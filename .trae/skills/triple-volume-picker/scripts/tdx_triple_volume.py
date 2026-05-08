#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
从通达信量化平台获取数据并筛选3倍量股票
使用 tqcenter 接口批量获取全市场数据
输出Markdown格式报告，并同步到通达信自定义板块
"""

import os
import sys

# 添加通达信 PYPlugins 目录到 Python 路径
TDX_PATH = r"C:\new_tdx_test"
PYPLUGINS_PATH = os.path.join(TDX_PATH, "PYPlugins", "user")
if os.path.exists(PYPLUGINS_PATH):
    sys.path.insert(0, PYPLUGINS_PATH)

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
    print("[失败] 错误: 无法导入 tqcenter 模块")
    print(f"请检查通达信安装目录: {PYPLUGINS_PATH}")
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
    """获取最近交易日（使用通达信接口）"""
    try:
        # 使用通达信接口获取最近交易日
        # 需要设置 start_time 和 end_time，count 才有效
        trade_dates = tq.get_trading_dates(market='SH', start_time='', end_time='', count=1)
        if trade_dates and len(trade_dates) > 0:
            # 取最后一个（最新的）
            return datetime.strptime(trade_dates[-1], '%Y%m%d').date()
    except Exception as e:
        print(f"[警告] 获取最近交易日失败: {e}")
    
    # 回退到本地计算
    today = date.today()
    while today.weekday() >= 5:
        today -= timedelta(days=1)
    return today


def get_prev_trade_date(target_date: date) -> date:
    """获取前一个交易日（使用通达信接口）"""
    try:
        # 使用通达信接口获取最近5个交易日
        trade_dates = tq.get_trading_dates(market='SH', start_time='', end_time='', count=5)
        print(f"   [调试] 通达信返回交易日: {trade_dates}")
        if trade_dates and len(trade_dates) >= 2:
            # 取最后两个（最新的两个）
            latest = datetime.strptime(trade_dates[-1], '%Y%m%d').date()
            prev = datetime.strptime(trade_dates[-2], '%Y%m%d').date()
            print(f"   [调试] 最近交易日: {latest}, 前一个: {prev}")
            if target_date >= latest:
                return prev
    except Exception as e:
        print(f"[警告] 获取前一个交易日失败: {e}")
    
    # 回退到本地计算
    prev_date = target_date - timedelta(days=1)
    while prev_date.weekday() >= 5:
        prev_date -= timedelta(days=1)
    return prev_date


def find_triple_volume_stocks(target_date: date) -> List[TripleVolumeResult]:
    """
    使用通达信量化平台查找3倍量股票
    """
    results = []
    stock_names = {}  # 初始化股票名称字典
    
    # 获取前一个交易日
    prev_date = get_prev_trade_date(target_date)
    
    print(f"[数据] 选股日期: {target_date}")
    print(f"[数据] 对比日期: {prev_date}")
    print("=" * 60)
    
    # 1. 获取全市场股票列表（使用 get_stock_list）
    print("\n[1] 获取全市场股票列表...")
    try:
        # 使用代码 '5' 获取所有A股
        batch_codes = tq.get_stock_list('5')
        print(f"   获取到 {len(batch_codes)} 只股票")
        
        if not batch_codes or len(batch_codes) == 0:
            print("[失败] 无法获取股票列表")
            return results
            
    except Exception as e:
        print(f"[失败] 获取股票列表失败: {e}")
        return results
    
    # 1.5 获取股票名称并过滤ST股票
    print("\n[1.5] 获取股票名称并过滤ST股票...")
    try:
        valid_codes = []
        st_count = 0
        
        for code in batch_codes:
            try:
                # 使用 get_stock_info 获取股票信息
                info = tq.get_stock_info(code)
                name = info.get('Name', '') if isinstance(info, dict) else ''
                stock_names[code] = name
                
                # 过滤ST股票（名称中包含ST、*ST、SST等）
                if name and ('ST' in name or '*ST' in name or 'SST' in name):
                    st_count += 1
                    continue
                
                valid_codes.append(code)
            except Exception as e:
                # 如果获取名称失败，保留该股票
                valid_codes.append(code)
        
        batch_codes = valid_codes
        print(f"   过滤ST股票后剩余 {len(batch_codes)} 只")
        print(f"   排除ST股票: {st_count} 只")
        
    except Exception as e:
        print(f"[警告] 获取股票名称失败: {e}")
        # 继续执行，不过滤ST股票
    
    # 2. 批量获取成交量和收盘价数据
    print("\n[2] 批量获取成交量数据...")
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
        print(f"[失败] 获取市场数据失败: {e}")
        return results
    
    # 3. 转换为宽表格式
    print("\n[3] 处理数据...")
    try:
        volume_df = tq.price_df(df_real, 'Volume', column_names=batch_codes)
        close_df = tq.price_df(df_real, 'Close', column_names=batch_codes)
        open_df = tq.price_df(df_real, 'Open', column_names=batch_codes)
        high_df = tq.price_df(df_real, 'High', column_names=batch_codes)
        low_df = tq.price_df(df_real, 'Low', column_names=batch_codes)
    except Exception as e:
        print(f"[失败] 数据处理失败: {e}")
        return results
    
    # 4. 计算放量倍数并过滤股票
    print("\n[4] 计算放量倍数并过滤...")
    
    # 检查数据行数
    print(f"   数据行数: {len(volume_df)}")
    
    # 获取两日数据
    if len(volume_df) < 2:
        print(f"[警告] 数据不足，只有 {len(volume_df)} 天数据")
        print(f"[提示] 可能是当天数据尚未收盘，或通达信数据未更新")
        print(f"[提示] 尝试使用历史数据模式...")
        
        # 如果只有一天数据，尝试获取前两个交易日的数据
        try:
            from trading_calendar import get_recent_trade_dates
            recent_dates = get_recent_trade_dates(2, target_date)
            if len(recent_dates) >= 2:
                prev_date = recent_dates[0]
                target_date = recent_dates[1]
                print(f"   调整分析日期: {target_date} (对比 {prev_date})")
                
                # 重新获取数据
                df_real = tq.get_market_data(
                    field_list=['Volume', 'Close', 'Open', 'High', 'Low'],
                    stock_list=batch_codes,
                    start_time=prev_date.strftime('%Y%m%d'),
                    end_time=target_date.strftime('%Y%m%d'),
                    period='1d',
                    dividend_type='none',
                    fill_data=True
                )
                
                volume_df = tq.price_df(df_real, 'Volume', column_names=batch_codes)
                close_df = tq.price_df(df_real, 'Close', column_names=batch_codes)
                open_df = tq.price_df(df_real, 'Open', column_names=batch_codes)
                high_df = tq.price_df(df_real, 'High', column_names=batch_codes)
                low_df = tq.price_df(df_real, 'Low', column_names=batch_codes)
                
                print(f"   重新获取后数据行数: {len(volume_df)}")
        except Exception as e:
            print(f"[失败] 重新获取数据失败: {e}")
        
        # 再次检查数据
        if len(volume_df) < 2:
            print("[失败] 数据仍然不足，无法计算")
            print("[建议] 请检查通达信是否已收盘，或尝试使用 --date 参数指定历史日期")
            return results
    
    prev_volume = volume_df.iloc[-2]  # 前一日成交量
    today_volume = volume_df.iloc[-1]  # 当日成交量
    
    prev_close = close_df.iloc[-2]    # 前一日收盘价
    today_close = close_df.iloc[-1]   # 当日收盘价
    today_open = open_df.iloc[-1]     # 当日开盘价
    today_high = high_df.iloc[-1]     # 当日最高价
    today_low = low_df.iloc[-1]       # 当日最低价
    
    # 过滤条件：非ST、非科创板、非创业板、非北交所
    def is_valid_stock(code):
        """检查股票是否符合条件"""
        # 排除科创板（688开头）
        if code.startswith('688'):
            return False
        
        # 排除创业板（300、301开头）
        if code.startswith('300') or code.startswith('301'):
            return False
        
        # 排除北交所（8开头或4开头）
        if code.startswith('8') or code.startswith('4'):
            return False
        
        # 只保留主板（600、601、603、605、000、001、002开头）
        pure_code = code.split('.')[0]
        if pure_code.startswith('600') or pure_code.startswith('601') or \
           pure_code.startswith('603') or pure_code.startswith('605') or \
           pure_code.startswith('000') or pure_code.startswith('001') or \
           pure_code.startswith('002'):
            return True
        
        return False
    
    # 应用过滤条件
    valid_stocks = [code for code in batch_codes if is_valid_stock(code)]
    print(f"   过滤后剩余 {len(valid_stocks)} 只主板股票")
    
    # 只保留有效股票的成交量数据
    prev_volume = prev_volume[valid_stocks]
    today_volume = today_volume[valid_stocks]
    prev_close = prev_close[valid_stocks]
    today_close = today_close[valid_stocks]
    today_open = today_open[valid_stocks]
    today_high = today_high[valid_stocks]
    today_low = today_low[valid_stocks]
    
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
        # 获取股票名称，如果没有则使用代码
        stock_name = stock_names.get(stock_code, stock_code)
        results.append(TripleVolumeResult(
            stock_code=stock_code,
            stock_name=stock_name,
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


def create_or_update_tdx_block(block_code: str, block_name: str, stock_codes: List[str]):
    """
    创建或更新通达信自定义板块
    使用 tq.create_sector API 创建板块，使用 tq.send_user_block 添加股票
    """
    print(f"\n[5] 更新通达信自定义板块...")
    
    try:
        # 1. 创建板块（如果已存在会返回错误，但我们可以忽略）
        try:
            result = tq.create_sector(block_code=block_code, block_name=block_name)
            print(f"   [成功] 创建板块: {block_name} ({block_code})")
            print(f"   [调试] create_sector 返回: {result}")
        except Exception as e:
            # 板块已存在，继续执行
            print(f"   [信息] 板块已存在: {block_name} ({block_code})")
        
        # 2. 先清空板块（避免重复添加）
        try:
            tq.send_user_block(block_code=block_code, stocks=[])
            print(f"   [成功] 清空板块原有股票")
        except Exception as e:
            print(f"   [警告] 清空板块提示: {e}")
        
        # 3. 添加股票到板块
        if stock_codes:
            # send_user_block 需要原始格式的股票代码（带后缀）
            # 例如: 001896.SZ, 600000.SH
            tq.send_user_block(block_code=block_code, stocks=stock_codes)
            print(f"   [成功] 添加 {len(stock_codes)} 只股票到板块")
        
        print(f"   [信息] 板块代码: {block_code}")
        print(f"   [提示] 请在通达信中查看板块: {block_name}")
        
        return True
    except Exception as e:
        print(f"   [失败] 板块操作失败: {e}")
        import traceback
        traceback.print_exc()
        return False


def generate_markdown_report(results: List[TripleVolumeResult], target_date: date) -> str:
    """生成Markdown格式报告"""
    
    # 统计信息
    total_stocks = len(results)
    avg_ratio = sum(r.ratio for r in results) / total_stocks if total_stocks > 0 else 0
    up_stocks = len([r for r in results if r.change_pct > 0])
    down_stocks = len([r for r in results if r.change_pct < 0])
    up_pct = up_stocks / total_stocks * 100 if total_stocks > 0 else 0
    down_pct = down_stocks / total_stocks * 100 if total_stocks > 0 else 0
    
    # 生成Markdown
    md = f"""# [数据] 三倍量选股报告 - {target_date.strftime('%Y年%m月%d日')}

