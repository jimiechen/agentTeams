#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
测试腾讯股票API获取实时数据
"""

import requests
import json

def get_stock_realtime(stock_code):
    """获取股票实时数据"""
    try:
        # 转换股票代码格式
        if ".SH" in stock_code:
            tencent_code = f"sh{stock_code.replace('.SH', '')}"
        elif ".SZ" in stock_code:
            tencent_code = f"sz{stock_code.replace('.SZ', '')}"
        else:
            tencent_code = stock_code
        
        # 腾讯实时行情API
        url = f"https://qt.gtimg.cn/q={tencent_code}"
        response = requests.get(url, timeout=10)
        content = response.text
        
        print(f"\n股票代码: {stock_code}")
        print(f"腾讯代码: {tencent_code}")
        print(f"原始数据: {content[:200]}...")
        
        # 解析数据
        # 格式: v_sh600000="1~浦发银行~600000~10.50~10.30~10.40~..."
        if "~" in content:
            parts = content.split('"')[1].split("~")
            if len(parts) > 45:
                data = {
                    "name": parts[1],           # 股票名称
                    "code": parts[2],           # 股票代码
                    "current_price": float(parts[3]),   # 当前价格
                    "yesterday_close": float(parts[4]), # 昨收
                    "today_open": float(parts[5]),      # 今开
                    "volume": int(parts[6]),            # 成交量（手）
                    "amount": float(parts[7]),          # 成交额（万）
                    "high": float(parts[33]),           # 最高价
                    "low": float(parts[34]),            # 最低价
                    "time": parts[30],                  # 更新时间
                }
                return data
        
        return None
    except Exception as e:
        print(f"[ERROR] 获取实时数据失败: {e}")
        return None

def get_stock_kline(stock_code, days=60):
    """获取日K线数据"""
    try:
        if ".SH" in stock_code:
            tencent_code = f"sh{stock_code.replace('.SH', '')}"
        elif ".SZ" in stock_code:
            tencent_code = f"sz{stock_code.replace('.SZ', '')}"
        else:
            tencent_code = stock_code
        
        url = f"https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param={tencent_code},day,,,{days},qfq"
        response = requests.get(url, timeout=10)
        data = response.json()
        
        if data.get("code") != 0:
            print(f"[ERROR] API返回错误: {data}")
            return None
        
        kline_data = data.get("data", {}).get(tencent_code, {}).get("day", [])
        
        result = []
        for item in kline_data:
            result.append({
                "date": item[0],
                "open": float(item[1]),
                "close": float(item[2]),
                "low": float(item[3]),
                "high": float(item[4]),
                "volume": int(item[5])
            })
        
        return result
    except Exception as e:
        print(f"[ERROR] 获取K线数据失败: {e}")
        return None

if __name__ == "__main__":
    print("=" * 60)
    print("测试腾讯股票API")
    print("=" * 60)
    
    # 测试股票
    test_stocks = ["000001.SZ", "600000.SH"]
    
    for stock in test_stocks:
        print(f"\n{'='*60}")
        print(f"测试股票: {stock}")
        print('='*60)
        
        # 获取实时数据
        realtime = get_stock_realtime(stock)
        if realtime:
            print(f"\n实时数据:")
            print(f"  名称: {realtime['name']}")
            print(f"  当前价: {realtime['current_price']}")
            print(f"  开盘价: {realtime['today_open']}")
            print(f"  最高价: {realtime['high']}")
            print(f"  最低价: {realtime['low']}")
            print(f"  成交量: {realtime['volume']} 手")
            print(f"  成交额: {realtime['amount']} 万")
            print(f"  时间: {realtime['time']}")
        
        # 获取K线数据
        kline = get_stock_kline(stock, days=10)
        if kline:
            print(f"\n最近10天K线:")
            for d in kline[-5:]:
                print(f"  {d['date']}: 收{d['close']:.2f} 量{d['volume']}")
    
    print("\n" + "=" * 60)
    print("测试完成")
    print("=" * 60)
