#!/usr/bin/env python3
"""
飞书多维表格更新器
用于在nanobot环境中使用MCP工具更新股票数据
"""

import json
from typing import Dict, List, Optional, Any
from datetime import datetime

# 配置
APP_TOKEN = "NjMBbwfgLaBXoSslUD8cDaPQnvf"
TABLE_ID = "tblRzH4lnNlvcAlq"

# 字段ID映射
FIELD_IDS = {
    "股票代码": "fldHPzxvNn",
    "股票名称": "fldoz6l46S",
    "入池日期": "fldZ1ryVTc",
    "入池开盘价": "fldh1WqZQj",
    "入池收盘价": "fldhHjplYb",
    "入池最高价": "fldM8tWz1R",
    "最新收盘价": "fldz04zez3",
    "成交量": "fldENO4ZxO",
    "5日地量": "fldpbtGag0",
    "10日地量": "fldpcWKIrC",
    "20日地量": "fld8MCVecG",
    "30日地量": "fldJQ3Pfzt",
    "60日地量": "fldSy9BEEe",
    "3倍量确认": "fldnV2uFKW",
    "备注": "fldz2m6rRC",
}


def prepare_update_fields(stock_data: Dict) -> Dict:
    """
    准备更新字段数据
    
    参数:
        stock_data: {
            'code': '000001',
            'name': '平安银行',
            'price': 10.86,
            'volume': 546731,
            'diliang_5': True,
            'diliang_10': False,
            ...
        }
    
    返回:
        飞书多维表格字段格式
    """
    fields = {}
    
    # 股票代码（文本数组格式）
    fields["股票代码"] = [{"text": stock_data['code'], "type": "text"}]
    
    # 股票名称（文本数组格式）
    fields["股票名称"] = [{"text": stock_data.get('name', stock_data['code']), "type": "text"}]
    
    # 最新收盘价
    if 'price' in stock_data:
        fields["最新收盘价"] = float(stock_data['price'])
    
    # 成交量
    if 'volume' in stock_data:
        fields["成交量"] = int(stock_data['volume'])
    
    # 地量指标（复选框）
    fields["5日地量"] = bool(stock_data.get('diliang_5', False))
    fields["10日地量"] = bool(stock_data.get('diliang_10', False))
    fields["20日地量"] = bool(stock_data.get('diliang_20', False))
    fields["30日地量"] = bool(stock_data.get('diliang_30', False))
    fields["60日地量"] = bool(stock_data.get('diliang_60', False))
    
    # 备注
    update_time = datetime.now().strftime("%Y-%m-%d %H:%M")
    diliang_list = []
    if stock_data.get('diliang_5'): diliang_list.append("5日")
    if stock_data.get('diliang_10'): diliang_list.append("10日")
    if stock_data.get('diliang_20'): diliang_list.append("20日")
    if stock_data.get('diliang_30'): diliang_list.append("30日")
    if stock_data.get('diliang_60'): diliang_list.append("60日")
    
    diliang_str = ",".join(diliang_list) if diliang_list else "无"
    remark = f"更新时间: {update_time} 最新价:{stock_data.get('price', '-')} 成交量:{stock_data.get('volume', '-')} 地量:{diliang_str}"
    fields["备注"] = [{"text": remark, "type": "text"}]
    
    return fields


def generate_mcp_update_command(record_id: str, stock_data: Dict) -> str:
    """
    生成MCP更新命令（用于在nanobot中执行）
    
    返回:
        MCP工具调用命令字符串
    """
    fields = prepare_update_fields(stock_data)
    
    # 构建MCP命令
    command = f"""mcp_lark-mcp_bitable_v1_appTableRecord_update({{
  "data": {{
    "fields": {json.dumps(fields, ensure_ascii=False, indent=2)}
  }},
  "path": {{
    "app_token": "{APP_TOKEN}",
    "table_id": "{TABLE_ID}",
    "record_id": "{record_id}"
  }}
}})"""
    
    return command


def generate_update_script(existing_records: List[Dict], stock_data_dict: Dict[str, Dict]) -> str:
    """
    生成完整的更新脚本
    
    参数:
        existing_records: 多维表格现有记录
        stock_data_dict: 股票数据字典 {code: data}
    
    返回:
        可执行的Python脚本
    """
    script_lines = [
        "#!/usr/bin/env python3",
        "# 飞书多维表格更新脚本",
        "# 在nanobot环境中执行",
        "",
        "import json",
        "",
        "APP_TOKEN = '{}'".format(APP_TOKEN),
        "TABLE_ID = '{}'".format(TABLE_ID),
        "",
        "# 更新的股票数据",
        "stock_updates = [",
    ]
    
    # 为每条记录生成更新数据
    for record in existing_records:
        record_id = record.get('record_id')
        fields = record.get('fields', {})
        
        # 获取股票代码
        stock_code_field = fields.get('股票代码', [])
        if stock_code_field and len(stock_code_field) > 0:
            stock_code = stock_code_field[0].get('text', '')
        else:
            continue
        
        # 检查是否有新数据
        if stock_code in stock_data_dict:
            stock_data = stock_data_dict[stock_code]
            update_fields = prepare_update_fields(stock_data)
            
            script_lines.append("    {")
            script_lines.append('        "record_id": "{}",'.format(record_id))
            script_lines.append('        "stock_code": "{}",'.format(stock_code))
            script_lines.append('        "fields": {}'.format(json.dumps(update_fields, ensure_ascii=False, indent=8)))
            script_lines.append("    },")
    
    script_lines.append("]")
    script_lines.append("")
    script_lines.append("# 执行更新")
    script_lines.append("for update in stock_updates:")
    script_lines.append("    print(f\"更新股票: {update['stock_code']}\")")
    script_lines.append("    # 这里调用MCP工具更新")
    script_lines.append("    # mcp_lark-mcp_bitable_v1_appTableRecord_update(...)")
    
    return "\n".join(script_lines)


# 测试
if __name__ == "__main__":
    # 测试数据
    test_stock = {
        'code': '000001',
        'name': '平安银行',
        'price': 10.86,
        'volume': 546731,
        'diliang_5': True,
        'diliang_10': False,
        'diliang_20': True,
        'diliang_30': True,
        'diliang_60': True,
    }
    
    print("准备更新字段:")
    fields = prepare_update_fields(test_stock)
    print(json.dumps(fields, ensure_ascii=False, indent=2))
