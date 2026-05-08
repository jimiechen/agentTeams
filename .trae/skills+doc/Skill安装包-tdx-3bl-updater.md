# Skill 安装包: tdx-3bl-updater (TDX 3BL板块数据更新)

> **Skill名称:** tdx-3bl-updater
> **版本:** 1.0.0
> **分类:** 股票数据更新与同步
> **状态:** 待签约

---

## 一、Skill 概述

从通达信量化平台获取3BL（3倍量）板块股票的实时行情数据，计算地量指标（5日/10日/20日/30日/60日），并更新到飞书多维表格。支持批量处理和定时执行。

---

## 二、安装信息

### 2.1 代码位置

| 项目 | 路径 |
|------|------|
| **Skill根目录** | `d:\agentsTeam\skills\tdx-3bl-updater\` |
| **SKILL.md** | `d:\agentsTeam\skills\tdx-3bl-updater\SKILL.md` |
| **核心脚本** | `d:\agentsTeam\skills\tdx-3bl-updater\update_with_tdx.py` |
| **API封装** | `d:\agentsTeam\skills\tdx-3bl-updater\tdx_api.py` |
| **完整更新** | `d:\agentsTeam\skills\tdx-3bl-updater\complete_update.py` |
| **定时插入** | `d:\agentsTeam\skills\tdx-3bl-updater\scheduled_batch_insert.py` |
| **飞书更新** | `d:\agentsTeam\skills\tdx-3bl-updater\update_to_feishu.py` |
| **其他工具** | `batch_insert_feishu.py`, `feishu_table.py`, `read_sectors.py`, `test_tdx_api.py` 等 |

### 2.2 环境依赖

| 依赖项 | 版本要求 | 安装方式 |
|--------|----------|----------|
| Python | 3.7+ | 系统自带 |
| tqcenter | 最新版 | `pip install tqcenter` |
| requests | 最新版 | `pip install requests` |
| 通达信金融终端 | 量化版 | 官方安装 |

### 2.3 通达信配置

| 配置项 | 值 |
|--------|-----|
| **通达信安装路径** | `C:\new_tdx_test` 或 `D:\new_tdx` |
| **PYPlugins路径** | `C:\new_tdx_test\PYPlugins\user` |
| **板块文件路径** | `{TDX_PATH}\T0002\blocknew\` |
| **板块文件编码** | GBK |

---

## 三、核心功能

### 3.1 功能列表

| # | 功能 | 说明 |
|---|------|------|
| 1 | **读取板块文件** | 从通达信本地读取3BL板块股票列表 |
| 2 | **批量行情获取** | 使用 `get_market_data` 批量获取K线数据 |
| 3 | **地量计算** | 计算5日/10日/20日/30日/60日地量指标 |
| 4 | **飞书表格更新** | 将数据更新到飞书多维表格 |
| 5 | **定时执行** | 支持定时批量插入任务 |
| 6 | **多板块支持** | 支持多个历史3BL板块同时处理 |

### 3.2 更新流程

```
1. 初始化通达信连接 (tq.initialize)
2. 读取3BL板块文件 (T0002/blocknew/3BLYYYYMMDD.blk)
3. 批量获取股票K线数据 (tq.get_market_data)
4. 计算最新价格和成交量
5. 计算各周期地量指标 (V < MA(V,N) * 0.8)
6. 更新飞书多维表格
```

---

## 四、使用方法

### 4.1 主更新程序

```bash
python update_with_tdx.py
```

### 4.2 完整更新（含腾讯API备用）

```bash
python complete_update.py
```

### 4.3 定时批量插入

```bash
python scheduled_batch_insert.py
```

### 4.4 飞书表格更新

```bash
python update_to_feishu.py
```

---

## 五、接口说明

### 5.1 tdx_api.py 封装接口

| 函数 | 说明 |
|------|------|
| `init_tdx()` | 初始化通达信连接 |
| `get_realtime_data_tdx(stock_code)` | 获取实时数据 |
| `get_kline_data_tdx(stock_code, count)` | 获取K线数据 |
| `calculate_diliang_tdx(volumes)` | 计算地量指标 |
| `get_stock_name_tdx(stock_code)` | 获取股票名称 |
| `get_stock_full_data_tdx(stock_code)` | 获取完整数据 |
| `format_stock_code_tdx(code)` | 格式化股票代码 |

### 5.2 股票代码格式

| 市场 | 格式 | 示例 |
|------|------|------|
| 深市 | `000001.SZ` | 平安银行 |
| 沪市 | `600000.SH` | 浦发银行 |
| 北交所 | `835305.BJ` | - |

### 5.3 地量计算规则

```
地量定义: 当日成交量 < N日平均成交量 × 0.8

