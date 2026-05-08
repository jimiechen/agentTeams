#!/usr/bin/env python3
import sys
sys.path.insert(0, r"C:\new_tdx_test\PYPlugins\user")

from tqcenter import tq

print("初始化通达信...")
tq.initialize(__file__)
print("✓ 成功\n")

# 测试获取平安银行数据
print("获取平安银行数据...")
df = tq.get_market_data(
    field_list=['Close', 'Volume'],
    stock_list=['000001.SZ'],
    period='1d',
    count=5,
    dividend_type='front'
)
print(f"✓ 成功")
print(f"最新收盘价: {df['Close'].iloc[-1].values[0]}")
print(f"最新成交量: {df['Volume'].iloc[-1].values[0]}")

# 读取板块文件
print("\n读取板块文件...")
with open(r"C:\new_tdx_test\T0002\blocknew\3BL0225.blk", 'r', encoding='gbk') as f:
    lines = f.readlines()
print(f"✓ 3BL0225 板块有 {len(lines)} 只股票")

print("\n完成!")
