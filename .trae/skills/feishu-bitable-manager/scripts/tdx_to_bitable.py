#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
通达信3倍量选股并发送到飞书多维表格
整合tdx_triple_volume.py和飞书表格写入功能
"""

import os
import sys
import json
import requests
from datetime import datetime, date
from pathlib import Path

# 添加当前脚本路径（用于导入feishu_notifier）
CURRENT_SCRIPT_PATH = Path(__file__).parent
if str(CURRENT_SCRIPT_PATH) not in sys.path:
    sys.path.insert(0, str(CURRENT_SCRIPT_PATH))

# 添加triple-volume-picker脚本路径
TDX_SCRIPT_PATH = Path(__file__).parent.parent.parent / "triple-volume-picker" / "scripts"
if str(TDX_SCRIPT_PATH) not in sys.path:
    sys.path.insert(0, str(TDX_SCRIPT_PATH))

# 添加通达信PYPlugins路径
TDX_PATH = r"C:\new_tdx_test"
PYPLUGINS_PATH = os.path.join(TDX_PATH, "PYPlugins", "user")
if os.path.exists(PYPLUGINS_PATH):
    sys.path.insert(0, PYPLUGINS_PATH)

# 导入飞书通知模块
try:
    from feishu_notifier import send_task_start_notification, send_triple_volume_notification
    FEISHU_NOTIFY_ENABLED = True
    print("[信息] 飞书通知模块已加载")
except ImportError as e:
    print(f"[警告] 无法加载飞书通知模块: {e}")
    FEISHU_NOTIFY_ENABLED = False


def get_tenant_access_token(app_id: str, app_secret: str) -> str:
    """获取飞书租户访问令牌"""
    url = "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal"
    headers = {"Content-Type": "application/json"}
    data = {"app_id": app_id, "app_secret": app_secret}
    
    try:
        response = requests.post(url, headers=headers, json=data, timeout=30)
        result = response.json()
        if result.get("code") == 0:
            return result.get("tenant_access_token")
        else:
            print(f"[错误] 获取token失败: {result}")
            return None
    except Exception as e:
        print(f"[错误] 请求token失败: {e}")
        return None


def add_record_to_bitable(token: str, app_token: str, table_id: str, record: dict) -> bool:
    """添加记录到飞书多维表格"""
    url = f"https://open.feishu.cn/open-apis/bitable/v1/apps/{app_token}/tables/{table_id}/records"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    data = {"fields": record}
    
    try:
        response = requests.post(url, headers=headers, json=data, timeout=30)
        result = response.json()
        
        if result.get("code") == 0:
            print(f"  ✅ 已添加: {record.get('股票代码', 'N/A')}")
            return True
        else:
            print(f"  ❌ 添加失败: {result}")
            return False
    except Exception as e:
        print(f"  ❌ 添加失败: {e}")
        return False


def run_tdx_triple_volume(target_date: date = None) -> list:
    """运行通达信3倍量选股"""
    try:
        # 导入通达信选股模块
        from tdx_triple_volume import (
            find_triple_volume_stocks, 
            get_latest_trade_date,
            get_prev_trade_date,
            save_results,
            create_or_update_tdx_block
        )
        from tqcenter import tq
        
        # 初始化通达信
        print("[初始化] 通达信量化平台...")
        try:
            tq.initialize(__file__)
            print("  ✅ 初始化成功")
        except Exception as e:
            print(f"  ❌ 初始化失败: {e}")
            print("  请确保已启动通达信金融终端")
            return []
        
        # 检查盘后数据是否已更新
        print("\n[检查] 验证盘后数据更新状态...")
        try:
            from tdx_triple_volume import get_latest_trade_date, get_prev_trade_date
            latest_date = get_latest_trade_date()
            today = date.today()
            
            # 如果指定了目标日期，检查该日期是否有数据
            check_date = target_date if target_date else latest_date
            
            # 获取检查日期的前一个交易日
            prev_date = get_prev_trade_date(check_date)
            
            # 尝试获取检查日期的数据来验证（使用平安银行000001.SZ作为测试）
            test_data = tq.get_market_data(
                field_list=['Volume'],
                stock_list=['000001.SZ'],
                start_time=check_date.strftime('%Y%m%d'),
                end_time=check_date.strftime('%Y%m%d'),
                period='1d',
                dividend_type='none'
            )
            
            if test_data is None or len(test_data) == 0:
                print(f"  ❌ 数据检查失败: {check_date} 的数据不可用")
                print(f"\n" + "="*60)
                print("⚠️  重要提示：盘后数据未更新！")
                print("="*60)
                print(f"\n目标日期: {check_date}")
                print(f"最近交易日: {latest_date}")
                print("\n请按以下步骤操作：")
                print("1. 打开通达信金融终端")
                print("2. 点击菜单：系统 -> 盘后数据下载")
                print("3. 选择：日线数据 + 分钟线数据")
                print("4. 点击：开始下载")
                print("5. 等待下载完成后，重新运行本脚本")
                print("="*60 + "\n")
                return []
            else:
                print(f"  ✅ 数据检查通过: {check_date} 的数据已更新")
                
        except Exception as e:
            print(f"  ⚠️  数据检查警告: {e}")
            print("  继续执行选股...")
        
        # 确定分析日期
        if target_date is None:
            target_date = get_latest_trade_date()
        
        print(f"\n[选股] 分析日期: {target_date}")
        print(f"[选股] 对比日期: {get_prev_trade_date(target_date)}")
        print("="*60)
        
        # 执行选股
        results = find_triple_volume_stocks(target_date)
        
        print(f"\n[结果] 共找到 {len(results)} 只3倍量股票")
        
        if results:
            # 保存结果到统一输出目录
            base_dir = r"d:\agentsTeam\output"
            month_dir = target_date.strftime("%Y%m")
            output_dir = Path(base_dir) / month_dir
            output_dir.mkdir(parents=True, exist_ok=True)
            save_results(results, target_date, str(output_dir))
            
            # 创建通达信板块
            block_code = f"3BL{target_date.strftime('%m%d')}"
            block_name = f"3倍量{target_date.strftime('%Y%m%d')}"
            stock_codes = [r.stock_code for r in results]
            create_or_update_tdx_block(block_code, block_name, stock_codes)
        
        return results
        
    except Exception as e:
        print(f"[错误] 通达信选股失败: {e}")
        import traceback
        traceback.print_exc()
        return []


def convert_to_bitable_format(stock_result, trade_date: date) -> dict:
    """将通达信选股结果转换为飞书表格格式"""
    # 转换日期为时间戳（毫秒）
    date_timestamp = int(datetime.combine(trade_date, datetime.min.time()).timestamp() * 1000)
    
    return {
        "股票代码": stock_result.stock_code.split('.')[0],  # 去掉后缀
        "股票名称": stock_result.stock_name,
        "入池日期": date_timestamp,
        "入池开盘价": stock_result.open_price,
        "入池收盘价": stock_result.close_price,
        "入池最高价": stock_result.high_price,
        "成交量": stock_result.today_volume,
        "3倍量确认": True,
        "备注": f"放量倍数: {stock_result.ratio}x, 昨日成交量: {stock_result.yesterday_volume}, 涨跌幅: {stock_result.change_pct}%"
    }


def main():
    import argparse
    
    parser = argparse.ArgumentParser(description='通达信3倍量选股并发送到飞书表格')
    parser.add_argument('--date', type=str, help='指定日期 (YYYY-MM-DD)，默认最近交易日')
    parser.add_argument('--app-token', default='Cxk3bzwIualrJNsHMPec3SIDnAh', help='飞书多维表格应用Token')
    parser.add_argument('--table-id', default='tblR66rv2d42lTXR', help='飞书多维表格ID')
    
    args = parser.parse_args()
    
    # 飞书配置
    app_id = "cli_a90a6cf288f8dbb3"
    app_secret = "oOSgX9FPUnomiaJ5MJaXrfPllxvV4Nar"
    
    # 解析日期
    target_date = None
    if args.date:
        target_date = datetime.strptime(args.date, '%Y-%m-%d').date()
    
    print("="*60)
    print("通达信3倍量选股 → 飞书多维表格")
    print("="*60)
    
    # 发送任务开始通知
    if FEISHU_NOTIFY_ENABLED:
        print("\n[通知] 发送任务开始通知到飞书群聊...")
        send_task_start_notification(
            "三倍量选股",
            "正在执行通达信3倍量选股，分析日期: {}".format(target_date or "最近交易日")
        )
    
    # 步骤1: 通达信选股
    print("\n[步骤1/3] 执行通达信3倍量选股...")
    results = run_tdx_triple_volume(target_date)
    
    if not results:
        print("\n[完成] 未找到3倍量股票")
        # 发送任务完成通知（无股票）
        if FEISHU_NOTIFY_ENABLED:
            print("\n[通知] 发送任务完成通知到飞书群聊...")
            send_triple_volume_notification(
                date=(target_date or date.today()).isoformat(),
                stock_count=0,
                top_stocks=[],
                csv_path="无",
                bitable_url=f"https://ua1ubozww7s.feishu.cn/base/{args.app_token}"
            )
        return
    
    # 步骤2: 获取飞书token
    print("\n[步骤2/3] 获取飞书访问令牌...")
    token = get_tenant_access_token(app_id, app_secret)
    if not token:
        print("  ❌ 获取token失败")
        return
    print("  ✅ 获取token成功")
    
    # 步骤3: 发送到飞书表格
    print(f"\n[步骤3/3] 发送 {len(results)} 条记录到飞书多维表格...")
    print("-"*60)
    
    success_count = 0
    trade_date = results[0].trade_date if results else date.today()
    
    for stock in results:
        record = convert_to_bitable_format(stock, trade_date)
        if add_record_to_bitable(token, args.app_token, args.table_id, record):
            success_count += 1
    
    print("-"*60)
    
    # 输出结果
    print(f"\n{'='*60}")
    print("完成!")
    print(f"{'='*60}")
    print(f"选股日期: {trade_date}")
    print(f"总股票数: {len(results)}")
    print(f"成功入池: {success_count}")
    print(f"飞书表格: https://ua1ubozww7s.feishu.cn/base/{args.app_token}")
    print(f"{'='*60}")
    
    # 发送任务完成通知
    if FEISHU_NOTIFY_ENABLED:
        print("\n[通知] 发送任务完成通知到飞书群聊...")
        # 构建前5名股票列表
        top_stocks = []
        for stock in results[:5]:
            top_stocks.append({
                'code': stock.code,
                'name': stock.name,
                'volume_ratio': f"{stock.ratio:.2f}"
            })
        
        send_triple_volume_notification(
            date=trade_date.isoformat(),
            stock_count=len(results),
            top_stocks=top_stocks,
            csv_path=f"output/{trade_date.strftime('%Y%m%d')}/tdx_triple_volume_{trade_date.strftime('%Y%m%d')}.csv",
            bitable_url=f"https://ua1ubozww7s.feishu.cn/base/{args.app_token}"
        )
    
    # nanobot输出格式
    output = {
        "success": True,
        "stock_count": len(results),
        "added_count": success_count,
        "trade_date": trade_date.isoformat(),
        "bitable_url": f"https://ua1ubozww7s.feishu.cn/base/{args.app_token}"
    }
    print(f"\n###NANOBOT_OUTPUT_START###{json.dumps(output, ensure_ascii=False)}###NANOBOT_OUTPUT_END###")


if __name__ == '__main__':
    main()
