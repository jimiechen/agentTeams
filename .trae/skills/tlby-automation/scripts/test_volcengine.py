#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
火山引擎图片理解功能测试脚本

用于测试三龙聚首指标识别功能

作者：nanobot AI
日期：2026-02-16
"""

import argparse
import json
import os
import sys
from pathlib import Path


def test_volcengine_api(image_path: str, stock_code: str = "TEST"):
    """测试火山引擎API调用"""
    print("=" * 60)
    print("火山引擎图片理解功能测试")
    print("=" * 60)
    
    # 导入模块
    sys.path.insert(0, str(Path(__file__).parent))
    from analyze_with_volcengine import analyze_sanlong_jushou, generate_analysis_report
    
    # 获取API配置
    api_key = os.getenv('VOLCENGINE_API_KEY')
    api_url = os.getenv('VOLCENGINE_API_URL', 'https://ark.cn-beijing.volces.com/api/v3')
    
    # 移除/coding后缀（如果存在）
    if "/coding" in api_url:
        api_url = api_url.replace("/coding", "")
    
    model = os.getenv('VOLCENGINE_MODEL', 'doubao-seed-1-6-251015')
    
    print(f"\n📋 配置信息:")
    print(f"   API端点: {api_url}")
    print(f"   模型: {model}")
    print(f"   API密钥: {'已设置' if api_key else '未设置'}")
    print(f"   图片路径: {image_path}")
    print(f"   股票代码: {stock_code}")
    
    if not api_key:
        print("\n❌ 错误: 未设置火山引擎API密钥")
        print("   请设置环境变量 VOLCENGINE_API_KEY")
        return False
    
    if not os.path.exists(image_path):
        print(f"\n❌ 错误: 图片文件不存在: {image_path}")
        return False
    
    print("\n🚀 开始调用火山引擎API...")
    print("-" * 60)
    
    try:
        # 调用分析
        result = analyze_sanlong_jushou(image_path, api_key, api_url, model)
        
        print("\n📊 API调用结果:")
        print(f"   成功: {result.get('success', False)}")
        
        if result.get('success'):
            analysis = result.get('analysis', {})
            
            if 'error' in analysis:
                print(f"   分析错误: {analysis['error']}")
            elif analysis.get('parse_error'):
                print("   ⚠️ 无法解析JSON结果")
                print(f"   原始内容: {analysis.get('raw_content', '无')[:200]}...")
            else:
                print(f"\n   三龙聚首分析结果:")
                print(f"   - 总灯数: {analysis.get('total_lights', 'N/A')}")
                print(f"   - 亮灯数: {analysis.get('lit_count', 'N/A')}")
                print(f"   - 灭灯数: {analysis.get('unlit_count', 'N/A')}")
                print(f"   - 总结: {analysis.get('summary', 'N/A')}")
                print(f"   - 信号: {analysis.get('signal', 'N/A')}")
                
                lights = analysis.get('lights', [])
                if lights:
                    print(f"\n   详细灯状态:")
                    for light in lights:
                        pos = light.get('position', '-')
                        status = light.get('status', '-')
                        color = light.get('color', '-')
                        print(f"     第{pos}盏: {status} ({color})")
        else:
            print(f"   错误信息: {result.get('error', '未知错误')}")
        
        print("\n" + "-" * 60)
        print("📝 生成分析报告...")
        
        # 生成报告
        report = generate_analysis_report(stock_code, image_path, result)
        
        # 保存报告
        output_path = f"test_sanlong_report_{stock_code}.md"
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(report)
        
        print(f"✅ 报告已保存到: {output_path}")
        
        # 显示报告内容
        print("\n" + "=" * 60)
        print("📄 报告预览:")
        print("=" * 60)
        print(report)
        print("=" * 60)
        
        return result.get('success', False)
        
    except Exception as e:
        print(f"\n❌ 测试失败: {e}")
        import traceback
        print(f"\n详细错误:\n{traceback.format_exc()}")
        return False


def main():
    """主函数"""
    parser = argparse.ArgumentParser(
        description='火山引擎图片理解功能测试',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  python test_volcengine.py --image ./output/daily_002735_20260215_003545.png
  python test_volcengine.py --image ./test.png --code 000001
        """
    )
    
    parser.add_argument(
        '--image',
        type=str,
        required=True,
        help='测试图片路径（必填，推荐使用日K线图截图）'
    )
    
    parser.add_argument(
        '--code',
        type=str,
        default='TEST',
        help='测试股票代码（默认: TEST）'
    )
    
    args = parser.parse_args()
    
    # 运行测试
    success = test_volcengine_api(args.image, args.code)
    
    # 输出结果
    print("\n" + "=" * 60)
    if success:
        print("✅ 测试完成！")
    else:
        print("❌ 测试失败，请检查配置和日志")
    print("=" * 60)
    
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
