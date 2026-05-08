#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
火山引擎图片理解分析模块

功能：
1. 调用火山引擎API进行图片理解
2. 识别日K线图中"三龙聚首4盏灯"情况
3. 返回结构化分析结果

作者：nanobot AI
日期：2026-02-16
"""

import base64
import json
import os
import re
from typing import Dict, Any, Optional

import requests


def encode_image_to_base64(image_path: str) -> str:
    """
    将图片文件转为base64编码
    
    Args:
        image_path: 图片文件路径
        
    Returns:
        str: base64编码字符串
    """
    with open(image_path, "rb") as f:
        return base64.b64encode(f.read()).decode('utf-8')


def analyze_sanlong_jushou(image_path: str, api_key: str, api_url: str, model: str = "doubao-seed-1-6-251015", intraday_path: str = None) -> Dict[str, Any]:
    """
    分析三龙聚首4盏灯情况
    
    Args:
        image_path: 日K线图截图路径（主分析图片）
        api_key: 火山引擎API密钥
        api_url: API端点URL
        model: 模型名称
        intraday_path: 分时图截图路径（可选，用于辅助判断）
        
    Returns:
        Dict: 包含分析结果的字典
    """
    try:
        # 读取图片并转为base64
        base64_image = encode_image_to_base64(image_path)
        
        # 构建prompt
        prompt = """请仔细分析这张股票截图。

【重要任务】
1. 首先判断这是日K线图还是分时图
2. 如果是日K线图，识别DK点标识和三龙聚首指标
3. 如果是分时图，说明这是分时图，不进行分析

【DK点标识识别】
- 在K线图上查找"D"或"K"字母标识
- "D"=买入点（红色/黄色），"K"=卖出点（绿色/蓝色）
- 确认最新K线是否有DK标识

【三龙聚首指标识别】（屏幕右侧或下方的4个灯）
- 第1盏：趋势警戒
- 第2盏：量能警戒
- 第3盏：中期警戒
- 第4盏：短期警戒
- 状态：亮=红色/绿色，灭=灰色/黑色

【必须严格按照以下JSON格式返回，不要添加任何其他内容】

{
    "chart_type": "日K线图或分时图",
    "dk_analysis": {
        "has_dk_marker": true或false,
        "latest_marker": "D或K或空字符串",
        "marker_color": "红色/绿色/黄色/蓝色/空字符串",
        "description": "描述"
    },
    "sanlong_analysis": {
        "total_lights": 4,
        "lit_count": 亮灯数量,
        "unlit_count": 灭灯数量,
        "lights": [
            {"position": 1, "name": "趋势警戒", "status": "亮或灭", "color": "颜色"},
            {"position": 2, "name": "量能警戒", "status": "亮或灭", "color": "颜色"},
            {"position": 3, "name": "中期警戒", "status": "亮或灭", "color": "颜色"},
            {"position": 4, "name": "短期警戒", "status": "亮或灭", "color": "颜色"}
        ],
        "lit_lights": ["亮灯的名称列表"],
        "summary": "总结"
    },
    "signal": "强烈/积极/中性/谨慎",
    "recommendation": "建议"
}

【分时图返回格式】
{
    "chart_type": "分时图",
    "dk_analysis": {"has_dk_marker": false, "description": "分时图无DK点"},
    "sanlong_analysis": {"total_lights": 0, "lights": [], "summary": "分时图无三龙聚首指标"},
    "signal": "中性",
    "recommendation": "请查看日K线图获取完整分析"
}"""

        # 构建消息内容
        content = []
        
        # 如果提供了分时图，先传入分时图
        if intraday_path and os.path.exists(intraday_path):
            base64_intraday = encode_image_to_base64(intraday_path)
            content.append({
                "type": "image_url",
                "image_url": {
                    "url": f"data:image/png;base64,{base64_intraday}",
                    "detail": "high"
                }
            })
            content.append({
                "type": "text",
                "text": "【第一张图】"
            })
        
        # 传入日K线图
        content.append({
            "type": "image_url",
            "image_url": {
                "url": f"data:image/png;base64,{base64_image}",
                "detail": "high"
            }
        })
        content.append({
            "type": "text",
            "text": "【第二张图】"
        })
        
        # 修改prompt支持双图识别
        if intraday_path and os.path.exists(intraday_path):
            dual_prompt = prompt.replace(
                "请仔细分析这张股票截图。",
                "我提供了两张股票截图。请识别哪张是日K线图（显示多日的蜡烛线），哪张是分时图（显示当日价格曲线）。\n\n请重点分析日K线图，识别DK点和三龙聚首指标。分时图仅供参考。"
            )
            content.append({
                "type": "text",
                "text": dual_prompt
            })
        else:
            content.append({
                "type": "text",
                "text": prompt
            })

        # 调用火山引擎API
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        
        data = {
            "model": model,
            "messages": [
                {
                    "role": "user",
                    "content": content
                }
            ],
            "max_tokens": 1500
        }
        
        response = requests.post(
            f"{api_url}/chat/completions",
            headers=headers,
            json=data,
            timeout=60
        )
        
        if response.status_code != 200:
            return {
                "success": False,
                "error": f"API调用失败: {response.status_code} - {response.text}"
            }
        
        result = response.json()
        content = result["choices"][0]["message"]["content"]
        
        # 尝试从返回内容中提取JSON
        analysis_result = extract_json_from_content(content)
        
        return {
            "success": True,
            "raw_content": content,
            "analysis": analysis_result
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": f"分析失败: {str(e)}"
        }


def extract_json_from_content(content: str) -> Dict[str, Any]:
    """
    从AI返回的内容中提取JSON
    
    Args:
        content: AI返回的文本内容
        
    Returns:
        Dict: 解析后的JSON字典
    """
    try:
        # 尝试直接解析整个内容
        return json.loads(content)
    except json.JSONDecodeError:
        pass
    
    # 尝试提取JSON代码块
    json_pattern = r'```(?:json)?\s*([\s\S]*?)```'
    matches = re.findall(json_pattern, content)
    
    for match in matches:
        try:
            return json.loads(match.strip())
        except json.JSONDecodeError:
            continue
    
    # 尝试提取花括号包裹的内容
    brace_pattern = r'\{[\s\S]*\}'
    match = re.search(brace_pattern, content)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass
    
    # 如果都无法解析，返回原始内容
    return {
        "parse_error": True,
        "raw_content": content
    }


def generate_analysis_report(stock_code: str, image_path: str, analysis_result: Dict[str, Any]) -> str:
    """
    生成三龙聚首分析报告
    
    Args:
        stock_code: 股票代码
        image_path: 截图路径
        analysis_result: 分析结果字典
        
    Returns:
        str: Markdown格式的分析报告
    """
    from datetime import datetime
    
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    if not analysis_result.get("success", False):
        return f"""# 三龙聚首分析报告 - {stock_code}

