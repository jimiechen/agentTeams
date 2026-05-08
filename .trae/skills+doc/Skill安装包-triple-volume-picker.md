# Skill 安装包: triple-volume-picker (每日三倍量选股)

> **Skill名称:** triple-volume-picker
> **版本:** 1.0.0
> **分类:** 股票数据获取与选股
> **状态:** 待签约

---

## 一、Skill 概述

每日自动从通达信量化平台获取全市场数据，筛选当日成交量 >= 前日成交量 × 3 的股票（3倍量），并自动创建通达信自定义板块。

---

## 二、安装信息

### 2.1 代码位置

| 项目 | 路径 |
|------|------|
| **Skill根目录** | `d:\agentsTeam\skills\nanobot\triple-volume-picker\` |
| **SKILL.md** | `d:\agentsTeam\skills\nanobot\triple-volume-picker\SKILL.md` |
| **核心脚本** | `d:\agentsTeam\skills\nanobot\triple-volume-picker\scripts\tdx_triple_volume.py` |
| **其他脚本** | `tdx_triple_volume_v2.py`, `tdx_triple_volume_v3.py`, `tdx_triple_volume_v4.py`, `tdx_triple_volume_batch.py`, `tdx_triple_volume_unified.py`, `daily_triple_volume.py`, `trading_calendar.py` |
| **输出目录** | `d:\agentsTeam\skills\nanobot\triple-volume-picker\output\` |

### 2.2 环境依赖

| 依赖项 | 版本要求 | 安装方式 |
|--------|----------|----------|
| Python | 3.7+ | 系统自带 |
| tqcenter | 最新版 | `pip install tqcenter` |
| pandas | 最新版 | `pip install pandas` |
| 通达信金融终端 | 量化版/专业研究版 | 官方安装 |

### 2.3 通达信配置

| 配置项 | 值 |
|--------|-----|
| **通达信安装路径** | `C:\new_tdx_test` |
| **PYPlugins路径** | `C:\new_tdx_test\PYPlugins\user` |
| **板块文件路径** | `C:\new_tdx_test\T0002\blocknew\` |
| **可执行文件** | `C:\new_tdx_test\tdxw.exe` |

---

## 三、核心功能

### 3.1 功能列表

| # | 功能 | 说明 |
|---|------|------|
| 1 | **3倍量筛选** | 当日成交量 >= 前日成交量 × 3 |
| 2 | **批量数据获取** | 使用 `tqcenter` 接口一次性获取全市场数据 |
| 3 | **高效计算** | 使用 pandas 向量化计算 |
| 4 | **结果保存** | 自动保存到 CSV 和 JSON 文件 |
| 5 | **自定义板块** | 自动创建通达信自定义板块（3BLMMDD格式） |
| 6 | **交易日处理** | 自动获取最近交易日和前一个交易日 |

### 3.2 选股流程

```
1. 初始化通达信量化平台 (tq.initialize)
2. 获取全市场股票列表 (tq.get_stock_list_in_sector('沪深A股'))
3. 批量获取成交量数据 (tq.get_market_data)
4. 向量化计算放量倍数 (当日/前日)
5. 筛选3倍量股票
6. 创建通达信自定义板块 (tq.create_sector)
7. 保存结果到 CSV/JSON
```

---

## 四、使用方法

### 4.1 命令行参数

```bash
python scripts/tdx_triple_volume.py [选项]
```

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--date` | 目标日期 (YYYY-MM-DD) | 最近交易日 |
| `--output` | 输出目录 | `./output` |

### 4.2 使用示例

```bash
# 执行今日选股
cd d:\agentsTeam\skills\nanobot\triple-volume-picker
python scripts\tdx_triple_volume.py

# 分析指定日期
python scripts\tdx_triple_volume.py --date 2026-02-13

# 指定输出目录
python scripts\tdx_triple_volume.py --output ./reports
```

### 4.3 输出文件

| 文件 | 格式 | 说明 |
|------|------|------|
| `tdx_triple_volume_YYYYMMDD.csv` | CSV | 选股结果表格 |
| `tdx_triple_volume_YYYYMMDD.json` | JSON | 选股结果数据 |
| `tdx_triple_volume_YYYYMMDD.md` | Markdown | 选股报告 |

