#!/usr/bin/env python3
"""
更新3BL板块股票到飞书表格
使用腾讯API获取2025-03-02数据（测试用）
"""

import requests
import json
from datetime import datetime
from typing import Dict, List, Optional

# 配置
APP_TOKEN = "NjMBbwfgLaBXoSslUD8cDaPQnvf"
TABLE_ID = "tblRzH4lnNlvcAlq"

# 3BL板块测试数据
SECTOR_STOCKS = {
    "20260225": ["000001", "000002", "000063", "000333", "000568"],
    "20260226": ["000001", "000858", "002594", "300750", "600519"],
    "20260227": ["000002", "000858", "002415", "300059", "600036"],
}


def format_stock_code(code: str) -> str:
    """格式化为腾讯股票代码"""
    code = code.strip()
    if code.startswith('6'):
        return f"sh{code}"
    else:
        return f"sz{code}"


def get_stock_realtime(stock_code: str) -> Optional[Dict]:
    """获取股票实时数据"""
    tencent_code = format_stock_code(stock_code)
    url = f"https://qt.gtimg.cn/q={tencent_code}"
    
    try:
        response = requests.get(url, timeout=10)
        response.encoding = 'gbk'
        data = response.text
        
        marker = f'v_{tencent_code}="'
        if marker not in data:
            marker = f"v_{tencent_code}='"
            if marker not in data:
                return None
            
        start = data.find(marker) + len(marker)
        end = data.find('";', start)
        if end == -1:
            end = data.find("';", start)
        
        if end == -1:
            return None
            
        values = data[start:end].split('~')
        
        if len(values) < 10:
            return None
            
        return {
            'code': stock_code,
            'name': values[1],
            'price': float(values[3]),
            'open': float(values[5]),
            'high': float(values[4]),
            'low': float(values[5]),  # 使用开盘价作为最低价简化
            'volume': int(values[6]),
        }
    except Exception as e:
        print(f"获取 {stock_code} 失败: {e}")
        return None


def get_stock_kline(stock_code: str, days: int = 60) -> List[Dict]:
    """获取股票K线数据"""
    tencent_code = format_stock_code(stock_code)
    url = f"https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param={tencent_code},day,,,{days},qfq"
    
    try:
        response = requests.get(url, timeout=10)
        data = response.json()
        
        kline_data = []
        key = tencent_code
        
        if key in data.get('data', {}):
            stock_data = data['data'][key]
            
            if 'qfqday' in stock_data:
                kline_list = stock_data['qfqday']
            elif 'day' in stock_data:
                kline_list = stock_data['day']
            else:
                return []
            
            for item in kline_list:
                if isinstance(item, list) and len(item) >= 6:
                    kline_data.append({
                        'date': item[0],
                        'open': float(item[1]),
                        'close': float(item[2]),
                        'low': float(item[3]),
                        'high': float(item[4]),
                        'volume': int(float(item[5]))
                    })
        
        return kline_data
    except Exception as e:
        print(f"获取K线 {stock_code} 失败: {e}")
        return []


def calculate_diliang(kline_data: List[Dict]) -> Dict[str, bool]:
    """计算地量指标"""
    if len(kline_data) < 5:
        return {"5日": False, "10日": False, "20日": False, "30日": False, "60日": False}
    
    volumes = [d["volume"] for d in kline_data]
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


def process_stock(stock_code: str) -> Optional[Dict]:
    """处理单只股票"""
    # 获取实时数据
    realtime = get_stock_realtime(stock_code)
    if not realtime:
        return None
    
    # 获取K线数据
    kline = get_stock_kline(stock_code, 60)
    if len(kline) < 5:
        return None
    
    # 计算地量
    diliang = calculate_diliang(kline)
    
    return {
        "code": stock_code,
        "name": realtime['name'],
        "price": realtime['price'],
        "open": realtime['open'],
        "high": realtime['high'],
        "low": realtime['low'],
        "volume": realtime['volume'],
        "diliang_5": diliang["5日"],
        "diliang_10": diliang["10日"],
        "diliang_20": diliang["20日"],
        "diliang_30": diliang["30日"],
        "diliang_60": diliang["60日"],
    }


def prepare_feishu_fields(stock_data: Dict, sector_date: str) -> Dict:
    """准备飞书字段"""
    entry_date = int(datetime(2025, 3, 2).timestamp() * 1000)
    
    # 计算地量字符串
    diliang_list = []
    if stock_data['diliang_5']: diliang_list.append("5日")
    if stock_data['diliang_10']: diliang_list.append("10日")
    if stock_data['diliang_20']: diliang_list.append("20日")
    if stock_data['diliang_30']: diliang_list.append("30日")
    if stock_data['diliang_60']: diliang_list.append("60日")
    diliang_str = ",".join(diliang_list) if diliang_list else "无"
    
    return {
        "股票代码": stock_data['code'],
        "股票名称": stock_data['name'],
        "最新收盘价": float(stock_data['price']),
        "成交量": int(stock_data['volume']),
        "5日地量": bool(stock_data['diliang_5']),
        "10日地量": bool(stock_data['diliang_10']),
        "20日地量": bool