#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
飞书多维表格操作模块
使用 MCP 工具或飞书 API 更新表格
"""

import json
from typing import Dict, List, Optional

# 飞书表格配置
FEISHU_APP_TOKEN = "NjMBbwfgLaBXoSslUD8cDaPQnvf"
FEISHU_TABLE_ID = "tblRzH4lnNlvcAlq"

# 字段ID映射（从MCP工具获取）
FIELD_IDS = {
    "股票代码": "fldHPzxvNn",
    "股票名称": "fldoz6l46S",
    "入池日期": "fldZ1ryVTc",
    "入池开盘价": "fldr6sO3Nx",
    "入池收盘价": "fldBIvaxPe",
    "入池最高价": "fld3V8H29g",
    "最新收盘价": "fldz04zez3",
    "成交量": "fldENO4ZxO",
    "3倍量确认": "fld5lBmEzQ",
    "突破最高价": "fldLhukAda",
    "突破收盘价": "fldBySiZOz",
    "突破告警": "fldLFdBhXF",
    "告警时间": "fldbM9eY4E",
    "底分型": "fld4EE0BkN",
    "阳包阴": "fldUiz9eGY",
    "5日地量": "fldpbtGag0",
    "10日地量": "fldpcWKIrC",
    "20日地量": "fld8MCVecG",
    "30日地量": "fldJQ3Pfzt",
    "60日地量": "fldSy9BEEe",
    "形态得分": "fldFzyoU2l",
    "备注": "fldceiRBna",
}


def prepare_record_fields(record: Dict) -> Dict:
    """
    将记录转换为飞书表格字段格式
    
    Args:
        record: 原始记录字典
    
    Returns:
        飞书表格格式的字段字典
    """
    fields = {}
    
    for field_name, value in record.items():
        field_id = FIELD_IDS.get(field_name)
        if not field_id:
            continue
        
        # 根据字段类型转换值
        if field_name in ["3倍量确认", "突破最高价", "突破收盘价", "突破告警", 
                          "底分型", "阳包阴", "5日地量", "10日地量", "20日地量", 
                          "30日地量", "60日地量"]:
            # Checkbox 类型
            fields[field_id] = bool(value)
        
        elif field_name in ["入池开盘价", "入池收盘价", "入池最高价", "最新收盘价"]:
            # Number 类型，保留2位小数
            fields[field_id] = float(value) if value else 0.0
        
        elif field_name in ["成交量", "形态得分"]:
            # Number 类型，整数
            fields[field_id] = int(value) if value else 0
        
        elif field_name in ["入池日期"]:
            # Date 类型
            fields[field_id] = value if value else None
        
        elif field_name == "告警时间":
            # DateTime 类型
            fields[field_id] = value if value else None
        
        else:
            # Text 类型
            fields[field_id] = str(value) if value else ""
    
    return fields


def update_record_to_feishu(record: Dict, record_id: Optional[str] = None) -> bool:
    """
    更新记录到飞书表格
    
    使用 MCP 工具 mcp_lark-mcp_bitable_v1_appTableRecord_create 或 _update
    
    Args:
        record: 记录数据
        record_id: 记录ID（如果为None则创建新记录）
    
    Returns:
        是否成功
    """
    try:
        # 准备字段数据
        fields = prepare_record_fields(record)
        
        # 构建 MCP 工具调用参数
        params = {
            "app_token": FEISHU_APP_TOKEN,
            "table_id": FEISHU_TABLE_ID,
            "fields": fields
        }
        
        # 打印 MCP 调用信息（实际使用时调用 MCP 工具）
        print(f"[MCP] 准备更新记录到飞书表格:")
        print(f"  - 股票代码: {record.get('股票代码')}")
        print(f"  - 股票名称: {record.get('股票名称')}")
        print(f"  - 字段数: {len(fields)}")
        
        # TODO: 实际调用 MCP 工具
        # 在 nanobot 环境中使用:
        # mcp_lark-mcp_bitable_v1_appTableRecord_create(**params)
        
        return True
    
    except Exception as e:
        print(f"[ERROR] 更新飞书表格失败: {e}")
        return False


def search_record_by_stock_code(stock_code: str) -> Optional[str]:
    """
    根据股票代码搜索记录
    
    Args:
        stock_code: 股票代码，如 "000001.SZ"
    
    Returns:
        记录ID，如果未找到返回None
    """
    # TODO: 使用 MCP 工具搜索记录
    # mcp_lark-mcp_bitable_v1_appTableRecord_search
    return None


def batch_update_records(records: List[Dict]) -> Dict:
    """
    批量更新记录
    
    Args:
        records: 记录列表
    
    Returns:
        更新结果统计
    """
    result = {
        "total": len(records),
        "success": 0,
        "failed": 0,
        "errors": []
    }
    
    for record in records:
        stock_code = record.get("股票代码", "未知")
        
        # 检查记录是否已存在
        record_id = search_record_by_stock_code(stock_code)
        
        # 更新或创建记录
        if update_record_to_feishu(record, record_id):
            result["success"] += 1
        else:
            result["failed"] += 1
            result["errors"].append(stock_code)
    
    return result


if __name__ == "__main__":
    # 测试
    test_record = {
        "股票代码": "000001.SZ",
        "股票名称": "平安银行",
        "入池日期": "2026-02-27",
        "入池开盘价": 10.5,
        "入池收盘价": 10.8,
        "入池最高价": 11.0,
        "最新收盘价": 11.2,
        "成交量": 1000000,
        "5日地量": True,
        "10日地量": False,
        "形态得分": 3,
    }
    
    update_record_to_feishu(test_record)
