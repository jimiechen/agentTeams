#!/usr/bin/env python3
"""
测试通达信API连接
"""

import sys
import os

# 添加通达信路径
sys.path.insert(0, r"C:\new_tdx_test\PYPlugins\user")

print("=" * 60)
print("测试通达信API连接")
print("=" * 60)

print("\n1. 检查tqcenter.py是否存在:")
tqcenter_path = r"C:\new_tdx_test\PYPlugins\user\tqcenter.py"
print(f"   路径: {tqcenter_path}")
print(f"   存在: {os.path.exists(tqcenter_path)}")

print("\n2. Python路径:")
print(f"   {sys.path[0]}")

print("\n3. 尝试导入tqcenter:")
try:
    from tqcenter import tq
    print("   ✓ 导入成功!")
    
    print("\n4. 尝试初始化通达信:")
    try:
        tq.initialize(__file__)
        print("   ✓ 初始化成功!")
        
        print("\n5. 获取自定义板块列表:")
        try:
            sectors = tq.get_user_sector()
            print(f"   ✓ 获取成功!")
            print(f"   板块数量: {len(sectors)}")
            for sector in sectors[:5]:
                print(f"     - {sector['Code']}: {sector['Name']}")
        except Exception as e:
            print(f"   ✗ 获取板块列表失败: {e}")
        
        print("\n6. 尝试获取3BL板块股票:")
        try:
            # 尝试获取3BL0225板块
            stocks = tq.get_stock_list_in_sector('3BL0225')
            print(f"   ✓ 获取成功!")
            print(f"   股票数量: {len(stocks)}")
            print(f"   前5只: {', '.join(stocks[:5])}")
        except Exception as e:
            print(f"   ✗ 获取板块股票失败: {e}")
        
        print("\n7. 测试获取股票数据:")
        try:
            df = tq.get_market_data(
                field_list=['Close', 'Volume'],
                stock_list=['000001.SZ'],
                period='1d',
                count=5,
                dividend_type='front'
            )
            print(f"   ✓ 获取数据成功!")
            print(f"   数据:\n{df}")
        except Exception as e:
            print(f"   ✗ 获取数据失败: {e}")
            
    except Exception as e:
        print(f"   ✗ 初始化失败: {e}")
        print("   请确保通达信客户端已启动并登录")
        
except ImportError as e:
    print(f"   ✗ 导入失败: {e}")
    import traceback
    traceback.print_exc()