计算周期:
- 5日地量  (DL5)
- 10日地量 (DL10)
- 20日地量 (DL20)
- 30日地量 (DL30)
- 60日地量 (DL60)
```

---

## 六、飞书配置

### 6.1 目标表格

| 配置项 | 值 |
|--------|-----|
| **App Token** | `NjMBbwfgLaBXoSslUD8cDaPQnvf` |
| **Table ID** | `tblRzH4lnNlvcAlq` |

### 6.2 字段映射

| 字段名 | 字段ID | 类型 |
|--------|--------|------|
| 股票代码 | `fldHPzxvNn` | 文本 |
| 股票名称 | `fldoz6l46S` | 文本 |
| 入池日期 | `fldZ1ryVTc` | 日期 |
| 入池开盘价 | `fldh1WqZQj` | 数字 |
| 入池收盘价 | `fldhHjplYb` | 数字 |
| 入池最高价 | `fldM8tWz1R` | 数字 |
| 最新收盘价 | `fldz04zez3` | 数字 |
| 成交量 | `fldENO4ZxO` | 数字 |
| 5日地量 | `fldpbtGag0` | 复选框 |
| 10日地量 | `fldpcWKIrC` | 复选框 |
| 20日地量 | `fld8MCVecG` | 复选框 |
| 30日地量 | `fldJQ3Pfzt` | 复选框 |
| 60日地量 | `fldSy9BEEe` | 复选框 |
| 3倍量确认 | `fldnV2uFKW` | 复选框 |
| 备注 | `fldz2m6rRC` | 文本 |

---

## 七、集成关系

### 7.1 上游依赖

| Skill/服务 | 关系 | 说明 |
|------------|------|------|
| 通达信金融终端 | **强依赖** | 必须启动并登录 |
| tqcenter 模块 | **强依赖** | 通达信量化平台接口 |
| triple-volume-picker | **数据依赖** | 消费其创建的3BL板块文件 |

### 7.2 下游消费

| Skill/服务 | 关系 | 说明 |
|------------|------|------|
| 飞书多维表格 | **数据目标** | 更新股票数据到飞书 |

---

## 八、板块文件格式

### 8.1 文件位置

```
{TDX_PATH}\T0002\blocknew\
├── 3BL20260225.blk
├── 3BL20260226.blk
├── 3BL20260227.blk
└── ...
```

### 8.2 文件内容格式

```
0001896
0013300
1603103
...
```

- 以 `0` 开头：深市股票（去掉前缀0）
- 以 `1` 开头：沪市股票（去掉前缀1）

---

## 九、故障排查

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| 无法读取板块文件 | 路径错误或文件不存在 | 检查 `T0002\blocknew\` 路径 |
| 股票代码解析错误 | 编码问题 | 确保使用GBK编码读取 |
| 地量计算异常 | 数据不足N天 | 检查K线数据条数 |
| 飞书更新失败 | Token失效或网络问题 | 检查飞书应用权限 |

---

## 十、版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| 1.0.0 | 2026-02 | 初始版本 |

---

## 十一、关联文档

| 文档 | 路径 |
|------|------|
| 原始开发文档 | [检查系统定时任务配置.md](file:///d:/agentsTeam/.trae/documents/skills+doc/检查系统定时任务配置.md) |
| Skill目录大纲 | [Skill签约目录大纲.md](file:///d:/agentsTeam/.trae/documents/skills+doc/Skill签约目录大纲.md) |
