#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
三倍量股票批量截图脚本

功能：
1. 读取CSV文件中的三倍量股票列表
2. 批量执行TLBY自动化截图
3. 生成分析报告

作者：nanobot AI
日期：2026-02-26
"""

import csv
import os
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path


def log(message: str) -> None:
    """打印带时间戳的日志信息"""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{timestamp}] {message}")


def read_triple_volume_csv(csv_path: str) -> list:
    """
    读取三倍量股票CSV文件
    
    Args:
        csv_path: CSV文件路径
        
    Returns:
        list: 股票代码列表（去除.SZ/.SH后缀）
    """
    stocks = []
    try:
        with open(csv_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                code = row['代码']
                # 去除.SZ或.SH后缀
                if '.' in code:
                    code = code.split('.')[0]
                stocks.append({
                    'code': code,
                    'name': row['名称'],
                    'volume_ratio': row['放量倍数'],
                    'change': row['涨跌幅']
                })
        log(f"成功读取 {len(stocks)} 只股票从 {csv_path}")
        return stocks
    except Exception as e:
        log(f"读取CSV文件失败: {e}")
        return []


def run_tlby_auto(stock_code: str, output_dir: str, no_launch: bool = True) -> bool:
    """
    执行TLBY自动化脚本
    
    Args:
        stock_code: 股票代码
        output_dir: 输出目录
        no_launch: 是否跳过启动软件
        
    Returns:
        bool: 是否成功
    """
    script_path = Path(__file__).parent / "tlby_auto.py"
    
    cmd = [
        sys.executable,
        str(script_path),
        "--code", stock_code,
        "--output-dir", output_dir,
        "--wait-time", "3"
    ]
    
    if no_launch:
        cmd.append("--no-launch")
    
    try:
        log(f"执行: {' '.join(cmd)}")
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        
        if result.returncode == 0:
            log(f"✅ {stock_code} 截图成功")
            return True
        else:
            log(f"❌ {stock_code} 截图失败: {result.stderr}")
            return False
    except subprocess.TimeoutExpired:
        log(f"⏱️ {stock_code} 执行超时")
        return False
    except Exception as e:
        log(f"❌ {stock_code} 执行异常: {e}")
        return False


def main():
    """主函数"""
    # 配置文件路径
    csv_20260225 = "d:\\agentsTeam\\output\\20260225\\tdx_triple_volume_20260225.csv"
    csv_20260226 = "d:\\agentsTeam\\output\\20260226\\tdx_triple_volume_20260226.csv"
    
    # 输出目录 - 所有截图都保存到2026-02-26目录
    output_dir = "d:\\agentsTeam\\output\\20260226\\tlby"
    
    # 创建输出目录
    os.makedirs(output_dir, exist_ok=True)
    
    log("=" * 60)
    log("三倍量股票批量截图工具")
    log("=" * 60)
    
    # 读取股票列表
    stocks_20260225 = read_triple_volume_csv(csv_20260225)
    stocks_20260226 = read_triple_volume_csv(csv_20260226)
    
    if not stocks_20260225 and not stocks_20260226:
        log("没有读取到任何股票数据，退出")
        sys.exit(1)
    
    log(f"2026-02-25 三倍量股票: {len(stocks_20260225)} 只")
    log(f"2026-02-26 三倍量股票: {len(stocks_20260226)} 只")
    
    # 询问用户是否开始执行
    log("\n准备开始执行截图操作...")
    log("请确保：")
    log("1. 天龙博弈软件已经启动并登录")
    log("2. 软件窗口处于可见状态")
    log("3. 不要操作鼠标和键盘")
    
    total_stocks = len(stocks_20260225) + len(stocks_20260226)
    current = 0
    
    # 处理2026-02-25的股票（保存到2026-02-26目录）
    if stocks_20260225:
        log("\n" + "=" * 60)
        log("处理 2026-02-25 的三倍量股票（保存到2026-02-26目录）")
        log("=" * 60)
        
        success_count = 0
        fail_count = 0
        
        for i, stock in enumerate(stocks_20260225, 1):
            current += 1
            log(f"\n[{current}/{total_stocks}] 处理 {stock['code']} {stock['name']} (2026-02-25)")
            log(f"   放量倍数: {stock['volume_ratio']}, 涨跌幅: {stock['change']}")
            
            stock_output_dir = os.path.join(output_dir, stock['code'])
            os.makedirs(stock_output_dir, exist_ok=True)
            
            # 第一只股票需要启动软件，后续不需要
            no_launch = (current > 1)
            
            if run_tlby_auto(stock['code'], stock_output_dir, no_launch=no_launch):
                success_count += 1
            else:
                fail_count += 1
            
            # 每处理5只股票暂停一下
            if current % 5 == 0:
                log(f"\n已处理 {current} 只股票，暂停5秒...")
                time.sleep(5)
        
        log(f"\n2026-02-25 股票处理完成: 成功 {success_count} 只, 失败 {fail_count} 只")
    
    # 处理2026-02-26的股票（保存到2026-02-26目录）
    if stocks_20260226:
        log("\n" + "=" * 60)
        log("处理 2026-02-26 的三倍量股票（保存到2026-02-26目录）")
        log("=" * 60)
        
        success_count = 0
        fail_count = 0
        
        for i, stock in enumerate(stocks_20260226, 1):
            current += 1
            log(f"\n[{current}/{total_stocks}] 处理 {stock['code']} {stock['name']} (2026-02-26)")
            log(f"   放量倍数: {stock['volume_ratio']}, 涨跌幅: {stock['change']}")
            
            stock_output_dir = os.path.join(output_dir, stock['code'])
            os.makedirs(stock_output_dir, exist_ok=True)
            
            # 使用 --no-launch 因为软件应该已经在运行
            if run_tlby_auto(stock['code'], stock_output_dir, no_launch=True):
                success_count += 1
            else:
                fail_count += 1
            
            # 每处理5只股票暂停一下
            if current % 5 == 0:
                log(f"\n已处理 {current} 只股票，暂停5秒...")
                time.sleep(5)
        
        log(f"\n2026-02-26 股票处理完成: 成功 {success_count} 只, 失败 {fail_count} 只")
    
    log("\n" + "=" * 60)
    log("所有任务执行完成!")
    log("=" * 60)


if __name__ == "__main__":
    main()
