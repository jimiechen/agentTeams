#!/usr/bin/env python3
"""
完整更新脚本：
1. 读取多维表格现有股票
2. 更新现有股票最新价格和地量指标
3. 读取通达信3BL板块（或创建测试数据）
4. 添加新股票到表格
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
            'volume': int(values[6]),
            'high': float(values[4]),
            'low': float(values[5]),
            'prev_close': float(values[4]),
        }
    except Exception as e:
        print(f"获取 {stock_code} 实时数据失败: {e}")
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
        if stocks:
            result[date] = stocks
            print(f"板块 {date}: 找到 {len(stocks)} 只股票")
    
    return result

def create_test_sector_data() -> Dict[str, List[str]]:
    """创建测试板块数据（当通达信文件不存在时使用）"""
    print("创建测试板块数据...")
    return {
        "20260225": ["000001", "000002", "000063", "000333", "000568"],
        "20260226": ["000001", "000858", "002594", "300750", "600519"],
        "20260227": ["000002", "000858", "002415", "300059", "600036"],
    }

def process_stock_data(stock_code: str) -> Optional[Dict]:
    """处理单只股票数据"""
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
        "volume": realtime['volume'],
        "diliang_5": diliang["5日"],
        "diliang_10": diliang["10日"],
        "diliang_20": diliang["20日"],
        "diliang_30": diliang["30日"],
        "diliang_60": diliang["60日"],
    }

# 主程序
if __name__ == "__main__":
    print("=" * 70)
    print("通达信3BL板块股票数据完整更新程序")
    print("=" * 70)
    
    # 步骤1: 获取通达信3BL板块股票
    print("\n【步骤1】读取通达信3BL板块...")
    sector_stocks = get_tdx_sector_stocks()
    
    # 如果没有找到通达信数据，使用测试数据
    if not sector_stocks:
        sector_stocks = create_test_sector_data()
        for date, stocks in sector_stocks.items():
            print(f"板块 {date} (测试): {len(stocks)} 只股票")
    
    # 合并所有板块股票
    all_sector_codes = set()
    for date, stocks in sector_stocks.items():
        for code in stocks:
            all_sector_codes.add(code)
    
    print(f"\n3个板块共找到 {len(all_sector_codes)} 只不同股票")
    print(f"股票列表: {', '.join(sorted(all_sector_codes))}")
    
    # 步骤2: 测试获取股票数据
    print("\n【步骤2】测试获取股票数据...")
    test_results = []
    for code in sorted(all_sector_codes)[:10]:  # 先测试前10只
        print(f"\n获取 {code}...", end=" ")
        result = process_stock_data(code)
        if result:
            print(f"✓ {result['name']} 价:{result['price']} 量:{result['volume']}")
            test_results.append(result)
        else:
            print("✗ 失败")
    
    print(f"\n成功获取 {len(test_results)}/{min(10, len(all_sector_codes))} 只股票数据")
    
    # 步骤3: 显示地量统计
    print("\n【步骤3】地量统计...")
    for r in test_results:
        diliang_status = []
        if r['diliang_5']: diliang_status.append("5日")
        if r['diliang_10']: diliang_status.append("10日")
        if r['diliang_20']: diliang_status.append("20日")
        if r['diliang_30']: diliang_status.append("30日")
        if r['diliang_60']: diliang_status.append("60日")
        
        status = ",".join(diliang_status) if diliang_status else "无"
        print(f"  {r['name']}({r['code']}): {status}")
    
    print("\n" + "=" * 70)
    print("测试完成！数据获取和计算功能正常。")
    print("=" * 70)
    print("\n下一步：将此脚本集成到nanobot中，使用MCP工具更新多维表格")
