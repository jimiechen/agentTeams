#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
从通达信量化平台获取数据并筛选3倍量股票
使用 tqcenter 接口批量获取全市场数据
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


def get_latest_trade_date() -> date:
    """获取最近交易日"""
    today = date.today()
    # 如果是周末，回退到周五
    while today.weekday() >= 5:
        today -= timedelta(days=1)
    return today


def get_prev_trade_date(target_date: date) -> date:
    """获取前一个交易日"""
    prev_date = target_date - timedelta(days=1)
    # 跳过周末
    while prev_date.weekday() >= 5:
        prev_date -= timedelta(days=1)
    return prev_date


def find_triple_volume_stocks(target_date: date) -> List[TripleVolumeResult]:
    """
    使用通达信量化平台查找3倍量股票
    """
    results = []
    
    # 获取前一个交易日
    prev_date = get_prev_trade_date(target_date)
    
    print(f"📊 选股日期: {target_date}")
    print(f"📊 对比日期: {prev_date}")
    print("=" * 60)
    
    # 1. 获取全市场股票列表（沪深A股）
    print("\n1️⃣ 获取全市场股票列表...")
    try:
        batch_codes = tq.get_stock_list_in_sector('沪深A股')
        print(f"   共 {len(batch_codes)} 只股票")
    except Exception as e:
        print(f"❌ 获取股票列表失败: {e}")
        return results
    
    # 2. 批量获取成交量和收盘价数据
    print("\n2️⃣ 批量获取成交量数据...")
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
        print(f"   数据获取成功")
    except Exception as e:
        print(f"❌ 获取市场数据失败: {e}")
        return results
    
    # 3. 转换为宽表格式
    print("\n3️⃣ 处理数据...")
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
    print("\n4️⃣ 计算放量倍数...")
    
    # 获取两日数据
    if len(volume_df) < 2:
        print("❌ 数据不足，无法计算")
        return results
    
    prev_volume = volume_df.iloc[-2]  # 前一日成交量
    today_volume = volume_df.iloc[-1]  # 当日成交量
    
    prev_close = close_df.iloc[-2]    # 前一日收盘价
    today_close = close_df.iloc[-1]   # 当日收盘价
    today_open = open_df.iloc[-1]     # 当日开盘价
    today_high = high_df.iloc[-1]     # 当日最高价
    today_low = low_df.iloc[-1]       # 当日最低价
    
    # 过滤掉成交量为0的股票
    valid_mask = (prev_volume > 0) & (today_volume > 0)
    
    # 计算放量倍数
    ratio = today_volume / prev_volume
    
    # 计算涨跌幅
    change_pct = (today_close - prev_close) / prev_close * 100
    
    # 5. 筛选3倍量股票
    triple_mask = (ratio >= 3.0) & valid_mask
    triple_stocks = ratio[triple_mask].sort_values(ascending=False)
    
    print(f"   找到 {len(triple_stocks)} 只3倍量股票")
    
    # 6. 构建结果列表
    for stock_code in triple_stocks.index:
        results.append(TripleVolumeResult(
            stock_code=stock_code,
            stock_name=stock_code,  # 暂时使用代码作为名称
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


def create_tdx_block(block_code: str, block_name: str, stock_codes: List[str]):
    """
    创建通达信自定义板块
    """
    print(f"\n5️⃣ 创建通达信自定义板块...")
    
    try:
        # 创建板块
        tq.create_sector(block_code=block_code, block_name=block_name)
        print(f"   ✅ 创建板块: {block_name} ({block_code})")
        
        # 添加股票到板块
        if stock_codes:
            tq.send_user_block(block_code=block_code, stocks=stock_codes)
            print(f"   ✅ 添加 {len(stock_codes)} 只股票到板块")
        
        return True
    except Exception as e:
        print(f"   ⚠️ 板块操作提示: {e}")
        return False


def save_results(results: List[TripleVolumeResult], target_date: date, output_dir: str):
    """保存结果到文件"""
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
    
    # 保存CSV
    csv_file = os.path.join(output_dir, f'tdx_triple_volume_{target_date.strftime("%Y%m%d")}.csv')
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
        print(f"   ✅ CSV已保存: {csv_file}")
    
    # 保存JSON
    json_file = os.path.join(output_dir, f'tdx_triple_volume_{target_date.strftime("%Y%m%d")}.json')
    with open(json_file, 'w', encoding='utf-8') as f:
        json.dump([asdict(r) for r in results], f, ensure_ascii=False, indent=2, default=str)
    print(f"   ✅ JSON已保存: {json_file}")
    
    return csv_file, json_file


def main():
    """主函数"""
    import argparse
    
    parser = argparse.ArgumentParser(description='通达信量化平台3倍量选股')
    parser.add_argument('--date', type=str, help='目标日期 (YYYY-MM-DD)，默认最近交易日')
    parser.add_argument('--output', type=str, default='./output', help='输出目录')
    args = parser.parse_args()
    
    # 确定分析日期
    if args.date:
        target_date = datetime.strptime(args.date, '%Y-%m-%d').date()
    else:
        target_date = get_latest_trade_date()
    
    print("=" * 60)
    print(f"🚀 通达信量化平台3倍量选股")
    print(f"📅 分析日期: {target_date}")
    print("=" * 60)
    
    # 初始化通达信量化平台
    print("\n🔌 初始化通达信量化平台...")
    try:
        tq.initialize(__file__)
        print("   ✅ 初始化成功")
    except Exception as e:
        print(f"❌ 初始化失败: {e}")
        print("请确保已启动通达信金融终端")
        return
    
    # 查找3倍量股票
    results = find_triple_volume_stocks(target_date)
    
    # 显示结果
    print(f"\n{'=' * 60}")
    print(f"🏆 选股结果 - 共 {len(results)} 只3倍量股票")
    print(f"{'=' * 60}\n")
    
    print(f"{'排名':<4} {'代码':<12} {'昨日成交量':<12} {'今日成交量':<12} {'倍数':<8} {'收盘价':<8} {'涨跌幅':<8}")
    print("-" * 80)
    
    for i, r in enumerate(results[:20], 1):  # 只显示前20只
        print(f"{i:<4} {r.stock_code:<12} {r.yesterday_volume:<12,} {r.today_volume:<12,} "
              f"{r.ratio:<8.2f} {r.close_price:<8.2f} {r.change_pct:<8.2f}%")
    
    # 保存结果
    csv_file, json_file = save_results(results, target_date, args.output)
    
    # 创建通达信自定义板块
    if results:
        block_code = f"3BL{target_date.strftime('%m%d')}"
        block_name = f"3倍量{target_date.strftime('%Y%m%d')}"
        stock_codes = [r.stock_code for r in results]
        create_tdx_block(block_code, block_name, stock_codes)
    
    # 输出nanobot标准格式
    output = {
        "success": True,
        "stock_count": len(results),
        "trade_date": target_date.isoformat(),
        "csv_file": csv_file if results else "",
        "json_file": json_file,
        "stocks": [asdict(r) for r in results[:10]]
    }
    
    print(f"\n###NANOBOT_OUTPUT_START###{json.dumps(output, ensure_ascii=False, default=str)}###NANOBOT_OUTPUT_END###")
    
    return results


if __name__ == "__main__":
    main()
