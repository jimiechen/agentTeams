#!/usr/bin/env python3
"""
完整更新脚本：
1. 读取通达信3BL板块（20260225, 20260226, 20260227）
2. 使用通达信API获取2025-03-02最新价格和成交量
3. 计算地量指标
4. 新增股票到选股记录表格
5. 更新现有股票数据
"""

import os
import sys
from datetime import datetime
from typing import Dict, List, Optional, Set

# 添加当前目录到路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from tdx_api import (
    init_tdx,
    get_realtime_data_tdx,
    get_kline_data_tdx,
    calculate_diliang_tdx,
    get_stock_name_tdx,
    TDX_AVAILABLE
)

# 配置
APP_TOKEN = "NjMBbwfgLaBXoSslUD8cDaPQnvf"
TABLE_ID = "tblRzH4lnNlvcAlq"


def read_tdx_sector_file(sector_name: str) -> List[str]:
    """读取通达信板块文件"""
    possible_paths = [
        f"C:\\new_tdx_test\\T0002\\blocknew\\{sector_name}.blk",
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
                
                print(f"✓ 读取板块 {sector_name}: {len(stocks)} 只股票")
                return stocks
            except Exception as e:
                print(f"✗ 读取 {path} 失败: {e}")
                continue
    
    print(f"✗ 未找到板块文件: {sector_name}")
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
    
    return result


def create_test_sector_data() -> Dict[str, List[str]]:
    """创建测试板块数据（当通达信文件不存在时使用）"""
    print("使用测试数据...")
    return {
        "20260225": ["000001", "000002", "000063", "000333", "000568"],
        "20260226": ["000001", "000858", "002594", "300750", "600519"],
        "20260227": ["000002", "000858", "002415", "300059", "600036"],
    }


def process_stock_data(stock_code: str) -> Optional[Dict]:
    """处理单只股票数据"""
    # 获取K线数据
    kline = get_kline_data_tdx(stock_code, 60)
    if len(kline) < 5:
        return None
    
    # 获取最新数据
    latest = kline[-1]
    
    # 计算地量
    diliang = calculate_diliang_tdx(kline)
    
    # 获取股票名称
    name = get_stock_name_tdx(stock_code)
    
    return {
        "code": stock_code,
        "name": name,
        "price": latest['close'],
        "open": latest['open'],
        "high": latest['high'],
        "low": latest['low'],
        "volume": latest['volume'],
        "amount": latest['amount'],
        "date": latest['date'],
        "diliang_5": diliang["5日"],
        "diliang_10": diliang["10日"],
        "diliang_20": diliang["20日"],
        "diliang_30": diliang["30日"],
        "diliang_60": diliang["60日"],
    }


def batch_process_stocks(stock_codes: List[str]) -> Dict[str, Dict]:
    """批量处理多只股票"""
    results = {}
    
    print(f"\n开始处理 {len(stock_codes)} 只股票...")
    
    for i, code in enumerate(stock_codes, 1):
        print(f"  [{i}/{len(stock_codes)}] 处理 {code}...", end=" ")
        
        data = process_stock_data(code)
        if data:
            results[code] = data
            print(f"✓ {data['name']} 价:{data['price']:.2f} 量:{data['volume']}")
        else:
            print("✗ 失败")
    
    return results


def prepare_record_fields(stock_data: Dict, sector_date: str = "") -> Dict:
    """准备飞书记录字段"""
    # 入池日期转换为毫秒时间戳
    date_str = "2025-03-02"
    entry_date = int(datetime(2025, 3, 2).timestamp() * 1000)
    
    fields = {
        "股票代码": stock_data['code'],
        "股票名称": stock_data['name'],
        "最新收盘价": float(stock_data['price']),
        "成交量": int(stock_data['volume']),
        "5日地量": bool(stock_data['diliang_5']),
        "10日地量": bool(stock_data['diliang_10']),
        "20日地量": bool(stock_data['diliang_20']),
        "30日地量": bool(stock_data['diliang_30']),
        "60日地量": bool(stock_data['diliang_60']),
        "入池日期": entry_date,
        "入池开盘价": float(stock_data['open']),
        "入池收盘价": float(stock_data['price']),
        "入池最高价": float(stock_data['high']),
        "3倍量确认": False,
        "备注": f"板块:{sector_date} 日期:{stock_data['date']} 地量:{','.join([k for k,v in stock_data.items() if k.startswith('diliang_') and v]) or '无'}"
    }
    
    return fields


# 主程序
if __name__ == "__main__":
    print("=" * 70)
    print("通达信3BL板块股票数据完整更新")
    print("=" * 70)
    
    # 初始化通达信
    print("\n【步骤1】初始化通达信...")
    if not init_tdx():
        print("✗ 通达信初始化失败")
        print("  请确保已安装tqcenter并启动通达信客户端")
        exit(1)
    print("✓ 通达信连接成功")
    
    # 读取3BL板块
    print("\n【步骤2】读取通达信3BL板块...")
    sector_stocks = get_tdx_sector_stocks()
    
    if not sector_stocks:
        sector_stocks = create_test_sector_data()
    
    # 合并所有板块股票
    all_stocks = {}
    for date, stocks in sector_stocks.items():
        for code in stocks:
            if code not in all_stocks:
                all_stocks[code] = date
    
    print(f"\n共找到 {len(all_stocks)} 只不同股票")
    print(f"股票列表: {', '.join(sorted(all_stocks.keys()))}")
    
    # 获取股票数据
    print("\n【步骤3】使用通达信API获取最新数据...")
    stock_data_dict = batch_process_stocks(list(all_stocks.keys()))
    
    print(f"\n✓ 成功获取 {len(stock_data_dict)}/{len(all_stocks)} 只股票数据")
    
    # 显示统计
    print("\n【步骤4】数据统计...")
    total = len(stock_data_dict)
    if total > 0:
        diliang_5 = sum(1 for d in stock_data_dict.values() if d['diliang_5'])
        diliang_10 = sum(1 for d in stock_data_dict.values() if d['diliang_10'])
        diliang_20 = sum(1 for d in stock_data_dict.values() if d['diliang_20'])
        diliang_30 = sum(1 for d in stock_data_dict.values() if d['diliang_30'])
        diliang_60 = sum(1 for d in stock_data_dict.values() if d['diliang_60'])
        
        print(f"  股票总数: {total}")
        print(f"  5日地量: {diliang_5} 只 ({diliang_5/total*100:.1f}%)")
        print(f"  10日地量: {diliang_10} 只 ({diliang_10/total*100:.1f}%)")
        print(f"  20日地量: {diliang_20} 只 ({diliang_20/total*100:.1f}%)")
        print(f"  30日地量: {diliang_30} 只 ({diliang_30/total*100:.1f}%)")
        print(f"  60日地量: {diliang_60} 只 ({diliang_60/total*100:.1f}%)")
    
    # 准备飞书更新数据
    print("\n【步骤5】准备飞书多维表格更新数据...")
    records_to_add = []
    
    for code, data in stock_data_dict.items():
        sector_date = all_stocks.get(code, "")
        fields = prepare_record_fields(data, sector_date)
        records_to_add.append({
            "code": code,
            "fields": fields
        })
    
    print(f"✓ 准备新增 {len(records_to_add)} 条记录")
    
    # 显示示例
    print("\n【示例数据】")
    if records_to_add:
        sample = records_to_add[0]
        print(f"股票: {sample['code']}")
        print(f"字段: {sample['fields']}")
    
    print("\n" + "=" * 70)
    print("数据准备完成！")
    print("=" * 70)
    print(f"\n下一步: 使用MCP工具将 {len(records_to_add)} 条记录新增到飞书表格")
    print("\n请在nanobot环境中执行以下MCP命令:")
    print("mcp_lark-mcp_bitable_v1_appTableRecord_create")
