#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
飞书多维表格创建脚本
创建通达信3倍量选股追踪多维表格应用
"""

import argparse
import json
import os
import sys
import requests
from datetime import datetime


def get_tenant_access_token(app_id: str, app_secret: str) -> str:
    """获取飞书租户访问令牌"""
    url = "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal"
    headers = {"Content-Type": "application/json"}
    data = {"app_id": app_id, "app_secret": app_secret}
    
    try:
        response = requests.post(url, headers=headers, json=data, timeout=30)
        result = response.json()
        if result.get("code") == 0:
            return result.get("tenant_access_token")
        else:
            print(f"[错误] 获取token失败: {result}")
            return None
    except Exception as e:
        print(f"[错误] 请求token失败: {e}")
        return None


def create_bitable_app(token: str, name: str, folder_token: str = "") -> dict:
    """创建多维表格应用"""
    url = "https://open.feishu.cn/open-apis/bitable/v1/apps"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    data = {
        "name": name,
        "time_zone": "Asia/Shanghai"
    }
    if folder_token:
        data["folder_token"] = folder_token
    
    try:
        response = requests.post(url, headers=headers, json=data, timeout=30)
        result = response.json()
        
        if result.get("code") == 0:
            app_data = result.get("data", {})
            print(f"[成功] 多维表格应用创建成功")
            print(f"  应用Token: {app_data.get('app_token')}")
            print(f"  应用名称: {app_data.get('name')}")
            print(f"  应用URL: {app_data.get('url')}")
            return app_data
        else:
            print(f"[失败] 创建多维表格应用失败: {result}")
            return None
    except Exception as e:
        print(f"[错误] 创建多维表格应用失败: {e}")
        return None


def create_stock_table(token: str, app_token: str) -> dict:
    """创建选股记录数据表"""
    url = f"https://open.feishu.cn/open-apis/bitable/v1/apps/{app_token}/tables"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    # 字段类型说明：
    # 1: 多行文本, 2: 数字, 5: 日期, 7: 复选框, 13: 电话号码, 15: 超链接
    # 20: 公式, 1001: 创建时间, 1002: 最后修改时间
    
    data = {
        "table": {
            "name": "选股记录",
            "default_view_name": "全部记录",
            "fields": [
                {
                    "field_name": "股票代码",
                    "type": 1,
                    "ui_type": "Text"
                },
                {
                    "field_name": "股票名称",
                    "type": 1,
                    "ui_type": "Text"
                },
                {
                    "field_name": "入池日期",
                    "type": 5,
                    "ui_type": "DateTime",
                    "property": {
                        "date_formatter": "yyyy-MM-dd"
                    }
                },
                {
                    "field_name": "入池开盘价",
                    "type": 2,
                    "ui_type": "Number",
                    "property": {
                        "formatter": "0.00"
                    }
                },
                {
                    "field_name": "入池收盘价",
                    "type": 2,
                    "ui_type": "Number",
                    "property": {
                        "formatter": "0.00"
                    }
                },
                {
                    "field_name": "入池最高价",
                    "type": 2,
                    "ui_type": "Number",
                    "property": {
                        "formatter": "0.00"
                    }
                },
                {
                    "field_name": "最新收盘价",
                    "type": 2,
                    "ui_type": "Number",
                    "property": {
                        "formatter": "0.00"
                    }
                },
                {
                    "field_name": "成交量",
                    "type": 2,
                    "ui_type": "Number",
                    "property": {
                        "formatter": "0"
                    }
                },
                {
                    "field_name": "3倍量确认",
                    "type": 7,
                    "ui_type": "Checkbox"
                },
                {
                    "field_name": "突破最高价",
                    "type": 7,
                    "ui_type": "Checkbox"
                },
                {
                    "field_name": "突破收盘价",
                    "type": 7,
                    "ui_type": "Checkbox"
                },
                {
                    "field_name": "突破告警",
                    "type": 7,
                    "ui_type": "Checkbox"
                },
                {
                    "field_name": "告警时间",
                    "type": 5,
                    "ui_type": "DateTime",
                    "property": {
                        "date_formatter": "yyyy-MM-dd HH:mm"
                    }
                },
                {
                    "field_name": "底分型",
                    "type": 7,
                    "ui_type": "Checkbox"
                },
                {
                    "field_name": "阳包阴",
                    "type": 7,
                    "ui_type": "Checkbox"
                },
                {
                    "field_name": "5日地量",
                    "type": 7,
                    "ui_type": "Checkbox"
                },
                {
                    "field_name": "10日地量",
                    "type": 7,
                    "ui_type": "Checkbox"
                },
                {
                    "field_name": "20日地量",
                    "type": 7,
                    "ui_type": "Checkbox"
                },
                {
                    "field_name": "30日地量",
                    "type": 7,
                    "ui_type": "Checkbox"
                },
                {
                    "field_name": "60日地量",
                    "type": 7,
                    "ui_type": "Checkbox"
                },
                {
                    "field_name": "形态得分",
                    "type": 2,
                    "ui_type": "Number",
                    "property": {
                        "formatter": "0"
                    }
                },
                {
                    "field_name": "备注",
                    "type": 1,
                    "ui_type": "Text"
                }
            ]
        }
    }
    
    try:
        response = requests.post(url, headers=headers, json=data, timeout=30)
        result = response.json()
        
        if result.get("code") == 0:
            table_data = result.get("data", {})
            print(f"[成功] 数据表创建成功")
            print(f"  表ID: {table_data.get('table_id')}")
            print(f"  表名: {table_data.get('name')}")
            return table_data
        else:
            print(f"[失败] 创建数据表失败: {result}")
            return None
    except Exception as e:
        print(f"[错误] 创建数据表失败: {e}")
        return None


def list_tables(token: str, app_token: str) -> list:
    """获取应用下的所有数据表"""
    url = f"https://open.feishu.cn/open-apis/bitable/v1/apps/{app_token}/tables"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    try:
        response = requests.get(url, headers=headers, timeout=30)
        result = response.json()
        
        if result.get("code") == 0:
            tables = result.get("data", {}).get("items", [])
            print(f"[成功] 获取到 {len(tables)} 个数据表")
            for table in tables:
                print(f"  - {table.get('name')} (ID: {table.get('table_id')})")
            return tables
        else:
            print(f"[失败] 获取数据表列表失败: {result}")
            return []
    except Exception as e:
        print(f"[错误] 获取数据表列表失败: {e}")
        return []


def save_config(app_token: str, table_id: str, config_path: str = "bitable_config.json"):
    """保存配置到文件"""
    config = {
        "app_token": app_token,
        "table_id": table_id,
        "created_at": datetime.now().isoformat()
    }
    
    try:
        with open(config_path, 'w', encoding='utf-8') as f:
            json.dump(config, f, ensure_ascii=False, indent=2)
        print(f"[成功] 配置已保存到 {config_path}")
    except Exception as e:
        print(f"[错误] 保存配置失败: {e}")


def main():
    parser = argparse.ArgumentParser(description='创建飞书多维表格应用')
    parser.add_argument('--name', default='通达信3倍量选股追踪', help='应用名称')
    parser.add_argument('--folder', default='', help='文件夹Token（可选）')
    parser.add_argument('--config', default='bitable_config.json', help='配置文件保存路径')
    
    args = parser.parse_args()
    
    # 获取环境变量
    app_id = os.environ.get('FEISHU_APP_ID')
    app_secret = os.environ.get('FEISHU_APP_SECRET')
    
    if not app_id or not app_secret:
        print("错误: 未设置 FEISHU_APP_ID 或 FEISHU_APP_SECRET 环境变量")
        sys.exit(1)
    
    # 获取访问令牌
    print("[步骤1/4] 获取飞书访问令牌...")
    token = get_tenant_access_token(app_id, app_secret)
    if not token:
        sys.exit(1)
    
    # 创建多维表格应用
    print(f"\n[步骤2/4] 创建多维表格应用 '{args.name}'...")
    app_data = create_bitable_app(token, args.name, args.folder)
    if not app_data:
        sys.exit(1)
    
    app_token = app_data.get('app_token')
    
    # 创建数据表
    print(f"\n[步骤3/4] 创建选股记录数据表...")
    table_data = create_stock_table(token, app_token)
    if not table_data:
        sys.exit(1)
    
    table_id = table_data.get('table_id')
    
    # 列出所有数据表
    print(f"\n[步骤4/4] 验证数据表...")
    list_tables(token, app_token)
    
    # 保存配置
    save_config(app_token, table_id, args.config)
    
    # 输出结果
    output = {
        "success": True,
        "app_token": app_token,
        "table_id": table_id,
        "app_url": app_data.get('url'),
        "config_path": args.config
    }
    
    print(f"\n{'='*60}")
    print("多维表格创建成功!")
    print(f"{'='*60}")
    print(f"应用Token: {app_token}")
    print(f"数据表ID: {table_id}")
    print(f"应用链接: {app_data.get('url')}")
    print(f"配置文件: {args.config}")
    print(f"{'='*60}")
    
    print(f"###NANOBOT_OUTPUT_START###{json.dumps(output)}###NANOBOT_OUTPUT_END###")
    
    sys.exit(0)


if __name__ == '__main__':
    main()
