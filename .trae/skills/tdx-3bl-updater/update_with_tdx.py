#!/usr/bin/env python3
"""
使用通达信API的完整更新脚本
"""

from typing import Dict, List, Optional, Any
from datetime import datetime
import os

# 导入通达信API模块
from tdx_api import (
    init_tdx,
    get_realtime_data_tdx,
    get_kline_data_tdx,
    calculate_diliang_tdx,
    get_stock_name_tdx,
    get_stock_full_data_tdx,
    format_stock_code_tdx,
    TDX_AVAILABLE
)

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
    """创建测试板块数据"""
    print("创建测试板块数据...")
    return {
        "20260225": ["000001", "000002", "000063", "000333", "000568"],
        "20260226": ["000001", "000858", "002594", "300750", "600519"],
        "20260227": ["000002", "000858", "002415", "300059", "600036"],
    }


def process_stock_data_tdx(stock_code: str) -> Optional[Dict]:
    """使用通达信API处理单只股票数据"""
    # 获取K线数据（包含最新价格和成交量）
    kline = get_kline_data_tdx(stock_code, 60)
    if len(kline) < 5:
        return None
    
    # 最新数据
    latest = kline[-1]
    
    # 计算地量
    diliang = calculate_diliang_tdx(kline)
    
    return {
        "code": stock_code,
        "name": stock_code,  # 通达信API需要通过其他方式获取名称
        "price": latest['close'],
        "open": latest['open'],
        "high": latest['high'],
        "low": latest['low'],
        "volume": latest['volume'],
        "amount": latest['amount'],
        "diliang_5": diliang["5日"],
        "diliang_10": diliang["10日"],
        "diliang_20": diliang["20日"],
        "diliang_30": diliang["30日"],
        "diliang_60": diliang["60日"],
    }


def batch_process_stocks(stock_codes: List[str]) -> Dict[str, Dict]:
    """批量处理多只股票"""
    results = {}
    
    # 使用通达信批量获取实时数据
    realtime_data = get_realtime_data_tdx(stock_codes)
    
    for code in stock_codes:
        if code in realtime_data:
            # 获取K线数据计算地量
            kline = get_kline_data_tdx(code, 60)
            if len(kline) >= 5:
                diliang = calculate_diliang_tdx(kline)
                # 获取股票名称
                name = get_stock_name_tdx(code)
                
                results[code] = {
                    **realtime_data[code],
                    "name": name,
                    "diliang_5": diliang["5日"],
                    "diliang_10": diliang["10日"],
                    "diliang_20": diliang["20日"],
                    "diliang_30": diliang["30日"],
                    "diliang_60": diliang["60日"],
                }
    
    return results


# 主程序
if __name__ == "__main__":
    print("=" * 70)
    print("通达信3BL板块股票数据更新程序 (使用通达信API)")
    print("=" * 70)
    
    # 初始化通达信
    print("\n【初始化】连接通达信...")
    if not init_tdx():
        print("✗ 通达信初始化失败")
        print("  请确保:")
        print("  1. 已安装通达信量化平台")
        print("  2. 已安装Python模块: pip install tqcenter")
        print("  3. 通达信客户端已启动")
        exit(1)
    
    print("✓ 通达信连接成功")
    
    # 步骤1: 获取通达信3BL板块股票
    print("\n【步骤1】读取通达信3BL板块...")
    sector_stocks = get_tdx_sector_stocks()
    
    # 如果没有找到通达信数据，使用测试数据
    if not sector_stocks:
        sector_stocks = create_test_sector_data()
        for date, stocks in sector_stocks.items():
            print(f"板块 {date} (测试): {len(stocks)} 只股票")
    
    # 合并所有板块股票
    all_sector_codes = list(set([
        code for stocks in sector_stocks.values() for code in stocks
    ]))
    
    print(f"\n3个板块共找到 {len(all_sector_codes)} 只不同股票")
    print(f"股票列表: {', '.join(sorted(all_sector_codes))}")
    
    # 步骤2: 批量获取股票数据
    print("\n【步骤2】使用通达信API批量获取股票数据...")
    print(f"正在获取 {len(all_sector_codes)} 只股票的实时数据...")
    
    stock_data = batch_process_stocks(all_sector_codes)
    
    print(f"✓ 成功获取 {len(stock_data)}/{len(all_sector_codes)} 只股票数据")
    
    # 步骤3: 显示数据详情
    print("\n【步骤3】股票数据详情...")
    for code in sorted(stock_data.keys()):
        data = stock_data[code]
        print(f"\n  {code} ({data['name']}):")
        print(f"    最新价: {data['price']:.2f}")
        print(f"    成交量: {data['volume']:,}")
        print(f"    成交额: {data['amount']:,.2f}")
        
        # 显示地量指标
        diliang_list = []
        if data['diliang_5']: diliang_list.append("5日")
        if data['diliang_10']: diliang_list.append("10日")
        if data['diliang_20']: diliang_list.append("20日")
        if data['diliang_30']: diliang_list.append("30日")
        if data['diliang_60']: diliang_list.append("60日")
        
        if diliang_list:
            print(f"    地量指标: {', '.join(diliang_list)}")
        else:
            print(f"    地量指标: 无")
    
    # 步骤4: 统计信息
    print("\n【步骤4】统计信息...")
    total = len(stock_data)
    diliang_5_count = sum(1 for d in stock_data.values() if d['diliang_5'])
    diliang_10_count = sum(1 for d in stock_data.values() if d['diliang_10'])
    diliang_20_count = sum(1 for d in stock_data.values() if d['diliang_20'])
    diliang_30_count = sum(1 for d in stock_data.values() if d['diliang_30'])
    diliang_60_count = sum(1 for d in stock_data.values() if d['diliang_60'])
    
    print(f"  股票总数: {total}")
    print(f"  5日地量: {diliang_5_count} 只 ({diliang_5_count/total*100:.1f}%)")
    print(f"  10日地量: {diliang_10_count} 只 ({diliang_10_count/total*100:.1f}%)")
    print(f"  20日地量: {diliang_20_count} 只 ({diliang_20_count/total*100:.1f}%)")
    print(f"  30日地量: {diliang_30_count} 只 ({diliang_30_count/total*100:.1f}%)")
    print(f"  60日地量: {diliang_60_count} 只 ({diliang_60_count/total*100:.1f}%)")
    
    print("\n" + "=" * 70)
    print("通达信API数据获取完成！")
    print("=" * 70)
    print("\n下一步: 使用MCP工具将数据更新到飞书多维表格")
