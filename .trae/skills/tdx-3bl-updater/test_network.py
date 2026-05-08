#!/usr/bin/env python3
"""测试网络连接"""

import requests
import socket

def test_network():
    print("测试网络连接...")
    
    # 测试腾讯股票API
    try:
        url = "https://qt.gtimg.cn/q=sz000001"
        response = requests.get(url, timeout=10)
        print(f"腾讯API状态: {response.status_code}")
        print(f"响应长度: {len(response.text)}")
        print(f"响应前100字符: {response.text[:100]}")
    except Exception as e:
        print(f"腾讯API访问失败: {e}")
    
    # 测试K线API
    try:
        url = "https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=sz000001,day,,,10,qfq"
        response = requests.get(url, timeout=10)
        print(f"\nK线API状态: {response.status_code}")
        data = response.json()
        print(f"数据键: {data.keys()}")
    except Exception as e:
        print(f"K线API访问失败: {e}")

if __name__ == "__main__":
    test_network()
