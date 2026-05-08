#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
自动创建飞书多维表格视图
为通达信3倍量选股追踪表格创建多个业务视图
"""

import os
import sys
import json
import requests
from datetime import datetime
from typing import List, Dict, Optional

# 飞书API配置
FEISHU_API_BASE = "https://open.feishu.cn/open-apis"

# 视图配置
VIEWS_CONFIG = [
    {
        "name": "📊 全部记录",
        "description": "查看所有选股记录",
        "filters": [],
        "groups": [
            {"field_name": "入池日期", "sort_type": "DESCENDING"}
        ],
        "sorts": [
            {"field_name": "入池日期", "desc": True}
        ],
        "visible_fields": None  # 显示全部字段
    },
    {
        "name": "⭐ 今日入池",
        "description": "今天新入池的股票",
        "filters": [
            {
                "field_name": "入池日期",
                "operator": "is",
                "value": [datetime.now().strftime("%Y-%m-%d")]
            }
        ],
        "groups": [
            {"field_name": "形态得分", "sort_type": "DESCENDING"}
        ],
        "sorts": [
            {"field_name": "形态得分", "desc": True},
            {"field_name": "股票代码", "desc": False}
        ],
        "visible_fields": [
            "股票代码", "股票名称", "入池日期", "入池收盘价",
            "3倍量确认", "形态得分", "底分型", "阳包阴"
        ]
    },
    {
        "name": "🚀 突破监控",
        "description": "已突破最高价或收盘价的股票",
        "filters": [
            {
                "conjunction": "or",
                "conditions": [
                    {"field_name": "突破最高价", "operator": "is", "value": ["true"]},
                    {"field_name": "突破收盘价", "operator": "is", "value": ["true"]}
                ]
            }
        ],
        "groups": [
            {"field_name": "突破最高价", "sort_type": "DESCENDING"},
            {"field_name": "突破收盘价", "sort_type": "DESCENDING"}
        ],
        "sorts": [
            {"field_name": "告警时间", "desc": True},
            {"field_name": "最新收盘价", "desc": True}
        ],
        "visible_fields": [
            "股票代码", "股票名称", "入池最高价", "入池收盘价",
            "最新收盘价", "突破最高价", "突破收盘价", "突破告警", "告警时间"
        ]
    },
    {
        "name": "📉 地量股票",
        "description": "成交量处于近期低位的股票",
        "filters": [
            {
                "conjunction": "or",
                "conditions": [
                    {"field_name": "5日地量", "operator": "is", "value": ["true"]},
                    {"field_name": "10日地量", "operator": "is", "value": ["true"]},
                    {"field_name": "20日地量", "operator": "is", "value": ["true"]}
                ]
            }
        ],
        "groups": [
            {"field_name": "60日地量", "sort_type": "DESCENDING"},
            {"field_name": "30日地量", "sort_type": "DESCENDING"},
            {"field_name": "20日地量", "sort_type": "DESCENDING"}
        ],
        "sorts": [
            {"field_name": "形态得分", "desc": True}
        ],
        "visible_fields": [
            "股票代码", "股票名称", "入池日期", "成交量",
            "5日地量", "10日地量", "20日地量", "30日地量", "60日地量", "形态得分"
        ]
    },
    {
        "name": "💎 高形态得分",
        "description": "形态得分≥3的优质股票",
        "filters": [
            {
                "field_name": "形态得分",
                "operator": "isGreaterEqual",
                "value": ["3"]
            }
        ],
        "groups": [
            {"field_name": "形态得分", "sort_type": "DESCENDING"}
        ],
        "sorts": [
            {"field_name": "形态得分", "desc": True},
            {"field_name": "入池日期", "desc": True}
        ],
        "visible_fields": [
            "股票代码", "股票名称", "入池日期",
            "底分型", "阳包阴", "5日地量", "10日地量", "20日地量",
            "30日地量", "60日地量", "形态得分", "备注"
        ]
    },
    {
        "name": "🔥 强势信号",
        "description": "底分型+阳包阴同时出现",
        "filters": [
            {
                "conjunction": "and",
                "conditions": [
                    {"field_name": "底分型", "operator": "is", "value": ["true"]},
                    {"field_name": "阳包阴", "operator": "is", "value": ["true"]}
                ]
            }
        ],
        "groups": [
            {"field_name": "入池日期", "sort_type": "DESCENDING"}
        ],
        "sorts": [
            {"field_name": "形态得分", "desc": True}
        ],
        "visible_fields": [
            "股票代码", "股票名称", "入池日期", "入池收盘价",
            "最新收盘价", "底分型", "阳包阴", "形态得分"
        ]
    },
    {
        "name": "👀 待观察",
        "description": "尚未突破的股票",
        "filters": [
            {
                "conjunction": "and",
                "conditions": [
                    {"field_name": "突破最高价", "operator": "is", "value": ["false"]},
                    {"field_name": "突破收盘价", "operator": "is", "value": ["false"]}
                ]
            }
        ],
        "groups": [
            {"field_name": "入池日期", "sort_type": "DESCENDING"}
        ],
        "sorts": [
            {"field_name": "入池日期", "desc": True},
            {"field_name": "最新收盘价", "desc": True}
        ],
        "visible_fields": [
            "股票代码", "股票名称", "入池日期",
            "入池最高价", "入池收盘价", "最新收盘价", "形态得分"
        ]
    },
    {
        "name": "🚨 告警记录",
        "description": "触发突破告警的股票",
        "filters": [
            {"field_name": "突破告警", "operator": "is", "value": ["true"]}
        ],
        "groups": [
            {"field_name": "告警时间", "sort_type": "DESCENDING"}
        ],
        "sorts": [
            {"field_name": "告警时间", "desc": True}
        ],
        "visible_fields": [
            "股票代码", "股票名称", "告警时间",
            "突破最高价", "突破收盘价", "最新收盘价", "备注"
        ]
    }
]


def get_tenant_access_token(app_id: str, app_secret: str) -> str:
    """获取飞书租户访问令牌"""
    url = f"{FEISHU_API_BASE}/auth/v3/tenant_access_token/internal"
    headers = {"Content-Type": "application/json"}
    data = {"app_id": app_id, "app_secret": app_secret}
    
    try:
        response = requests.post(url, headers=headers, json=data, timeout=30)
        result = response.json()
        if result.get("code") == 0:
            return result.get("tenant_access_token")
        else:
            print(f"[错误] 获取token失败: {result.get('msg')}")
            return None
    except Exception as e:
        print(f"[错误] 请求失败: {e}")
        return None


def get_table_fields(app_token: str, table_id: str, token: str) -> Dict[str, str]:
    """获取表格字段信息，建立字段名到字段ID的映射"""
    url = f"{FEISHU_API_BASE}/bitable/v1/apps/{app_token}/tables/{table_id}/fields"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    
    field_map = {}
    try:
        response = requests.get(url, headers=headers, timeout=30)
        result = response.json()
        if result.get("code") == 0:
            items = result.get("data", {}).get("items", [])
            for field in items:
                field_name = field.get("field_name")
                field_id = field.get("field_id")
                if field_name and field_id:
                    field_map[field_name] = field_id
            print(f"[成功] 获取到 {len(field_map)} 个字段")
            return field_map
        else:
            print(f"[错误] 获取字段失败: {result.get('msg')}")
            return {}
    except Exception as e:
        print(f"[错误] 请求失败: {e}")
        return {}


def create_view(app_token: str, table_id: str, token: str, view_config: Dict, field_map: Dict) -> bool:
    """创建单个视图"""
    url = f"{FEISHU_API_BASE}/bitable/v1/apps/{app_token}/tables/{table_id}/views"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    # 构建视图数据
    view_data = {
        "view_name": view_config["name"],
        "view_type": "grid"  # 表格视图
    }
    
    # 添加筛选条件
    if view_config.get("filters"):
        filters = view_config["filters"]
        if filters:
            # 处理简单筛选和复杂筛选
            if len(filters) == 1 and "field_name" in filters[0]:
                # 简单筛选
                filter_item = filters[0]
                field_id = field_map.get(filter_item["field_name"])
                if field_id:
                    view_data["filter_info"] = {
                        "conjunction": "and",
                        "conditions": [
                            {
                                "field_id": field_id,
                                "operator": filter_item["operator"],
                                "value": filter_item["value"]
                            }
                        ]
                    }
            elif "conjunction" in filters[0]:
                # 复杂筛选（带and/or）
                filter_info = {
                    "conjunction": filters[0]["conjunction"],
                    "conditions": []
                }
                for condition in filters[0].get("conditions", []):
                    field_id = field_map.get(condition["field_name"])
                    if field_id:
                        filter_info["conditions"].append({
                            "field_id": field_id,
                            "operator": condition["operator"],
                            "value": condition["value"]
                        })
                if filter_info["conditions"]:
                    view_data["filter_info"] = filter_info
    
    # 添加分组
    if view_config.get("groups"):
        groups = []
        for group in view_config["groups"]:
            field_id = field_map.get(group["field_name"])
            if field_id:
                groups.append({
                    "field_id": field_id,
                    "sort_type": group.get("sort_type", "ASCENDING")
                })
        if groups:
            view_data["group_info"] = {"groups": groups}
    
    # 添加排序
    if view_config.get("sorts"):
        sorts = []
        for sort in view_config["sorts"]:
            field_id = field_map.get(sort["field_name"])
            if field_id:
                sorts.append({
                    "field_id": field_id,
                    "desc": sort.get("desc", False)
                })
        if sorts:
            view_data["sort_info"] = {"sorts": sorts}
    
    try:
        print(f"\n[创建] {view_config['name']}")
        print(f"  描述: {view_config['description']}")
        
        response = requests.post(url, headers=headers, json=view_data, timeout=30)
        result = response.json()
        
        if result.get("code") == 0:
            print(f"  ✅ 创建成功")
            return True
        else:
            print(f"  ❌ 创建失败: {result.get('msg')}")
            return False
    except Exception as e:
        print(f"  ❌ 请求失败: {e}")
        return False


def main():
    """主函数"""
    import argparse
    
    parser = argparse.ArgumentParser(description="创建飞书多维表格视图")
    parser.add_argument("--app-token", required=True, help="飞书多维表格App Token")
    parser.add_argument("--table-id", required=True, help="数据表ID")
    parser.add_argument("--app-id", default=os.environ.get("FEISHU_APP_ID"), help="飞书App ID")
    parser.add_argument("--app-secret", default=os.environ.get("FEISHU_APP_SECRET"), help="飞书App Secret")
    
    args = parser.parse_args()
    
    print("="*60)
    print(" 飞书多维表格视图创建工具")
    print("="*60)
    print(f"\n表格: {args.app_token}")
    print(f"数据表: {args.table_id}")
    print(f"视图数量: {len(VIEWS_CONFIG)}")
    
    # 获取访问令牌
    print("\n[步骤1/3] 获取飞书访问令牌...")
    if not args.app_id or not args.app_secret:
        print("[错误] 请提供App ID和App Secret，或设置环境变量")
        return
    
    token = get_tenant_access_token(args.app_id, args.app_secret)
    if not token:
        return
    print("  ✅ 获取token成功")
    
    # 获取字段信息
    print("\n[步骤2/3] 获取表格字段信息...")
    field_map = get_table_fields(args.app_token, args.table_id, token)
    if not field_map:
        print("[错误] 无法获取字段信息")
        return
    
    # 打印字段映射（调试用）
    print("\n  字段映射:")
    for name, field_id in list(field_map.items())[:5]:
        print(f"    - {name}: {field_id}")
    print(f"    ... 共 {len(field_map)} 个字段")
    
    # 创建视图
    print("\n[步骤3/3] 创建视图...")
    success_count = 0
    for view_config in VIEWS_CONFIG:
        if create_view(args.app_token, args.table_id, token, view_config, field_map):
            success_count += 1
    
    # 打印结果
    print("\n" + "="*60)
    print(" 创建完成")
    print("="*60)
    print(f"\n成功: {success_count}/{len(VIEWS_CONFIG)}")
    
    if success_count == len(VIEWS_CONFIG):
        print("\n✅ 所有视图创建成功！")
        print(f"\n表格链接: https://ua1ubozww7s.feishu.cn/base/{args.app_token}")
    else:
        print(f"\n⚠️ 部分视图创建失败，请检查错误信息")


if __name__ == "__main__":
    main()
