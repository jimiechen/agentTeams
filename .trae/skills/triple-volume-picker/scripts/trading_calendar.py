#!/usr/bin/env python3
"""
交易日历工具
- 判断是否为交易日
- 获取最近交易日
- 区分周末和节假日
"""

from datetime import date, timedelta
from typing import List, Optional

# 2026年A股节假日安排（可根据需要更新）
HOLIDAYS_2026 = {
    # 元旦
    date(2026, 1, 1), date(2026, 1, 2),
    # 春节
    date(2026, 2, 16), date(2026, 2, 17), date(2026, 2, 18), date(2026, 2, 19), date(2026, 2, 20),
    # 清明节
    date(2026, 4, 4), date(2026, 4, 5), date(2026, 4, 6),
    # 劳动节
    date(2026, 5, 1), date(2026, 5, 2), date(2026, 5, 3), date(2026, 5, 4), date(2026, 5, 5),
    # 端午节
    date(2026, 6, 19), date(2026, 6, 20), date(2026, 6, 21),
    # 中秋节
    date(2026, 9, 25), date(2026, 9, 26), date(2026, 9, 27),
    # 国庆节
    date(2026, 10, 1), date(2026, 10, 2), date(2026, 10, 3), date(2026, 10, 4), date(2026, 10, 5),
    date(2026, 10, 6), date(2026, 10, 7), date(2026, 10, 8),
}


def is_trading_day(target_date: date) -> bool:
    """
    判断是否为交易日
    
    返回:
        True - 是交易日
        False - 非交易日（周末或节假日）
    """
    # 周末
    if target_date.weekday() >= 5:  # 5=周六, 6=周日
        return False
    
    # 节假日
    if target_date in HOLIDAYS_2026:
        return False
    
    return True


def get_date_type(target_date: date) -> str:
    """
    获取日期类型
    
    返回:
        'trading' - 交易日
        'weekend' - 周末
        'holiday' - 节假日
    """
    if target_date in HOLIDAYS_2026:
        return 'holiday'
    if target_date.weekday() >= 5:
        return 'weekend'
    return 'trading'


def get_date_type_desc(target_date: date) -> str:
    """获取日期类型描述"""
    date_type = get_date_type(target_date)
    if date_type == 'trading':
        return '交易日'
    elif date_type == 'weekend':
        weekday_names = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
        return f'周末 ({weekday_names[target_date.weekday()]})'
    else:
        return '节假日'


def get_latest_trading_date(today: Optional[date] = None) -> date:
    """
    获取最近交易日（今天或之前）
    """
    if today is None:
        today = date.today()
    
    # 向前查找最近交易日
    target = today
    while not is_trading_day(target):
        target -= timedelta(days=1)
    
    return target


def get_next_trading_date(today: Optional[date] = None) -> date:
    """
    获取下一个交易日（今天或之后）
    """
    if today is None:
        today = date.today()
    
    # 向后查找最近交易日
    target = today
    while not is_trading_day(target):
        target += timedelta(days=1)
    
    return target


def get_prev_trading_date(target_date: date) -> date:
    """
    获取前一个交易日
    """
    prev = target_date - timedelta(days=1)
    while not is_trading_day(prev):
        prev -= timedelta(days=1)
    return prev


def get_trading_dates(start_date: date, end_date: date) -> List[date]:
    """
    获取日期范围内的所有交易日
    """
    trading_dates = []
    current = start_date
    while current <= end_date:
        if is_trading_day(current):
            trading_dates.append(current)
        current += timedelta(days=1)
    return trading_dates


def validate_trading_date(target_date: Optional[date] = None) -> tuple:
    """
    验证日期是否为交易日，如果不是则返回最近交易日
    
    返回:
        (actual_date, is_original, original_type_desc)
        - actual_date: 实际使用的交易日
        - is_original: 是否使用原始日期
        - original_type_desc: 原始日期类型描述
    """
    if target_date is None:
        target_date = date.today()
    
    if is_trading_day(target_date):
        return target_date, True, get_date_type_desc(target_date)
    
    # 不是交易日，获取最近交易日
    actual_date = get_latest_trading_date(target_date)
    return actual_date, False, get_date_type_desc(target_date)


def get_recent_trade_dates(days: int, end_date: Optional[date] = None) -> List[date]:
    """
    获取最近N个交易日（从end_date往前数）
    
    Args:
        days: 需要获取的交易日数量
        end_date: 结束日期，默认为今天
        
    Returns:
        交易日列表（按时间顺序，从早到晚）
    """
    if end_date is None:
        end_date = date.today()
    
    trading_dates = []
    current = end_date
    
    # 向前查找交易日
    while len(trading_dates) < days:
        if is_trading_day(current):
            trading_dates.append(current)
        current -= timedelta(days=1)
    
    # 反转列表，使其按时间顺序排列（从早到晚）
    trading_dates.reverse()
    
    return trading_dates


if __name__ == "__main__":
    # 测试
    today = date(2026, 2, 16)  # 周日
    print(f"今天: {today} ({get_date_type_desc(today)})")
    print(f"是否交易日: {is_trading_day(today)}")
    
    latest = get_latest_trading_date(today)
    print(f"最近交易日: {latest} ({get_date_type_desc(latest)})")
    
    next_day = get_next_trading_date(today)
    print(f"下一个交易日: {next_day} ({get_date_type_desc(next_day)})")
    
    # 验证日期
    actual, is_orig, orig_desc = validate_trading_date(today)
    print(f"\n验证结果:")
    print(f"  原始日期: {today} ({orig_desc})")
    print(f"  是否使用原始日期: {is_orig}")
    print(f"  实际使用: {actual}")
