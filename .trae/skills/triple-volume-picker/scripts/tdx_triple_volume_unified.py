#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
通达信3倍量选股 - 统一输出版本
输出到 d:\agentsTeam\output\YYYYMM\ 目录
每天生成一个CSV和MD文件
"""

import os
import sys
from pathlib import Path

# 添加通达信 PYPlugins 目录到 Python 路径
TDX_PATH = r"C:\new_tdx_test"
PYPLUGINS_PATH = os.path.join(TDX_PATH, "PYPlugins", "user")
if os.path.exists(PYPLUGINS_PATH):
    sys.path.insert(0, PYPLUGINS_PATH)

import pandas as pd
from datetime import datetime, date, timedelta
from typing import List, Dict
from dataclasses import dataclass, asdict
import json
import csv

# 导入通达信量化平台接口
try:
    from tqcenter import tq
except ImportError:
    print("[失败] 错误: 无法导入 tqcenter 模块")
    sys.exit(1)


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


def get_output_dir(target_date: date) -> str:
    """获取统一输出目录"""
    base_dir = r"d:\agentsTeam\output"
    # 按年月分目录: 202603
    month_dir = target_date.strftime("%Y%m")
    output_dir = os.path.join(base_dir, month_dir)
    return output_dir


def get_latest_trade_date() -> date:
    """获取最近交易日"""
    try:
        trade_dates = tq.get_trading_dates(market='SH', start_time='', end_time='', count=1)
        if trade_dates and len(trade_dates) > 0:
            return datetime.strptime(trade_dates[-1], '%Y%m%d').date()
    except Exception as e:
        print(f"[警告] 获取最近交易日失败: {e}")
    
    # 回退到本地计算
    today = date.today()
    while today.weekday() >= 5:
        today -= timedelta(days=1)
    return today


def get_prev_trade_date(target_date: date) -> date:
    """获取前一个交易日"""
    try:
        trade_dates = tq.get_trading_dates(market='SH', start_time='', end_time='', count=5)
        if trade_dates and len(trade_dates) >= 2:
            latest = datetime.strptime(trade_dates[-1], '%Y%m%d').date()
            prev = datetime.strptime(trade_dates[-2], '%Y%m%d').date()
            if target_date >= latest:
                return prev
    except Exception as e:
        print(f"[警告] 获取前一个交易日失败: {e}")
    
    prev_date = target_date - timedelta(days=1)
    while prev_date.weekday() >= 5:
        prev_date -= timedelta(days=1)
    return prev_date


def find_triple_volume_stocks(target_date: date) -> List[TripleVolumeResult]:
    """查找3倍量股票"""
    results = []
    stock_names = {}
    
    prev_date = get_prev_trade_date(target_date)
    print(f"[分析] 目标日期: {target_date}, 对比日期: {prev_date}")
    
    # 获取所有A股代码
    all_stocks = tq.get_stock_list(market='SH') + tq.get_stock_list(market='SZ')
    total = len(all_stocks)
    print(f"[信息] 共 {total} 只股票需要分析")
    
    for i, stock_code in enumerate(all_stocks, 1):
        try:
            # 获取股票名称
            if stock_code not in stock_names:
                try:
                    stock_info = tq.get_stock_info(stock_code)
                    stock_name = stock_info.get('name', '')
                    stock_names[stock_code] = stock_name
                except:
                    stock_name = ''
            else:
                stock_name = stock_names[stock_code]
            
            # 获取今日数据
            today_data = tq.get_kline_data(stock_code, start_time=target_date.strftime('%Y%m%d'), 
                                            end_time=target_date.strftime('%Y%m%d'), freq='day')
            if today_data is None or len(today_data) == 0:
                continue
                
            today_volume = today_data['volume'].iloc[0]
            today_open = today_data['open'].iloc[0]
            today_close = today_data['close'].iloc[0]
            today_high = today_data['high'].iloc[0]
            today_low = today_data['low'].iloc[0]
            
            # 获取昨日数据
            prev_data = tq.get_kline_data(stock_code, start_time=prev_date.strftime('%Y%m%d'),
                                          end_time=prev_date.strftime('%Y%m%d'), freq='day')
            if prev_data is None or len(prev_data) == 0:
                continue
                
            prev_volume = prev_data['volume'].iloc[0]
            
            # 计算放量倍数
            if prev_volume > 0:
                ratio = today_volume / prev_volume
                
                # 判断是否为3倍量
                if ratio >= 3.0:
                    change_pct = ((today_close - prev_data['close'].iloc[0]) / prev_data['close'].iloc[0]) * 100
                    
                    result = TripleVolumeResult(
                        stock_code=stock_code,
                        stock_name=stock_name,
                        trade_date=target_date,
                        yesterday_volume=int(prev_volume),
                        today_volume=int(today_volume),
                        ratio=round(ratio, 2),
                        open_price=round(today_open, 2),
                        close_price=round(today_close, 2),
                        high_price=round(today_high, 2),
                        low_price=round(today_low, 2),
                        change_pct=round(change_pct, 2)
                    )
                    results.append(result)
                    
            # 每100只显示进度
            if i % 100 == 0:
                print(f"   进度: {i}/{total} ({i/total*100:.1f}%) - 已找到 {len(results)} 只")
                
        except Exception as e:
            continue
    
    # 按放量倍数排序
    results.sort(key=lambda x: x.ratio, reverse=True)
    return results


def generate_markdown_report(results: List[TripleVolumeResult], target_date: date) -> str:
    """生成Markdown报告"""
    md = f"""# 通达信3倍量选股报告

