#!/usr/bin/env python3
"""
批量插入3BL板块所有股票到飞书多维表格
"""

import sys
sys.path.insert(0, r"C:\new_tdx_test\PYPlugins\user")

from tqcenter import tq
from datetime import datetime

# 初始化通达信
print("初始化通达信...")
tq.initialize(__file__)
print("✓ 成功\n")

# 读取板块文件
def read_sector_file(filepath, sector_date):
    """读取板块文件并返回股票列表"""
    stocks = []
    with open(filepath, 'r', encoding='gbk') as f:
        lines = f.readlines()
    
    for line in lines[1:]:  # 跳过第一行空行
        code = line.strip()
        if not code:
            continue
        
        # 转换股票代码
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

# 获取股票名称
def get_stock_names(stock_list):
    """批量获取股票名称"""
    names = {}
    for stock in stock_list:
        try:
            info = tq.get_more_info(stock['tdx_code'])
            names[stock['code']] = info.get('Name', stock['code'])
        except:
            names[stock['code']] = stock['code']
    return names

# 主程序
print("=" * 60)
print("批量读取3BL板块股票")
print("=" * 60)

# 读取3个板块
sectors = {
    "0225": r"C:\new_tdx_test\T0002\blocknew\3BL0225.blk",
    "0226": r"C:\new_tdx_test\T0002\blocknew\3BL0226.blk",
    "0227": r"C:\new_tdx_test\T0002\blocknew\3BL0227.blk",
}

all_stocks = []
for date, filepath in sectors.items():
    stocks = read_sector_file(filepath, date)
    print(f"3BL{date}: {len(stocks)} 只股票")
    all_stocks.extend(stocks)

print(f"\n总计: {len(all_stocks)} 只股票")

# 获取股票名称（分批获取，避免请求过多）
print("\n获取股票名称...")
batch_size = 10
stock_names = {}

for i in range(0, len(all_stocks), batch_size):
    batch = all_stocks[i:i+batch_size]
    print(f"  批次 {i//batch_size + 1}/{(len(all_stocks)-1)//batch_size + 1}...")
    names = get_stock_names(batch)
    stock_names.update(names)

print(f"✓ 获取到 {len(stock_names)} 个股票名称")

# 准备飞书插入数据
print("\n准备飞书插入数据...")
records = []
for stock in all_stocks:
    code = stock['code']
    name = stock_names.get(code, code)
    sector = stock['sector']
    
    # 入池日期
    if sector == "0225":
        entry_date = 1740403200000  # 2025-02-25
    elif sector == "0226":
        entry_date = 1740489600000  # 2025-02-26
    else:
        entry_date = 1740576000000  # 2025-02-27
    
    record = {
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
    records.append(record)

print(f"✓ 准备了 {len(records)} 条记录")

# 保存到文件，供MCP工具使用
import json
output_file = "feishu_records_" + datetime.now().strftime("%Y%m%d_%H%M%S") + ".json"
with open(output_file, 'w', encoding='utf-8') as f:
    json.dump(records, f, ensure_ascii=False, indent=2)

print(f"\n数据已保存到: {output_file}")
print("\n请在nanobot环境中使用MCP工具批量插入这些记录")
print(f"总共需要插入 {len(records)} 条记录")

# 显示前5条示例
print("\n前5条记录示例:")
for i, record in enumerate(records[:5], 1):
    print(f"{i}. {record['股票代码']} - {record['股票名称']}")