## 基本信息
- **股票代码**: {stock_code}
- **分析时间**: {timestamp}
- **截图文件**: {image_path}

## 分析状态
❌ **分析失败**

**错误信息**: {analysis_result.get('error', '未知错误')}

## 建议
请手动查看截图中的三龙聚首指标情况。

---
*报告由nanobot TLBY Automation生成*
"""
    
    analysis = analysis_result.get("analysis", {})
    
    # 检查是否有解析错误
    if analysis.get("parse_error"):
        return f"""# 三龙聚首分析报告 - {stock_code}

## 基本信息
- **股票代码**: {stock_code}
- **分析时间**: {timestamp}
- **截图文件**: {image_path}

## AI原始回复
```
{analysis.get('raw_content', '无内容')}
```

---
*报告由nanobot TLBY Automation生成*
"""
    
    # 检查是否有错误
    if "error" in analysis:
        return f"""# 三龙聚首分析报告 - {stock_code}

## 基本信息
- **股票代码**: {stock_code}
- **分析时间**: {timestamp}
- **截图文件**: {image_path}

## 分析状态
⚠️ **{analysis.get('error')}**

---
*报告由nanobot TLBY Automation生成*
"""
    
    # 正常结果
    total_lights = analysis.get("total_lights", 4)
    lit_count = analysis.get("lit_count", 0)
    unlit_count = analysis.get("unlit_count", 0)
    lights = analysis.get("lights", [])
    summary = analysis.get("summary", "")
    signal = analysis.get("signal", "未知")
    
    # 生成灯状态表格
    lights_table = "| 位置 | 状态 | 颜色 |\n|------|------|------|\n"
    for light in lights:
        pos = light.get("position", "-")
        status = light.get("status", "-")
        color = light.get("color", "-")
        status_emoji = "🔴" if status == "亮" else "⚫"
        lights_table += f"| 第{pos}盏 | {status_emoji} {status} | {color} |\n"
    
    # 信号表情
    signal_emoji = {
        "强烈": "🟢🟢🟢🟢",
        "积极": "🟢🟢🟢",
        "中性": "🟡🟡",
        "谨慎": "🔴"
    }.get(signal, "❓")
    
    return f"""# 三龙聚首分析报告 - {stock_code}

## 基本信息
- **股票代码**: {stock_code}
- **分析时间**: {timestamp}
- **截图文件**: {image_path}

## 三龙聚首指标分析

### 亮灯统计
- **总灯数**: {total_lights}盏
- **亮灯数**: {lit_count}盏 ✅
- **灭灯数**: {unlit_count}盏

### 详细状态
{lights_table}
### 分析总结
**{summary}**

### 信号判断
{signal_emoji} **{signal}信号**

---
*报告由nanobot TLBY Automation生成*
*AI分析结果仅供参考，投资需谨慎*
"""


def main():
    """测试函数"""
    import argparse
    
    parser = argparse.ArgumentParser(description='火山引擎图片理解分析工具')
    parser.add_argument('--image', required=True, help='图片文件路径')
    parser.add_argument('--code', required=True, help='股票代码')
    parser.add_argument('--api-key', default=os.getenv('VOLCENGINE_API_KEY'), help='API密钥')
    parser.add_argument('--api-url', default='https://ark.cn-beijing.volces.com/api/v3', help='API端点')
    parser.add_argument('--model', default='doubao-seed-1-6-251015', help='模型名称')
    parser.add_argument('--output', help='输出文件路径')
    
    args = parser.parse_args()
    
    if not args.api_key:
        print("错误: 未设置API密钥，请通过--api-key参数或VOLCENGINE_API_KEY环境变量设置")
        return
    
    print(f"正在分析股票 {args.code} 的截图...")
    print(f"图片路径: {args.image}")
    
    # 执行分析
    result = analyze_sanlong_jushou(args.image, args.api_key, args.api_url, args.model)
    
    # 生成报告
    report = generate_analysis_report(args.code, args.image, result)
    
    # 输出结果
    if args.output:
        with open(args.output, 'w', encoding='utf-8') as f:
            f.write(report)
        print(f"报告已保存到: {args.output}")
    else:
        print("\n" + "="*50)
        print(report)
        print("="*50)
    
    # 输出JSON结果
    json_output = json.dumps(result, ensure_ascii=False, indent=2)
    print(f"###NANOBOT_OUTPUT_START###{json_output}###NANOBOT_OUTPUT_END###")


if __name__ == "__main__":
    main()
