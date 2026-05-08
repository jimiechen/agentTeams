#!/usr/bin/env python3
"""
批量截图脚本 - 遍历所有历史三倍量选股CSV文件，使用天龙博弈SKILL截图
截图保存到每个股票独立的文件夹: output/YYYYMMDD/tlby/股票代码/

用法:
    python batch_screenshot_from_csv.py [--output-dir <输出目录>] [--today-only]
    
示例:
    python batch_screenshot_from_csv.py                    # 遍历所有历史CSV，截图保存到今天日期/tlby/股票代码/
    python batch_screenshot_from_csv.py --today-only       # 只处理今天的CSV
    python batch_screenshot_from_csv.py --output-dir d:\custom\output  # 指定输出目录

输出目录结构:
    output/YYYYMMDD/
    └── tlby/
        ├── 000001/
        │   ├── intraday_000001_YYYYMMDD_HHMMSS.png
        │   └── daily_000001_YYYYMMDD_HHMMSS.png
        ├── 000002/
        │   ├── intraday_000002_YYYYMMDD_HHMMSS.png
        │   └── daily_000002_YYYYMMDD_HHMMSS.png
        └── ...
"""

import argparse
import csv
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path


def parse_stock_code(code_str: str) -> str:
    """解析股票代码，移除后缀"""
    # 处理格式如 "603269.SH" -> "603269"
    if '.' in code_str:
        return code_str.split('.')[0]
    return code_str


def read_stocks_from_csv(csv_path: str) -> list[dict]:
    """从CSV文件读取股票列表"""
    stocks = []
    csv_file = Path(csv_path)
    
    if not csv_file.exists():
        print(f"错误: CSV文件不存在: {csv_path}")
        return stocks
    
    # 从文件名提取日期
    csv_date = csv_file.stem.split('_')[-1] if '_' in csv_file.stem else ''
    
    try:
        with open(csv_file, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                stock = {
                    'rank': row.get('排名', ''),
                    'code': parse_stock_code(row.get('代码', '')),
                    'name': row.get('名称', ''),
                    'date': row.get('日期', csv_date),
                    'volume_ratio': row.get('放量倍数', ''),
                    'source_csv': csv_file.name
                }
                if stock['code']:
                    stocks.append(stock)
    except Exception as e:
        print(f"读取CSV文件失败: {e}")
        return []
    
    return stocks


def take_screenshot(stock_code: str, output_dir: str, no_launch: bool = True) -> bool:
    """使用tlby_auto.py对单只股票截图"""
    script_dir = Path(__file__).parent
    tlby_script = script_dir / 'tlby_auto.py'
    
    if not tlby_script.exists():
        print(f"错误: 找不到tlby_auto.py脚本: {tlby_script}")
        return False
    
    cmd = [
        sys.executable,
        str(tlby_script),
        '--code', stock_code,
        '--output-dir', output_dir,
        '--wait-time', '3'
    ]
    
    if no_launch:
        cmd.append('--no-launch')
    
    try:
        print(f"    正在截图 {stock_code}...")
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=60
        )
        
        if result.returncode == 0:
            print(f"    ✅ {stock_code} 截图成功")
            return True
        else:
            print(f"    ❌ {stock_code} 截图失败: {result.stderr}")
            return False
    except subprocess.TimeoutExpired:
        print(f"    ⏱️ {stock_code} 截图超时")
        return False
    except Exception as e:
        print(f"    ❌ {stock_code} 截图异常: {e}")
        return False


def batch_screenshot(csv_path: str, base_output_dir: str, limit: int = None):
    """批量截图主函数
    
    截图保存路径: base_output_dir/tlby/股票代码/
    """
    print(f"\n{'=' * 60}")
    print(f"处理CSV文件: {Path(csv_path).name}")
    print(f"基础输出目录: {base_output_dir}")
    print(f"{'=' * 60}")
    
    # 读取股票列表
    stocks = read_stocks_from_csv(csv_path)
    if not stocks:
        print("没有读取到股票数据")
        return 0, 0
    
    total = len(stocks)
    if limit and limit > 0:
        stocks = stocks[:limit]
        print(f"股票总数: {total}, 本次处理: {len(stocks)} (限制模式)")
    else:
        print(f"股票总数: {total}")
    
    # 创建基础输出目录
    base_output_path = Path(base_output_dir)
    base_output_path.mkdir(parents=True, exist_ok=True)
    
    # 创建 tlby 子目录
    tlby_output_path = base_output_path / 'tlby'
    tlby_output_path.mkdir(parents=True, exist_ok=True)
    
    # 统计
    success_count = 0
    fail_count = 0
    
    # 批量截图
    for i, stock in enumerate(stocks, 1):
        stock_code = stock['code']
        stock_name = stock['name']
        
        # 为每只股票创建独立文件夹: tlby/股票代码/
        stock_output_dir = tlby_output_path / stock_code
        stock_output_dir.mkdir(parents=True, exist_ok=True)
        
        print(f"\n  [{i}/{len(stocks)}] {stock_code} {stock_name} (日期:{stock['date']}, 排名:{stock['rank']}, 放量:{stock['volume_ratio']}倍)")
        print(f"    输出路径: {stock_output_dir}")
        
        if take_screenshot(stock_code, str(stock_output_dir)):
            success_count += 1
        else:
            fail_count += 1
        
        # 每只股票之间等待2秒，避免操作过快
        if i < len(stocks):
            time.sleep(2)
    
    # 输出统计
    print(f"\n  CSV文件处理完成: {Path(csv_path).name}")
    print(f"  成功: {success_count}, 失败: {fail_count}")
    
    return success_count, fail_count


