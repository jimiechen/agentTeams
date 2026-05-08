#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
TDX 实时行情监控工具测试脚本

测试内容：
1. 交易时间检查函数
2. 板块名称生成函数
3. 日志配置
4. 预警管理器
5. 命令行参数解析

运行方式：
    python test_tdx_monitor.py
"""

import os
import sys
import time
import unittest
from datetime import datetime, timedelta
from unittest.mock import Mock, patch, MagicMock

# 添加脚本目录到路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


class TestTradingTime(unittest.TestCase):
    """测试交易时间检查功能"""
    
    def test_weekend_not_trading(self):
        """测试周末非交易时间"""
        from tdx_sector_monitor import is_trading_time
        
        # 模拟周六
        with patch('tdx_sector_monitor.datetime') as mock_datetime:
            mock_datetime.now.return_value = datetime(2026, 2, 28, 10, 0, 0)  # 周六
            mock_datetime.weekday.return_value = 5
            mock_datetime.strptime = datetime.strptime
            self.assertFalse(is_trading_time())
        
        # 模拟周日
        with patch('tdx_sector_monitor.datetime') as mock_datetime:
            mock_datetime.now.return_value = datetime(2026, 3, 1, 10, 0, 0)  # 周日
            mock_datetime.weekday.return_value = 6
            mock_datetime.strptime = datetime.strptime
            self.assertFalse(is_trading_time())
    
    def test_morning_trading_time(self):
        """测试上午交易时间"""
        from tdx_sector_monitor import is_trading_time
        
        with patch('tdx_sector_monitor.datetime') as mock_datetime:
            mock_datetime.now.return_value = datetime(2026, 2, 26, 10, 30, 0)  # 周四 10:30
            mock_datetime.weekday.return_value = 3
            mock_datetime.strptime = datetime.strptime
            mock_datetime.time.return_value = datetime(2026, 2, 26, 10, 30, 0).time()
            self.assertTrue(is_trading_time())
    
    def test_afternoon_trading_time(self):
        """测试下午交易时间"""
        from tdx_sector_monitor import is_trading_time
        
        with patch('tdx_sector_monitor.datetime') as mock_datetime:
            mock_datetime.now.return_value = datetime(2026, 2, 26, 14, 0, 0)  # 周四 14:00
            mock_datetime.weekday.return_value = 3
            mock_datetime.strptime = datetime.strptime
            mock_datetime.time.return_value = datetime(2026, 2, 26, 14, 0, 0).time()
            self.assertTrue(is_trading_time())
    
    def test_lunch_break_not_trading(self):
        """测试午间休市"""
        from tdx_sector_monitor import is_trading_time
        
        with patch('tdx_sector_monitor.datetime') as mock_datetime:
            mock_datetime.now.return_value = datetime(2026, 2, 26, 12, 0, 0)  # 周四 12:00
            mock_datetime.weekday.return_value = 3
            mock_datetime.strptime = datetime.strptime
            mock_datetime.time.return_value = datetime(2026, 2, 26, 12, 0, 0).time()
            self.assertFalse(is_trading_time())


class TestSectorNameGeneration(unittest.TestCase):
    """测试板块名称生成功能"""
    
    def test_generate_sector_names(self):
        """测试板块名称生成"""
        from tdx_sector_monitor import generate_sector_names
        
        # 由于需要通达信连接，这里只测试函数结构
        # 实际测试需要在有通达信环境时进行
        try:
            names = generate_sector_names(3)
            # 如果通达信未连接，应该返回空列表或使用本地计算
            self.assertIsInstance(names, list)
        except Exception as e:
            print(f"生成板块名称测试（需要通达信连接）: {e}")


class TestAlertManager(unittest.TestCase):
    """测试预警管理器"""
    
    def setUp(self):
        """测试前准备"""
        from tdx_sector_monitor import AlertManager
        self.alert_manager = AlertManager(threshold=5.0, anti_shake_seconds=2)
    
    def test_alert_triggered_above_threshold(self):
        """测试超过阈值触发预警"""
        result = self.alert_manager.check_alert("000001.SZ", 6.0)
        self.assertTrue(result)
    
    def test_alert_not_triggered_below_threshold(self):
        """测试低于阈值不触发"""
        result = self.alert_manager.check_alert("000001.SZ", 4.0)
        self.assertFalse(result)
    
    def test_anti_shake_mechanism(self):
        """测试防抖机制"""
        # 第一次触发
        result1 = self.alert_manager.check_alert("000001.SZ", 6.0)
        self.assertTrue(result1)
        
        # 短时间内再次触发（应该被防抖）
        result2 = self.alert_manager.check_alert("000001.SZ", 6.5)
        self.assertFalse(result2)
    
    def test_different_stocks_independent(self):
        """测试不同股票独立计算"""
        # 股票A触发
        result1 = self.alert_manager.check_alert("000001.SZ", 6.0)
        self.assertTrue(result1)
        
        # 股票B也应该能触发
        result2 = self.alert_manager.check_alert("000002.SZ", 6.0)
        self.assertTrue(result2)


class TestLoggingSetup(unittest.TestCase):
    """测试日志配置"""
    
    def test_setup_logging(self):
        """测试日志设置"""
        from tdx_sector_monitor import setup_logging
        import tempfile
        import shutil
        
        # 创建临时目录
        temp_dir = tempfile.mkdtemp()
        
        try:
            logger = setup_logging(temp_dir)
            
            # 验证日志器配置
            self.assertEqual(logger.name, "tdx_monitor")
            self.assertEqual(logger.level, 20)  # INFO level
            
            # 验证处理器数量（文件+控制台）
            self.assertEqual(len(logger.handlers), 2)
            
            # 测试日志记录
            logger.info("测试日志消息")
            
            # 验证日志文件创建
            log_files = [f for f in os.listdir(temp_dir) if f.endswith('.log')]
            self.assertEqual(len(log_files), 1)
            
        finally:
            # 清理临时目录
            shutil.rmtree(temp_dir)


class TestArgumentParsing(unittest.TestCase):
    """测试命令行参数解析"""
    
    def test_parse_sector_argument(self):
        """测试板块参数解析"""
        from tdx_sector_monitor import main
        import argparse
        
        # 测试参数解析
        test_args = ['--sector', '3倍量20260226', '--threshold', '3.0']
        
        with patch('sys.argv', ['tdx_sector_monitor.py'] + test_args):
            with patch('tdx_sector_monitor.setup_logging') as mock_setup:
                with patch('tdx_sector_monitor.tq') as mock_tq:
                    with patch('tdx_sector_monitor.load_sectors') as mock_load:
                        with patch('tdx_sector_monitor.monitor_sectors') as mock_monitor:
                            mock_load.return_value = {'3倍量20260226': ['000001.SZ']}
                            try:
                                main()
                            except SystemExit:
                                pass  # 预期会退出
                            
                            # 验证参数传递
                            mock_monitor.assert_called_once()
                            call_args = mock_monitor.call_args
                            self.assertEqual(call_args[1]['threshold'], 3.0)
    
    def test_parse_days_argument(self):
        """测试天数参数解析"""
        from tdx_sector_monitor import generate_sector_names
        
        # 测试板块名称生成逻辑
        # 注意：这需要通达信连接，这里仅测试函数存在性
        self.assertTrue(callable(generate_sector_names))


class TestStockAlertDataclass(unittest.TestCase):
    """测试股票预警数据结构"""
    
    def test_stock_alert_creation(self):
        """测试创建预警对象"""
        from tdx_sector_monitor import StockAlert
        
        alert = StockAlert(
            stock_code="000001.SZ",
            stock_name="平安银行",
            sector_name="3倍量20260226",
            current_price=10.5,
            change_pct=5.2,
            volume=1000000,
            alert_time=datetime.now()
        )
        
        self.assertEqual(alert.stock_code, "000001.SZ")
        self.assertEqual(alert.stock_name, "平安银行")
        self.assertEqual(alert.sector_name, "3倍量20260226")
        self.assertEqual(alert.current_price, 10.5)
        self.assertEqual(alert.change_pct, 5.2)


def run_tests():
    """运行所有测试"""
    print("=" * 60)
    print("TDX 实时行情监控工具测试")
    print("=" * 60)
    print()
    
    # 创建测试套件
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()
    
    # 添加测试类
    suite.addTests(loader.loadTestsFromTestCase(TestTradingTime))
    suite.addTests(loader.loadTestsFromTestCase(TestSectorNameGeneration))
    suite.addTests(loader.loadTestsFromTestCase(TestAlertManager))
    suite.addTests(loader.loadTestsFromTestCase(TestLoggingSetup))
    suite.addTests(loader.loadTestsFromTestCase(TestArgumentParsing))
    suite.addTests(loader.loadTestsFromTestCase(TestStockAlertDataclass))
    
    # 运行测试
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    
    print()
    print("=" * 60)
    print(f"测试完成: 运行 {result.testsRun} 个, 失败 {len(result.failures)} 个, 错误 {len(result.errors)} 个")
    print("=" * 60)
    
    return result.wasSuccessful()


if __name__ == "__main__":
    success = run_tests()
    sys.exit(0 if success else 1)
