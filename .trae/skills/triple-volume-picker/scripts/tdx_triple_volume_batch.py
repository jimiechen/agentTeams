#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
批量获取最近5个交易日的3倍量股票，并同步到通达信自定义板块
使用 get_trading_dates 获取交易日历
"""

import os
import sys
import pandas as pd
from datetime import datetime, date, timedelta
from typing import List, Dict, Optional
from dataclasses import dataclass, asdict
import json
import csv

# 导入通达信量化平台接口
try:
    from tqcenter import tq
except ImportError:
    print("❌ 错误: 未安装 tqcenter 模块")
    print("请安装: pip install tqcenter")
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


def get_recent_trading_dates(market: str = 'SSE', count: int = 5) -> List[date]:
    """
    获取最近N个交易日
    
    Args:
        market: 市场代码，'SSE'上交所，'SZSE'深交所
        count: 获取交易日数量
    
    Returns:
        交易日列表（从近到远排序）
    """
    # 获取从今天往前推30天的交易日历
    end_date = date.today()
    start_date = end_date - timedelta(days=30)
    
    try:
        trading_dates = tq.get_trading_dates(
            market=market,
            start_time=start_date.strftime('%Y%m%d'),
            end_time=end_date.strftime('%Y%m%d'),
            count=-1
        )
        
        # 转换为date对象，并按日期降序排序（从近到远）
        dates = [datetime.strptime(str(d), '%Y%m%d').date() for d in trading_dates]
        dates.sort(reverse=True)
        
        # 取最近N个交易日
        return dates[:count]
    except Exception as e:
        print(f"❌ 获取交易日历失败: {e}")
        # 如果获取失败，使用简单的回退逻辑
        dates = []
        current = end_date
        while len(dates) < count:
            if current.weekday() < 5:  # 周一到周五
                dates.append(current)
            current -= timedelta(days=1)
        return dates


def find_triple_volume_for_date(target_date: date) -> List[TripleVolumeResult]:
    """
    为指定日期查找3倍量股票
    """
    results = []
    
    # 获取前一个交易日
    trading_dates = tq.get_trading_dates(
        market='SSE',
        start_time=(target_date - timedelta(days=10)).strftime('%Y%m%d'),
        end_time=target_date.strftime('%Y%m%d'),
        count=-1
    )
    
    # 找到target_date的前一个交易日
    target_str = int(target_date.strftime('%Y%m%d'))
    prev_date_str = None
    for d in sorted(trading_dates):
        if d >= target_str:
            break
        prev_date_str = d
    
    if not prev_date_str:
        print(f"❌ 无法找到 {target_date} 的前一个交易日")
        return results
    
    prev_date = datetime.strptime(str(prev_date_str), '%Y%m%d').date()
    
    print(f"\n📅 分析日期: {target_date} (对比: {prev_date})")
    
    # 1. 获取全市场股票列表
    try:
        batch_codes = tq.get_stock_list_in_sector('沪深A股')
    except Exception as e:
        print(f"❌ 获取股票列表失败: {e}")
        return results
    
    # 2. 批量获取数据
    try:
        df_real = tq.get_market_data(
            field_list=['Volume', 'Close', 'Open', 'High', 'Low'],
            stock_list=batch_codes,
            start_time=prev_date.strftime('%Y%m%d'),
            end_time=target_date.strftime('%Y%m%d'),
            period='1d',
            dividend_type='none',
            fill_data=True
        )
    except Exception as e:
        print(f"❌ 获取市场数据失败: {e}")
        return results
    
    # 3. 转换为宽表
    try:
        volume_df = tq.price_df(df_real, 'Volume', column_names=batch_codes)
        close_df = tq.price_df(df_real, 'Close', column_names=batch_codes)
        open_df = tq.price_df(df_real, 'Open', column_names=batch_codes)
        high_df = tq.price_df(df_real, 'High', column_names=batch_codes)
        low_df = tq.price_df(df_real, 'Low', column_names=batch_codes)
    except Exception as e:
        print(f"❌ 数据处理失败: {e}")
        return results
    
    # 4. 计算放量倍数
    if len(volume_df) < 2:
        print("❌ 数据不足")
        return results
    
    prev_volume = volume_df.iloc[-2]
    today_volume = volume_df.iloc[-1]
    prev_close = close_df.iloc[-2]
    today_close = close_df.iloc[-1]
    today_open = open_df.iloc[-1]
    today_high = high_df.iloc[-1]
    today_low = low_df.iloc[-1]
    
    # 过滤并计算
    valid_mask = (prev_volume > 0) & (today_volume > 0)
    ratio = today_volume / prev_volume
    change_pct = (today_close - prev_close) / prev_close * 100
    
    # 筛选3倍量
    triple_mask = (ratio >= 3.0) & valid_mask
    triple_stocks = ratio[triple_mask].sort_values(ascending=False)
    
    print(f"   找到 {len(triple_stocks)} 只3倍量股票")
    
    # 构建结果
    for stock_code in triple_stocks.index:
        results.append(TripleVolumeResult(
            stock_code=stock_code,
            stock_name=stock_code,
            trade_date=target_date,
            yesterday_volume=int(prev_volume[stock_code]),
            today_volume=int(today_volume[stock_code]),
            ratio=round(ratio[stock_code], 2),
            open_price=round(today_open[stock_code], 2),
            close_price=round(today_close[stock_code], 2),
            high_price=round(today_high[stock_code], 2),
            low_price=round(today_low[stock_code], 2),
            change_pct=round(change_pct[stock_code], 2)
        ))
    
    return results


def create_tdx_block_for_date(target_date: date, stock_codes: List[str]) -> bool:
    """
    为指定日期创建通达信自定义板块
    """
    block_code = f"3BL{target_date.strftime('%m%d')}"
    block_name = f"3倍量{target_date.strftime('%Y%m%d')}"
    
    try:
        # 创建板块
        tq.create_sector(block_code=block_code, block_name=block_name)
        
        # 添加股票
        if stock_codes:
            tq.send_user_block(block_code=block_code, stocks=stock_codes)
        
        print(f"   ✅ 板块: {block_name} ({block_code}) - {len(stock_codes)}只股票")
        return True
    except Exception as e:
        print(f"   ⚠️ 板块创建提示: {e}")
        return False


def save_batch_results(all_results: Dict[date, List[TripleVolumeResult]], output_dir: str):
    """保存批量选股结果"""
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
    
    # 保存汇总CSV
    summary_file = os.path.join(output_dir, 'triple_volume_summary.csv')
    with open(summary_file, 'w', encoding='utf-8-sig', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(['日期', '3倍量股票数', '板块代码', '板块名称'])
        
        for trade_date in sorted(all_results.keys(), reverse=True):
            results = all_results[trade_date]
            block_code = f"3BL{trade_date.strftime('%m%d')}"
            block_name = f"3倍量{trade_date.strftime('%Y%m%d')}"
            writer.writerow([trade_date, len(results), block_code, block_name])
    
    print(f"\n📊 汇总报告已保存: {summary_file}")
    
    # 保存每个日期的详细结果
    for trade_date, results in all_results.items():
        if results:
            csv_file = os.path.join(output_dir, f'triple_volume_{trade_date.strftime("%Y%m%d")}.csv')
            with open(csv_file, 'w', encoding='utf-8-sig', newline='') as f:
                writer = csv.writer(f)
                writer.writerow(['排名', '代码', '名称', '日期', '昨日成交量', '今日成交量', 
                               '放量倍数', '开盘价', '收盘价', '最高价', '最低价', '涨跌幅'])
                for i, r in enumerate(results, 1):
                    writer.writerow([i, r.stock_code, r.stock_name, r.trade_date,
                                   r.yesterday_volume, r.today_volume, r.ratio,
                                   r.open_price, r.close_price, r.high_price, r.low_price,
                                   f"{r.change_pct}%"])


def main():
    """主函数"""
    import argparse
    
    parser = argparse.ArgumentParser(description='批量获取最近5个交易日3倍量股票')
    parser.add_argument('--days', type=int, default=5, help='获取最近N个交易日')
    parser.add_argument('--output', type=str, default='./output', help='输出目录')
    args = parser.parse_args()
    
    print("=" * 70)
    print(f"🚀 通达信量化平台 - 批量3倍量选股")
    print(f"📅 获取最近 {args.days} 个交易日")
    print("=" * 70)
    
    # 初始化通达信量化平台
    print("\n🔌 初始化通达信量化平台...")
    try:
        tq.initialize(__file__)
        print("   ✅ 初始化成功")
    except Exception as e:
        print(f"❌ 初始化失败: {e}")
        print("请确保已启动通达信金融终端")
        return
    
    # 获取最近N个交易日
    print(f"\n📅 获取最近 {args.days} 个交易日...")
    trading_dates = get_recent_trading_dates(market='SSE', count=args.days)
    print(f"   交易日: {[d.strftime('%Y-%m-%d') for d in trading_dates]}")
    
    # 存储所有结果
    all_results = {}
    
    # 为每个交易日进行选股
    print(f"\n{'=' * 70}")
    print("开始批量选股...")
    print(f"{'=' * 70}")
    
    for trade_date in trading_dates:
        # 选股
        results = find_triple_volume_for_date(trade_date)
        all_results[trade_date] = results
        
        # 创建通达信板块
        if results:
            stock_codes = [r.stock_code for r in results]
            create_tdx_block_for_date(trade_date, stock_codes)
        else:
            print(f"   ℹ️ 该日无3倍量股票")
    
    # 保存结果
    print(f"\n{'=' * 70}")
    print("保存结果...")
    print(f"{'=' * 70}")
    save_batch_results(all_results, args.output)
    
    # 显示汇总
    print(f"\n{'=' * 70}")
    print("📊 选股汇总")
    print(f"{'=' * 70}")
    print(f"{'日期':<15} {'股票数量':<10} {'板块代码':<15} {'板块名称':<20}")
    print("-" * 70)
    
    for trade_date in sorted(all_results.keys(), reverse=True):
        results = all_results[trade_date]
        block_code = f"3BL{trade_date.strftime('%m%d')}"
        block_name = f"3倍量{trade_date.strftime('%Y%m%d')}"
        print(f"{trade_date.strftime('%Y-%m-%d'):<15} {len(results):<10} {block_code:<15} {block_name:<20}")
    
    print(f"\n{'=' * 70}")
    print("✅ 批量选股完成！")
    print(f"{'=' * 70}")


if __name__ == "__main__":
    main()
