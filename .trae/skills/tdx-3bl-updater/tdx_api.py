#!/usr/bin/env python3
"""
通达信API封装模块
使用通达信量化平台API获取股票数据
"""

import sys
import os
from typing import Dict, List, Optional, Any
import json

# 添加通达信安装路径到Python路径
TDX_INSTALL_PATHS = [
    r"C:\new_tdx_test\PYPlugins\user",
    r"C:\new_tdx\PYPlugins\user",
    r"D:\new_tdx\PYPlugins\user",
]

for path in TDX_INSTALL_PATHS:
    if os.path.exists(path) and path not in sys.path:
        sys.path.insert(0, path)
        print(f"添加通达信路径: {path}")

# 通达信Python API导入
try:
    from tqcenter import tq
    TDX_AVAILABLE = True
    print("✓ 成功导入tqcenter模块")
except ImportError as e:
    TDX_AVAILABLE = False
    print(f"✗ 无法导入tqcenter模块: {e}")
    print("  请检查通达信安装路径是否正确")


def init_tdx() -> bool:
    """初始化通达信连接"""
    if not TDX_AVAILABLE:
        return False
    
    try:
        # 初始化通达信
        tq.initialize(__file__)
        return True
    except Exception as e:
        print(f"通达信初始化失败: {e}")
        return False


def format_stock_code_tdx(code: str) -> str:
    """
    格式化为通达信股票代码格式
    通达信格式: 000001.SZ, 600000.SH, 688318.SH
    """
    code = code.strip()
    if len(code) == 6:
        if code.startswith('6') or code.startswith('5'):
            return f"{code}.SH"
        else:
            return f"{code}.SZ"
    return code


def get_market_data_tdx(
    stock_list: List[str],
    period: str = '1d',
    count: int = 60,
    dividend_type: str = 'front',
    field_list: List[str] = None
) -> Optional[Dict[str, Any]]:
    """
    获取通达信K线数据
    
    参数:
        stock_list: 股票代码列表 ['000001.SZ', '600000.SH']
        period: 周期 '1d'=日线, '1m'=1分钟线
        count: 返回数据条数
        dividend_type: 复权类型 'none'=不复权, 'front'=前复权, 'back'=后复权
        field_list: 字段筛选，空则返回全部
    
    返回:
        {
            'Close': DataFrame,
            'Open': DataFrame,
            'High': DataFrame,
            'Low': DataFrame,
            'Volume': DataFrame,
            'Amount': DataFrame,
            ...
        }
    """
    if not TDX_AVAILABLE:
        return None
    
    try:
        # 转换股票代码格式
        tdx_codes = [format_stock_code_tdx(code) for code in stock_list]
        
        # 调用通达信API
        result = tq.get_market_data(
            field_list=field_list or [],
            stock_list=tdx_codes,
            period=period,
            count=count,
            dividend_type=dividend_type,
            fill_data=True
        )
        
        return result
    except Exception as e:
        print(f"获取通达信数据失败: {e}")
        return None


def get_realtime_data_tdx(stock_codes: List[str]) -> Dict[str, Dict]:
    """
    获取股票实时数据（最新一条K线）
    
    返回:
        {
            '000001': {
                'code': '000001',
                'name': '平安银行',
                'price': 10.86,
                'open': 10.80,
                'high': 10.90,
                'low': 10.78,
                'volume': 546731,
                'amount': 5940000.00
            },
            ...
        }
    """
    if not TDX_AVAILABLE:
        return {}
    
    # 获取最新一条日K线数据
    data = get_market_data_tdx(
        stock_list=stock_codes,
        period='1d',
        count=1,
        dividend_type='front'
    )
    
    if not data:
        return {}
    
    result = {}
    for code in stock_codes:
        try:
            tdx_code = format_stock_code_tdx(code)
            
            # 从DataFrame中提取数据
            close_df = data.get('Close', {})
            open_df = data.get('Open', {})
            high_df = data.get('High', {})
            low_df = data.get('Low', {})
            volume_df = data.get('Volume', {})
            amount_df = data.get('Amount', {})
            
            if tdx_code in close_df.index:
                result[code] = {
                    'code': code,
                    'name': code,  # 通达信API不返回名称，需要另外获取
                    'price': float(close_df.loc[tdx_code].iloc[-1]),
                    'open': float(open_df.loc[tdx_code].iloc[-1]),
                    'high': float(high_df.loc[tdx_code].iloc[-1]),
                    'low': float(low_df.loc[tdx_code].iloc[-1]),
                    'volume': int(volume_df.loc[tdx_code].iloc[-1]),
                    'amount': float(amount_df.loc[tdx_code].iloc[-1]),
                }
        except Exception as e:
            print(f"处理 {code} 数据失败: {e}")
            continue
    
    return result


def get_kline_data_tdx(stock_code: str, days: int = 60) -> List[Dict]:
    """
    获取股票历史K线数据
    
    返回:
        [
            {
                'date': '20250220',
                'open': 10.5,
                'close': 10.8,
                'high': 10.9,
                'low': 10.4,
                'volume': 1000000,
                'amount': 10800000.0
            },
            ...
        ]
    """
    if not TDX_AVAILABLE:
        return []
    
    data = get_market_data_tdx(
        stock_list=[stock_code],
        period='1d',
        count=days,
        dividend_type='front',
        field_list=['Date', 'Open', 'Close', 'High', 'Low', 'Volume', 'Amount']
    )
    
    if not data:
        return []
    
    try:
        tdx_code = format_stock_code_tdx(stock_code)
        
        # 提取各字段数据
        dates = data['Date'].loc[tdx_code]
        opens = data['Open'].loc[tdx_code]
        closes = data['Close'].loc[tdx_code]
        highs = data['High'].loc[tdx_code]
        lows = data['Low'].loc[tdx_code]
        volumes = data['Volume'].loc[tdx_code]
        amounts = data['Amount'].loc[tdx_code]
        
        # 组装K线数据
        kline_data = []
        for i in range(len(dates)):
            kline_data.append({
                'date': str(int(dates.iloc[i])),
                'open': float(opens.iloc[i]),
                'close': float(closes.iloc[i]),
                'high': float(highs.iloc[i]),
                'low': float(lows.iloc[i]),
                'volume': int(volumes.iloc[i]),
                'amount': float(amounts.iloc[i])
            })
        
        return kline_data
    except Exception as e:
        print(f"解析K线数据失败: {e}")
        return []


