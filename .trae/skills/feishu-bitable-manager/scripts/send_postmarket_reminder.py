#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
盘后数据维护提醒脚本
每日15:00收盘后发送提醒到飞书群聊
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


def send_postmarket_reminder(chat_id: str, token: str) -> bool:
    """发送盘后维护提醒卡片消息"""
    
    current_time = datetime.now().strftime("%Y-%m-%d %H:%M")
    
    # 构建卡片内容
    card_content = {
        "config": {
            "wide_screen_mode": True
        },
        "header": {
            "title": {
                "tag": "plain_text",
                "content": "📢 盘后数据维护提醒"
            },
            "template": "orange"
        },
        "elements": [
            {
                "tag": "div",
                "text": {
                    "tag": "lark_md",
                    "content": f"**时间：** {current_time}\n\n请操作员完成以下操作："
                }
            },
            {
                "tag": "div",
                "text": {
                    "tag": "lark_md",
                    "content": (
                        "**1️⃣ 打开通达信软件**\n"
                        "**2️⃣ 执行盘后数据下载**\n"
                        "   - 点击菜单：系统 → 盘后数据下载\n"
                        "   - 选择：日线数据\n"
                        "   - 时间范围：最近3个月\n"
                        "   - 点击：开始下载\n\n"
                        "**3️⃣ 执行三倍量选股**\n"
                        "   - 点击菜单：功能 → 选股器 → 综合选股\n"
                        "   - 选择：三倍量选股公式\n"
                        "   - 执行选股\n\n"
                        "**4️⃣ 录入选股结果**\n"
                        "   - 将选股结果导出为Excel\n"
                        "   - 使用脚本批量导入多维表格"
                    )
                }
            },
            {
                "tag": "hr"
            },
            {
                "tag": "div",
                "text": {
                    "tag": "lark_md",
                    "content": "⏰ **复盘分析将在15:30自动执行**"
                }
            },
            {
                "tag": "action",
                "actions": [
                    {
                        "tag": "button",
                        "text": {
                            "tag": "plain_text",
                            "content": "查看多维表格"
                        },
                        "type": "primary",
                        "url": os.environ.get('BITABLE_URL', 'https://www.feishu.cn')
                    }
                ]
            }
        ]
    }
    
    # 发送卡片消息
    api_url = "https://open.feishu.cn/open-apis/im/v1/messages"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    params = {"receive_id_type": "chat_id"}
    
    data = {
        "receive_id": chat_id,
        "msg_type": "interactive",
        "content": json.dumps(card_content)
    }
    
    try:
        response = requests.post(api_url, headers=headers, params=params, json=data, timeout=30)
        result = response.json()
        
        if result.get("code") == 0:
            print(f"[成功] 盘后维护提醒已发送到群聊 {chat_id}")
            return True
        else:
            print(f"[失败] 发送提醒失败: {result}")
            return False
    except Exception as e:
        print(f"[错误] 发送提醒失败: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(description='发送盘后数据维护提醒')
    parser.add_argument('--chat', required=True, help='飞书群聊ID')
    
    args = parser.parse_args()
    
    # 获取环境变量
    app_id = os.environ.get('FEISHU_APP_ID')
    app_secret = os.environ.get('FEISHU_APP_SECRET')
    
    if not app_id or not app_secret:
        print("错误: 未设置 FEISHU_APP_ID 或 FEISHU_APP_SECRET 环境变量")
        sys.exit(1)
    
    # 获取访问令牌
    print("[步骤1/2] 获取飞书访问令牌...")
    token = get_tenant_access_token(app_id, app_secret)
    if not token:
        sys.exit(1)
    
    # 发送提醒
    print(f"\n[步骤2/2] 发送盘后维护提醒到群聊 {args.chat}...")
    success = send_postmarket_reminder(args.chat, token)
    
    # 输出结果
    output = {
        "success": success,
        "chat_id": args.chat,
        "sent_at": datetime.now().isoformat()
    }
    
    print(f"###NANOBOT_OUTPUT_START###{json.dumps(output)}###NANOBOT_OUTPUT_END###")
    
    sys.exit(0 if success else 1)


if __name__ == '__main__':
    main()
