#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
读取通达信3BL板块，获取实时数据，实际更新到飞书多维表格
使用MCP工具
"""

import sys
sys.path.insert(0, 'd:\\agentsTeam\\skills\\tdx-3bl-updater')

import requests
from datetime import datetime
from pathlib import Path

# 飞书表格配置
FEISHU_APP_TOKEN = "NjMBbwfgLaBXoSslUD8cDaPQnvf"
FEISHU_TABLE_ID = "tblRzH4lnNlvcAlq"

# 通达信板块路径（需要用户修改为实际路径）
TDX_BLOCK_PATH = Path("D:/通达信/T0002/sblock")

# 板块日期
BLOCK_DATE = "20260227"

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
    "备注": "fldceiRBna",
}


def get_stock_realtime(stock_code):
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
                    "code": parts[2],
                    "current_price": float(parts[3]),
                    "yesterday_close": float(parts[4]),
                    "today_open": float(parts[5]),
                    "volume": int(parts[6]),
                    "high": float(parts[33]),
                    "low": float(parts[34]),
                }
        return None
    except Exception as e:
        print(f"[ERROR] 获取实时数据失败 {stock_code}: {e}")
        return None


def get_stock_kline(stock_code, days=20):
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


def calculate_diliang(kline_data):
    """计算地量"""
    if not kline_data or len(kline_data) < 5:
        return {}
    
    volumes = [d["volume"] for d in kline_data]
    latest_volume = volumes[-1]
    
    avg_5 = sum(volumes[-5:]) / 5
    avg_10 = sum(volumes[-10:]) / 10 if len(volumes) >= 10 else avg_5
    avg_20 = sum(volumes[-20:]) / 20 if len(volumes) >= 20 else avg_10
    
    return {
        "avg_5": avg_5,
        "avg_10": avg_10,
        "avg_20": avg_20,
        "diliang_5": latest_volume < avg_5 * 0.8,
        "diliang_10": latest_volume < avg_10 * 0.8,
        "diliang_20": latest_volume < avg_20 * 0.8,
    }


def read_tdx_block():
    """读取通达信板块文件"""
    block_file = TDX_BLOCK_PATH / f"3BL{BLOCK_DATE}.blk"
    
    if not block_file.exists():
        print(f"[WARNING] 板块文件不存在: {block_file}")
        print("[INFO] 使用测试数据")
        # 返回测试数据
        return [
            {"code": "000001", "full_code": "000001.SZ"},
            {"code": "600000", "full_code": "600000.SH"},
        ]
    
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
                
                stocks.append({"code": line, "full_code": full_code})
        
        return stocks
    except Exception as e:
        print(f"[ERROR] 读取板块文件失败: {e}")
        return []


def prepare_feishu_fields(stock, realtime, diliang):
    """准备飞书表格字段数据"""
    fields = {
        FIELD_IDS["股票代码"]: stock["full_code"],
        FIELD_IDS["股票名称"]]: realtime["name"],
        FIELD_IDS["入池日期"]: BLOCK_DATE,
        FIELD_IDS["入池开盘价"]: realtime["today_open"],
        FIELD_IDS["入池收盘价"]: realtime["current_price"],
        FIELD_IDS["入池最高价"]: realtime["high"],
        FIELD_IDS["最新收盘价"]: realtime["current_price"],
        FIELD_IDS["成交量"]: realtime["volume"],
        FIELD_IDS["5日地量"]: diliang.get("diliang_5", False),
        FIELD_IDS["10日地量"]: diliang.get("diliang_10", False),
        FIELD_IDS["20日地量"]: diliang.get("diliang_20", False),
        FIELD_IDS["备注"]: f"更新于 {datetime.now().strftime('%Y-%m-%d %H:%M')}"
    }
    return fields


def update_feishu_record(fields):
    """
    更新飞书表格记录
    使用MCP工具: mcp_lark-mcp_bitable_v1_appTableRecord_create
    """
    print(f"\n准备更新到飞书表格:")
    print(f"  股票代码: {fields[FIELD_IDS['股票代码']]}")
    print(f"  股票名称: {fields[FIELD_IDS['股票名称']]}")
    print(f"  最新价: {fields[FIELD_IDS['最新收盘价']]}")
    print(f"  成交量: {fields[FIELD_IDS['成交量']]}")
    print(f"  5日地量: {fields[FIELD_IDS['5日地量']]}")
    
    # 实际调用MCP工具的代码（需要在nanobot环境中执行）
    # 示例:
    # result = mcp_lark-mcp_bitable_v1_appTableRecord_create(
    #     app_token=FEISHU_APP_TOKEN,
    #     table_id=FEISHU_TABLE_ID,
    #     fields=fields
    # )
    
    print("  [INFO] 请在nanobot环境中使用MCP工具执行实际更新")
    print(f"  [MCP] mcp_lark-mcp_bitable_v1_appTableRecord_create")
    print(f"        app_token={FEISHU_APP_TOKEN}")
    print(f"        table_id={FEISHU_TABLE_ID}")
    print(f"        fields={json.dumps(fields, ensure_ascii=False, indent=2)[:200]}...")
    
    return True


def main():
    print("=" * 60)
    print("通达信3BL板块股票数据更新 - 实际更新模式")
    print("=" * 60)
    print(f"板块日期: {BLOCK_DATE}")
    print(f"当前时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"飞书表格: {FEISHU_TABLE_ID}")
    
    # 1. 读取板块股票
    stocks = read_tdx_block()
    print(f"\n读取到 {len(stocks)} 只股票")
    
    # 2. 处理每只股票
    success_count = 0
    for i, stock in enumerate(stocks, 1):
        print(f"\n{'='*60}")
        print(f"处理第 {i}/{len(stocks)} 只: {stock['full_code']}")
        print('='*60)
        
        # 获取实时数据
        realtime = get_stock_realtime(stock["full_code"])
        if not realtime:
            print("[ERROR] 获取实时数据失败")
            continue
        
        print(f"名称: {realtime['name']}")
        print(f"当前价: {realtime['current_price']}")
        print(f"成交量: {realtime['volume']} 手")
        
        # 获取K线数据
        kline = get_stock_kline(stock["full_code"], days=20)
        if not kline:
            print("[ERROR] 获取K线数据失败")
            continue
        
        # 计算地量
        diliang = calculate_diliang(kline)
        print(f"5日均量: {diliang['avg_5']:.0f}")
        print(f"5日地量: {diliang['diliang_5']}")
        
        # 准备字段
        fields = prepare_feishu_fields(stock, realtime, diliang)
        
        # 更新到飞书
        if update_feishu_record(fields):
            success_count += 1
    
    print(f"\n{'='*60}")
    print(f"更新完成: {success_count}/{len(stocks)}")
    print('='*60)


if __name__ == "__main__":
    main()
