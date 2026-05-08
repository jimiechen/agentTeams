#!/usr/bin/env python3
"""
测试通达信真实连接
"""

import sys
import os

# 添加通达信路径
sys.path.insert(0, r"C:\new_tdx_test\PYPlugins\user")

print("Python路径:")
for p in sys.path[:3]:
    print(f"  {p}")

print("\n检查tqcenter.py是否存在:")
tqcenter_path = r"C:\new_tdx_test\PYPlugins\user\tqcenter.py"
print(f"  路径: {tqcenter_path}")
print(f"  存在: {os.path.exists(tqcenter_path)}")

print("\n尝试导入tqcenter:")
try:
    from tqcenter import tq
    print("✓ 导入成功!")
    
    print("\n尝试初始化通达信:")
    try:
        tq.initialize(__file__)
        print("✓ 初始化成功!")
        
        # 测试获取数据
        print("\n尝试获取平安银行数据:")
        df = tq.get_market_data(
            field_list=['Close', 'Volume'],
            stock_list=['000001.SZ'],
            period='1d',
            count=5,
            dividend_type='front'
        )
        print(f"✓ 获取数据成功!")
        print(f"数据:\n{df}")
        
    except Exception as e:
        print(f"✗ 初始化失败: {e}")
        print("  请确保通达信客户端已启动")
        
except ImportError as e:
    print(f"✗ 导入失败: {e}")
    print("  请检查通达信安装路径")
