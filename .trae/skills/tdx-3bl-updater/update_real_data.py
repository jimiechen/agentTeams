#!/usr/bin/env python3
"""
使用通达信API获取真实股票数据并更新到飞书
"""

import sys
import os
from datetime import datetime

# 添加通达信路径
sys.path.insert(0, r"C:\new_tdx_test\PYPlugins\user")

from tqcenter import tq

# 初始化通达信
print("初始化通达信...")
tq.initialize(__file__)
print("✓ 初始化成功\n")

# 读取板块文件获取股票列表
def read_sector_file(filepath):
    """读取板块文件"""
    stocks = []
    try:
        with open(filepath, 'r', encoding='gbk') as f:
            lines = f.readlines()
        
        for line in lines:
            line = line.strip()
            if not line:
                continue
            # 处理通达信格式
            if '|' in line:
                parts = line.split('|')
                if len(parts) >= 2:
                    code = parts[1]
                    # 转换为通达信格式
                    if code.startswith('6'):
                        stocks.append(f"{code}.SH")
                    else:
                        stocks.append(f"{code}.SZ")
            else:
                # 处理直接代码格式
                if len(line) >= 6:
                    if line.startswith('1'):
                        code = line[1:]
                        stocks.append(f"{code}.SH")
                    elif line.startswith('0'):
                        code = line[1:]
                        stocks.append(f"{code}.SZ")
                    else:
                        if line.startswith('6'):
                            stocks.append(f"{line}.SH")
                        else:
                            stocks.append(f"{line}.SZ")
        
        return stocks
    except Exception as e:
        print(f"读取文件失败: {e}")
        return []

# 获取股票数据
def get_stock_data(stock_list):
    """获取股票最新数据"""
    try:
        df = tq.get_market_data(
            field_list=['Close', 'Volume', 'Open', 'High', 'Low'],
            stock_list=stock_list,
            period='1d',
            count=60,  # 获取60天数据用于计算地量
            dividend_type='front'
        )
        return df
    except Exception as e:
        print(f"获取数据失败: {e}")
        return None

# 计算地量
def calculate_diliang(volumes):
    """计算地量指标"""
    if len(volumes) < 5:
        return {"5日": False, "10日": False, "20日": False, "30日": False, "60日": False}
    
    latest_volume = volumes[-1]
    result = {}
    periods = [(5, "5日"), (10, "10日"), (20, "20日"), (30, "30日"), (60, "60日")]
    
    for days, name in periods:
        if len(volumes) >= days:
            avg_volume = sum(volumes[-days:]) / days
            result[name] = latest_volume < avg_volume * 0.8
        else:
            result[name] = False
    
    return result

# 主程序
print("=" * 60)
print("通达信3BL板块真实数据更新")
print("=" * 60)

# 读取3个板块
sectors = {
    "0225": r"C:\new_tdx_test\T0002\blocknew\3BL0225.blk",
    "0226": r"C:\new_tdx_test\T0002\blocknew\3BL0226.blk",
    "0227": r"C:\new_tdx_test\T0002\blocknew\3BL0227.blk",
}

all_results = {}

for date, filepath in sectors.items():
    print(f"\n【板块 3BL{date}】")
    
    # 读取股票列表
    stocks = read_sector_file(filepath)
    print(f"  股票数量: {len(stocks)}")
    
    if not stocks:
        continue
    
    # 获取股票数据（分批获取，避免一次请求太多）
    batch_size = 50
    for i in range(0, len(stocks), batch_size):
        batch = stocks[i:i+batch_size]
        print(f"  获取批次 {i//batch_size + 1}/{(len(stocks)-1)//batch_size + 1} ({len(batch)}只)...")
        
        df = get_stock_data(batch)
        if df is None:
            continue
        
        # 处理数据
        for stock_code in batch:
            try:
                if stock_code in df['Close'].index:
                    close_series = df['Close'].loc[stock_code]
                    volume_series = df['Volume'].loc[stock_code]
                    
                    latest_close = close_series.iloc[-1]
                    latest_volume = volume_series.iloc[-1]
                    
                    # 计算地量
                    volumes = volume_series.tolist()
                    diliang = calculate_diliang(volumes)
                    
                    # 获取开盘价、最高价、最低价
                    open_price = df['Open'].loc[stock_code].iloc[-1]
                    high_price = df['High'].loc[stock_code].iloc[-1]
                    low_price = df['Low'].loc[stock_code].iloc[-1]
                    
                    all_results[stock_code] = {
                        'code': stock_code.replace('.SH', '').replace('.SZ', ''),
                        'price': float(latest_close),
                        'volume': int(latest_volume),
                        'open': float(open_price),
                        'high': float(high_price),
                        'low': float(low_price),
                        'sector': date,
                        'diliang': diliang
                    }
                    
                    diliang_list = [k for k, v in diliang.items() if v]
                    print(f"    {stock_code}: 价={latest_close:.2f} 量={latest_volume:,.0f} 地量={','.join(diliang_list) if diliang_list else '无'}")
                    
            except Exception as e:
                print(f"    {stock_code}: 处理失败 - {e}")

print(f"\n{'=' * 60}")
print(f"数据获取完成！共 {len(all_results)} 只股票")
print(f"{'=' * 60}")

# 显示统计
if all_results:
    diliang_5 = sum(1 for d in all_results.values() if d['diliang']['5日'])
    diliang_10 = sum(1 for d in all_results.values() if d['diliang']['10日'])
    diliang_20 = sum(1 for d in all_results.values() if d['diliang']['20日'])
    diliang_30 = sum(1 for d in all_results.values() if d['diliang']['30日'])
    diliang_60 = sum(1 for d in all_results.values() if d['diliang']['60日'])
    
    print(f"\n地量统计:")
    print(f"  5日地量: {diliang_5} 只")
    print(f"  10日地量: {diliang_10} 只")
    print(f"  20日地量: {diliang_20} 只")
    print(f"  30日地量: {diliang_30} 只")
    print(f"  60日地量: {diliang_60} 只")

# 保存结果到文件，供后续使用
import json
output_file = "stock_data_" + datetime.now().strftime("%Y%m%d_%H%M%S") + ".json"
with open(output_file, 'w', encoding='utf-8') as f:
    json.dump(all_results, f, ensure_ascii=False, indent=2)

print(f"\n数据已保存到: {output_file}")
print("\n下一步: 使用MCP工具将数据更新到飞书多维表格")
