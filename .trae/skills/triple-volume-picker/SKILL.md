---
name: triple-volume-picker
description: "每日自动从通达信量化平台获取3倍量股票，批量筛选并自动创建自定义板块。Invoke when user wants to run daily triple volume stock screening, analyze stock volume anomalies, or schedule automated stock analysis."
metadata: 
  nanobot:
    emoji: "📊"
    os: ["windows"]
    requires:
      bins: ["python"]
      packages: ["tqcenter"]
    install:
      - id: pip
        kind: pip
        packages: ["tqcenter"]
        label: "需要安装 tqcenter 模块"
---

# 每日三倍量选股 (Triple Volume Picker)

使用**通达信量化平台(TdxQuant)**批量获取全市场数据，筛选3倍量股票（当日成交量 >= 前日成交量 × 3），并自动创建通达信自定义板块。

## 功能特性

- 📈 **3倍量筛选**: 自动筛选当日成交量 >= 前日3倍的股票
- 🚀 **批量数据获取**: 使用 `tqcenter` 接口一次性获取全市场数据
- 🎯 **高效计算**: 使用 pandas 向量化计算，速度快
- 💾 **结果保存**: 自动保存到CSV和JSON文件
- 📊 **自定义板块**: 自动创建通达信自定义板块并添加股票
- 🔍 **数据完整**: 直接获取当日成交量，无需从累计值计算
- 📡 **通达信量化**: 基于通达信量化平台，数据准确可靠

## 前置要求

### 1. 安装通达信金融终端

需要安装支持 TQ 策略功能的通达信金融终端或专业研究版。

### 2. 安装 tqcenter 模块

```bash
pip install tqcenter
```

### 3. 启动通达信终端

运行脚本前，需要先启动通达信金融终端并登录。

## 使用方法

### 执行今日选股

```bash
python scripts/tdx_triple_volume.py
```

### 分析指定日期

```bash
python scripts/tdx_triple_volume.py --date 2026-02-13
```

### 指定输出目录

```bash
python scripts/tdx_triple_volume.py --output ./reports
```

## 命令行参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--date` | 目标日期 (YYYY-MM-DD) | 最近交易日 |
| `--output` | 输出目录 | `./output` |

## 实现原理

### 1. 获取全市场股票列表

```python
batch_codes = tq.get_stock_list_in_sector('沪深A股')
```

### 2. 批量获取成交量数据

```python
df_real = tq.get_market_data(
    field_list=['Volume', 'Close', 'Open', 'High', 'Low'],
    stock_list=batch_codes,
    start_time='20260212',
    end_time='20260213',
    period='1d'
)
```

### 3. 向量化计算放量倍数

```python
volume_df = tq.price_df(df_real, 'Volume', column_names=batch_codes)
ratio = volume_df.iloc[-1] / volume_df.iloc[-2]  # 当日 / 前日
```

### 4. 创建自定义板块

```python
tq.create_sector(block_code='3BL0213', block_name='3倍量20260213')
tq.send_user_block(block_code='3BL0213', stocks=stock_codes)
```

## 输出文件

执行后会生成以下文件：

- `tdx_triple_volume_YYYYMMDD.csv` - CSV格式结果
- `tdx_triple_volume_YYYYMMDD.json` - JSON格式结果

## 自定义板块

脚本会自动在通达信中创建自定义板块：

- **板块名称**: `3倍量YYYYMMDD`
- **板块代码**: `3BLMMDD`
- **包含股票**: 所有3倍量股票

## 示例输出

```
============================================================
🚀 通达信量化平台3倍量选股
📅 分析日期: 2026-02-13
============================================================

🔌 初始化通达信量化平台...
   ✅ 初始化成功

1️⃣ 获取全市场股票列表...
   共 5123 只股票

2️⃣ 批量获取成交量数据...
   数据获取成功

3️⃣ 处理数据...

4️⃣ 计算放量倍数...
   找到 128 只3倍量股票

5️⃣ 创建通达信自定义板块...
   ✅ 创建板块: 3倍量20260213 (3BL0213)
   ✅ 添加 128 只股票到板块

============================================================
🏆 选股结果 - 共 128 只3倍量股票
============================================================

排名   代码           昨日成交量    今日成交量    倍数      收盘价    涨跌幅  
--------------------------------------------------------------------------------
1    600589.SH    249,054      41,280,253   165.75   13.19    4.69%   
2    002803.SZ    21,060       2,280,420    108.28   18.53    -0.64%  
3    603197.SH    167,881      18,066,026   107.61   37.79    4.08%   
...
```

## 注意事项

1. **必须先启动通达信终端** - 脚本需要连接通达信终端获取数据
2. **需要安装 tqcenter** - 使用 `pip install tqcenter` 安装
3. **数据准确性** - 直接从通达信获取当日成交量，无需计算
4. **板块自动创建** - 选股结果会自动添加到通达信自定义板块

## 依赖说明

- Python 3.7+
- tqcenter (通达信量化平台接口)
- pandas (数据处理)
- 通达信金融终端 (必须启动)

## 相关链接

- [通达信量化平台文档](https://help.tdx.com.cn/quant/)
- [get_market_data 接口说明](https://help.tdx.com.cn/quant/docs/markdown/mindoc-1h10g60jt68sc.html)
- [选股策略示例](https://help.tdx.com.cn/quant/docs/markdown/mindoc-1h1525ci3mnkc/mindoc-1h15262vnafcc.html)
