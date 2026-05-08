#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
配置nanobot定时任务
每个交易日15:30自动执行通达信3倍量选股并入池
"""

import json
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path

# nanobot cron store路径
NANOBOT_CRON_STORE = Path.home() / ".nanobot" / "cron_store.json"


def is_trading_day(date: datetime) -> bool:
    """判断是否为交易日（简化版，周一到周五）"""
    return date.weekday() < 5  # 0-4 是周一到周五


def get_next_trading_day_1530() -> datetime:
    """获取下一个交易日15:30的时间"""
    now = datetime.now()
    
    # 如果今天不是交易日或者已经过了15:30，找下一个交易日
    if not is_trading_day(now) or now.hour > 15 or (now.hour == 15 and now.minute >= 30):
        # 从明天开始找
        next_day = now + timedelta(days=1)
        while not is_trading_day(next_day):
            next_day += timedelta(days=1)
        return next_day.replace(hour=15, minute=30, second=0, microsecond=0)
    else:
        # 今天还没过15:30
        return now.replace(hour=15, minute=30, second=0, microsecond=0)


def create_cron_job():
    """创建cron任务配置"""
    
    # 计算下一个交易日15:30的时间戳
    next_run = get_next_trading_day_1530()
    next_run_ms = int(next_run.timestamp() * 1000)
    
    # 任务消息 - 让nanobot执行选股并入池
    message = """执行通达信3倍量选股并入池到飞书多维表格

步骤：
1. 运行 tdx_to_bitable.py 脚本
2. 选股结果会自动保存到 d:\agentsTeam\output\YYYYMMDD\
3. 股票数据会入池到飞书多维表格
4. 在通达信中查看自定义板块"3倍量YYYYMMDD"

参数：
- 分析日期: 最近交易日
- 最小放量倍数: 3.0
- 过滤条件: 主板股票，排除ST、科创板、创业板、北交所
"""
    
    # 创建cron任务配置
    job = {
        "id": "triple_volume_daily",
        "name": "每日通达信3倍量选股入池",
        "enabled": True,
        "schedule": {
            "kind": "cron",
            "expr": "30 15 * * 1-5",  # 周一到周五15:30
            "tz": "Asia/Shanghai"
        },
        "payload": {
            "kind": "agent_turn",
            "message": message,
            "deliver": True,
            "channel": None,
            "to": None
        },
        "state": {
            "nextRunAtMs": next_run_ms,
            "lastRunAtMs": None,
            "lastStatus": None,
            "lastError": None
        },
        "createdAtMs": int(datetime.now().timestamp() * 1000),
        "updatedAtMs": int(datetime.now().timestamp() * 1000),
        "deleteAfterRun": False
    }
    
    return job


def setup_cron():
    """设置定时任务"""
    print("="*60)
    print("配置nanobot定时任务")
    print("="*60)
    
    # 确保目录存在
    NANOBOT_CRON_STORE.parent.mkdir(parents=True, exist_ok=True)
    
    # 读取现有配置
    store = {"version": 1, "jobs": []}
    if NANOBOT_CRON_STORE.exists():
        try:
            with open(NANOBOT_CRON_STORE, 'r', encoding='utf-8') as f:
                store = json.load(f)
            print(f"\n已加载现有配置: {NANOBOT_CRON_STORE}")
        except Exception as e:
            print(f"\n警告: 无法读取现有配置: {e}")
    
    # 移除已有的同名任务
    store["jobs"] = [j for j in store["jobs"] if j.get("id") != "triple_volume_daily"]
    
    # 创建新任务
    job = create_cron_job()
    store["jobs"].append(job)
    
    # 保存配置
    with open(NANOBOT_CRON_STORE, 'w', encoding='utf-8') as f:
        json.dump(store, f, indent=2, ensure_ascii=False)
    
    print(f"\n✅ 定时任务已创建")
    print(f"   任务ID: {job['id']}")
    print(f"   任务名称: {job['name']}")
    print(f"   执行时间: 每个交易日 15:30 (周一到周五)")
    print(f"   时区: Asia/Shanghai")
    print(f"   下次执行: {datetime.fromtimestamp(job['state']['nextRunAtMs']/1000)}")
    print(f"\n配置文件: {NANOBOT_CRON_STORE}")
    
    # 同时创建Windows任务计划程序作为备份
    create_windows_task_backup()
    
    print("\n" + "="*60)
    print("配置完成!")
    print("="*60)


def create_windows_task_backup():
    """创建Windows任务计划程序作为备份"""
    import subprocess
    
    print("\n创建Windows任务计划程序备份...")
    
    # 任务名称
    task_name = "Nanobot_TripleVolume_Daily"
    
    # 删除已存在的任务
    try:
        subprocess.run(["schtasks", "/delete", "/tn", task_name, "/f"], 
                      capture_output=True, timeout=30)
    except:
        pass
    
    # 创建PowerShell脚本
    ps_script_path = Path(__file__).parent / "run_triple_volume_task.ps1"
    ps_script = '''# 通达信3倍量选股定时任务
$ErrorActionPreference = "Stop"

# 设置工作目录
$workDir = "D:\\agentsTeam\\skills\\nanobot\\feishu-bitable-manager\\scripts"
Set-Location $workDir

# 执行选股脚本
& python tdx_to_bitable.py

# 记录日志
$logDir = "D:\\agentsTeam\\output\\logs"
if (!(Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force
}
$logFile = "$logDir\\triple_volume_$(Get-Date -Format 'yyyyMMdd').log"
"[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] 定时任务执行完成" | Out-File -Append -FilePath $logFile
'''
    
    with open(ps_script_path, 'w', encoding='utf-8') as f:
        f.write(ps_script)
    
    # 创建任务
    ps_create = f'''
$Action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -File {ps_script_path}"
$Trigger = New-ScheduledTaskTrigger -Daily -At 15:30
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
$Principal = New-ScheduledTaskPrincipal -UserId "$env:USERNAME" -LogonType Interactive
Register-ScheduledTask -TaskName "{task_name}" -Action $Action -Trigger $Trigger -Settings $Settings -Principal $Principal -Force
'''
    
    try:
        result = subprocess.run(
            ["powershell", "-Command", ps_create],
            capture_output=True,
            text=True,
            timeout=60
        )
        if result.returncode == 0:
            print(f"   ✅ Windows任务 '{task_name}' 创建成功")
            print(f"   📁 PowerShell脚本: {ps_script_path}")
        else:
            print(f"   ⚠️ Windows任务创建失败: {result.stderr}")
    except Exception as e:
        print(f"   ⚠️ Windows任务创建失败: {e}")


def main():
    setup_cron()


if __name__ == '__main__':
    main()
