#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
股票截图分析脚本 - 使用nanobot provider系统

功能：
1. 读取股票截图
2. 调用AI分析（支持多种provider）
3. 生成结构化分析报告

作者：nanobot AI
日期：2026-02-03
"""

import argparse
import base64
import os
import sys
from pathlib import Path


def analyze_with_litellm(image_path: str, stock_code: str, api_key: str = None) -> str:
    """
    使用LiteLLM分析截图
    
    Args:
        image_path: 截图文件路径
        stock_code: 股票代码
        api_key: API密钥（可选）
        
    Returns:
        str: AI分析结果
    """
    try:
        from litellm import completion
        
        # 读取图片并转为base64
        with open(image_path, "rb") as f:
            image_base64 = base64.b64encode(f.read()).decode()
        
        # 构建prompt
        prompt = f"""请分析这张股票截图，股票代码是{stock_code}。

请回答以下问题：
1. 日K线图上是否有"D"标识？有几个？
2. 三龙聚首指标有几盏灯亮了？分别是哪些？
3. 当前价格是多少？涨跌幅是多少？
4. 成交量和成交额是多少？

请以markdown格式输出分析报告。"""

        # 调用LiteLLM
        response = completion(
            model="gpt-4o",
            messages=[{
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{image_base64}"}}
                ]
            }]
        )
        
        return response.choices[0].message.content
        
    except Exception as e:
        return f"LiteLLM分析失败: {e}"


def analyze_with_kimi(image_path: str, stock_code: str, api_key: str = None) -> str:
    """
    使用Kimi API分析截图
    
    Args:
        image_path: 截图文件路径
        stock_code: 股票代码
        api_key: API密钥（可选，默认从环境变量读取）
        
    Returns:
        str: AI分析结果
    """
    import requests
    
    if not api_key:
        api_key = os.environ.get("KIMI_API_KEY")
    
    if not api_key:
        return "错误: 未找到Kimi API密钥，请设置KIMI_API_KEY环境变量"
    
    try:
        # 读取图片并转为base64
        with open(image_path, "rb") as f:
            image_base64 = base64.b64encode(f.read()).decode()
        
        # 构建prompt
        prompt = f"""请分析这张股票截图，股票代码是{stock_code}。

请回答以下问题：
1. 日K线图上是否有"D"标识？有几个？
2. 三龙聚首指标有几盏灯亮了？分别是哪些？
3. 当前价格是多少？涨跌幅是多少？
4. 成交量和成交额是多少？

请以markdown格式输出分析报告。"""

        # 调用Kimi API
        response = requests.post(
            "https://api.moonshot.cn/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}"},
            json={
                "model": "kimi-latest",
                "messages": [{
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{image_base64}"}}
                    ]
                }]
            }
        )
        
        if response.status_code == 200:
            return response.json()["choices"][0]["message"]["content"]
        else:
            return f"Kimi API调用失败: {response.status_code} - {response.text}"
        
    except Exception as e:
        return f"Kimi分析失败: {e}"


def generate_fallback_analysis(stock_code: str, image_path: str) -> str:
    """
    生成备用分析结果（当AI分析失败时）
    
    Args:
        stock_code: 股票代码
        image_path: 截图路径
        
    Returns:
        str: 备用分析结果
    """
    from datetime import datetime
    
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    return f"""# 股票分析报告 - {stock_code}

## 基本信息
- **股票代码**: {stock_code}
- **分析时间**: {timestamp}
- **截图文件**: {image_path}
- **数据来源**: 天龙博弈软件

## 分析说明
⚠️ AI分析服务暂时不可用，请查看截图文件获取详细数据。

## 需要关注的信息
请手动查看截图中的以下内容：
1. 日K线图上是否有"D"标识（买入信号）
2. 三龙聚首指标亮灯情况
3. 当前价格和涨跌幅
4. 成交量和成交额数据

## 文件位置
截图保存在: `{image_path}`

---
*报告由nanobot TLBY Automation生成*
"""


def analyze_with_volcengine(image_path: str, stock_code: str, api_key: str = None) -> str:
    """
    使用火山引擎API分析截图
    
    Args:
        image_path: 截图文件路径
        stock_code: 股票代码
        api_key: API密钥（可选，默认从环境变量读取）
        
    Returns:
        str: AI分析结果
    """
    import sys
    sys.path.insert(0, str(Path(__file__).parent))
    from analyze_with_volcengine import analyze_sanlong_jushou, generate_analysis_report
    
    if not api_key:
        api_key = os.environ.get("VOLCENGINE_API_KEY")
    
    if not api_key:
        return "错误: 未找到火山引擎API密钥，请设置VOLCENGINE_API_KEY环境变量"
    
    # 获取API URL和模型
    api_url = os.environ.get("VOLCENGINE_API_URL", "https://ark.cn-beijing.volces.com/api/v3")
    # 移除/coding后缀（如果存在）
    if "/coding" in api_url:
        api_url = api_url.replace("/coding", "")
    
    model = os.environ.get("VOLCENGINE_MODEL", "doubao-seed-1-6-251015")
    
    try:
        # 调用火山引擎分析
        result = analyze_sanlong_jushou(image_path, api_key, api_url, model)
        
        # 生成报告
        report = generate_analysis_report(stock_code, image_path, result)
        
        return report
        
    except Exception as e:
        return f"火山引擎分析失败: {e}"


def main():
    """主函数"""
    parser = argparse.ArgumentParser(
        description='股票截图分析工具',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  python analyze_stock.py --image screenshot.png --code 002735
  python analyze_stock.py --image screenshot.png --code 002735 --provider kimi
  python analyze_stock.py --image screenshot.png --code 002735 --provider litellm
  python analyze_stock.py --image screenshot.png --code 002735 --provider volcengine
        """
    )
    
    parser.add_argument(
        '--image',
        type=str,
        required=True,
        help='截图文件路径（必填）'
    )
    
    parser.add_argument(
        '--code',
        type=str,
        required=True,
        help='股票代码（必填）'
    )
    
    parser.add_argument(
        '--provider',
        type=str,
        choices=['kimi', 'litellm', 'volcengine', 'none'],
        default='none',
        help='AI分析provider（默认: none，生成模板报告）'
    )
    
    parser.add_argument(
        '--api-key',
        type=str,
        default=None,
        help='API密钥（可选，默认从环境变量读取）'
    )
    
    parser.add_argument(
        '--output',
        type=str,
        default=None,
        help='输出文件路径（可选，默认输出到控制台）'
    )
    
    args = parser.parse_args()
    
    # 检查截图文件是否存在
    if not os.path.exists(args.image):
        print(f"错误: 截图文件不存在: {args.image}")
        sys.exit(1)
    
    print(f"正在分析股票 {args.code} 的截图...")
    print(f"截图文件: {args.image}")
    print(f"分析provider: {args.provider}")
    
    # 根据provider选择分析方式
    if args.provider == 'kimi':
        analysis = analyze_with_kimi(args.image, args.code, args.api_key)
    elif args.provider == 'litellm':
        analysis = analyze_with_litellm(args.image, args.code, args.api_key)
    elif args.provider == 'volcengine':
        analysis = analyze_with_volcengine(args.image, args.code, args.api_key)
    else:
        analysis = generate_fallback_analysis(args.code, args.image)
    
    # 输出结果
    if args.output:
        # 保存到文件
        output_path = Path(args.output)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(analysis)
        
        print(f"分析报告已保存到: {args.output}")
    else:
        # 输出到控制台
        print("\n" + "=" * 50)
        print("分析报告")
        print("=" * 50)
        print(analysis)


if __name__ == "__main__":
    main()