## [上涨] 统计概览

| 指标 | 数值 |
|:------|------:|
| 分析日期 | {target_date} |
| 对比日期 | {get_prev_trade_date(target_date)} |
| 3倍量股票数 | **{total_stocks}只** |
| 平均放量倍数 | {avg_ratio:.2f}x |
| 上涨股票数 | {up_stocks}只 ({up_pct:.1f}%) |
| 下跌股票数 | {down_stocks}只 ({down_pct:.1f}%) |

---

## [结果] TOP 30 简表（按放量倍数排序）

| 排名 | 代码 | 昨日成交量 | 今日成交量 | 放量倍数 | 收盘价 | 涨跌幅 |
|:----:|:----:|----------:|----------:|:--------:|-------:|:------:|
"""
    
    # 添加前30只股票
    for i, r in enumerate(results[:30], 1):
        change_emoji = "[上涨]" if r.change_pct > 0 else "[下跌]" if r.change_pct < 0 else "[平]"
        md += f"| {i} | {r.stock_code} | {r.yesterday_volume:,} | {r.today_volume:,} | **{r.ratio:.2f}x** | {r.close_price} | {change_emoji} {r.change_pct:.2f}% |\n"
    
    # 详细数据表
    md += f"""
---

## [列表] 详细数据表（全部{total_stocks}只）