def calculate_diliang_tdx(kline_data: List[Dict]) -> Dict[str, bool]:
    """
    计算地量指标
    地量定义: 当日成交量 < N日平均成交量 × 0.8
    """
    if len(kline_data) < 5:
        return {"5日": False, "10日": False, "20日": False, "30日": False, "60日": False}
    
    volumes = [d["volume"] for d in kline_data]
    latest_volume = volumes[-1]
    
    result = {}
    periods = [(5, "5日"), (10, "10日"), (20, "20日"), (30, "30日"), (60, "60日")]
    
    for days, name in periods:
        if len(volumes) >= days:
            avg_volume = sum(volumes[-days:]) / days
            result[name] = latest_volume < avg_volume * 0.8
        else:
            result[name] = False
    
    return result


def get_more_info_tdx(stock_code: str) -> Optional[Dict[str, Any]]:
    """
    获取股票更多信息
    
    参数:
        stock_code: 股票代码，如 '000001' 或 '000001.SZ'
    
    返回:
        {
            'HqDate': '20260227',          # 行情日期
            'ZTPrice': 151.62,              # 涨停价
            'DTPrice': 101.08,              # 跌停价
            'Zsz': 326.91,                  # 总市值(亿)
            'Ltsz': 326.91,                 # 流通市值(亿)
            'DynaPE': 133.10,               # 动态PE
            'StaticPE_TTM': 94.99,          # 静态PE(TTM)
            'PB_MRQ': 8.82,                 # 市净率
            'MA5Value': 126.56,             # 5日均线值
            'HisHigh': 180.86,              # 历史最高价
            'HisLow': 83.41,                # 历史最低价
            'ZAF': 1.02,                    # 涨跌幅(%)
            'ZAFYesterday': -1.21,          # 昨日涨跌幅(%)
            'fHSL': 0.86,                   # 换手率(%)
            ...
        }
    """
    if not TDX_AVAILABLE:
        return None
    
    try:
        # 转换股票代码格式
        tdx_code = format_stock_code_tdx(stock_code)
        
        # 调用通达信API获取更多信息
        result = tq.get_more_info(tdx_code)
        
        return result
    except Exception as e:
        print(f"获取 {stock_code} 更多信息失败: {e}")
        return None


def get_stock_name_tdx(stock_code: str) -> str:
    """
    获取股票名称
    
    参数:
        stock_code: 股票代码
    
    返回:
        股票名称，如 '平安银行'
    """
    info = get_more_info_tdx(stock_code)
    if info and 'Name' in info:
        return info['Name']
    return stock_code


def get_stock_full_data_tdx(stock_code: str) -> Optional[Dict[str, Any]]:
    """
    获取股票完整数据（K线 + 更多信息）
    
    参数:
        stock_code: 股票代码
    
    返回:
        {
            'code': '000001',
            'name': '平安银行',
            'kline': [...],           # K线数据
            'realtime': {...},        # 实时数据
            'more_info': {...},       # 更多信息
            'diliang': {...},         # 地量指标
        }
    """
    # 获取K线数据
    kline = get_kline_data_tdx(stock_code, 60)
    if len(kline) < 5:
        return None
    
    # 获取实时数据
    realtime_data = get_realtime_data_tdx([stock_code])
    realtime = realtime_data.get(stock_code, {})
    
    # 获取更多信息
    more_info = get_more_info_tdx(stock_code)
    
    # 计算地量
    diliang = calculate_diliang_tdx(kline)
    
    # 获取股票名称
    name = more_info.get('Name', stock_code) if more_info else stock_code
    
    return {
        'code': stock_code,
        'name': name,
        'kline': kline,
        'realtime': realtime,
        'more_info': more_info,
        'diliang': diliang,
    }


# 测试代码
if __name__ == "__main__":
    print("=" * 60)
    print("通达信API测试")
    print("=" * 60)
    
    # 初始化
    if init_tdx():
        print("✓ 通达信初始化成功")
        
        # 测试获取实时数据
        print("\n测试获取实时数据...")
        test_codes = ["000001", "600000"]
        realtime_data = get_realtime_data_tdx(test_codes)
        
        for code, data in realtime_data.items():
            print(f"  {code}: 价格={data['price']}, 成交量={data['volume']}")
        
        # 测试获取K线数据
        print("\n测试获取K线数据...")
        kline = get_kline_data_tdx("000001", 10)
        print(f"  获取到 {len(kline)} 条K线数据")
        if kline:
            print(f"  最新: 日期={kline[-1]['date']}, 收盘={kline[-1]['close']}, 成交量={kline[-1]['volume']}")
        
        # 测试地量计算
        print("\n测试地量计算...")
        kline_60 = get_kline_data_tdx("000001", 60)
        if kline_60:
            diliang = calculate_diliang_tdx(kline_60)
            print(f"  地量指标: {diliang}")
    else:
        print("✗ 通达信未初始化，请确保已安装tqcenter模块")
        print("  安装命令: pip install tqcenter")
