#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
天龙博弈股票软件自动化脚本 - nanobot适配版

功能：
1. 启动或激活天龙博弈软件
2. 输入股票代码并回车
3. 切换到日K线图
4. 截图保存
5. 生成分析报告

作者：nanobot AI
日期：2026-02-03
"""

import argparse
import os
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

import pyautogui
from PIL import Image


# 默认配置
DEFAULT_APP_PATH = r"C:\Program Files (x86)\天龙博弈\bin\tlby.exe"
DEFAULT_OUTPUT_DIR = "./output"
DEFAULT_WAIT_TIME = 3


def log(message: str) -> None:
    """打印带时间戳的日志信息"""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{timestamp}] {message}")


def launch_application(app_path: str) -> bool:
    """
    启动天龙博弈应用程序
    
    Args:
        app_path: 应用程序路径
        
    Returns:
        bool: 是否成功启动
    """
    log(f"正在启动应用程序: {app_path}")
    
    if not os.path.exists(app_path):
        log(f"错误: 应用程序不存在: {app_path}")
        return False
    
    try:
        subprocess.Popen(app_path, shell=True)
        log("应用程序启动成功，等待加载...")
        time.sleep(5)  # 等待软件加载
        return True
    except Exception as e:
        log(f"启动应用程序失败: {e}")
        return False


def activate_tlby_window() -> bool:
    """
    激活天龙博弈窗口（软件已启动）
    
    Returns:
        bool: 是否成功激活
    """
    log("正在激活天龙博弈窗口...")
    
    try:
        import pygetwindow as gw
        
        # 查找天龙博弈窗口
        window = None
        for title in ["天龙博弈", "TLBY", "tlby", "约牛"]:
            try:
                window = gw.getWindowsWithTitle(title)
                if window:
                    window = window[0]
                    log(f"找到窗口: {title}")
                    break
            except:
                continue
        
        if window:
            # 激活窗口并置于最前
            window.activate()
            window.maximize()  # 最大化窗口确保可交互
            time.sleep(1)
            log("窗口激活成功")
            return True
        else:
            log("警告: 未找到天龙博弈窗口，尝试使用当前活动窗口")
            return True
            
    except Exception as e:
        log(f"激活窗口失败: {e}，尝试使用当前活动窗口")
        return True


def find_and_click_input_box() -> bool:
    """
    查找并点击股票代码输入框
    
    Returns:
        bool: 是否成功找到并点击
    """
    log("正在定位股票代码输入框...")
    
    # 尝试在屏幕顶部区域查找输入框（通常位于工具栏）
    screen_width, screen_height = pyautogui.size()
    
    try:
        log(f"屏幕分辨率: {screen_width}x{screen_height}")
        
        # 点击屏幕顶部中央偏左位置（常见的搜索/输入区域）
        input_x = int(screen_width * 0.3)
        input_y = int(screen_height * 0.08)
        
        log(f"尝试点击输入框位置: ({input_x}, {input_y})")
        
        # 先双击确保选中，然后再点击
        pyautogui.doubleClick(input_x, input_y)
        time.sleep(0.3)
        pyautogui.click(input_x, input_y)
        time.sleep(0.5)
        
        # 按F6键尝试聚焦到地址/搜索栏
        pyautogui.press('f6')
        time.sleep(0.3)
        
        return True
    except Exception as e:
        log(f"定位输入框失败: {e}")
        return False


def input_stock_code(stock_code: str) -> bool:
    """
    输入股票代码并回车
    
    Args:
        stock_code: 股票代码
        
    Returns:
        bool: 是否成功输入
    """
    log(f"正在输入股票代码: {stock_code}")
    
    try:
        # 确保输入框聚焦
        pyautogui.hotkey('ctrl', 'a')
        time.sleep(0.2)
        
        # 逐个字符输入，确保每个字符都被接收
        for char in stock_code:
            pyautogui.press(char)
            time.sleep(0.05)
        
        time.sleep(0.3)
        
        # 按回车确认
        pyautogui.press('return')
        log("股票代码输入完成")
        
        return True
    except Exception as e:
        log(f"输入股票代码失败: {e}")
        return False


def switch_to_daily_kline() -> bool:
    """
    切换到日K线图
    
    Returns:
        bool: 是否成功切换
    """
    log("正在切换到日K线...")
    
    try:
        # 等待股票数据加载
        time.sleep(2)
        
        # 尝试快捷键 F5（很多股票软件用F5切换周期）
        pyautogui.press('f5')
        time.sleep(0.5)
        
        # 尝试按数字键 5（日K线）
        pyautogui.press('5')
        time.sleep(0.5)
        
        # 尝试点击常见的日K按钮位置
        screen_width, screen_height = pyautogui.size()
        daily_k_x = int(screen_width * 0.75)
        daily_k_y = int(screen_height * 0.12)
        
        log(f"尝试点击日K按钮位置: ({daily_k_x}, {daily_k_y})")
        pyautogui.click(daily_k_x, daily_k_y)
        time.sleep(1)
        
        log("日K线切换完成")
        return True
        
    except Exception as e:
        log(f"切换日K线失败: {e}")
        return False


def take_screenshot(output_path: str) -> bool:
    """
    截取屏幕截图
    
    Args:
        output_path: 截图保存路径
        
    Returns:
        bool: 是否成功截图
    """
    log(f"正在截图并保存到: {output_path}")
    
    try:
        # 等待数据加载
        time.sleep(2)
        
        # 截取屏幕
        screenshot = pyautogui.screenshot()
        
        # 保存截图
        screenshot.save(output_path)
        log(f"截图保存成功: {output_path}")
        
        return True
    except Exception as e:
        log(f"截图失败: {e}")
        return False


def generate_analysis_template(stock_code: str, intraday_path: str, daily_path: str, sanlong_analysis: str = "") -> str:
    """
    生成分析报告模板
    
    Args:
        stock_code: 股票代码
        intraday_path: 分时图截图路径
        daily_path: 日K线图截图路径
        sanlong_analysis: 三龙聚首AI分析结果
        
    Returns:
        str: 分析报告markdown内容
    """
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    # 三龙聚首分析部分
    sanlong_section = f"""

