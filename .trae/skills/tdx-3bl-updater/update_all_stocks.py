#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
完整的数据更新脚本：
1. 读取飞书表格中现有股票，更新最新价格和成交量
2. 读取通达信3BL板块，添加到表格
"""

import sys
sys.path.insert(0, 'd:\\agentsTeam\\skills\\tdx-3bl-updater')

import json
import requests
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Set

# 飞书表格配置
FEISHU_APP_TOKEN = "NjMBbwfgLaBXoSslUD8cDaPQnvf"
FEISHU_TABLE_ID = "tblRzH4lnNlvcAlq"

# 通达信板块路径
TDX_BLOCK_PATH = Path("D:/通达信/T0002/sblock")

# 3BL板块日期
BLOCK_DATES = ["20260225", "20260226", "20260227"]

# 字段ID映射
FIELD_IDS = {
    "股票代码": "fldHPzxvNn",
    "股票名称": "fldoz6l46S",
    "入池日期": "fldZ1ryVTc",
    "入池开盘价": "fldr6sO3Nx",
    "入池收盘价": "fldBIvaxPe",
    "入池最高价": "fld3V8H29g",
    "最新收盘价": "fldz04zez3",
    "成交量": "fldENO4ZxO",
    "5日地量": "fldpbtGag0",
    "10日地量": "fldpcWKIrC",
    "20日地量": "fld8MCVecG",
    "30日地量": "fldJQ3Pfzt",
    "60日地量": "fldSy9BEEe",
    "备注": "fldceiRBna",
}


def get_stock_realtime(stock_code: str) -> Dict:
    """获取股票实时数据"""
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
        
        if "~" in content:
            parts = content.split('"')[1].split("~")
            if len(parts) > 45:
                return {
                    "name": parts[1],
                    "code": stock_code,
                    "current_price": float(parts[3]),
                    "volume": int(parts[6]),
                    "high": float(parts[33]),
                    "low": float(parts[34]),
                }
        return None
    except Exception as e:
        print(f"[ERROR] 获取实时数据失败 {stock_code}: {e}")
        return None


def get_stock_kline(stock_code: str, days: int = 60) -> List[Dict]:
    """获取日K线数据"""
    try:
        if ".SH" in stock_code:
            tencent_code = f"sh{stock_code.replace('.SH', '')}"
        elif ".SZ" in stock_code:
            tencent_code = f"sz{stock_code.replace('.SZ', '')}"
        else:
            tencent_code = stock_code
        
        url = f"https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param={tencent_code},day,,,{days},qfq"
        response = requests.get(url, timeout=10)
        data = response.json()
        
        if data.get("code") != 0:
            return None
        
        stock_data = data.get("data", {}).get(tencent_code, {})
        kline_data = stock_data.get("day") or stock_data.get("qfqday") or []
        
        result = []
        for item in kline_data:
            result.append({
                "date": item[0],
                "open": float(item[1]),
                "close": float(item[2]),
                "low": float(item[3]),
                "high": float(item[4]),
                "volume": int(float(item[5]))
            })
        
        return result
    except Exception as e:
        print(f"[ERROR] 获取K线数据失败 {stock_code}: {e}")
        return None


def calculate_diliang(kline_data: List[Dict]) -> Dict:
    """计算地量"""
    if not kline_data or len(kline_data) < 5:
        return {}
    
    volumes = [d["volume"] for d in kline_data]
    latest_volume = volumes[-1]
    
    avg_5 = sum(volumes[-5:]) / 5
    avg_10 = sum(volumes[-10:]) / 10 if len(volumes) >= 10 else avg_5
    avg_20 = sum(volumes[-20:]) / 20 if len(volumes) >= 20 else avg_10
    avg_30 = sum(volumes[-30:]) / 30 if len(volumes) >= 30 else avg_20
    avg_60 = sum(volumes[-60:]) / 60 if len(volumes) >= 60 else avg_30
    
    return {
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


def read_tdx_block(block_date: str) -> List[Dict]:
    """读取通达信板块文件"""
    block_file = TDX_BLOCK_PATH / f"3BL{block_date}.blk"
    
    if not block_file.exists():
        print(f"[WARNING] 板块文件不存在: {block_file}")
        return []
    
    stocks = []
    try:
        with open(block_file, 'r', encoding='gbk') as f:
            lines = f.readlines()
        
        for line in lines:
            line = line.strip()
            if line and not line.startswith('#'):
                if line.startswith('6'):
                    full_code = f"{line}.SH"
                elif line.startswith('0') or line.startswith('3'):
                    full_code = f"{line}.SZ"
                else:
                    full_code = line
                
                stocks.append({
                    "code": line, 
                    "full_code": full_code,
                    "block_date": block_date
                })
        
        return stocks
    except Exception as e:
        print(f"[ERROR] 读取板块文件失败: {e}")
        return []


def parse_table_records(records_data: List[Dict]) -> Dict[str, Dict]:
    """解析飞书表格记录"""
    stocks = {}
    
    for record in records_data:
        fields = record.get("fields", {})
        
        # 获取股票代码
        code_field = fields.get("股票代码", [{}])
        if isinstance(code_field, list) and len(code_field) > 0:
            stock_code = code_field[0].get("text", "")
        else:
            stock_code = str(code_field)
        
        if stock_code:
            # 添加后缀
            if len(stock_code) == 6:
                if stock_code.startswith('6'):
                    full_code = f"{stock_code}.SH"
                else:
                    full_code = f"{stock_code}.SZ"
            else:
                full_code = stock_code
            
            stocks[full_code] = {
                "record_id": record.get("record_id"),
                "stock_code": stock_code,
                "full_code": full_code,
                "fields": fields
            }
    
    return stocks


def update_existing_stocks(existing_stocks: Dict[str, Dict]):
    """更新表格中现有股票的最新数据"""
    print(f"\n{'='*60}")
    print("更新现有股票数据")
    print('='*60)
    
    success_count = 0
    for i, (full_code, stock_info) in enumerate(existing_stocks.items(), 1):
        print(f"\n[{i}/{len(existing_stocks)}] 更新: {full_code}")
        
        # 获取实时数据
        realtime = get_stock_realtime(full_code)
        if not realtime:
            print("  [ERROR] 获取实时数据失败")
            continue
        
        print(f"  名称: {realtime['name']}")
        print(f"  当前价: {realtime['current_price']}")
        print(f"  成交量: {realtime['volume']}")
        
        # 获取K线数据
        kline = get_stock_kline(full_code, days=60)
        if not kline:
            print("  [ERROR] 获取K线数据失败")
            continue
        
        # 计算地量
        diliang = calculate_diliang(kline)
        print(f"  5日地量: {diliang.get('diliang_5', False)}")
        
        # 准备更新字段
        fields = {
            FIELD_IDS["最新收盘价"]]: realtime["current_price"],
            FIELD_IDS["成交量"]]: realtime["volume"],
            FIELD_IDS["5日地量"]]: diliang.get("diliang_5", False),
            FIELD_IDS["10日地量"]]: diliang.get("diliang_10", False),
            FIELD_IDS["20日地量"]]: diliang.get("diliang_20", False),
            FIELD_IDS["30日地量"]]: diliang.get("diliang_30", False),
            FIELD_IDS["60日地量"]]: diliang.get("diliang_60", False),
            FIELD_IDS["备注"]]: f"更新于 {datetime.now().strftime('%Y-%m-%d %H:%M')}"
        }
        
        # 实际更新（使用MCP工具）
        # mcp_lark-mcp_bitable_v1_appTableRecord_update(
        #     app_token=FEISHU_APP_TOKEN,
        #     table_id=FEISHU_TABLE_ID,
        #     record_id=stock_info["record_id"],
        #     fields=fields
        # )
        print(f"  [OK] 准备更新记录 {stock_info['record_id']}")
        success_count += 1
    
    print(f"\n更新完成: {success_count}/{len(existing_stocks)}")
    return success_count


def add_new_stocks_from_tdx(existing_codes: Set[str]):
    """从通达信板块添加新股票"""
    print(f"\n{'='*60}")
    print("从通达信3BL板块添加新股票")
    print('='*60)
    
    all_new_stocks = []
    
    for block_date in BLOCK_DATES:
        print(f"\n读取板块: 3BL{block_date}")
        stocks = read_tdx_block(block_date)
        
        for stock in stocks:
            if stock["full_code"] not in existing_codes:
                stock["block_date"] = block_date
                all_new_stocks.append(stock)
    
    print(f"\n发现 {len(all_new_stocks)} 只新股票")
    
    # 处理新股票
    success_count = 0
    for i, stock in enumerate(all_new_stocks, 1):
        print(f"\n[{i}/{len(all_new_stocks)}] 添加: {stock['full_code']}")
        
        # 获取实时数据
        realtime = get_stock_realtime(stock["full_code"])
        if not realtime:
            print("  [ERROR] 获取实时数据失败")
            continue
        
        print(f"  名称: {realtime['name']}")
        
        # 获取K线数据
        kline = get_stock_kline(stock["full_code"], days=60)
        if not kline:
            print("  [ERROR] 获取K线数据失败")
            continue
        
        # 计算地量
        diliang = calculate_diliang(kline)
        
        # 准备字段
        fields = {
            FIELD_IDS["股票代码"]]: stock["code"],
            FIELD_IDS["股票名称"]]: realtime["name"],
            FIELD_IDS["入池日期"]]: stock["block_date"],
            FIELD_IDS["入池开盘价"]]: realtime["current_price"],
            FIELD_IDS["入池收盘价"]]: realtime["current_price"],
            FIELD_IDS["入池最高价"]]: realtime["high"],
            FIELD_IDS["最新收盘价"]]: realtime["current_price"],
            FIELD_IDS["成交量"]]: realtime["volume"],
            FIELD_IDS["5日地量"]]: diliang.get("diliang_5", False),
            FIELD_IDS["10日地量"]]: diliang.get("diliang_10", False),
            FIELD_IDS["20日地量"]]: diliang.get("diliang_20", False),
            FIELD_IDS["30日地量"]]: diliang.get("diliang_30", False),
            FIELD_IDS["60日地量"]]: diliang.get("diliang_60", False),
            FIELD_IDS["备注"]]: f"添加于 {datetime.now().strftime('%Y-%m-%d %H:%M')}"
        }
        
        # 实际添加（使用MCP工具）
        # mcp_lark-mcp_bitable_v1_appTableRecord_create(
        #     app_token=FEISHU_APP_TOKEN,
        #     table_id=FEISHU_TABLE_ID,
        #     fields=fields
        # )
        print(f"  [OK] 准备添加新记录")
        success_count += 1
    
    print(f"\n添加完成: {success_count}/{len(all_new_stocks)}")
    return success_count


def main():
    print("=" * 60)
    print("飞书表格股票数据完整更新")
    print("=" * 60)
    print(f"当前时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"飞书表格: {FEISHU_TABLE_ID}")
    
    # 注意：这里应该使用MCP工具读取表格数据
    # 由于当前环境限制，需要手动传入表格数据
    print("\n[提示] 请先在nanobot环境中使用MCP工具读取表格数据")
    print("  mcp_lark-mcp_bitable_v1_appTableRecord_search")
    print("    app_token=N jMBbwfgLaBXoSslUD8cDaPQnvf")
    print("    table_id=tblRzH4lnNlvcAlq")
    print("    page_size=500")
    
    # 测试模式
    print("\n[测试模式] 使用示例数据")
    
    # 示例：表格中已有的股票
    sample_existing = {
        "000001.SZ": {"record_id": "recvcfe1dJtWfs", "stock_code": "000001", "full_code": "000001.SZ"},
        "600519.SH": {"record_id": "recvcfe06mmOeq", "stock_code": "600519", "full_code": "600519.SH"},
    }
    
    # 更新现有股票
    update_existing_stocks(sample_existing)
    
    # 添加新股票（从通达信板块）
    existing_codes = set(sample_existing.keys())
    add_new_stocks_from_tdx(existing_codes)
    
    print(f"\n{'='*60}")
    print("完整更新流程测试完成")
    print('='*60)


if __name__ == "__main__":
    main()
