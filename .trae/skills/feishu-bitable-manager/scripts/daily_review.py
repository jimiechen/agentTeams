#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
每日复盘脚本
每日15:30自动执行：
1. 获取所有在池股票的最新收盘价
2. 对比入池最高价和收盘价，更新突破状态
3. 触发突破告警
4. 形态分析（底分型、阳包阴、地量计算）
"""

import argparse
import json
import os
import sys
import requests
from datetime import datetime, timedelta
from typing import List, Dict, Optional

# 添加通达信PYPlugins路径（模块级别，确保只执行一次）
TDX_PATH = r"C:\new_tdx_test"
PYPLUGINS_PATH = os.path.join(TDX_PATH, "PYPlugins", "user")
if os.path.exists(PYPLUGINS_PATH) and PYPLUGINS_PATH not in sys.path:
    sys.path.insert(0, PYPLUGINS_PATH)
    print(f"[调试] 已添加通达信路径: {PYPLUGINS_PATH}")


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


def get_stock_records(token: str, app_token: str, table_id: str) -> List[Dict]:
    """获取所有在池股票记录（未突破最高价的）"""
    url = f"https://open.feishu.cn/open-apis/bitable/v1/apps/{app_token}/tables/{table_id}/records"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    records = []
    page_token = None
    
    while True:
        params = {"page_size": 500}
        if page_token:
            params["page_token"] = page_token
        
        try:
            response = requests.get(url, headers=headers, params=params, timeout=30)
            result = response.json()
            
            if result.get("code") == 0:
                items = result.get("data", {}).get("items", [])
                records.extend(items)
                
                # 检查是否还有更多数据
                page_token = result.get("data", {}).get("page_token")
                if not page_token or not items:
                    break
            else:
                print(f"[失败] 获取记录失败: {result}")
                break
        except Exception as e:
            print(f"[错误] 获取记录失败: {e}")
            break
    
    print(f"[成功] 获取到 {len(records)} 条记录")
    return records


def get_stock_price(stock_code: str) -> Optional[Dict]:
    """
    获取股票最新价格
    使用通达信API获取数据
    返回：{"close": float, "open": float, "high": float, "low": float, "volume": int}
    """
    try:
        # 通达信路径已在模块级别添加
        from tqcenter import tq
        
        # 转换股票代码为通达信格式
        if stock_code.startswith('6'):
            stock_code_full = f"{stock_code}.SH"
        elif stock_code.startswith('8') or stock_code.startswith('4'):
            stock_code_full = f"{stock_code}.BJ"
        else:
            stock_code_full = f"{stock_code}.SZ"
        
        # 初始化通达信（如果未初始化）
        try:
            tq.initialize(__file__)
        except:
            pass  # 可能已经初始化
        
        # 获取最新行情数据
        df = tq.get_market_data(
            field_list=['Close', 'Open', 'High', 'Low', 'Volume'],
            stock_list=[stock_code_full],
            period='1d',
            count=1,
            dividend_type='front',
            fill_data=True
        )
        
        if df is not None and len(df) > 0:
            # 获取最新数据 - 使用iloc[0]避免FutureWarning
            close = float(df['Close'].iloc[-1].iloc[0]) if hasattr(df['Close'].iloc[-1], 'iloc') else float(df['Close'].iloc[-1])
            open_price = float(df['Open'].iloc[-1].iloc[0]) if hasattr(df['Open'].iloc[-1], 'iloc') else float(df['Open'].iloc[-1])
            high = float(df['High'].iloc[-1].iloc[0]) if hasattr(df['High'].iloc[-1], 'iloc') else float(df['High'].iloc[-1])
            low = float(df['Low'].iloc[-1].iloc[0]) if hasattr(df['Low'].iloc[-1], 'iloc') else float(df['Low'].iloc[-1])
            volume = int(df['Volume'].iloc[-1].iloc[0]) if hasattr(df['Volume'].iloc[-1], 'iloc') else int(df['Volume'].iloc[-1])
            
            return {
                "close": close,
                "open": open_price,
                "high": high,
                "low": low,
                "volume": volume
            }
    except Exception as e:
        print(f"[错误] 获取股票 {stock_code} 价格失败: {e}")
    
    return None


def analyze_patterns(stock_code: str, entry_date: str) -> Dict:
    """
    分析股票形态
    使用通达信API获取历史数据
    返回：{"bottom_pattern": bool, "yang_bao_yin": bool, "low_volume_5": bool, ...}
    """
    patterns = {
        "bottom_pattern": False,  # 底分型
        "yang_bao_yin": False,    # 阳包阴
        "low_volume_5": False,    # 5日地量
        "low_volume_10": False,   # 10日地量
        "low_volume_20": False,   # 20日地量
        "low_volume_30": False,   # 30日地量
        "low_volume_60": False,   # 60日地量
    }
    
    try:
        # 通达信路径已在模块级别添加
        from tqcenter import tq
        
        # 转换股票代码为通达信格式
        if stock_code.startswith('6'):
            stock_code_full = f"{stock_code}.SH"
        elif stock_code.startswith('8') or stock_code.startswith('4'):
            stock_code_full = f"{stock_code}.BJ"
        else:
            stock_code_full = f"{stock_code}.SZ"
        
        # 初始化通达信（如果未初始化）
        try:
            tq.initialize(__file__)
        except:
            pass  # 可能已经初始化
        
        # 获取历史数据（获取足够的数据用于形态分析）
        df = tq.get_market_data(
            field_list=['Close', 'Open', 'High', 'Low', 'Volume'],
            stock_list=[stock_code_full],
            period='1d',
            count=70,  # 获取70天数据，足够用于60日地量计算
            dividend_type='front',
            fill_data=True
        )
        
        if df is not None and len(df) >= 3:
            # 转换为numpy数组便于处理
            closes = df['Close'].values
            opens = df['Open'].values
            highs = df['High'].values
            lows = df['Low'].values
            volumes = df['Volume'].values
            
            # 底分型判断：中间K线低点最低，两边低点抬高
            if len(lows) >= 3:
                recent_lows = lows[-3:]
                if recent_lows[1] < recent_lows[0] and recent_lows[1] < recent_lows[2]:
                    patterns["bottom_pattern"] = True
            
            # 阳包阴判断：今日阳线完全包住昨日阴线
            if len(closes) >= 2:
                today_close = closes[-1]
                today_open = opens[-1]
                yesterday_close = closes[-2]
                yesterday_open = opens[-2]
                
                if (today_close > today_open and  # 今日阳线
                    yesterday_close < yesterday_open and  # 昨日阴线
                    today_open <= yesterday_close and
                    today_close >= yesterday_open):
                    patterns["yang_bao_yin"] = True
            
            # 地量判断
            current_volume = float(volumes[-1])
            
            # 将numpy数组转换为Python列表以便使用min()
            vol_list = [float(v) for v in volumes]
            
            patterns["low_volume_5"] = len(vol_list) >= 5 and current_volume <= float(min(vol_list[-5:])) * 1.01
            patterns["low_volume_10"] = len(vol_list) >= 10 and current_volume <= float(min(vol_list[-10:])) * 1.01
            patterns["low_volume_20"] = len(vol_list) >= 20 and current_volume <= float(min(vol_list[-20:])) * 1.01
            patterns["low_volume_30"] = len(vol_list) >= 30 and current_volume <= float(min(vol_list[-30:])) * 1.01
            patterns["low_volume_60"] = len(vol_list) >= 60 and current_volume <= float(min(vol_list[-60:])) * 1.01
    
    except Exception as e:
        print(f"[错误] 分析股票 {stock_code} 形态失败: {e}")
    
    return patterns


def calculate_pattern_score(patterns: Dict) -> int:
    """计算形态得分"""
    score = 0
    if patterns.get("bottom_pattern"): score += 1
    if patterns.get("yang_bao_yin"): score += 1
    if patterns.get("low_volume_5"): score += 1
    if patterns.get("low_volume_10"): score += 1
    if patterns.get("low_volume_20"): score += 1
    if patterns.get("low_volume_30"): score += 1
    if patterns.get("low_volume_60"): score += 1
    return score


def update_record(token: str, app_token: str, table_id: str, record_id: str, 
                  fields: Dict) -> bool:
    """更新记录"""
    url = f"https://open.feishu.cn/open-apis/bitable/v1/apps/{app_token}/tables/{table_id}/records/{record_id}"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    data = {"fields": fields}
    
    try:
        response = requests.put(url, headers=headers, json=data, timeout=30)
        result = response.json()
        
        if result.get("code") == 0:
            return True
        else:
            print(f"[失败] 更新记录失败: {result}")
            return False
    except Exception as e:
        print(f"[错误] 更新记录失败: {e}")
        return False


def send_breakthrough_alert(chat_id: str, token: str, stock_code: str, 
                            stock_name: str, current_price: float, 
                            alert_type: str, threshold: float) -> bool:
    """发送突破告警消息"""
    
    if alert_type == "high":
        title = "🚨 突破最高价告警"
        content = f"**{stock_code} {stock_name}**\n\n当前收盘价：**{current_price:.2f}**\n突破入池最高价：**{threshold:.2f}**"
        template = "red"
    elif alert_type == "close":
        title = "📈 突破收盘价提醒"
        content = f"**{stock_code} {stock_name}**\n\n当前收盘价：**{current_price:.2f}**\n突破入池收盘价：**{threshold:.2f}**"
        template = "blue"
    else:  # both
        title = "🔥 强势突破告警"
        content = f"**{stock_code} {stock_name}**\n\n当前收盘价：**{current_price:.2f}**\n同时突破入池最高价和收盘价！"
        template = "red"
    
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
    
    api_url = "https://open.feishu.cn/open-apis/im/v1/messages"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    data = {
        "receive_id": chat_id,
        "msg_type": "interactive",
        "content": json.dumps(card_content)
    }
    
    try:
        response = requests.post(api_url, headers=headers, 
                                params={"receive_id_type": "chat_id"},
                                json=data, timeout=30)
        result = response.json()
        
        if result.get("code") == 0:
            print(f"[成功] 突破告警已发送: {stock_code}")
            return True
        else:
            print(f"[失败] 发送告警失败: {result}")
            return False
    except Exception as e:
        print(f"[错误] 发送告警失败: {e}")
        return False


def send_pattern_alert(chat_id: str, token: str, stock_code: str,
                       stock_name: str, score: int, patterns: Dict) -> bool:
    """发送形态告警消息"""
    
    # 构建形态列表
    pattern_names = []
    if patterns.get("bottom_pattern"): pattern_names.append("底分型")
    if patterns.get("yang_bao_yin"): pattern_names.append("阳包阴")
    if patterns.get("low_volume_5"): pattern_names.append("5日地量")
    if patterns.get("low_volume_10"): pattern_names.append("10日地量")
    if patterns.get("low_volume_20"): pattern_names.append("20日地量")
    if patterns.get("low_volume_30"): pattern_names.append("30日地量")
    if patterns.get("low_volume_60"): pattern_names.append("60日地量")
    
    content = f"**{stock_code} {stock_name}**\n\n形态得分：**{score}**\n触发形态：**{', '.join(pattern_names)}**"
    
    card_content = {
        "config": {"wide_screen_mode": True},
        "header": {
            "title": {"tag": "plain_text", "content": "📊 高形态得分提醒"},
            "template": "green"
        },
        "elements": [
            {
                "tag": "div",
                "text": {"tag": "lark_md", "content": content}
            }
        ]
    }
    
    api_url = "https://open.feishu.cn/open-apis/im/v1/messages"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    data = {
        "receive_id": chat_id,
        "msg_type": "interactive",
        "content": json.dumps(card_content)
    }
    
    try:
        response = requests.post(api_url, headers=headers,
                                params={"receive_id_type": "chat_id"},
                                json=data, timeout=30)
        result = response.json()
        
        if result.get("code") == 0:
            print(f"[成功] 形态告警已发送: {stock_code}")
            return True
        else:
            print(f"[失败] 发送形态告警失败: {result}")
            return False
    except Exception as e:
        print(f"[错误] 发送形态告警失败: {e}")
        return False


def process_records(token: str, app_token: str, table_id: str, 
                    chat_id: str, records: List[Dict]) -> Dict:
    """处理所有记录"""
    
    stats = {
        "total": len(records),
        "updated": 0,
        "breakthrough_high": 0,
        "breakthrough_close": 0,
        "pattern_alerts": 0,
        "errors": 0
    }
    
    for record in records:
        record_id = record.get("record_id")
        fields = record.get("fields", {})
        
        stock_code = fields.get("股票代码", "")
        stock_name = fields.get("股票名称", "")
        entry_high = float(fields.get("入池最高价", 0) or 0)
        entry_close = float(fields.get("入池收盘价", 0) or 0)
        
        print(f"\n处理: {stock_code} {stock_name}")
        
        # 获取最新价格
        price_data = get_stock_price(stock_code)
        if not price_data:
            print(f"  [跳过] 无法获取价格数据")
            stats["errors"] += 1
            continue
        
        current_close = price_data["close"]
        
        # 检查突破
        breakthrough_high = current_close > entry_high
        breakthrough_close = current_close > entry_close
        
        # 构建更新字段
        update_fields = {
            "最新收盘价": current_close
        }
        
        # 如果之前未突破，现在突破了
        if not fields.get("突破最高价") and breakthrough_high:
            update_fields["突破最高价"] = True
            stats["breakthrough_high"] += 1
            
            # 发送告警
            send_breakthrough_alert(chat_id, token, stock_code, stock_name,
                                   current_close, "high", entry_high)
        
        if not fields.get("突破收盘价") and breakthrough_close:
            update_fields["突破收盘价"] = True
            stats["breakthrough_close"] += 1
            
            # 如果还没发过最高价突破告警，发收盘价突破告警
            if not breakthrough_high:
                send_breakthrough_alert(chat_id, token, stock_code, stock_name,
                                       current_close, "close", entry_close)
        
        # 如果同时突破，发送强势突破告警
        if breakthrough_high and breakthrough_close:
            if not fields.get("突破告警"):
                update_fields["突破告警"] = True
                update_fields["告警时间"] = int(datetime.now().timestamp() * 1000)
                send_breakthrough_alert(chat_id, token, stock_code, stock_name,
                                       current_close, "both", 0)
        
        # 形态分析（只对新入池的股票进行分析）
        entry_date = fields.get("入池日期", "")
        if entry_date:
            # 检查是否是今天入池的
            # 入池日期可能是时间戳（毫秒）或日期字符串
            today = datetime.now().strftime("%Y-%m-%d")
            
            # 将入池日期转换为字符串格式进行比较
            if isinstance(entry_date, (int, float)):
                # 时间戳格式（毫秒）
                entry_date_str = datetime.fromtimestamp(entry_date / 1000).strftime('%Y-%m-%d')
            elif isinstance(entry_date, str):
                if entry_date.isdigit():
                    # 数字字符串，可能是时间戳
                    entry_date_str = datetime.fromtimestamp(int(entry_date) / 1000).strftime('%Y-%m-%d')
                else:
                    # 已经是日期字符串
                    entry_date_str = entry_date
            else:
                entry_date_str = str(entry_date)
            
            if entry_date_str == today and not fields.get("形态得分"):
                print(f"  [分析] 进行形态分析...")
                patterns = analyze_patterns(stock_code, entry_date_str)
                score = calculate_pattern_score(patterns)
                
                update_fields.update({
                    "底分型": patterns.get("bottom_pattern", False),
                    "阳包阴": patterns.get("yang_bao_yin", False),
                    "5日地量": patterns.get("low_volume_5", False),
                    "10日地量": patterns.get("low_volume_10", False),
                    "20日地量": patterns.get("low_volume_20", False),
                    "30日地量": patterns.get("low_volume_30", False),
                    "60日地量": patterns.get("low_volume_60", False),
                    "形态得分": score
                })
                
                # 如果形态得分>=3或同时有底分型+阳包阴，发送告警
                if score >= 3 or (patterns.get("bottom_pattern") and patterns.get("yang_bao_yin")):
                    stats["pattern_alerts"] += 1
                    send_pattern_alert(chat_id, token, stock_code, stock_name, score, patterns)
        
        # 更新记录
        if update_record(token, app_token, table_id, record_id, update_fields):
            stats["updated"] += 1
            print(f"  [成功] 记录已更新")
        else:
            stats["errors"] += 1
            print(f"  [失败] 记录更新失败")
    
    return stats


def main():
    parser = argparse.ArgumentParser(description='每日复盘脚本')
    parser.add_argument('--app-token', required=True, help='多维表格应用Token')
    parser.add_argument('--table-id', required=True, help='数据表ID')
    parser.add_argument('--chat', required=True, help='飞书群聊ID')
    
    args = parser.parse_args()
    
    # 获取环境变量
    app_id = os.environ.get('FEISHU_APP_ID')
    app_secret = os.environ.get('FEISHU_APP_SECRET')
    
    if not app_id or not app_secret:
        print("错误: 未设置 FEISHU_APP_ID 或 FEISHU_APP_SECRET 环境变量")
        sys.exit(1)
    
    print(f"{'='*60}")
    print("每日复盘任务开始")
    print(f"时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*60}\n")
    
    # 获取访问令牌
    print("[步骤1/3] 获取飞书访问令牌...")
    token = get_tenant_access_token(app_id, app_secret)
    if not token:
        sys.exit(1)
    
    # 获取所有记录
    print(f"\n[步骤2/3] 获取股票记录...")
    records = get_stock_records(token, args.app_token, args.table_id)
    
    if not records:
        print("[信息] 没有需要处理的记录")
        sys.exit(0)
    
    # 处理记录
    print(f"\n[步骤3/3] 处理股票记录...")
    stats = process_records(token, args.app_token, args.table_id, 
                           args.chat, records)
    
    # 输出结果
    print(f"\n{'='*60}")
    print("复盘任务完成")
    print(f"{'='*60}")
    print(f"总记录数: {stats['total']}")
    print(f"更新记录: {stats['updated']}")
    print(f"突破最高价: {stats['breakthrough_high']}")
    print(f"突破收盘价: {stats['breakthrough_close']}")
    print(f"形态告警: {stats['pattern_alerts']}")
    print(f"错误数: {stats['errors']}")
    print(f"{'='*60}")
    
    output = {
        "success": stats["errors"] == 0,
        "stats": stats,
        "completed_at": datetime.now().isoformat()
    }
    
    print(f"###NANOBOT_OUTPUT_START###{json.dumps(output)}###NANOBOT_OUTPUT_END###")
    
    sys.exit(0 if stats["errors"] == 0 else 1)


if __name__ == '__main__':
    main()
