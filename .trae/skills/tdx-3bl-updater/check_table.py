#!/usr/bin/env python3
"""
检查飞书多维表格数据
"""

import json

# 这里会插入从MCP工具获取的数据
# 用于统计实际记录数

def count_records_from_response(response_text):
    """从API响应中统计记录数"""
    try:
        data = json.loads(response_text)
        items = data.get('items', [])
        
        print(f"总记录数: {len(items)}")
        print(f"has_more: {data.get('has_more', False)}")
        
        # 统计股票代码
        stock_codes = []
        for item in items:
            fields = item.get('fields', {})
            code_field = fields.get('股票代码', [])
            if code_field:
                code = code_field[0].get('text', '')
                if code:
                    stock_codes.append(code)
        
        print(f"\n股票代码数: {len(stock_codes)}")
        print(f"唯一股票数: {len(set(stock_codes))}")
        
        # 显示前10个
        print("\n前10个股票:")
        for code in stock_codes[:10]:
            print(f"  {code}")
        
        return len(items)
    except Exception as e:
        print(f"解析失败: {e}")
        return 0


if __name__ == "__main__":
    print("请将从MCP工具获取的JSON数据粘贴到这里")
    print("然后调用 count_records_from_response() 函数统计")
