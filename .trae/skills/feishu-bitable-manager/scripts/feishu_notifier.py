#!/usr/bin/env python3
"""
飞书群聊通知模块
用于发送任务开始和完成通知到飞书群聊
使用飞书开放平台 API: /open-apis/im/v1/messages
"""

import os
import json
import requests
from datetime import datetime
from typing import Optional

# 飞书配置 - 从环境变量读取
FEISHU_APP_ID = os.getenv("FEISHU_APP_ID", "cli_a90a6cf288f8dbb3")
FEISHU_APP_SECRET = os.getenv("FEISHU_APP_SECRET", "oOSgX9FPUnomiaJ5MJaXrfPllxvV4Nar")
FEISHU_CHAT_ID = os.getenv("FEISHU_CHAT_ID", "oc_1234567890abcdef")  # 默认群聊ID，需要替换为实际值

# 飞书API基础URL
FEISHU_API_BASE = "https://open.feishu.cn/open-apis"


def get_tenant_access_token(app_id: str, app_secret: str) -> Optional[str]:
    """
    获取飞书租户访问令牌
    
    Args:
        app_id: 飞书应用ID
        app_secret: 飞书应用密钥
        
    Returns:
        访问令牌或None
    """
    url = f"{FEISHU_API_BASE}/auth/v3/tenant_access_token/internal"
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


def send_feishu_message(
    content: str, 
    title: Optional[str] = None,
    chat_id: Optional[str] = None,
    template: str = "blue"
) -> bool:
    """
    发送飞书群聊消息
    使用 /open-apis/im/v1/messages 接口
    
    Args:
        content: 消息内容（支持Markdown格式）
        title: 消息标题（可选）
        chat_id: 群聊ID，默认从环境变量读取
        template: 消息卡片颜色模板 (blue, green, red, orange, purple, grey)
    
    Returns:
        bool: 发送是否成功
    """
    # 获取访问令牌
    token = get_tenant_access_token(FEISHU_APP_ID, FEISHU_APP_SECRET)
    if not token:
        print("[警告] 无法获取飞书访问令牌")
        return False
    
    # 使用传入的chat_id或环境变量
    target_chat_id = chat_id or FEISHU_CHAT_ID
    if not target_chat_id or target_chat_id == "oc_1234567890abcdef":
        print("[警告] 未配置飞书群聊ID (FEISHU_CHAT_ID)")
        return False
    
    try:
        # 构建消息卡片
        if title:
            card_content = {
                "config": {"wide_screen_mode": True},
                "header": {
                    "title": {"tag": "plain_text", "content": title},
                    "template": template
                },
                "elements": [
                    {
                        "tag": "div",
                        "text": {"tag": "lark_md", "content": content}
                    }
                ]
            }
            
            api_url = f"{FEISHU_API_BASE}/im/v1/messages"
            headers = {
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json"
            }
            
            data = {
                "receive_id": target_chat_id,
                "msg_type": "interactive",
                "content": json.dumps(card_content)
            }
        else:
            # 纯文本消息
            api_url = f"{FEISHU_API_BASE}/im/v1/messages"
            headers = {
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json"
            }
            
            data = {
                "receive_id": target_chat_id,
                "msg_type": "text",
                "content": json.dumps({"text": content})
            }
        
        # 发送请求
        response = requests.post(
            api_url,
            headers=headers,
            params={"receive_id_type": "chat_id"},
            json=data,
            timeout=30
        )
        
        result = response.json()
        
        if result.get("code") == 0:
            print(f"[通知] 飞书消息发送成功")
            return True
        else:
            print(f"[警告] 飞书消息发送失败: {result.get('msg', '未知错误')}")
            return False
            
    except Exception as e:
        print(f"[警告] 飞书消息发送异常: {e}")
        return False


def send_task_start_notification(
    task_name: str, 
    task_details: str = "",
    chat_id: Optional[str] = None
) -> bool:
    """
    发送任务开始通知
    
    Args:
        task_name: 任务名称
        task_details: 任务详情（可选）
        chat_id: 群聊ID（可选，默认使用环境变量）
    
    Returns:
        bool: 发送是否成功
    """
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    content = f"""⏰ **定时任务开始执行**

📊 **任务**: {task_name}
🕐 **开始时间**: {now}

{task_details}

正在执行任务，请稍候..."""
    
    return send_feishu_message(
        content, 
        title="⏰ 定时任务开始",
        chat_id=chat_id,
        template="blue"
    )


def send_task_end_notification(
    task_name: str, 
    success: bool = True, 
    result_summary: str = "",
    error_message: str = "",
    chat_id: Optional[str] = None
) -> bool:
    """
    发送任务完成通知
    
    Args:
        task_name: 任务名称
        success: 任务是否成功
        result_summary: 结果摘要
        error_message: 错误信息（如果失败）
        chat_id: 群聊ID（可选，默认使用环境变量）
    
    Returns:
        bool: 发送是否成功
    """
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    if success:
        status_icon = "✅"
        status_text = "成功"
        template = "green"
    else:
        status_icon = "❌"
        status_text = "失败"
        template = "red"
    
    content = f"""{status_icon} **定时任务执行完成**

📊 **任务**: {task_name}
🕐 **完成时间**: {now}
📈 **状态**: {status_text}

{result_summary}
"""
    
    if error_message:
        content += f"""
⚠️ **错误信息**:
```
{error_message}
```
"""
    
    return send_feishu_message(
        content, 
        title=f"{status_icon} 定时任务完成",
        chat_id=chat_id,
        template=template
    )


