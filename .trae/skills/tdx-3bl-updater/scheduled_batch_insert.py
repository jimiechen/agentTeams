#!/usr/bin/env python3
"""
定时任务：批量插入通达信3BL板块股票到飞书
"""

import sys
import os
import json
from datetime import datetime

# 添加通达信路径
sys.path.insert(0, r"C:\new_tdx_test\PYPlugins\user")

from tqcenter import tq

# 配置
APP_TOKEN = "NjMBbwfgLaBXoSslUD8cDaPQnvf"
TABLE_ID = "tblRzH4lnNlvcAlq"

def read_sector_file(filepath, sector_date):
    """读取板块文件"""
    stocks = []
    with open(filepath, 'r', encoding='gbk') as f:
        lines = f.readlines()
    
    for line in lines[1:]:
        code = line.strip()
        if not code:
            continue
        
        if code.startswith('1'):
            stock_code = code[1:]
            tdx_code = f"{stock_code}.SH"
        elif code.startswith('0'):
            stock_code = code[1:]
            tdx_code = f"{stock_code}.SZ"
        else:
            stock_code = code
            tdx_code = f"{code}.SZ"
        
        stocks.append({
            'code': stock_code,
            'tdx_code': tdx_code,
            'sector': sector_date
        })
    
    return stocks

def get_stock_name(tdx_code):
    """获取股票名称"""
    try:
        info = tq.get_more_info(tdx_code)
        return info.get('Name', tdx_code)
    except:
        return tdx_code

def prepare_record(stock, name):
    """准备飞书记录"""
    code = stock['code']
    sector = stock['sector']
    
    if sector == "0225":
        entry_date = 1740403200000
    elif sector == "0226":
        entry_date = 1740489600000
    else:
        entry_date = 1740576000000
    
    return {
        "股票代码": code,
        "股票名称": f"{name}-3BL{sector}",
        "最新收盘价": 0,
        "成交量": 0,
        "5日地量": False,
        "10日地量": False,
        "20日地量": False,
        "30日地量": False,
        "60日地量": False,
        "入池日期": entry_date,
        "入池开盘价": 0,
        "入池收盘价": 0,
        "入池最高价": 0,
        "3倍量确认": False,
        "备注": f"板块:{sector} 来源:通达信3BL 待更新价格"
    }

def main():
    print("=" * 70)
    print("通达信3BL板块批量插入任务")
    print(f"开始时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 70)
    
    # 初始化通达信
    print("\n1. 初始化通达信...")
    tq.initialize(__file__)
    print("   ✓ 成功")
    
    # 读取板块
    print("\n2. 读取板块文件...")
    sectors = {
        "0225": r"C:\new_tdx_test\T0002\blocknew\3BL0225.blk",
        "0226": r"C:\new_tdx_test\T0002\blocknew\3BL0226.blk",
        "0227": r"C:\new_tdx_test\T0002\blocknew\3BL0227.blk",
    }
    
    all_stocks = []
    for date, filepath in sectors.items():
        stocks = read_sector_file(filepath, date)
        print(f"   3BL{date}: {len(stocks)} 只")
        all_stocks.extend(stocks)
    
    print(f"\n   总计: {len(all_stocks)} 只股票")
    
    # 获取股票名称并准备记录
    print("\n3. 准备插入数据...")
    records = []
    for i, stock in enumerate(all_stocks, 1):
        name = get_stock_name(stock['tdx_code'])
        record = prepare_record(stock, name)
        records.append(record)
        if i % 10 == 0:
            print(f"   已处理 {i}/{len(all_stocks)}")
    
    print(f"\n   ✓ 准备了 {len(records)} 条记录")
    
    # 保存到文件
    output_file = f"batch_insert_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(records, f, ensure_ascii=False, indent=2)
    
    print(f"\n4. 数据已保存到: {output_file}")
    
    # 生成MCP命令列表
    print("\n5. 生成MCP命令...")
    mcp_commands = []
    for record in records:
        cmd = {
            "tool": "mcp_lark-mcp_bitable_v1_appTableRecord_create",
            "params": {
                "data": {"fields": record},
                "path": {
                    "app_token": APP_TOKEN,
                    "table_id": TABLE_ID
                }
            }
        }
        mcp_commands.append(cmd)
    
    # 保存MCP命令
    mcp_file = f"mcp_commands_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    with open(mcp_file, 'w', encoding='utf-8') as f:
        json.dump(mcp_commands, f, ensure_ascii=False, indent=2)
    
    print(f"   ✓ 生成了 {len(mcp_commands)} 条MCP命令")
    print(f"   保存到: {mcp_file}")
    
    print("\n" + "=" * 70)
    print("任务完成!")
    print(f"结束时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 70)
    print(f"\n请在nanobot环境中执行 {mcp_file} 中的MCP命令")
    print("或者使用批量执行工具自动插入所有记录")

if __name__ == "__main__":
    main()
