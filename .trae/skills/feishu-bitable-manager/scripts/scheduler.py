#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
定时任务调度器
用于管理盘后提醒和每日复盘任务
支持Windows任务计划程序集成
"""

import argparse
import json
import os
import sys
import subprocess
from datetime import datetime
from pathlib import Path


class TaskScheduler:
    """任务调度器"""
    
    def __init__(self, config_path: str = "scheduler_config.json"):
        self.config_path = config_path
        self.config = self.load_config()
        self.script_dir = Path(__file__).parent.absolute()
        
    def load_config(self) -> dict:
        """加载配置"""
        if os.path.exists(self.config_path):
            try:
                with open(self.config_path, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception as e:
                print(f"[警告] 加载配置失败: {e}")
        return {
            "app_token": "",
            "table_id": "",
            "chat_id": "",
            "python_path": "python",
            "enabled_tasks": {
                "postmarket_reminder": True,
                "daily_review": True
            },
            "schedule": {
                "postmarket_reminder": {"hour": 15, "minute": 0},
                "daily_review": {"hour": 15, "minute": 30}
            }
        }
    
    def save_config(self):
        """保存配置"""
        try:
            with open(self.config_path, 'w', encoding='utf-8') as f:
                json.dump(self.config, f, ensure_ascii=False, indent=2)
            print(f"[成功] 配置已保存到 {self.config_path}")
        except Exception as e:
            print(f"[错误] 保存配置失败: {e}")
    
    def run_postmarket_reminder(self) -> bool:
        """执行盘后提醒任务"""
        print(f"\n{'='*60}")
        print(f"执行盘后提醒任务 - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"{'='*60}")
        
        script_path = self.script_dir / "send_postmarket_reminder.py"
        chat_id = self.config.get("chat_id", "")
        python_path = self.config.get("python_path", "python")
        
        if not chat_id:
            print("[错误] 未配置 chat_id")
            return False
        
        cmd = [
            python_path,
            str(script_path),
            "--chat", chat_id
        ]
        
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
            print(result.stdout)
            if result.stderr:
                print(f"[stderr] {result.stderr}")
            return result.returncode == 0
        except Exception as e:
            print(f"[错误] 执行盘后提醒任务失败: {e}")
            return False
    
    def run_daily_review(self) -> bool:
        """执行每日复盘任务"""
        print(f"\n{'='*60}")
        print(f"执行每日复盘任务 - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"{'='*60}")
        
        script_path = self.script_dir / "daily_review.py"
        app_token = self.config.get("app_token", "")
        table_id = self.config.get("table_id", "")
        chat_id = self.config.get("chat_id", "")
        python_path = self.config.get("python_path", "python")
        
        if not all([app_token, table_id, chat_id]):
            print("[错误] 配置不完整，请检查 app_token, table_id, chat_id")
            return False
        
        cmd = [
            python_path,
            str(script_path),
            "--app-token", app_token,
            "--table-id", table_id,
            "--chat", chat_id
        ]
        
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
            print(result.stdout)
            if result.stderr:
                print(f"[stderr] {result.stderr}")
            return result.returncode == 0
        except Exception as e:
            print(f"[错误] 执行每日复盘任务失败: {e}")
            return False
    
    def create_windows_task(self, task_name: str, schedule_time: dict, script_name: str) -> bool:
        """创建Windows任务计划程序任务"""
        try:
            # 构建命令
            python_path = self.config.get("python_path", "python")
            script_path = self.script_dir / script_name
            chat_id = self.config.get("chat_id", "")
            
            if script_name == "daily_review.py":
                app_token = self.config.get("app_token", "")
                table_id = self.config.get("table_id", "")
                action_command = f'"{python_path}" "{script_path}" --app-token {app_token} --table-id {table_id} --chat {chat_id}'
            else:
                action_command = f'"{python_path}" "{script_path}" --chat {chat_id}'
            
            # 删除已存在的任务
            subprocess.run(["schtasks", "/delete", "/tn", task_name, "/f"], 
                          capture_output=True, timeout=30)
            
            # 创建新任务
            hour = schedule_time.get("hour", 15)
            minute = schedule_time.get("minute", 0)
            
            # 使用PowerShell创建任务（支持更多选项）
            ps_script = f'''
$Action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c {action_command}"
$Trigger = New-ScheduledTaskTrigger -Daily -At {hour:02d}:{minute:02d}
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
$Principal = New-ScheduledTaskPrincipal -UserId "$env:USERNAME" -LogonType Interactive
Register-ScheduledTask -TaskName "{task_name}" -Action $Action -Trigger $Trigger -Settings $Settings -Principal $Principal -Force
'''
            
            result = subprocess.run(
                ["powershell", "-Command", ps_script],
                capture_output=True,
                text=True,
                timeout=60
            )
            
            if result.returncode == 0:
                print(f"[成功] Windows任务 '{task_name}' 创建成功")
                print(f"  执行时间: {hour:02d}:{minute:02d}")
                print(f"  执行命令: {action_command}")
                return True
            else:
                print(f"[失败] 创建Windows任务失败: {result.stderr}")
                return False
                
        except Exception as e:
            print(f"[错误] 创建Windows任务失败: {e}")
            return False
    
    def setup_all_tasks(self):
        """设置所有定时任务"""
        print(f"\n{'='*60}")
        print("设置定时任务")
        print(f"{'='*60}\n")
        
        enabled_tasks = self.config.get("enabled_tasks", {})
        schedule = self.config.get("schedule", {})
        
        # 设置盘后提醒任务
        if enabled_tasks.get("postmarket_reminder", True):
            print("[1/2] 设置盘后提醒任务...")
            reminder_schedule = schedule.get("postmarket_reminder", {"hour": 15, "minute": 0})
            self.create_windows_task(
                "TripleVolume_PostmarketReminder",
                reminder_schedule,
                "send_postmarket_reminder.py"
            )
        else:
            print("[1/2] 盘后提醒任务已禁用")
        
        # 设置每日复盘任务
        if enabled_tasks.get("daily_review", True):
            print("\n[2/2] 设置每日复盘任务...")
            review_schedule = schedule.get("daily_review", {"hour": 15, "minute": 30})
            self.create_windows_task(
                "TripleVolume_DailyReview",
                review_schedule,
                "daily_review.py"
            )
        else:
            print("[2/2] 每日复盘任务已禁用")
        
        print(f"\n{'='*60}")
        print("定时任务设置完成")
        print(f"{'='*60}")
    
    def remove_all_tasks(self):
        """移除所有定时任务"""
        print(f"\n{'='*60}")
        print("移除定时任务")
        print(f"{'='*60}\n")
        
        tasks = ["TripleVolume_PostmarketReminder", "TripleVolume_DailyReview"]
        
        for i, task_name in enumerate(tasks, 1):
            print(f"[{i}/{len(tasks)}] 移除任务 '{task_name}'...")
            try:
                result = subprocess.run(
                    ["schtasks", "/delete", "/tn", task_name, "/f"],
                    capture_output=True,
                    text=True,
                    timeout=30
                )
                if result.returncode == 0:
                    print(f"  [成功] 任务已移除")
                else:
                    print(f"  [信息] {result.stderr.strip()}")
            except Exception as e:
                print(f"  [错误] 移除任务失败: {e}")
        
        print(f"\n{'='*60}")
        print("定时任务移除完成")
        print(f"{'='*60}")
    
    def list_tasks(self):
        """列出所有定时任务"""
        print(f"\n{'='*60}")
        print("当前定时任务状态")
        print(f"{'='*60}\n")
        
        tasks = ["TripleVolume_PostmarketReminder", "TripleVolume_DailyReview"]
        
        for task_name in tasks:
            try:
                result = subprocess.run(
                    ["schtasks", "/query", "/tn", task_name, "/fo", "list"],
                    capture_output=True,
                    text=True,
                    timeout=30
                )
                if result.returncode == 0:
                    print(f"✅ {task_name}")
                    print(result.stdout)
                else:
                    print(f"❌ {task_name} - 未找到")
            except Exception as e:
                print(f"❌ {task_name} - 查询失败: {e}")
        
        print(f"{'='*60}")


def main():
    parser = argparse.ArgumentParser(description='定时任务调度器')
    parser.add_argument('--config', default='scheduler_config.json', help='配置文件路径')
    parser.add_argument('--setup', action='store_true', help='设置所有定时任务')
    parser.add_argument('--remove', action='store_true', help='移除所有定时任务')
    parser.add_argument('--list', action='store_true', help='列出所有定时任务')
    parser.add_argument('--run-reminder', action='store_true', help='立即执行盘后提醒')
    parser.add_argument('--run-review', action='store_true', help='立即执行每日复盘')
    parser.add_argument('--app-token', help='设置应用Token')
    parser.add_argument('--table-id', help='设置数据表ID')
    parser.add_argument('--chat', help='设置群聊ID')
    parser.add_argument('--python-path', help='设置Python路径')
    
    args = parser.parse_args()
    
    scheduler = TaskScheduler(args.config)
    
    # 更新配置
    if args.app_token:
        scheduler.config["app_token"] = args.app_token
    if args.table_id:
        scheduler.config["table_id"] = args.table_id
    if args.chat:
        scheduler.config["chat_id"] = args.chat
    if args.python_path:
        scheduler.config["python_path"] = args.python_path
    
    # 保存配置更新
    if any([args.app_token, args.table_id, args.chat, args.python_path]):
        scheduler.save_config()
    
    # 执行任务
    if args.run_reminder:
        success = scheduler.run_postmarket_reminder()
        sys.exit(0 if success else 1)
    
    if args.run_review:
        success = scheduler.run_daily_review()
        sys.exit(0 if success else 1)
    
    if args.setup:
        scheduler.setup_all_tasks()
    
    if args.remove:
        scheduler.remove_all_tasks()
    
    if args.list:
        scheduler.list_tasks()
    
    # 如果没有指定任何操作，显示帮助
    if not any([args.setup, args.remove, args.list, args.run_reminder, args.run_review]):
        parser.print_help()
        print(f"\n{'='*60}")
        print("当前配置:")
        print(f"{'='*60}")
        print(f"应用Token: {scheduler.config.get('app_token', '未设置')}")
        print(f"数据表ID: {scheduler.config.get('table_id', '未设置')}")
        print(f"群聊ID: {scheduler.config.get('chat_id', '未设置')}")
        print(f"Python路径: {scheduler.config.get('python_path', 'python')}")
        print(f"{'='*60}")


if __name__ == '__main__':
    main()
