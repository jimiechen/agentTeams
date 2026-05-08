#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
通达信自定义板块实时行情监控工具

功能：
1. 获取通达信自定义板块成分股
2. 实时监控板块内股票价格和成交量
3. 涨幅超过阈值时触发预警
4. 支持多板块同时监控

作者：nanobot AI
日期：2026-02-26
"""

import os
import sys
import time
import json
import signal
import logging
import argparse
from datetime import datetime, timedelta
from collections import defaultdict
from typing import List, Dict, Set, Optional
from dataclasses import dataclass, asdict

# 添加通达信 PYPlugins 目录到 Python 路径
TDX_PATH = r"C:\new_tdx_test"
PYPLUGINS_PATH = os.path.join(TDX_PATH, "PYPlugins", "user")
if os.path.exists(PYPLUGINS_PATH):
    sys.path.insert(0, PYPLUGINS_PATH)

# 导入通达信量化平台接口
try:
    from tqcenter import tq
except ImportError:
    print("[失败] 错误: 无法导入 tqcenter 模块")
    print(f"请检查通达信安装目录: {PYPLUGINS_PATH}")
    sys.exit(1)


# ===================== 全局配置 =====================
DEFAULT_THRESHOLD = 5.0      # 默认涨幅阈值 5%
DEFAULT_INTERVAL = 5         # 默认轮询间隔 5秒
DEFAULT_ANTI_SHAKE = 10      # 防抖间隔 10秒
EXIT_FLAG = False            # 退出标志

# ===================== 数据结构 =====================
@dataclass
class StockAlert:
    """股票预警记录"""
    stock_code: str
    stock_name: str
    sector_name: str
    current_price: float
    change_pct: float
    volume: int
    alert_time: datetime


@dataclass
class SectorConfig:
    """板块配置"""
    name: str
    stocks: List[str]


# ===================== 日志配置 =====================
def setup_logging(output_dir: str) -> logging.Logger:
    """设置日志记录"""
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
    
    log_file = os.path.join(output_dir, f"monitor_{datetime.now().strftime('%Y%m%d')}.log")
    
    logger = logging.getLogger("tdx_monitor")
    logger.setLevel(logging.INFO)
    
    # 文件处理器
    file_handler = logging.FileHandler(log_file, encoding='utf-8')
    file_handler.setLevel(logging.INFO)
    
    # 控制台处理器
    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.INFO)
    
    # 格式化器
    formatter = logging.Formatter(
        '[%(asctime)s] %(levelname)s: %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    file_handler.setFormatter(formatter)
    console_handler.setFormatter(formatter)
    
    logger.addHandler(file_handler)
    logger.addHandler(console_handler)
    
    return logger


# ===================== 信号处理 =====================
def signal_handler(signum, frame):
    """处理Ctrl+C（SIGINT）信号"""
    global EXIT_FLAG
    logger = logging.getLogger("tdx_monitor")
    logger.info("接收到退出信号（Ctrl+C），正在清理资源...")
    EXIT_FLAG = True


# ===================== 交易时间检查 =====================
def is_trading_time() -> bool:
    """检查当前是否在交易时间内"""
    now = datetime.now()
    weekday = now.weekday()
    
    # 周末不交易
    if weekday >= 5:
        return False
    
    current_time = now.time()
    
    # 上午交易时间: 9:30 - 11:30
    morning_start = datetime.strptime("09:30:00", "%H:%M:%S").time()
    morning_end = datetime.strptime("11:30:00", "%H:%M:%S").time()
    
    # 下午交易时间: 13:00 - 15:00
    afternoon_start = datetime.strptime("13:00:00", "%H:%M:%S").time()
    afternoon_end = datetime.strptime("15:00:00", "%H:%M:%S").time()
    
    return (
        (morning_start <= current_time <= morning_end) or
        (afternoon_start <= current_time <= afternoon_end)
    )


def get_trading_status() -> str:
    """获取当前交易状态描述"""
    if is_trading_time():
        return "交易中"
    
    now = datetime.now()
    weekday = now.weekday()
    
    if weekday >= 5:
        return "周末休市"
    
    current_time = now.time()
    morning_start = datetime.strptime("09:30:00", "%H:%M:%S").time()
    afternoon_end = datetime.strptime("15:00:00", "%H:%M:%S").time()
    
    if current_time < morning_start:
        return "盘前"
    elif current_time > afternoon_end:
        return "盘后"
    else:
        return "午间休市"


# ===================== 板块操作 =====================
def get_sector_stocks(sector_name: str) -> List[str]:
    """
    获取板块成分股列表
    
    Args:
        sector_name: 板块名称
        
    Returns:
        股票代码列表
    """
    try:
        stocks = tq.get_stock_list_in_sector(sector_name)
        if stocks:
            return stocks
        else:
            return []
    except Exception as e:
        logging.getLogger("tdx_monitor").warning(f"获取板块 {sector_name} 失败: {e}")
        return []


def generate_sector_names(days: int) -> List[str]:
    """
    生成最近N个交易日的板块名称列表
    
    Args:
        days: 天数
        
    Returns:
        板块名称列表（如 ['3倍量20260226', '3倍量20260225', ...]）
    """
    sector_names = []
    current_date = datetime.now()
    
    # 尝试获取最近交易日
    try:
        trade_dates = tq.get_trading_dates(market='SH', start_time='', end_time='', count=days)
        for date_str in reversed(trade_dates):
            sector_name = f"3倍量{date_str}"
            sector_names.append(sector_name)
    except Exception as e:
        # 如果获取失败，使用本地计算
        logging.getLogger("tdx_monitor").warning(f"获取交易日失败，使用本地计算: {e}")
        count = 0
        while count < days:
            if current_date.weekday() < 5:  # 周一到周五
                sector_name = f"3倍量{current_date.strftime('%Y%m%d')}"
                sector_names.append(sector_name)
                count += 1
            current_date -= timedelta(days=1)
    
    return sector_names


def load_sectors(sector_names: List[str]) -> Dict[str, List[str]]:
    """
    加载多个板块的成分股
    
    Args:
        sector_names: 板块名称列表
        
    Returns:
        板块名称 -> 股票代码列表 的字典
    """
    logger = logging.getLogger("tdx_monitor")
    sectors = {}
    all_stocks = set()
    
    logger.info(f"开始加载 {len(sector_names)} 个板块...")
    
    for sector_name in sector_names:
        stocks = get_sector_stocks(sector_name)
        if stocks:
            sectors[sector_name] = stocks
            all_stocks.update(stocks)
            logger.info(f"  [{sector_name}] 加载 {len(stocks)} 只股票")
        else:
            logger.warning(f"  [{sector_name}] 未找到或为空")
    
    logger.info(f"共加载 {len(sectors)} 个板块，{len(all_stocks)} 只唯一股票")
    
    return sectors


# ===================== 行情获取 =====================
def get_market_data_batch(stock_list: List[str]) -> Dict[str, Dict]:
    """
    批量获取股票行情数据
    
    Args:
        stock_list: 股票代码列表
        
    Returns:
        股票代码 -> 行情数据的字典
    """
    logger = logging.getLogger("tdx_monitor")
    result = {}
    
    if not stock_list:
        return result
    
    try:
        # 获取最新行情数据
        # 使用空字符串表示获取最新数据
        df = tq.get_market_data(
            field_list=['Close', 'ChangePercent', 'Volume', 'Amount', 'Open', 'High', 'Low'],
            stock_list=stock_list,
            start_time='',
            end_time='',
            period='1d',
            dividend_type='none',
            fill_data=True
        )
        
        # 转换为字典格式
        for stock_code in stock_list:
            try:
                result[stock_code] = {
                    'close': df['Close'][stock_code].iloc[-1] if stock_code in df['Close'] else 0,
                    'change_pct': df['ChangePercent'][stock_code].iloc[-1] if stock_code in df['ChangePercent'] else 0,
                    'volume': int(df['Volume'][stock_code].iloc[-1]) if stock_code in df['Volume'] else 0,
                    'amount': df['Amount'][stock_code].iloc[-1] if stock_code in df['Amount'] else 0,
                    'open': df['Open'][stock_code].iloc[-1] if stock_code in df['Open'] else 0,
                    'high': df['High'][stock_code].iloc[-1] if stock_code in df['High'] else 0,
                    'low': df['Low'][stock_code].iloc[-1] if stock_code in df['Low'] else 0,
                }
            except Exception as e:
                logger.debug(f"处理 {stock_code} 数据失败: {e}")
                
    except Exception as e:
        logger.error(f"获取行情数据失败: {e}")
    
    return result


def get_stock_names(stock_list: List[str]) -> Dict[str, str]:
    """
    获取股票名称
    
    Args:
        stock_list: 股票代码列表
        
    Returns:
        股票代码 -> 股票名称 的字典
    """
    names = {}
    for code in stock_list:
        try:
            info = tq.get_stock_info(code)
            if isinstance(info, dict):
                names[code] = info.get('Name', code)
            else:
                names[code] = code
        except:
            names[code] = code
    return names


# ===================== 预警逻辑 =====================
class AlertManager:
    """预警管理器"""
    
    def __init__(self, threshold: float, anti_shake_seconds: int):
        self.threshold = threshold
        self.anti_shake_seconds = anti_shake_seconds
        self.last_alert_time = {}  # stock_code -> timestamp
        self.alerted_stocks = set()  # 已触发预警的股票
        self.logger = logging.getLogger("tdx_monitor")
    
    def check_alert(self, stock_code: str, change_pct: float) -> bool:
        """
        检查是否应该触发预警
        
        Args:
            stock_code: 股票代码
            change_pct: 涨跌幅
            
        Returns:
            是否触发预警
        """
        # 检查是否超过阈值
        if change_pct < self.threshold:
            return False
        
        now = time.time()
        
        # 检查防抖
        if stock_code in self.last_alert_time:
            elapsed = now - self.last_alert_time[stock_code]
            if elapsed < self.anti_shake_seconds:
                return False
        
        # 更新最后预警时间
        self.last_alert_time[stock_code] = now
        self.alerted_stocks.add(stock_code)
        
        return True
    
    def trigger_alert(self, alert: StockAlert):
        """触发预警"""
        self.logger.warning(
            f"【预警】{alert.stock_code} ({alert.stock_name}) | "
            f"板块: {alert.sector_name} | "
            f"涨幅: {alert.change_pct:.2f}% | "
            f"价格: {alert.current_price:.2f} | "
            f"成交量: {alert.volume:,}"
        )


# ===================== 飞书通知 =====================
def send_feishu_notification(webhook_url: str, alert: StockAlert):
    """
    发送飞书通知
    
    Args:
        webhook_url: 飞书 webhook URL
        alert: 预警信息
    """
    try:
        import requests
        
        content = {
            "msg_type": "text",
            "content": {
                "text": f"【涨幅预警】\n"
                        f"板块: {alert.sector_name}\n"
                        f"股票: {alert.stock_code} ({alert.stock_name})\n"
                        f"涨幅: {alert.change_pct:.2f}%\n"
                        f"当前价: {alert.current_price:.2f}\n"
                        f"成交量: {alert.volume:,}\n"
                        f"时间: {alert.alert_time.strftime('%H:%M:%S')}"
            }
        }
        
        response = requests.post(webhook_url, json=content, timeout=5)
        if response.status_code == 200:
            logging.getLogger("tdx_monitor").info(f"飞书通知发送成功: {alert.stock_code}")
        else:
            logging.getLogger("tdx_monitor").warning(f"飞书通知发送失败: {response.status_code}")
            
    except Exception as e:
        logging.getLogger("tdx_monitor").warning(f"发送飞书通知失败: {e}")


# ===================== 主监控循环 =====================
def monitor_sectors(
    sectors: Dict[str, List[str]],
    threshold: float,
    interval: int,
    feishu_webhook: Optional[str],
    output_dir: str
):
    """
    主监控循环
    
    Args:
        sectors: 板块字典 {板块名: 股票列表}
        threshold: 涨幅阈值
        interval: 轮询间隔（秒）
        feishu_webhook: 飞书 webhook URL
        output_dir: 输出目录
    """
    global EXIT_FLAG
    
    logger = logging.getLogger("tdx_monitor")
    alert_manager = AlertManager(threshold, DEFAULT_ANTI_SHAKE)
    
    # 合并所有股票并建立反向映射
    all_stocks = set()
    stock_to_sectors = defaultdict(list)  # stock_code -> [sector_names]
    
    for sector_name, stocks in sectors.items():
        for stock in stocks:
            all_stocks.add(stock)
            if sector_name not in stock_to_sectors[stock]:
                stock_to_sectors[stock].append(sector_name)
    
    all_stocks = list(all_stocks)
    
    # 获取股票名称
    stock_names = get_stock_names(all_stocks)
    
    logger.info("=" * 60)
    logger.info("通达信板块实时行情监控启动")
    logger.info("=" * 60)
    logger.info(f"监控板块数: {len(sectors)}")
    logger.info(f"监控股票数: {len(all_stocks)}")
    logger.info(f"涨幅阈值: {threshold}%")
    logger.info(f"轮询间隔: {interval}秒")
    logger.info(f"飞书通知: {'已配置' if feishu_webhook else '未配置'}")
    logger.info("=" * 60)
    logger.info("按 Ctrl+C 停止监控")
    logger.info("=" * 60)
    
    cycle_count = 0
    
    while not EXIT_FLAG:
        try:
            cycle_count += 1
            
            # 检查交易时间
            if not is_trading_time():
                status = get_trading_status()
                if cycle_count % 10 == 1:  # 每10次循环打印一次
                    logger.info(f"当前状态: {status}，等待交易时间...")
                time.sleep(interval)
                continue
            
            # 获取行情数据
            market_data = get_market_data_batch(all_stocks)
            
            # 检查每只股票
            for stock_code in all_stocks:
                if stock_code not in market_data:
                    continue
                
                data = market_data[stock_code]
                change_pct = data.get('change_pct', 0)
                
                # 检查是否触发预警
                if alert_manager.check_alert(stock_code, change_pct):
                    # 确定所属板块（取第一个）
                    sector_name = stock_to_sectors[stock_code][0] if stock_code in stock_to_sectors else "未知"
                    
                    alert = StockAlert(
                        stock_code=stock_code,
                        stock_name=stock_names.get(stock_code, stock_code),
                        sector_name=sector_name,
                        current_price=data.get('close', 0),
                        change_pct=change_pct,
                        volume=data.get('volume', 0),
                        alert_time=datetime.now()
                    )
                    
                    # 触发预警
                    alert_manager.trigger_alert(alert)
                    
                    # 发送飞书通知
                    if feishu_webhook:
                        send_feishu_notification(feishu_webhook, alert)
            
            # 定期打印状态
            if cycle_count % 10 == 0:
                logger.info(f"监控运行中... 已检查 {cycle_count} 次，当前预警 {len(alert_manager.alerted_stocks)} 只")
            
            # 等待下次轮询
            time.sleep(interval)
            
        except KeyboardInterrupt:
            logger.info("收到键盘中断信号")
            break
        except Exception as e:
            logger.error(f"监控循环异常: {e}")
            time.sleep(interval)
    
    logger.info("=" * 60)
    logger.info("监控已停止")
    logger.info(f"共检查 {cycle_count} 次，触发预警 {len(alert_manager.alerted_stocks)} 只股票")
    logger.info("=" * 60)


# ===================== 主函数 =====================
def main():
    """主函数"""
    parser = argparse.ArgumentParser(
        description='通达信自定义板块实时行情监控工具',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  python tdx_sector_monitor.py --sector "3倍量20260226"
  python tdx_sector_monitor.py --days 5
  python tdx_sector_monitor.py --sector "3倍量20260226" --threshold 3.0 --interval 3
        """
    )
    
    parser.add_argument(
        '--sector',
        type=str,
        help='板块名称（如 "3倍量20260226"）'
    )
    
    parser.add_argument(
        '--days',
        type=int,
        help='监控最近N个交易日的板块（与--sector互斥）'
    )
    
    parser.add_argument(
        '--threshold',
        type=float,
        default=DEFAULT_THRESHOLD,
        help=f'涨幅阈值百分比（默认: {DEFAULT_THRESHOLD}%）'
    )
    
    parser.add_argument(
        '--interval',
        type=int,
        default=DEFAULT_INTERVAL,
        help=f'轮询间隔秒数（默认: {DEFAULT_INTERVAL}秒）'
    )
    
    parser.add_argument(
        '--output',
        type=str,
        default='./output/realtime_monitor',
        help='输出目录（默认: ./output/realtime_monitor）'
    )
    
    parser.add_argument(
        '--feishu-webhook',
        type=str,
        default=os.getenv('FEISHU_WEBHOOK'),
        help='飞书 webhook URL（默认从环境变量 FEISHU_WEBHOOK 读取）'
    )
    
    args = parser.parse_args()
    
    # 验证参数
    if not args.sector and not args.days:
        parser.error("必须指定 --sector 或 --days 参数")
    
    # 设置日志
    logger = setup_logging(args.output)
    
    # 注册信号处理
    signal.signal(signal.SIGINT, signal_handler)
    
    # 初始化通达信
    logger.info("正在初始化通达信量化平台...")
    try:
        tq.initialize(__file__)
        logger.info("通达信初始化成功")
    except Exception as e:
        logger.error(f"通达信初始化失败: {e}")
        logger.error("请确保已启动通达信金融终端")
        sys.exit(1)
    
    # 确定要监控的板块
    if args.sector:
        sector_names = [args.sector]
    else:
        sector_names = generate_sector_names(args.days)
    
    # 加载板块数据
    sectors = load_sectors(sector_names)
    
    if not sectors:
        logger.error("未加载到任何板块数据，退出")
        tq.close()
        sys.exit(1)
    
    # 启动监控
    try:
        monitor_sectors(
            sectors=sectors,
            threshold=args.threshold,
            interval=args.interval,
            feishu_webhook=args.feishu_webhook,
            output_dir=args.output
        )
    finally:
        # 清理资源
        logger.info("正在关闭通达信连接...")
        try:
            tq.close()
        except:
            pass
        logger.info("资源清理完成")
    
    # 输出 nanobot 标准格式
    output = {
        "success": True,
        "sectors_monitored": list(sectors.keys()),
        "total_stocks": sum(len(stocks) for stocks in sectors.values()),
        "threshold": args.threshold,
        "interval": args.interval
    }
    
    print(f"\n###NANOBOT_OUTPUT_START###{json.dumps(output, ensure_ascii=False)}###NANOBOT_OUTPUT_END###")


if __name__ == "__main__":
    main()
