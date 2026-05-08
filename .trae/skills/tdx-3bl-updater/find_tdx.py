#!/usr/bin/env python3
"""查找通达信安装位置"""

import os
import sys

possible_paths = [
    r"D:\new_tdx\PYPlugins\user\tqcenter.py",
    r"D:\new_tdx\T0002\blocknew\3BL20260225.blk",
    r"C:\new_tdx\PYPlugins\user\tqcenter.py",
    r"C:\new_tdx\T0002\blocknew\3BL20260225.blk",
    r"D:\通达信\PYPlugins\user\tqcenter.py",
    r"D:\通达信\T0002\blocknew\3BL20260225.blk",
]

print("查找通达信安装位置...")
print("=" * 60)

found = False
for path in possible_paths:
    exists = os.path.exists(path)
    status = "✓ 存在" if exists else "✗ 不存在"
    print(f"{status}: {path}")
    if exists:
        found = True
        # 获取目录
        dir_path = os.path.dirname(path)
        print(f"  目录: {dir_path}")

if not found:
    print("\n未找到通达信安装，请确认:")
    print("1. 通达信是否已安装")
    print("2. 安装路径是否为以上路径之一")
    print("3. 是否需要添加其他路径")
else:
    print("\n找到通达信安装!")
