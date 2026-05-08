#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
从通达信本地数据读取并筛选3倍量股票
直接读取通达信 .day 文件，无需数据库
"""

import os
import sys
import struct
import glob
from datetime import datetime, date, timedelta
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass, asdict
import json
import csv

# 通达信数据目录
TDX_PATH = r"C:\new_tdx_test"
SH_LDAY = os.path.join(TDX_PATH, "vipdoc", "sh", "lday")
SZ_LDAY = os.path.join(TDX_PATH, "vipdoc", "sz", "lday")


@dataclass
class StockDailyData:
    """股票日线数据"""
    code: str
    trade_date: date
    open: float
    high: float
    low: float
    close: float
    volume: int  # 成交量（股）
    amount: float  # 成交额（元）


@dataclass
class TripleVolumeResult:
    """三倍量结果"""
    stock_code: str
    stock_name: str
    trade_date: date
    yesterday_volume: int
    today_volume: int
    ratio: float
    open_price: float
    close_price: float
    high_price: float
    low_price: float
    change_pct: float


def read_tdx_day_file(file_path: str) -> List[StockDailyData]:
    """
    读取通达信 .day 文件
    """
    raw_records = []
    
    if not os.path.exists(file_path):
        return raw_records
    
    try:
        with open(file_path, 'rb') as f:
            while True:
                data = f.read(32)
                if len(data) < 32:
                    break
                
                # 解析数据
                date_int = struct.unpack('i', data[0:4])[0]
                open_price = struct.unpack('i', data[4:8])[0] * 0.01
                high_price = struct.unpack('i', data[8:12])[0] * 0.01
                low_price = struct.unpack('i', data[12:16])[0] * 0.01
                close_price = struct.unpack('i', data[16:20])[0] * 0.01
                cum_volume = struct.unpack('I', data[20:24])[0]  # 累计成交量（无符号整数）
                cum_amount = struct.unpack('f', data[24:28])[0]  # 累计成交额
                
                # 转换日期 (通达信日期格式: YYYYMMDD)
                year = date_int // 10000
                month = (date_int % 10000) // 100
                day = date_int % 100
                
                try:
                    trade_date = date(year, month, day)
                    
                    raw_records.append({
                        'trade_date': trade_date,
                        'open': round(open_price, 2),
                        'high': round(high_price, 2),
                        'low': round(low_price, 2),
                        'close': round(close_price, 2),
                        'cum_volume': cum_volume,
                        'cum_amount': cum_amount
                    })
                except:
                    continue
                    
    except Exception as e:
        return []
    
    # 按日期排序
    raw_records.sort(key=lambda x: x['trade_date'])
    
    # 计算当日成交量和成交额（差值）
    records = []
    for i, r in enumerate(raw_records):
        if i == 0:
            # 第一天，直接使用累计值
            daily_volume = r['cum_volume']
            daily_amount = r['cum_amount']
        else:
            # 当日 = 当日累计 - 前日累计
            daily_volume = r['cum_volume'] - raw_records[i-1]['cum_volume']
            daily_amount = r['cum_amount'] - raw_records[i-1]['cum_amount']
        
        # 只保留正数的成交量
        if daily_volume > 0:
            records.append(StockDailyData(
                code="",
                trade_date=r['trade_date'],
                open=r['open'],
                high=r['high'],
                low=r['low'],
                close=r['close'],
                volume=daily_volume,
                amount=round(daily_amount, 2)
            ))
    
    return records


def get_stock_code_from_filename(filename: str) -> str:
    """从文件名获取股票代码"""
    code = filename.replace('.day', '').replace('sh', '').replace('sz', '')
    if code.startswith('6') or code.startswith('5') or code.startswith('9'):
        return f"{code}.SH"
    else:
        return f"{code}.SZ"


def is_valid_stock(code: str) -> bool:
    """检查股票代码是否有效（排除北交所、创业板、科创板）"""
    pure_code = code.split('.')[0]
    
    # 排除北交所（8开头、4开头）
    if pure_code.startswith('8') or pure_code.startswith('4'):
        return False
    
    # 排除创业板（300开头）
    if pure_code.startswith('300'):
        return False
    
    # 排除科创板（688开头）
    if pure_code.startswith('688'):
        return False
    
    # 只保留主板股票（0、6开头）
    if pure_code.startswith('0') or pure_code.startswith('6'):
        return True
    
    return False


def find_triple_volume_stocks(target_date: date) -> List[TripleVolumeResult]:
    """查找指定日期的3倍量股票"""
    results = []
    
    print(f"查找日期: {target_date}")
    
    # 遍历所有日线数据文件
    all_files = []
    if os.path.exists(SH_LDAY):
        all_files.extend(glob.glob(os.path.join(SH_LDAY, '*.day')))
    if os.path.exists(SZ_LDAY):
        all_files.extend(glob.glob(os.path.join(SZ_LDAY, '*.day')))
    
    print(f"总共 {len(all_files)} 只股票数据文件")
    
    checked = 0
    has_target = 0
    has_prev = 0
    
    for file_path in all_files:
        filename = os.path.basename(file_path)
        code = get_stock_code_from_filename(filename)
        
        # 过滤股票
        if not is_valid_stock(code):
            continue
        
        checked += 1
        
        # 读取数据
        records = read_tdx_day_file(file_path)
        if len(records) < 2:
            continue
        
        # 查找目标日期的数据
        today_data = None
        yesterday_data = None
        
        for record in records:
            if record.trade_date == target_date:
                today_data = record
            elif record.trade_date == date(2026, 2, 12):
                yesterday_data = record
        
        if today_data:
            has_target += 1
        if yesterday_data:
            has_prev += 1
        
        # 检查是否满足3倍量条件
        if today_data and yesterday_data and yesterday_data.volume > 1000:
            ratio = today_data.volume / yesterday_data.volume
            
            if ratio >= 3.0:
                change_pct = 0
                if yesterday_data.close > 0:
                    change_pct = (today_data.close - yesterday_data.close) / yesterday_data.close * 100
                
                results.append(TripleVolumeResult(
                    stock_code=code,
                    stock_name=code,
                    trade_date=target_date,
                    yesterday_volume=yesterday_data.volume,
                    today_volume=today_data.volume,
                    ratio=round(ratio, 2),
                    open_price=today_data.open,
                    close_price=today_data.close,
                    high_price=today_data.high,
                    low_price=today_data.low,
                    change_pct=round(change_pct, 2)
                ))
    
    print(f"\n检查了 {checked} 只主板股票")
    print(f"有 {target_date} 数据的股票: {has_target}")
    print(f"有 2026-02-12 数据的股票: {has_prev}")
    
    # 按放量倍数排序
    results.sort(key=lambda x: x.ratio, reverse=True)
    
    return results


def main():
    """主函数"""
    import argparse
    
    parser = argparse.ArgumentParser(description='从通达信数据筛选3倍量股票')
    parser.add_argument('--date', type=str, help='目标日期 (YYYY-MM-DD)，默认今天')
    parser.add_argument('--days', type=int, default=1, help='分析最近N个交易日')
    parser.add_argument('--output', type=str, default='./output', help='输出目录')
    args = parser.parse_args()
    
    # 确定分析日期
    if args.date:
        target_date = datetime.strptime(args.date, '%Y-%m-%d').date()
    else:
        target_date = date.today()
        # 如果是周末，回退到周五
        while target_date.weekday() >= 5:
            target_date -= timedelta(days=1)
    
    print("=" * 60)
    print(f"通达信3倍量选股工具")
    print(f"通达信路径: {TDX_PATH}")
    print(f"分析日期: {target_date}")
    print("=" * 60)
    
    # 查找3倍量股票
    results = find_triple_volume_stocks(target_date)
    
    print(f"\n找到 {len(results)} 只3倍量股票:\n")
    print(f"{'排名':<4} {'代码':<10} {'昨日成交量':<12} {'今日成交量':<12} {'倍数':<8} {'收盘价':<8} {'涨跌幅':<8}")
    print("-" * 80)
    
    for i, r in enumerate(results[:20], 1):  # 只显示前20只
        print(f"{i:<4} {r.stock_code:<10} {r.yesterday_volume:<12,} {r.today_volume:<12,} {r.ratio:<8.2f} {r.close_price:<8.2f} {r.change_pct:<8.2f}%")
    
    # 保存结果
    if not os.path.exists(args.output):
        os.makedirs(args.output)
    
    # 保存JSON
    json_file = os.path.join(args.output, f'tdx_triple_volume_{target_date.strftime("%Y%m%d")}.json')
    with open(json_file, 'w', encoding='utf-8') as f:
        json.dump([asdict(r) for r in results], f, ensure_ascii=False, indent=2, default=str)
    print(f"\n✅ JSON结果已保存: {json_file}")
    
    # 保存CSV
    csv_file = os.path.join(args.output, f'tdx_triple_volume_{target_date.strftime("%Y%m%d")}.csv')
    if results:
        with open(csv_file, 'w', encoding='utf-8-sig', newline='') as f:
            writer = csv.writer(f)
            writer.writerow(['排名', '代码', '名称', '日期', '昨日成交量', '今日成交量', '放量倍数', '开盘价', '收盘价', '最高价', '最低价', '涨跌幅'])
            for i, r in enumerate(results, 1):
                writer.writerow([i, r.stock_code, r.stock_name, r.trade_date, r.yesterday_volume, r.today_volume, r.ratio, r.open_price, r.close_price, r.high_price, r.low_price, f"{r.change_pct}%"])
        print(f"✅ CSV结果已保存: {csv_file}")
    
    # 输出nanobot标准格式
    def json_serial(obj):
        if isinstance(obj, date):
            return obj.isoformat()
        raise TypeError(f"Type {type(obj)} not serializable")
    
    output = {
        "success": True,
        "stock_count": len(results),
        "trade_date": target_date.isoformat(),
        "csv_file": csv_file if results else "",
        "json_file": json_file,
        "stocks": [asdict(r) for r in results[:10]]  # 前10只详情
    }
    
    print(f"\n###NANOBOT_OUTPUT_START###{json.dumps(output, ensure_ascii=False, default=json_serial)}###NANOBOT_OUTPUT_END###")
    
    return results


if __name__ == "__main__":
    main()
