#!/usr/bin/env python3
"""
读取通达信3BL板块文件并解析股票代码
"""

import os

def read_sector_file(filepath):
    """读取板块文件并解析股票代码"""
    stocks = []
    try:
        with open(filepath, 'r', encoding='gbk') as f:
            lines = f.readlines()
        
        for line in lines:
            line = line.strip()
            if not line:
                continue
            
            # 通达信格式: 0|000001 或 1|600000
            # 但这里的文件看起来是直接的代码格式
            if '|' in line:
                parts = line.split('|')
                if len(parts) >= 2:
                    stocks.append(parts[1])
            else:
                # 直接是股票代码，需要处理前缀
                # 格式可能是: 0001896, 1603103
                # 1开头表示沪市(600/601/603等)，0开头表示深市(000/002/300等)
                if len(line) >= 6:
                    if line.startswith('1'):
                        # 沪市: 1603103 -> 603103
                        code = line[1:]
                    elif line.startswith('0'):
                        # 深市: 0001896 -> 001896
                        code = line[1:]
                    else:
                        code = line
                    stocks.append(code)
        
        return stocks
    except Exception as e:
        print(f"读取文件失败: {e}")
        return []

# 读取3个板块
sectors = {
    "0225": r"C:\new_tdx_test\T0002\blocknew\3BL0225.blk",
    "0226": r"C:\new_tdx_test\T0002\blocknew\3BL0226.blk",
    "0227": r"C:\new_tdx_test\T0002\blocknew\3BL0227.blk",
}

all_stocks = {}

for date, filepath in sectors.items():
    print(f"\n读取板块 3BL{date}:")
    stocks = read_sector_file(filepath)
    print(f"  找到 {len(stocks)} 只股票")
    print(f"  前5只: {', '.join(stocks[:5])}")
    all_stocks[date] = stocks

# 统计
print("\n" + "="*60)
print("板块统计:")
total_unique = set()
for date, stocks in all_stocks.items():
    print(f"  3BL{date}: {len(stocks)} 只")
    total_unique.update(stocks)

print(f"\n总计: {len(total_unique)} 只不同股票")
print(f"股票列表: {', '.join(sorted(total_unique)[:20])}...")