**选股日期**: {target_date}
**选股数量**: {len(results)} 只
**生成时间**: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

## 选股结果

| 排名 | 代码 | 名称 | 放量倍数 | 涨跌幅 | 收盘价 |
|------|------|------|----------|--------|--------|
"""
    
    for i, r in enumerate(results, 1):
        md += f"| {i} | {r.stock_code} | {r.stock_name} | {r.ratio}倍 | {r.change_pct}% | {r.close_price} |\n"
    
    md += f"""
## 详细数据

| 排名 | 代码 | 名称 | 日期 | 昨日成交量 | 今日成交量 | 放量倍数 | 开盘价 | 收盘价 | 最高价 | 最低价 | 涨跌幅 |
|------|------|------|------|------------|------------|----------|--------|--------|--------|--------|--------|
"""
    
    for i, r in enumerate(results, 1):
        md += f"| {i} | {r.stock_code} | {r.stock_name} | {r.trade_date} | {r.yesterday_volume} | {r.today_volume} | {r.ratio} | {r.open_price} | {r.close_price} | {r.high_price} | {r.low_price} | {r.change_pct}% |\n"
    
    return md


def save_results(results: List[TripleVolumeResult], target_date: date):
    """保存结果到统一输出目录"""
    output_dir = get_output_dir(target_date)
    
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
        print(f"[创建] 输出目录: {output_dir}")
    
    date_str = target_date.strftime("%Y%m%d")
    
    # 保存CSV
    csv_file = os.path.join(output_dir, f'tdx_triple_volume_{date_str}.csv')
    if results:
        with open(csv_file, 'w', encoding='utf-8-sig', newline='') as f:
            writer = csv.writer(f)
            writer.writerow(['排名', '代码', '名称', '日期', '昨日成交量', '今日成交量', 
                           '放量倍数', '开盘价', '收盘价', '最高价', '最低价', '涨跌幅'])
            for i, r in enumerate(results, 1):
                writer.writerow([i, r.stock_code, r.stock_name, r.trade_date,
                               r.yesterday_volume, r.today_volume, r.ratio,
                               r.open_price, r.close_price, r.high_price, r.low_price,
                               f"{r.change_pct}%"])
        print(f"[成功] CSV已保存: {csv_file}")
    
    # 保存Markdown
    md_file = os.path.join(output_dir, f'tdx_triple_volume_{date_str}.md')
    md_content = generate_markdown_report(results, target_date)
    with open(md_file, 'w', encoding='utf-8') as f:
        f.write(md_content)
    print(f"[成功] Markdown已保存: {md_file}")
    
    return csv_file, md_file


def main():
    """主函数"""
    import argparse
    
    parser = argparse.ArgumentParser(description='通达信3倍量选股 - 统一输出版本')
    parser.add_argument('--date', type=str, help='目标日期 (YYYY-MM-DD)，默认最近交易日')
    args = parser.parse_args()
    
    # 解析日期
    if args.date:
        target_date = datetime.strptime(args.date, '%Y-%m-%d').date()
    else:
        target_date = get_latest_trade_date()
    
    print(f"\n{'='*60}")
    print(f"通达信3倍量选股 - 统一输出版本")
    print(f"{'='*60}")
    print(f"目标日期: {target_date}")
    print(f"输出目录: {get_output_dir(target_date)}")
    print(f"{'='*60}\n")
    
    # 查找3倍量股票
    results = find_triple_volume_stocks(target_date)
    
    print(f"\n{'='*60}")
    print(f"选股完成！共找到 {len(results)} 只3倍量股票")
    print(f"{'='*60}\n")
    
    # 保存结果
    csv_file, md_file = save_results(results, target_date)
    
    # 输出结果供其他程序使用
    output = {
        "csv_file": csv_file,
        "md_file": md_file,
        "stock_count": len(results),
        "target_date": target_date.strftime('%Y-%m-%d')
    }
    print(f"###NANOBOT_OUTPUT_START###{json.dumps(output, ensure_ascii=False, default=str)}###NANOBOT_OUTPUT_END###")
    
    return results


if __name__ == "__main__":
    main()
