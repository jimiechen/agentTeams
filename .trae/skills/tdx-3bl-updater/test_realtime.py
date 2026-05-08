#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
测试读取通达信3BL板块实时数据并更新到飞书表格
"""

import sys
sys.path.insert(0, 'd:\\agentsTeam\\skills\\tdx-3bl-updater')

from update_3bl_stocks import (
    read_tdx_block_file, 
    get_stock_kline, 
    get_stock_name,
    calculate_indicators,
    check_breakthrough,
    prepare_record
)
from feishu_table import update_record_to_feishu
from datetime import datetime

# 测试读取单个板块
def test_read_block():
    print("=" * 60)
    print("测试读取3BL板块")
    print("=" * 60)
    
    # 读取20260227板块
    stocks = read_tdx_block_file("20260227")
    print(f"\n读取到 {len(stocks)} 只股票")
    
    if stocks:
        # 测试第一只股票
        test_stock = stocks[0]
        print(f"\n测试股票: {test_stock['code']} - {test_stock['full_code']}")
        
        # 获取股票名称
        stock_name = get_stock_name(test_stock['full_code'])
        print(f"股票名称: {stock_name}")
        
        # 获取K线数据
        print("\n获取K线数据...")
        kline_data = get_stock_kline(test_stock['full_code'], days=60)
        
        if kline_data:
            print(f"获取到 {len(kline_data)} 天K线数据")
            
            # 显示最新数据
            latest = kline_data[-1]
            print(f"\n最新数据 ({latest['date']}):")
            print(f"  开盘价: {latest['open']}")
            print(f"  收盘价: {latest['close']}")
            print(f"  最高价: {latest['high']}")
            print(f"  最低价: {latest['low']}")
            print(f"  成交量: {latest['volume']}")
            
            # 计算指标
            print("\n计算技术指标...")
            indicators = calculate_indicators(kline_data)
            print(f"  5日均量: {indicators.get('avg_5', 0):.0f}")
            print(f"  10日均量: {indicators.get('avg_10', 0):.0f}")
            print(f"  20日均量: {indicators.get('avg_20', 0):.0f}")
            print(f"  5日地量: {indicators.get('diliang_5', False)}")
            print(f"  10日地量: {indicators.get('diliang_10', False)}")
            print(f"  20日地量: {indicators.get('diliang_20', False)}")
            
            # 准备记录
            print("\n准备飞书表格记录...")
            pool_data = {
                "date": "2026-02-27",
                "open": latest['open'],
                "close": latest['close'],
                "high": latest['high']
            }
            record = prepare_record(test_stock, kline_data, pool_data)
            
            print(f"\n记录内容:")
            for key, value in record.items():
                print(f"  {key}: {value}")
            
            # 更新到飞书（测试）
            print("\n更新到飞书表格...")
            # update_record_to_feishu(record)
            print("[测试模式] 未实际更新到飞书")
            
        else:
            print("[ERROR] 获取K线数据失败")
    
    print("\n" + "=" * 60)
    print("测试完成")
    print("=" * 60)

if __name__ == "__main__":
    test_read_block()