### 4.4 通达信板块

- **板块名称**: `3倍量YYYYMMDD`（如: 3倍量20260213）
- **板块代码**: `3BLMMDD`（如: 3BL0213）
- **包含股票**: 所有3倍量股票

---

## 五、接口说明

### 5.1 主要函数

| 函数 | 文件 | 说明 |
|------|------|------|
| `find_triple_volume_stocks(target_date)` | `tdx_triple_volume.py` | 查找3倍量股票主函数 |
| `get_latest_trade_date()` | `tdx_triple_volume.py` | 获取最近交易日 |
| `get_prev_trade_date(target_date)` | `tdx_triple_volume.py` | 获取前一个交易日 |
| `save_results(results, output_dir)` | `tdx_triple_volume.py` | 保存选股结果 |
| `create_or_update_tdx_block(stocks, block_code, block_name)` | `tdx_triple_volume.py` | 创建/更新通达信板块 |

### 5.2 数据结构

```python
@dataclass
class TripleVolumeResult:
    stock_code: str      # 股票代码
    stock_name: str      # 股票名称
    trade_date: date     # 交易日期
    yesterday_volume: int # 昨日成交量
    today_volume: int    # 今日成交量
    ratio: float         # 放量倍数
    open_price: float    # 开盘价
    close_price: float   # 收盘价
    high_price: float    # 最高价
    low_price: float     # 最低价
    change_pct: float    # 涨跌幅
```

---

## 六、集成关系

### 6.1 上游依赖

| Skill/服务 | 关系 | 说明 |
|------------|------|------|
| 通达信金融终端 | **强依赖** | 必须启动并登录 |
| tqcenter 模块 | **强依赖** | 通达信量化平台接口 |

### 6.2 下游消费

| Skill/服务 | 关系 | 说明 |
|------------|------|------|
| tdx-realtime-monitor | 消费板块 | 监控3倍量板块实时行情 |
| feishu-bitable-manager | 消费结果 | 将选股结果写入飞书表格 |
| tdx-test-screenshot | 消费股票 | 对选股结果截图 |
| tdx-3bl-updater | 消费板块 | 更新板块数据到飞书 |

---

## 七、定时任务配置

### 7.1 Windows 任务计划程序

```powershell
# 任务名称: Nanobot_TripleVolume_Daily
# 执行时间: 每天 15:30:30
# 执行命令:
powershell.exe -ExecutionPolicy Bypass -File D:\agentsTeam\skills\nanobot\feishu-bitable-manager\scripts\run_triple_volume_task.ps1
```

### 7.2 执行流程

```
15:30 定时任务触发
    ↓
[Step 1/2] 数据同步检查 (check_tdx_data_sync.py)
    ↓ 检查通过
[Step 2/2] 执行选股 (tdx_triple_volume.py)
    ↓
生成 CSV/JSON/Markdown 文件
    ↓
创建通达信板块 3BLMMDD
```

---

## 八、故障排查

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| 无法导入 tqcenter | 通达信未安装或路径错误 | 检查 `C:\new_tdx_test\PYPlugins\user` |
| 初始化失败 | 通达信终端未启动 | 启动通达信并登录 |
| 获取数据为空 | 非交易日或数据未同步 | 检查是否为交易日，盘后数据是否已下载 |
| 板块创建失败 | 权限不足或编码错误 | 以管理员身份运行 |

---

## 九、版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| 1.0.0 | 2026-02 | 初始版本 |

---

## 十、关联文档

| 文档 | 路径 |
|------|------|
| 原始开发文档 | [分析文档并输出Skill方案.md](file:///d:/agentsTeam/.trae/documents/skills+doc/分析文档并输出Skill方案.md) |
| 定时任务配置 | [检查系统定时任务配置.md](file:///d:/agentsTeam/.trae/documents/skills+doc/检查系统定时任务配置.md) |
| Skill目录大纲 | [Skill签约目录大纲.md](file:///d:/agentsTeam/.trae/documents/skills+doc/Skill签约目录大纲.md) |