| 排名 | 代码 | 昨日成交量 | 今日成交量 | 放量倍数 | 开盘价 | 收盘价 | 最高价 | 最低价 | 涨跌幅 |
|:----:|:----:|----------:|----------:|:--------:|-------:|-------:|-------:|-------:|:------:|
"""
    
    for i, r in enumerate(results, 1):
        md += f"| {i} | {r.stock_code} | {r.yesterday_volume:,} | {r.today_volume:,} | {r.ratio:.2f}x | {r.open_price} | {r.close_price} | {r.high_price} | {r.low_price} | {r.change_pct:.2f}% |\n"
    
    # 使用说明
    md += f"""
---

## [提示] 使用说明

1. **通达信板块**: 已在通达信创建自定义板块 `3倍量{target_date.strftime('%Y%m%d')}`，包含全部{total_stocks}只股票
2. **过滤条件**:
   - [成功] 非ST股票（名称过滤）
   - [成功] 非科创板（688开头）
   - [成功] 非创业板（300/301开头）
   - [成功] 非北交所（8/4开头）
   - [成功] 仅主板（600/601/603/605/000/001/002开头）
3. **数据说明**: 
   - 放量倍数 = 今日成交量 / 昨日成交量
   - 成交量单位：股

---

*报告生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}*
"""
    
    return md


def save_results(results: List[TripleVolumeResult], target_date: date, output_dir: str):
    """保存结果到文件（CSV、JSON、Markdown）"""
    # 按年月创建子目录
    month_dir = target_date.strftime("%Y%m")
    full_output_dir = os.path.join(output_dir, month_dir)
    
    if not os.path.exists(full_output_dir):
        os.makedirs(full_output_dir)
    
    # 保存CSV
    csv_file = os.path.join(full_output_dir, f'tdx_triple_volume_{target_date.strftime("%Y%m%d")}.csv')
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
        print(f"   [成功] CSV已保存: {csv_file}")
    
    # 保存JSON
    json_file = os.path.join(full_output_dir, f'tdx_triple_volume_{target_date.strftime("%Y%m%d")}.json')
    with open(json_file, 'w', encoding='utf-8') as f:
        json.dump([asdict(r) for r in results], f, ensure_ascii=False, indent=2, default=str)
    print(f"   [成功] JSON已保存: {json_file}")
    
    # 保存Markdown
    md_file = os.path.join(full_output_dir, f'tdx_triple_volume_{target_date.strftime("%Y%m%d")}.md')
    md_content = generate_markdown_report(results, target_date)
    with open(md_file, 'w', encoding='utf-8') as f:
        f.write(md_content)
    print(f"   [成功] Markdown已保存: {md_file}")
    
    return csv_file, json_file, md_file


def main():
    """主函数"""
    import argparse
    
    parser = argparse.ArgumentParser(description='通达信量化平台3倍量选股')
    parser.add_argument('--date', type=str, help='目标日期 (YYYY-MM-DD)，默认最近交易日')
    parser.add_argument('--days', type=int, default=1, help='分析最近N个交易日 (与--date互斥)')
    parser.add_argument('--output', type=str, default=r'd:\agentsTeam\output', help='输出目录')
    args = parser.parse_args()
    
    # 导入交易日历
    from trading_calendar import validate_trading_date, get_date_type_desc, get_recent_trade_dates
    
    # 确定分析日期
    if args.date:
        # 优先使用 --date 参数
        input_date = datetime.strptime(args.date, '%Y-%m-%d').date()
        target_date, is_original, original_desc = validate_trading_date(input_date)
    else:
        # 使用 --days 参数获取最近交易日
        recent_dates = get_recent_trade_dates(args.days)
        target_date = recent_dates[-1]  # 取最近一个交易日
        is_original = True
        original_desc = f"最近第{args.days}个交易日"
    
    print("=" * 60)
    print(f"[启动] 通达信量化平台3倍量选股")
    if is_original:
        print(f"[日期] 分析日期: {target_date} ({original_desc})")
    else:
        print(f"[日期] 输入日期: {input_date} ({original_desc})")
        print(f"[日期] 实际使用: {target_date} (最近交易日)")
    print("=" * 60)
    
    # 初始化通达信量化平台
    print("\n[初始化] 通达信量化平台...")
    try:
        tq.initialize(__file__)
        print("   [成功] 初始化成功")
    except Exception as e:
        print(f"   [失败] 初始化失败: {e}")
        print("请确保已启动通达信金融终端")
        return
    
    # 查找3倍量股票
    results = find_triple_volume_stocks(target_date)
    
    # 显示结果
    print(f"\n{'=' * 60}")
    print(f"[结果] 选股结果 - 共 {len(results)} 只3倍量股票")
    print(f"{'=' * 60}\n")
    
    print(f"{'排名':<4} {'代码':<12} {'昨日成交量':<12} {'今日成交量':<12} {'倍数':<8} {'收盘价':<8} {'涨跌幅':<8}")
    print("-" * 80)
    
    for i, r in enumerate(results[:20], 1):  # 只显示前20只
        print(f"{i:<4} {r.stock_code:<12} {r.yesterday_volume:<12,} {r.today_volume:<12,} "
              f"{r.ratio:<8.2f} {r.close_price:<8.2f} {r.change_pct:<8.2f}%")
    
    # 保存结果
    csv_file, json_file, md_file = save_results(results, target_date, args.output)
    
    # 创建或更新通达信自定义板块
    if results:
        block_code = f"3BL{target_date.strftime('%m%d')}"
        block_name = f"3倍量{target_date.strftime('%Y%m%d')}"
        stock_codes = [r.stock_code for r in results]
        create_or_update_tdx_block(block_code, block_name, stock_codes)
    
    # 输出nanobot标准格式
    output = {
        "success": True,
        "stock_count": len(results),
        "trade_date": target_date.isoformat(),
        "csv_file": csv_file if results else "",
        "json_file": json_file,
        "md_file": md_file,
        "stocks": [asdict(r) for r in results[:10]]
    }
    
    print(f"\n###NANOBOT_OUTPUT_START###{json.dumps(output, ensure_ascii=False, default=str)}###NANOBOT_OUTPUT_END###")
    
    return results


if __name__ == "__main__":
    main()