def find_all_csv_files(output_base_dir: str = r'd:\agentsTeam\output') -> list[Path]:
    """查找所有历史的三倍量选股CSV文件"""
    output_path = Path(output_base_dir)
    if not output_path.exists():
        print(f"输出目录不存在: {output_base_dir}")
        return []
    
    csv_files = []
    
    # 查找模式: output/YYYYMMDD/tdx_triple_volume_YYYYMMDD.csv
    for date_dir in output_path.iterdir():
        if date_dir.is_dir() and date_dir.name.isdigit() and len(date_dir.name) == 8:
            csv_file = date_dir / f"tdx_triple_volume_{date_dir.name}.csv"
            if csv_file.exists():
                csv_files.append(csv_file)
    
    # 按日期排序（从早到晚）
    csv_files.sort(key=lambda x: x.name)
    
    return csv_files


def get_today_str() -> str:
    """获取今天日期字符串"""
    return datetime.now().strftime('%Y%m%d')


def get_today_csv_path() -> str:
    """获取今日CSV文件路径"""
    today = get_today_str()
    # 尝试多个可能的路径
    possible_paths = [
        Path(fr'd:\agentsTeam\output\{today}\tdx_triple_volume_{today}.csv'),
        Path(fr'd:\agentsTeam\output\tdx_triple_volume_{today}.csv'),
    ]
    
    for path in possible_paths:
        if path.exists():
            return str(path)
    
    # 如果都找不到，返回默认路径
    return str(possible_paths[0])


def main():
    parser = argparse.ArgumentParser(
        description='批量截图 - 遍历所有历史三倍量选股CSV文件并截图，截图保存到每个股票独立文件夹: output/YYYYMMDD/tlby/股票代码/'
    )
    parser.add_argument(
        '--csv', 
        type=str, 
        help='指定单个CSV文件路径（默认遍历所有历史CSV）'
    )
    parser.add_argument(
        '--output-dir', 
        type=str, 
        default=None, 
        help='输出目录（默认使用今天日期文件夹）'
    )
    parser.add_argument(
        '--today-only', 
        action='store_true',
        help='只处理今天的CSV文件'
    )
    parser.add_argument(
        '--limit', 
        type=int, 
        default=None, 
        help='限制每个CSV处理的股票数量'
    )
    parser.add_argument(
        '--max-csv', 
        type=int, 
        default=None, 
        help='限制处理的CSV文件数量'
    )
    
    args = parser.parse_args()
    
    # 确定输出目录 - 统一使用今天日期文件夹
    if args.output_dir:
        output_dir = args.output_dir
    else:
        today = get_today_str()
        output_dir = fr'd:\agentsTeam\output\{today}'
    
    # 创建输出目录
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    
    print(f"\n{'#' * 60}")
    print(f"# 天龙博弈批量截图任务")
    print(f"# 输出目录: {output_dir}")
    print(f"{'#' * 60}")
    
    # 确定要处理的CSV文件列表
    csv_files = []
    
    if args.csv:
        # 指定了单个CSV文件
        csv_files = [Path(args.csv)]
        print(f"\n指定CSV文件: {args.csv}")
    elif args.today_only:
        # 只处理今天的CSV
        today_csv = get_today_csv_path()
        csv_files = [Path(today_csv)]
        print(f"\n只处理今天的CSV: {today_csv}")
    else:
        # 遍历所有历史CSV文件
        csv_files = find_all_csv_files()
        print(f"\n找到 {len(csv_files)} 个历史CSV文件")
        for csv_file in csv_files:
            print(f"  - {csv_file.name}")
    
    if not csv_files:
        print("错误: 没有找到CSV文件")
        return
    
    # 限制CSV文件数量
    if args.max_csv and args.max_csv > 0:
        csv_files = csv_files[:args.max_csv]
        print(f"\n限制处理前 {args.max_csv} 个CSV文件")
    
    # 处理所有CSV文件
    total_success = 0
    total_fail = 0
    total_stocks = 0
    
    for i, csv_file in enumerate(csv_files, 1):
        print(f"\n{'#' * 60}")
        print(f"# 处理进度: [{i}/{len(csv_files)}] {csv_file.name}")
        print(f"{'#' * 60}")
        
        if not csv_file.exists():
            print(f"跳过不存在的文件: {csv_file}")
            continue
        
        success, fail = batch_screenshot(str(csv_file), output_dir, args.limit)
        total_success += success
        total_fail += fail
        total_stocks += success + fail
        
        # 每个CSV文件之间等待5秒
        if i < len(csv_files):
            print(f"\n等待5秒后继续处理下一个CSV文件...")
            time.sleep(5)
    
    # 最终统计
    print(f"\n{'#' * 60}")
    print(f"# 批量截图任务全部完成")
    print(f"{'#' * 60}")
    print(f"处理CSV文件数: {len(csv_files)}")
    print(f"总股票数: {total_stocks}")
    print(f"成功: {total_success}")
    print(f"失败: {total_fail}")
    print(f"输出目录: {output_dir}")
    print(f"{'#' * 60}")


if __name__ == '__main__':
    main()