## AI分析 - 三龙聚首指标
{sanlong_analysis}
""" if sanlong_analysis else """

## 三龙聚首指标
- **分析状态**: 未进行AI分析
- **说明**: 请手动查看日K线图中的三龙聚首指标亮灯情况
"""
    
    return f"""# 股票分析报告 - {stock_code}

## 基本信息
- **股票代码**: {stock_code}
- **分析时间**: {timestamp}
- **数据来源**: 天龙博弈软件

## 截图文件

### 1. 分时图（切换日K线前）
- **文件路径**: `{intraday_path}`
- **分析要点**:
  - 当日价格走势曲线
  - 成交量分布情况
  - 均价线位置
  - 实时买卖盘情况

### 2. 日K线图（切换日K线后）
- **文件路径**: `{daily_path}`
- **分析要点**:
  - 日K线图是否有"D"标识
  - 三龙聚首指标亮灯数
  - 近期价格趋势
  - 成交量变化
  - 技术指标信号
{sanlong_section}

## 综合分析
请结合分时图和日K线图进行综合分析：
- 短期走势（分时图）与中期趋势（日K线）是否一致
- 关键支撑和阻力位
- 买卖时机判断

---
*报告由nanobot TLBY Automation生成*
*生成时间: {timestamp}*
"""


def save_analysis_report(analysis: str, output_path: str) -> bool:
    """
    保存分析报告到markdown文件
    
    Args:
        analysis: 分析内容
        output_path: 输出文件路径
        
    Returns:
        bool: 是否成功保存
    """
    log(f"正在保存分析报告: {output_path}")
    
    try:
        # 确保目录存在
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        
        # 写入文件
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(analysis)
        
        log(f"分析报告保存成功: {output_path}")
        return True
    except Exception as e:
        log(f"保存分析报告失败: {e}")
        return False


def main():
    """主函数"""
    parser = argparse.ArgumentParser(
        description='天龙博弈股票软件自动化工具 - nanobot版',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  python tlby_auto.py --code 002735
  python tlby_auto.py --code 002735 --output-dir ./reports
  python tlby_auto.py --code 002735 --no-launch
        """
    )
    
    parser.add_argument(
        '--code',
        type=str,
        required=True,
        help='股票代码（必填）'
    )
    
    parser.add_argument(
        '--output-dir',
        type=str,
        default=DEFAULT_OUTPUT_DIR,
        help=f'输出目录（默认: {DEFAULT_OUTPUT_DIR}）'
    )
    
    parser.add_argument(
        '--no-launch',
        action='store_true',
        help='跳过启动软件（软件已在运行）'
    )
    
    parser.add_argument(
        '--wait-time',
        type=int,
        default=DEFAULT_WAIT_TIME,
        help=f'等待数据加载时间，秒（默认: {DEFAULT_WAIT_TIME}）'
    )
    
    parser.add_argument(
        '--app-path',
        type=str,
        default=DEFAULT_APP_PATH,
        help=f'天龙博弈程序路径（默认: {DEFAULT_APP_PATH}）'
    )
    
    parser.add_argument(
        '--analyze-sanlong',
        action='store_true',
        help='使用火山引擎AI分析三龙聚首指标'
    )
    
    parser.add_argument(
        '--api-key',
        type=str,
        default=os.getenv('VOLCENGINE_API_KEY'),
        help='火山引擎API密钥（默认从环境变量VOLCENGINE_API_KEY读取）'
    )
    
    args = parser.parse_args()
    
    # 打印欢迎信息
    log("=" * 50)
    log("天龙博弈自动化工具启动 - nanobot版")
    log("=" * 50)
    log(f"股票代码: {args.code}")
    log(f"输出目录: {args.output_dir}")
    log(f"等待时间: {args.wait_time}秒")
    log(f"AI分析三龙聚首: {'是' if args.analyze_sanlong else '否'}")
    
    # 创建输出目录
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    # 生成文件名
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    # 内部使用绝对路径进行文件操作
    intraday_path_abs = str(output_dir / f"intraday_{args.code}_{timestamp}.png")
    daily_path_abs = str(output_dir / f"daily_{args.code}_{timestamp}.png")
    analysis_path_abs = str(output_dir / f"analysis_{args.code}_{timestamp}.md")
    # 输出给工作流执行器的相对路径（使用 ./ 开头）
    output_dir_str = args.output_dir if args.output_dir.startswith('./') else f'./{args.output_dir}'
    intraday_path = f"{output_dir_str}/intraday_{args.code}_{timestamp}.png"
    daily_path = f"{output_dir_str}/daily_{args.code}_{timestamp}.png"
    analysis_path = f"{output_dir_str}/analysis_{args.code}_{timestamp}.md"
    
    # 设置pyautogui安全模式
    pyautogui.FAILSAFE = True
    pyautogui.PAUSE = 0.5
    
    success = True
    
    # 1. 启动或激活应用程序
    if not args.no_launch:
        if not launch_application(args.app_path):
            log("启动应用程序失败，退出")
            sys.exit(1)
    else:
        log("软件已在运行，激活窗口...")
        activate_tlby_window()
        time.sleep(1)
    
    # 2. 查找并点击输入框
    if not find_and_click_input_box():
        log("警告: 可能未找到输入框，继续尝试输入")
    
    # 3. 输入股票代码
    if not input_stock_code(args.code):
        log("输入股票代码失败，退出")
        sys.exit(1)
    
    # 4. 等待数据加载
    log(f"等待数据加载 {args.wait_time} 秒...")
    time.sleep(args.wait_time)
    
    # 5. 第一次截图 - 分时图（切换日K线前）
    log("=" * 50)
    log("步骤1: 截取分时图（切换日K线前）")
    log("=" * 50)
    if not take_screenshot(intraday_path_abs):
        log("分时图截图失败，退出")
        sys.exit(1)

    # 6. 切换到日K线
    switch_to_daily_kline()

    # 7. 第二次截图 - 日K线图（切换日K线后）
    log("=" * 50)
    log("步骤2: 截取日K线图（切换日K线后）")
    log("=" * 50)
    if not take_screenshot(daily_path_abs):
        log("日K线图截图失败，退出")
        sys.exit(1)

    # 8. 【新增】使用火山引擎AI分析三龙聚首指标
    sanlong_analysis = ""
    sanlong_analysis_path_abs = str(output_dir / f"sanlong_analysis_{args.code}_{timestamp}.md")
    sanlong_analysis_path = f"{output_dir_str}/sanlong_analysis_{args.code}_{timestamp}.md"
    
    if args.analyze_sanlong:
        log("=" * 50)
        log("步骤3: AI分析三龙聚首指标")
        log("=" * 50)
        
        try:
            # 导入火山引擎分析模块
            sys.path.insert(0, str(Path(__file__).parent))
            from analyze_with_volcengine import analyze_sanlong_jushou, generate_analysis_report
            
            # 获取API配置
            api_key = args.api_key or os.getenv('VOLCENGINE_API_KEY')
            api_url = os.getenv('VOLCENGINE_API_URL', 'https://ark.cn-beijing.volces.com/api/v3')
            # 移除/coding后缀（如果存在）
            if "/coding" in api_url:
                api_url = api_url.replace("/coding", "")
            model = os.getenv('VOLCENGINE_MODEL', 'doubao-seed-1-6-251015')
            
            if api_key:
                log(f"正在调用火山引擎API分析三龙聚首...")
                log(f"API端点: {api_url}")
                log(f"模型: {model}")
                
                # 调用AI分析（传入两张图，让AI判断哪张是日K线）
                log(f"正在分析两张图片，识别日K线图...")
                result = analyze_sanlong_jushou(daily_path_abs, api_key, api_url, model, intraday_path_abs)
                
                # 记录AI识别的图表类型
                analysis_data = result.get('analysis', {})
                if 'chart_type' in analysis_data:
                    log(f"   AI识别图表类型: {analysis_data['chart_type']}")
                
                # 生成分析报告
                sanlong_analysis = generate_analysis_report(args.code, daily_path, result)
                
                # 保存三龙聚首分析报告
                if save_analysis_report(sanlong_analysis, sanlong_analysis_path_abs):
                    log(f"三龙聚首分析报告已保存: {sanlong_analysis_path}")
                else:
                    log("警告: 三龙聚首分析报告保存失败")
                
                if result.get('success'):
                    log("✅ 三龙聚首AI分析完成")
                    analysis_data = result.get('analysis', {})
                    if 'lit_count' in analysis_data:
                        log(f"   亮灯数: {analysis_data['lit_count']}/{analysis_data.get('total_lights', 4)}")
                    if 'signal' in analysis_data:
                        log(f"   信号: {analysis_data['signal']}")
                else:
                    log(f"⚠️ 三龙聚首分析失败: {result.get('error', '未知错误')}")
            else:
                log("⚠️ 未设置火山引擎API密钥，跳过AI分析")
                log("   请设置环境变量 VOLCENGINE_API_KEY 或使用 --api-key 参数")
                
        except Exception as e:
            log(f"⚠️ 三龙聚首分析异常: {e}")
            import traceback
            log(f"   详细错误: {traceback.format_exc()}")
    
    # 9. 生成综合分析报告
    analysis = generate_analysis_template(args.code, intraday_path, daily_path, sanlong_analysis)

    # 10. 保存综合分析报告
    if not save_analysis_report(analysis, analysis_path_abs):
        log("保存综合分析报告失败")
        success = False
    
    # 打印完成信息
    log("=" * 50)
    log("任务完成!")
    log("=" * 50)
    log(f"分时图截图: {intraday_path}")
    log(f"日K线图截图: {daily_path}")
    log(f"综合分析报告: {analysis_path}")
    if args.analyze_sanlong and sanlong_analysis:
        log(f"三龙聚首分析报告: {sanlong_analysis_path}")
    
    # 输出 JSON 格式的结果（供工作流执行器解析）
    # 使用特殊标记包裹 JSON，方便工作流执行器提取
    import json
    result = {
        "success": success,
        "intraday_image": intraday_path,
        "daily_image": daily_path,
        "analysis_md": analysis_path,
        "stock_code": args.code,
        "timestamp": timestamp
    }
    if args.analyze_sanlong and sanlong_analysis:
        result["sanlong_analysis_md"] = sanlong_analysis_path
    json_output = json.dumps(result, ensure_ascii=False)
    print(f"###NANOBOT_OUTPUT_START###{json_output}###NANOBOT_OUTPUT_END###")
    
    if success:
        log("所有任务执行成功!")
        sys.exit(0)
    else:
        log("部分任务执行失败")
        sys.exit(1)


if __name__ == "__main__":
    main()
