# TDX 3BL板块股票数据更新 Skill

## 功能说明

本Skill用于从通达信量化平台获取3BL板块股票的实时行情数据，计算地量指标，并更新到飞书多维表格。

## 数据来源

- **股票行情**: 通达信量化平台API (`tqcenter`)
- **板块数据**: 通达信本地板块文件 (`T0002/blocknew/`)
- **目标表格**: 飞书多维表格

## 通达信API使用

### 初始化

```python
from tqcenter import tq

# 初始化通达信连接
tq.initialize(__file__)
```

### 获取K线数据

```python
# 获取股票K线数据
data = tq.get_market_data(
    field_list=[],           # 字段筛选，空则返回全部
    stock_list=['000001.SZ', '600000.SH'],  # 股票代码列表
    period='1d',             # 周期: '1d'=日线, '1m'=1分钟线
    count=60,                # 返回数据条数
    dividend_type='front',   # 复权类型: 'none'=不复权, 'front'=前复权
    fill_data=True           # 是否向后填充空缺数据
)

# 返回字段
# - Date: 日期
# - Time: 时间
# - Open: 开盘价
# - High: 最高价
# - Low: 最低价
# - Close: 收盘价
# - Volume: 成交量
# - Amount: 成交额
# - ForwardFactor: 前复权因子
```

### 股票代码格式

通达信使用以下格式：
- 深市: `000001.SZ`
- 沪市: `600000.SH`
- 北交所: `835305.BJ`

### 3. 获取股票更多信息

```python
from tdx_api import get_more_info_tdx, get_stock_name_tdx

# 获取股票更多信息
info = get_more_info_tdx('000001')

# 获取股票名称
name = get_stock_name_tdx('000001')  # 返回: '平安银行'
```

**常用字段：**
- `Name`: 股票名称
- `HqDate`: 行情日期
- `ZTPrice`: 涨停价
- `DTPrice`: 跌停价
- `Zsz`: 总市值(亿)
- `Ltsz`: 流通市值(亿)
- `DynaPE`: 动态PE
- `StaticPE_TTM`: 静态PE(TTM)
- `PB_MRQ`: 市净率
- `MA5Value`: 5日均线值
- `HisHigh`: 历史最高价
- `HisLow`: 历史最低价
- `ZAF`: 涨跌幅(%)
- `ZAFYesterday`: 昨日涨跌幅(%)
- `fHSL`: 换手率(%)

## 地量计算规则

**地量定义**: 当日成交量 < N日平均成交量 × 0.8

计算周期:
- 5日地量
- 10日地量
- 20日地量
- 30日地量
- 60日地量

## 文件说明

| 文件 | 说明 |
|------|------|
| `tdx_api.py` | 通达信API封装模块 |
| `update_with_tdx.py` | 主更新程序 |
| `complete_update.py` | 完整更新脚本（含腾讯API备用） |

## 使用方法

### 1. 安装依赖

```bash
pip install tqcenter
```

### 2. 启动通达信客户端

确保通达信量化平台客户端已启动并登录。

### 3. 运行更新程序

```bash
python update_with_tdx.py
```

## 配置信息

### 飞书多维表格

- **App Token**: `NjMBbwfgLaBXoSslUD8cDaPQnvf`
- **Table ID**: `tblRzH4lnNlvcAlq`

### 通达信板块文件

板块文件路径: `{TDX_PATH}/T0002/blocknew/`

- `3BL20260225.blk`
- `3BL20260226.blk`
- `3BL20260227.blk`

## 更新流程

1. 初始化通达信连接
2. 读取3个板块文件获取股票列表
3. 使用 `get_market_data` 批量获取股票K线数据
4. 计算最新价格和成交量
5. 计算5日/10日/20日/30日/60日地量指标
6. 更新飞书多维表格

## 注意事项

1. 通达信API需要在通达信客户端运行时才能使用
2. 股票代码需要转换为通达信格式 (`.SZ` / `.SH`)
3. 使用前复权数据 (`dividend_type='front'`) 计算地量
4. 一次最多返回24000条数据
