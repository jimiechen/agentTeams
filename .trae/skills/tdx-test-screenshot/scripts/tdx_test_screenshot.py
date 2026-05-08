#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
通达信测试版股票软件自动化截图脚本

功能：
1. 启动或激活通达信测试版软件
2. 按Ctrl+X打开股票代码输入框
3. 输入股票代码并回车确认
4. 等待数据加载
5. 截图保存

作者：nanobot AI
日期：2026-03-13
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
DEFAULT_APP_PATH = r"C:\new_tdx_test\tdxw.exe"
DEFAULT_OUTPUT_DIR = "./output"
DEFAULT_WAIT_TIME = 3


def log(message: str) -> None:
    """打印带时间戳的日志信息"""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{timestamp}] {message}")


def launch_application(app_path: str) -> bool:
    """
    启动通达信测试版应用程序
    
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
        time.sleep(8)  # 等待软件加载（通达信启动较慢）
        return True
    except Exception as e:
        log(f"启动应用程序失败: {e}")
        return False


def activate_tdx_window() -> bool:
    """
    激活通达信测试版窗口（软件已启动）
    
    Returns:
        bool: 是否成功激活
    """
    log("正在激活通达信窗口...")
    
    try:
        import pygetwindow as gw
        
        # 查找通达信窗口
        window = None
        for title in ["通达信", "tdx", "TDX", "分析"]:
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
            log("警告: 未找到通达信窗口，尝试使用当前活动窗口")
            return True
            
    except Exception as e:
        log(f"激活窗口失败: {e}，尝试使用当前活动窗口")
        return True


def input_stock_code(stock_code: str) -> bool:
    """
    输入股票代码，按回车，再按Ctrl+X切换，最后截图
    
    操作流程：
    1. 直接输入股票代码
    2. 按回车确认
    3. 按Ctrl+X切换（通达信的某个功能）
    
    Args:
        stock_code: 股票代码
        
    Returns:
        bool: 是否成功输入
    """
    log(f"正在输入股票代码: {stock_code}")
    
    try:
        # 1. 直接输入股票代码
        log(f"输入股票代码: {stock_code}")
        pyautogui.typewrite(stock_code, interval=0.05)
        time.sleep(0.3)
        
        # 2. 按回车确认
        log("按回车确认...")
        pyautogui.press('return')
        time.sleep(1)  # 等待数据加载
        
        # 3. 按Ctrl+X切换
        log("按 Ctrl+X 切换...")
        pyautogui.hotkey('ctrl', 'x')
        time.sleep(0.8)  # 等待切换完成
        
        log("股票代码输入和切换完成")
        return True
        
    except Exception as e:
        log(f"输入股票代码失败: {e}")
        return False


def take_screenshot(output_path: str, wait_time: int = 3) -> bool:
    """
    截取屏幕截图
    
    Args:
        output_path: 截图保存路径
        wait_time: 等待数据加载时间（秒）
        
    Returns:
        bool: 是否成功截图
    """
    log(f"等待 {wait_time} 秒让数据加载...")
    time.sleep(wait_time)
    
    log(f"正在截图并保存到: {output_path}")
    
    try:
        # 截取屏幕
        screenshot = pyautogui.screenshot()
        
        # 保存截图
        screenshot.save(output_path)
        log(f"截图保存成功: {output_path}")
        
        return True
    except Exception as e:
        log(f"截图失败: {e}")
        return False


def main():
    """主函数"""
    parser = argparse.ArgumentParser(
        description='通达信测试版股票软件自动化截图工具',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  python tdx_test_screenshot.py --code 000001
  python tdx_test_screenshot.py --code 002735 --output-dir ./reports
  python tdx_test_screenshot.py --code 600000 --no-launch
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
        help=f'通达信测试版程序路径（默认: {DEFAULT_APP_PATH}）'
    )
    
    args = parser.parse_args()
    
    # 打印欢迎信息
    log("=" * 50)
    log("通达信测试版自动化截图工具启动")
    log("=" * 50)
    log(f"股票代码: {args.code}")
    log(f"输出目录: {args.output_dir}")
    log(f"等待时间: {args.wait_time}秒")
    
    # 创建输出目录
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    # 生成文件名
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    # 内部使用绝对路径进行文件操作
    screenshot_path_abs = str(output_dir / f"tdx_{args.code}_{timestamp}.png")
    # 输出给工作流执行器的相对路径（使用 ./ 开头）
    output_dir_str = args.output_dir if args.output_dir.startswith('./') else f'./{args.output_dir}'
    screenshot_path = f"{output_dir_str}/tdx_{args.code}_{timestamp}.png"
    
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
        activate_tdx_window()
        time.sleep(1)
    
    # 2. 输入股票代码（输入 → 回车 → Ctrl+X）
    if not input_stock_code(args.code):
        log("输入股票代码失败，退出")
        sys.exit(1)
    
    # 3. 截图
    log("=" * 50)
    log("正在截图...")
    log("=" * 50)
    if not take_screenshot(screenshot_path_abs, args.wait_time):
        log("截图失败，退出")
        sys.exit(1)
    
    # 打印完成信息
    log("=" * 50)
    log("任务完成!")
    log("=" * 50)
    log(f"截图文件: {screenshot_path}")
    
    # 输出 JSON 格式的结果（供工作流执行器解析）
    import json
    result = {
        "success": success,
        "screenshot_image": screenshot_path,
        "stock_code": args.code,
        "timestamp": timestamp
    }
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