def send_triple_volume_notification(
    date: str,
    stock_count: int,
    top_stocks: list,
    csv_path: str,
    bitable_url: str = "",
    chat_id: Optional[str] = None
) -> bool:
    """
    发送三倍量选股结果通知
    
    Args:
        date: 选股日期
        stock_count: 选股数量
        top_stocks: 前N名股票列表
        csv_path: CSV文件路径
        bitable_url: 飞书表格URL
        chat_id: 群聊ID（可选，默认使用环境变量）
    
    Returns:
        bool: 发送是否成功
    """
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    # 构建前5名股票信息
    top_stocks_text = ""
    for i, stock in enumerate(top_stocks[:5], 1):
        code = stock.get('code', '')
        name = stock.get('name', '')
        ratio = stock.get('volume_ratio', '')
        top_stocks_text += f"{i}. **{code}** {name} - 放量{ratio}倍\n"
    
    content = f"""✅ **三倍量选股任务完成**

📅 **选股日期**: {date}
🕐 **完成时间**: {now}
📈 **选股数量**: {stock_count}只
📁 **结果文件**: {csv_path}
✅ **Git提交**: 已推送

🏆 **前5名股票**:
{top_stocks_text}
"""
    
    if bitable_url:
        content += f"""
📊 **[查看飞书表格]({bitable_url})**
"""
    
    return send_feishu_message(
        content, 
        title="✅ 三倍量选股完成",
        chat_id=chat_id,
        template="green"
    )


def send_screenshot_notification(
    date: str,
    total_stocks: int,
    output_dir: str,
    csv_files: list,
    chat_id: Optional[str] = None
) -> bool:
    """
    发送截图任务完成通知
    
    Args:
        date: 截图日期
        total_stocks: 截图股票总数
        output_dir: 输出目录
        csv_files: 处理的CSV文件列表
        chat_id: 群聊ID（可选，默认使用环境变量）
    
    Returns:
        bool: 发送是否成功
    """
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    # 构建CSV文件信息
    csv_files_text = "\n".join([f"- {f}" for f in csv_files])
    
    content = f"""✅ **天龙博弈截图任务完成**

📅 **截图日期**: {date}
🕐 **完成时间**: {now}
📊 **截图股票数**: {total_stocks}只
📁 **保存路径**: {output_dir}
✅ **Git提交**: 已推送

📄 **处理的CSV文件**:
{csv_files_text}
"""
    
    return send_feishu_message(
        content, 
        title="✅ 天龙博弈截图完成",
        chat_id=chat_id,
        template="green"
    )


def send_breakthrough_alert(
    stock_code: str,
    stock_name: str,
    current_price: float,
    alert_type: str,
    threshold: float,
    chat_id: Optional[str] = None
) -> bool:
    """
    发送突破告警消息
    
    Args:
        stock_code: 股票代码
        stock_name: 股票名称
        current_price: 当前价格
        alert_type: 告警类型 ("high"-突破最高价, "close"-突破收盘价, "both"-同时突破)
        threshold: 突破阈值
        chat_id: 群聊ID（可选，默认使用环境变量）
    
    Returns:
        bool: 发送是否成功
    """
    if alert_type == "high":
        title = "🚨 突破最高价告警"
        content = f"""**{stock_code} {stock_name}**

当前收盘价：**{current_price:.2f}**
突破入池最高价：**{threshold:.2f}**"""
        template = "red"
    elif alert_type == "close":
        title = "📈 突破收盘价提醒"
        content = f"""**{stock_code} {stock_name}**

当前收盘价：**{current_price:.2f}**
突破入池收盘价：**{threshold:.2f}**"""
        template = "blue"
    else:  # both
        title = "🔥 强势突破告警"
        content = f"""**{stock_code} {stock_name}**

当前收盘价：**{current_price:.2f}**
同时突破入池最高价和收盘价！"""
        template = "red"
    
    return send_feishu_message(
        content,
        title=title,
        chat_id=chat_id,
        template=template
    )


def send_pattern_alert(
    stock_code: str,
    stock_name: str,
    score: int,
    patterns: dict,
    chat_id: Optional[str] = None
) -> bool:
    """
    发送形态告警消息
    
    Args:
        stock_code: 股票代码
        stock_name: 股票名称
        score: 形态得分
        patterns: 形态字典
        chat_id: 群聊ID（可选，默认使用环境变量）
    
    Returns:
        bool: 发送是否成功
    """
    # 构建形态列表
    pattern_names = []
    if patterns.get("bottom_pattern"): pattern_names.append("底分型")
    if patterns.get("yang_bao_yin"): pattern_names.append("阳包阴")
    if patterns.get("low_volume_5"): pattern_names.append("5日地量")
    if patterns.get("low_volume_10"): pattern_names.append("10日地量")
    if patterns.get("low_volume_20"): pattern_names.append("20日地量")
    if patterns.get("low_volume_30"): pattern_names.append("30日地量")
    if patterns.get("low_volume_60"): pattern_names.append("60日地量")
    
    content = f"""**{stock_code} {stock_name}**

形态得分：**{score}**
触发形态：**{', '.join(pattern_names)}**"""
    
    return send_feishu_message(
        content,
        title="📊 高形态得分提醒",
        chat_id=chat_id,
        template="green"
    )


if __name__ == "__main__":
    # 测试发送消息
    print("测试发送飞书消息...")
    print(f"使用 App ID: {FEISHU_APP_ID}")
    print(f"使用 Chat ID: {FEISHU_CHAT_ID}")
    
    # 测试任务开始通知
    send_task_start_notification(
        "三倍量选股",
        "正在执行通达信3倍量选股..."
    )
    
    # 测试任务完成通知
    send_task_end_notification(
        "三倍量选股",
        success=True,
        result_summary="选股数量: 34只\n前5名: 600567, 603616, 603956, 603332, 002806"
    )
