#!/usr/bin/env python3
"""
完整更新脚本：
1. 读取多维表格现有股票
2. 从通达信获取最新价格和成交量
3. 计算地量指标
4. 更新现有股票数据
5. 读取通达信3BL板块
6. 添加新股票到表格
"""

import requests
import json
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional
import os

# 配置
APP_TOKEN = "NjMBbwfgLaBXoSslUD8cDaPQnvf"
TABLE_ID = "tblRzH4lnNlvcAlq"

# 字段ID映射
FIELD_IDS = {
    "股票代码": "fldHPzxvNn",
    "股票名称": "fldoz6l46S",
    "入池日期": "fldZ1ryVTc",
    "入池开盘价": "fldh1WqZQj",
    "入池收盘价": "fldhHjplYb",
    "入池最高价": "fldM8tWz1R",
    "最新收盘价": "fldz04zez3",
    "成交量": "fldENO4ZxO",
    "5日地量": "fldpbtGag0",
    "10日地量": "fldpcWKIrC",
    "20日地量": "fld8MCVecG",
    "30日地量": "fldJQ3Pfzt",
    "60日地量": "fldSy9BEEe",
    "3倍量确认": "fldnV2uFKW",
    "备注": "fldz2m6rRC",
}

def format_stock_code(code: str) -> str:
    """格式化为腾讯股票代码"""
    code = code.strip()
    if code.startswith('6'):
        return f"sh{code}"
    elif code.startswith('0') or code.startswith('3'):
        return f"sz{code}"
    return code

def get_stock_realtime(stock_code: str) -> Optional[Dict]:
    """获取股票实时数据"""
    tencent_code = format_stock_code(stock_code)
    url = f"https://qt.gtimg.cn/q={tencent_code}"
    
    try:
        response = requests.get(url, timeout=10)
        response.encoding = 'gbk'
        data = response.text
        
        # 调试输出
        # print(f"  API响应: {data[:100]}...")
        
        marker = f'v_{tencent_code}="'
        if marker not in data:
            marker = f"v_{tencent_code}='"
            if marker not in data:
                print(f"  未找到数据标记: {marker}")
                return None
            
        start = data.find(marker) + len(marker)
        end = data.find('";', start)
        if end == -1:
            end = data.find("';", start)
        
        if end == -1:
            print(f"  未找到数据结束标记")
            return None
            
        values = data[start:end].split('~')
        
        if len(values) < 10:
            print(f"  数据字段不足: {len(values)}")
            return None
            
        return {
            'code': stock_code,
            'name': values[1],
            'price': float(values[3]),
            'volume': int(values[6]),
            'high': float(values[4]),
            'low': float(values[5]),
            'prev_close': float(values[4]),
        }
    except Exception as e:
        print(f"获取 {stock_code} 实时数据失败: {e}")
        import traceback
        traceback.print_exc()
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
            
            # 获取日K数据
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
        print(f"获取 {stock_code} K线数据失败: {e}")
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

def read_tdx_sector_file(sector_name: str) -> List[str]:
    """读取通达信板块文件"""
    # 尝试多个可能的通达信安装路径
    possible_paths = [
        f"D:\\new_tdx\\T0002\\blocknew\\{sector_name}.blk",
        f"D:\\通达信\\T0002\\blocknew\\{sector_name}.blk",
        f"C:\\new_tdx\\T0002\\blocknew\\{sector_name}.blk",
        f"C:\\通达信\\T0002\\blocknew\\{sector_name}.blk",
    ]
    
    for path in possible_paths:
        if os.path.exists(path):
            try:
                with open(path, 'r', encoding='gbk') as f:
                    lines = f.readlines()
                
                stocks = []
                for line in lines:
                    line = line.strip()
                    if line:
                        # 通达信格式: 0|000001 或 1|600000
                        if '|' in line:
                            parts = line.split('|')
                            if len(parts) >= 2:
                                stocks.append(parts[1])
                        else:
                            stocks.append(line)
                
                return stocks
            except Exception as e:
                print(f"读取 {path} 失败: {e}")
                continue
    
    print(f"未找到板块文件: {sector_name}")
    return []

def get_tdx_sector_stocks() -> Dict[str, List[str]]:
    """获取通达信3BL板块的所有股票"""
    sectors = {
        "20260225": "3BL20260225",
        "20260226": "3BL20260226", 
        "20260227": "3BL20260227",
    }
    
    result = {}
    for date, sector_name in sectors.items():
        stocks = read_tdx_sector_file(sector_name)
        result[date] = stocks
        print(f"板块 {date}: 找到 {len(stocks)} 只股票")
    
    return result

def process_stock_update(stock_code: str, stock_name: str) -> Optional[Dict]:
    """处理单只股票更新"""
    print(f"处理股票: {stock_code} {stock_name}")
    
    # 获取实时数据
    realtime = get_stock_realtime(stock_code)
    if not realtime:
        print(f"  无法获取实时数据")
        return None
    
    # 获取K线数据
    kline = get_stock_kline(stock_code, 60)
    if len(kline) < 5:
        print(f"  K线数据不足")
        return None
    
    # 计算地量
    diliang = calculate_diliang(kline)
    
    result = {
        "股票代码": stock_code,
        "股票名称": realtime['name'],
        "最新收盘价": realtime['price'],
        "成交量": realtime['volume'],
        "5日地量": diliang["5日"],
        "10日地量": diliang["10日"],
        "20日地量": diliang["20日"],
        "30日地量": diliang["30日"],
        "60日地量": diliang["60日"],
    }
    
    print(f"  最新价: {realtime['price']}, 成交量: {realtime['volume']}")
    print(f"  地量: 5日={diliang['5日']}, 10日={diliang['10日']}, 20日={diliang['20日']}")
    
    return result

# 主程序
if __name__ == "__main__":
    print("=" * 60)
    print("通达信3BL板块股票数据更新程序")
    print("=" * 60)
    
    # 步骤1: 获取通达信3BL板块股票
    print("\n【步骤1】读取通达信3BL板块...")
    sector_stocks = get_tdx_sector_stocks()
    
    # 合并所有板块股票
    all_sector_codes = set()
    for date, stocks in sector_stocks.items():
        for code in stocks:
            all_sector_codes.add(code)
    
    print(f"\n通达信3个板块共找到 {len(all_sector_codes)} 只不同股票")
    
    # 步骤2: 测试更新几只股票
    print("\n【步骤2】测试更新股票数据...")
    test_codes = list(all_sector_codes)[:5] if all_sector_codes else ["000001", "600000", "002735"]
    
    for code in test_codes:
        result = process_stock_update(code, "")
        if result:
            print(f"  更新成功: {result['股票名称']}")
        print()
    
    print("\n" + "=" * 60)
    print("测试完成！")
    print("=" * 60)
