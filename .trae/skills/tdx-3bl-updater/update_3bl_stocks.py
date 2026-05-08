#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
TDX 3BL板块股票数据更新脚本
读取通达信3BL板块，更新到飞书多维表格
"""

import json
import os
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import requests

# 飞书配置
FEISHU_CONFIG = {
    "app_token": "NjMBbwfgLaBXoSslUD8cDaPQnvf",
    "table_id": "tblRzH4lnNlvcAlq",
}

# 通达信板块文件路径（需要根据实际安装路径修改）
TDX_BLOCK_PATH = Path("D:/通达信/T0002/sblock")  # 修改为实际路径

# 3BL板块日期列表
BLOCK_DATES = ["20260225", "20260226", "20260227"]


def read_tdx_block_file(block_date: str) -> List[Dict]:
    """
    读取通达信板块文件
    
    Args:
        block_date: 板块日期，如 "20260227"
    
    Returns:
        股票列表，每个股票包含代码和名称
    """
    block_file = TDX_BLOCK_PATH / f"3BL{block_date}.blk"
    
    if not block_file.exists():
        print(f"[ERROR] 板块文件不存在: {block_file}")
        return []
    
    stocks = []
    try:
        with open(block_file, 'r', encoding='gbk') as f:
            lines = f.readlines()
        
        for line in lines:
            line = line.strip()
            if line and not line.startswith('#'):
                # 通达信格式: 6位数字
                stock_code = line
                # 添加后缀
                if line.startswith('6'):
                    full_code = f"{line}.SH"  # 上海
                elif line.startswith('0') or line.startswith('3'):
                    full_code = f"{line}.SZ"  # 深圳
                else:
                    full_code = line
                
                stocks.append({
                    "code": stock_code,
                    "full_code": full_code,
                    "block_date": block_date
                })
        
        print(f"[OK] 读取板块 {block_date}: {len(stocks)} 只股票")
        return stocks
    
    except Exception as e:
        print(f"[ERROR] 读取板块文件失败: {e}")
        return []


def get_stock_kline(stock_code: str, days: int = 60) -> Optional[List[Dict]]:
    """
    获取股票日K线数据
    
    使用腾讯股票API获取数据
    """
    try:
        # 转换股票代码格式
        if ".SH" in stock_code:
            tencent_code = f"sh{stock_code.replace('.SH', '')}"
        elif ".SZ" in stock_code:
            tencent_code = f"sz{stock_code.replace('.SZ', '')}"
        else:
            tencent_code = stock_code
        
        # 腾讯股票API
        url = f"https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param={tencent_code},day,,,{days},qfq"
        response = requests.get(url, timeout=10)
        data = response.json()
        
        if data.get("code") != 0:
            print(f"[ERROR] 获取K线数据失败: {data}")
            return None
        
        # 解析数据
        kline_data = data.get("data", {}).get(tencent_code, {}).get("day", [])
        
        result = []
        for item in kline_data:
            # 格式: [日期, 开盘价, 收盘价, 最低价, 最高价, 成交量]
            result.append({
                "date": item[0],
                "open": float(item[1]),
                "close": float(item[2]),
                "low": float(item[3]),
                "high": float(item[4]),
                "volume": int(item[5])
            })
        
        return result
    
    except Exception as e:
        print(f"[ERROR] 获取K线数据异常: {e}")
        return None


def get_stock_name(stock_code: str) -> str:
    """获取股票名称"""
    try:
        if ".SH" in stock_code:
            tencent_code = f"sh{stock_code.replace('.SH', '')}"
        elif ".SZ" in stock_code:
            tencent_code = f"sz{stock_code.replace('.SZ', '')}"
        else:
            tencent_code = stock_code
        
        url = f"https://qt.gtimg.cn/q={tencent_code}"
        response = requests.get(url, timeout=10)
        content = response.text
        
        # 解析股票名称
        if "~" in content:
            parts = content.split("~")
            if len(parts) > 1:
                return parts[1]
        
        return "未知"
    except:
        return "未知"


def calculate_indicators(kline_data: List[Dict]) -> Dict:
    """
    计算技术指标
    
    Args:
        kline_data: K线数据列表
    
    Returns:
        指标字典
    """
    if not kline_data or len(kline_data) < 60:
        return {}
    
    # 最新数据
    latest = kline_data[-1]
    
    # 计算均量
    volumes = [d["volume"] for d in kline_data]
    
    avg_5 = sum(volumes[-5:]) / 5
    avg_10 = sum(volumes[-10:]) / 10
    avg_20 = sum(volumes[-20:]) / 20
    avg_30 = sum(volumes[-30:]) / 30
    avg_60 = sum(volumes[-60:]) / 60
    
    latest_volume = latest["volume"]
    
    # 地量判断（当日成交量 < N日均量 × 0.8）
    indicators = {
        "latest_close": latest["close"],
        "latest_volume": latest_volume,
        "avg_5": avg_5,
        "avg_10": avg_10,
        "avg_20": avg_20,
        "avg_30": avg_30,
        "avg_60": avg_60,
        "diliang_5": latest_volume < avg_5 * 0.8,
        "diliang_10": latest_volume < avg_10 * 0.8,
        "diliang_20": latest_volume < avg_20 * 0.8,
        "diliang_30": latest_volume < avg_30 * 0.8,
        "diliang_60": latest_volume < avg_60 * 0.8,
    }
    
    # 形态判断（底分型、阳包阴）
    if len(kline_data) >= 3:
        # 底分型：中间K线的低点低于两侧
        k1, k2, k3 = kline_data[-3], kline_data[-2], kline_data[-1]
        indicators["bottom_pattern"] = (k2["low"] < k1["low"]) and (k2["low"] < k3["low"])
        
        # 阳包阴：当前阳线包含前一根阴线
        if k1["close"] < k1["open"] and k3["close"] > k3["open"]:
            indicators["yang_bao_yin"] = (k3["open"] < k1["close"]) and (k3["close"] > k1["open"])
        else:
            indicators["yang_bao_yin"] = False
    else:
        indicators["bottom_pattern"] = False
        indicators["yang_bao_yin"] = False
    
    return indicators


def check_breakthrough(kline_data: List[Dict], pool_high: float) -> Tuple[bool, bool]:
    """
    检查突破情况
    
    Returns:
        (突破最高价, 突破收盘价)
    """
    if not kline_data:
        return False, False
    
    latest = kline_data[-1]
    latest_close = latest["close"]
    latest_high = latest["high"]
    
    # 突破最高价：当日最高价 > 入池最高价
    break_high = latest_high > pool_high
    
    # 突破收盘价：当日收盘价 > 入池最高价
    break_close = latest_close > pool_high
    
    return break_high, break_close


def prepare_record(stock: Dict, kline_data: List[Dict], pool_data: Dict) -> Dict:
    """
    准备飞书表格记录
    
    Args:
        stock: 股票基本信息
        kline_data: K线数据
        pool_data: 入池数据（开盘价、收盘价、最高价等）
    
    Returns:
        飞书表格记录
    """
    # 计算指标
    indicators = calculate_indicators(kline_data)
    
    # 检查突破
    pool_high = pool_data.get("high", 0)
    break_high, break_close = check_breakthrough(kline_data, pool_high)
    
    # 检查3倍量
    latest_volume = indicators.get("latest_volume", 0)
    avg_5 = indicators.get("avg_5", 0)
    triple_volume = latest_volume > avg_5 * 3 if avg_5 > 0 else False
    
    # 计算形态得分
    score = 0
    if indicators.get("diliang_5"): score += 1
    if indicators.get("diliang_10"): score += 1
    if indicators.get("diliang_20"): score += 1
    if indicators.get("bottom_pattern"): score += 2
    if indicators.get("yang_bao_yin"): score += 2
    
    # 构建记录
    record = {
        "股票代码": stock["full_code"],
        "股票名称": get_stock_name(stock["full_code"]),
        "入池日期": pool_data.get("date", ""),
        "入池开盘价": pool_data.get("open", 0),
        "入池收盘价": pool_data.get("close", 0),
        "入池最高价": pool_high,
        "最新收盘价": indicators.get("latest_close", 0),
        "成交量": latest_volume,
        "3倍量确认": triple_volume,
        "突破最高价": break_high,
        "突破收盘价": break_close,
        "突破告警": break_high or break_close,
        "告警时间": datetime.now().strftime("%Y-%m-%d %H:%M") if (break_high or break_close) else "",
        "底分型": indicators.get("bottom_pattern", False),
        "阳包阴": indicators.get("yang_bao_yin", False),
        "5日地量": indicators.get("diliang_5", False),
        "10日地量": indicators.get("diliang_10", False),
        "20日地量": indicators.get("diliang_20", False),
        "30日地量": indicators.get("diliang_30", False),
        "60日地量": indicators.get("diliang_60", False),
        "形态得分": score,
        "备注": f"更新于 {datetime.now().strftime('%Y-%m-%d %H:%M')}"
    }
    
    return record


def update_feishu_record(record: Dict) -> bool:
    """
    更新飞书表格记录
    
    使用MCP工具或飞书API更新
    """
    # TODO: 实现飞书表格更新逻辑
    # 可以使用 mcp_lark-mcp_bitable_v1_appTableRecord_create 或 _update
    print(f"[INFO] 准备更新记录: {record['股票代码']} - {record['股票名称']}")
    return True


def update_3bl_block(block_date: str) -> bool:
    """
    更新单个3BL板块
    
    Args:
        block_date: 板块日期，如 "20260227"
    """
    print(f"\n{'='*60}")
    print(f"更新板块: 3BL{block_date}")
    print(f"{'='*60}")
    
    # 1. 读取板块股票
    stocks = read_tdx_block_file(block_date)
    if not stocks:
        print("[ERROR] 没有读取到股票")
        return False
    
    # 2. 获取每只股票的数据
    success_count = 0
    for stock in stocks:
        print(f"\n处理: {stock['code']}")
        
        # 获取K线数据
        kline_data = get_stock_kline(stock["full_code"], days=60)
        if not kline_data:
            print(f"[ERROR] 获取K线数据失败: {stock['code']}")
            continue
        
        # 获取入池数据（入池当天的K线）
        pool_data = None
        for d in kline_data:
            if d["date"] == block_date:
                pool_data = d
                break
        
        if not pool_data:
            print(f"[WARNING] 没有找到入池日期数据: {stock['code']}")
            # 使用最早的可用数据
            pool_data = kline_data[0] if kline_data else {}
        
        # 准备记录
        record = prepare_record(stock, kline_data, pool_data)
        
        # 更新到飞书
        if update_feishu_record(record):
            success_count += 1
    
    print(f"\n[OK] 板块 {block_date} 更新完成: {success_count}/{len(stocks)}")
    return True


def update_all_3bl_blocks():
    """更新所有3BL板块"""
    print("开始更新3BL板块股票数据...")
    
    for block_date in BLOCK_DATES:
        update_3bl_block(block_date)
    
    print("\n[OK] 所有板块更新完成!")


if __name__ == "__main__":
    # 更新所有板块
    update_all_3bl_blocks()
