# Skill 安装包: tdx-realtime-monitor (通达信实时板块监控)

> **Skill名称:** tdx-realtime-monitor
> **版本:** 1.0.0
> **分类:** 股票实时监控
> **状态:** 待签约

---

## 一、Skill 概述

盘中交易时间监控通达信自定义板块（如"3倍量YYYYMMDD"）的实时价格和成交量，当股票涨幅超过配置阈值时触发预警，支持飞书Webhook通知。

---

## 二、安装信息

### 2.1 代码位置

| 项目 | 路径 |
|------|------|
| **Skill根目录** | `d:\agentsTeam\skills\nanobot\tdx-realtime-monitor\` |
| **SKILL.md** | `d:\agentsTeam\skills\nanobot\tdx-realtime-monitor\SKILL.md` |
| **核心脚本** | `d:\agentsTeam\skills\nanobot\tdx-realtime-monitor\scripts\tdx_sector_monitor.py` |
| **测试脚本** | `d:\agentsTeam\skills\nanobot\tdx-realtime-monitor\scripts\test_tdx_monitor.py` |
| **测试文档** | `d:\agentsTeam\skills\nanobot\tdx-realtime-monitor\TESTING.md` |

### 2.2 环境依赖

| 依赖项 | 版本要求 | 安装方式 |
|--------|----------|----------|
| Python | 3.8+ | 系统自带 |
| tqcenter | 最新版 | 随通达信安装 |
| 通达信金融终端 | 量化版 | 官方安装 |

### 2.3 通达信配置

| 配置项 | 值 |
|--------|-----|
| **通达信安装路径** | `C:\new_tdx_test` |
| **PYPlugins路径** | `C:\new_tdx_test\PYPlugins\user` |
| **可执行文件** | `C:\new_tdx_test\tdxw.exe` |

---

## 三、核心功能

### 3.1 功能列表

| # | 功能 | 说明 |
|---|------|------|
| 1 | **板块监控** | 监控指定通达信自定义板块成分股 |
| 2 | **多板块支持** | 可同时监控多个历史板块，自动合并去重 |
| 3 | **批量数据获取** | 使用 `tq.get_market_data()` 批量获取行情 |
| 4 | **涨幅预警** | 可配置涨幅阈值（默认5%），超过时触发预警 |
| 5 | **防抖机制** | 10秒内同一股票不重复预警 |
| 6 | **交易时间检查** | 只在交易时间监控（9:30-11:30, 13:00-15:00） |
| 7 | **飞书通知** | 支持 Webhook 推送预警消息 |

### 3.2 监控流程

```
1. 解析命令行参数
2. 获取板块成分股列表
3. 进入监控循环:
   a. 检查是否在交易时间
   b. 批量获取股票最新行情
   c. 计算涨跌幅
   d. 判断是否超过阈值
   e. 触发预警（含防抖）
   f. 发送飞书通知（如配置）
   g. 等待轮询间隔
4. 信号处理优雅退出
```

---

## 四、使用方法

### 4.1 命令行参数

```bash
python tdx_sector_monitor.py [选项]
```

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--sector` | 板块名称（如: "3倍量20260226"） | - |
| `--days` | 监控最近N个交易日的板块 | - |
| `--threshold` | 涨幅阈值百分比 | 5.0 |
| `--interval` | 轮询间隔（秒） | 5 |
| `--output` | 日志输出目录 | `./output/realtime_monitor` |
| `--feishu-webhook` | 飞书Webhook URL | - |

### 4.2 使用示例

```bash
# 监控指定板块
cd d:\agentsTeam\skills\nanobot\tdx-realtime-monitor
python scripts\tdx_sector_monitor.py --sector "3倍量20260226"

# 监控最近5天的板块
python scripts\tdx_sector_monitor.py --days 5

# 自定义阈值和轮询间隔
python scripts\tdx_sector_monitor.py --sector "3倍量20260226" --threshold 3.0 --interval 3

# 带飞书通知
python scripts\tdx_sector_monitor.py --sector "3倍量20260226" --feishu-webhook "https://open.feishu.cn/..."
```

### 4.3 输出

| 输出 | 说明 |
|------|------|
| **控制台** | 实时监控状态、预警信息 |
| **日志文件** | `monitor_YYYYMMDD.log` |
| **飞书消息** | 预警时推送（如配置Webhook） |

---

## 五、接口说明

### 5.1 主要类与函数

| 类/函数 | 文件 | 说明 |
|---------|------|------|
| `StockAlert` | `tdx_sector_monitor.py` | 股票预警记录数据结构 |
| `SectorConfig` | `tdx_sector_monitor.py` | 板块配置数据结构 |
| `setup_logging(output_dir)` | `tdx_sector_monitor.py` | 日志配置 |
| `is_trading_hours()` | `tdx_sector_monitor.py` | 检查是否在交易时间 |
| `get_sectors_from_days(days)` | `tdx_sector_monitor.py` | 获取最近N天的板块 |
| `monitor_sectors(sectors, config)` | `tdx_sector_monitor.py` | 监控主循环 |

### 5.2 全局配置

```python
DEFAULT_THRESHOLD = 5.0      # 默认涨幅阈值 5%
DEFAULT_INTERVAL = 5         # 默认轮询间隔 5秒
DEFAULT_ANTI_SHAKE = 10      # 防抖间隔 10秒
```

---

## 六、集成关系

### 6.1 上游依赖

| Skill/服务 | 关系 | 说明 |
|------------|------|------|
| 通达信金融终端 | **强依赖** | 必须启动并登录 |
| tqcenter 模块 | **强依赖** | 通达信量化平台接口 |
| triple-volume-picker | **数据依赖** | 消费其创建的3倍量板块 |

### 6.2 下游消费

| Skill/服务 | 关系 | 说明 |
|------------|------|------|
| 飞书Webhook | 可选通知 | 发送预警消息到飞书群聊 |

---

## 七、测试验证

### 7.1 单元测试

```bash
python scripts\test_tdx_monitor.py
```

| 测试项 | 说明 |
|--------|------|
| 交易时间检查 | 验证交易时间判断逻辑 |
| 预警管理器 | 验证防抖机制 |
| 日志配置 | 验证日志输出 |
| 参数解析 | 验证命令行参数 |

### 7.2 集成测试

```bash
# 单板块监控测试
python scripts\tdx_sector_monitor.py --sector "3倍量20260226" --threshold 5.0

# 多板块监控测试
python scripts\tdx_sector_monitor.py --days 5
```

---

## 八、故障排查

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| 无法导入 tqcenter | 通达信路径错误 | 检查 `C:\new_tdx_test\PYPlugins\user` |
| 板块不存在 | 板块名称错误或未创建 | 检查通达信板块列表 |
| 无预警触发 | 阈值设置过高或股票未涨 | 降低阈值测试 |
| 飞书通知失败 | Webhook URL错误 | 检查飞书机器人配置 |

---

## 九、版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| 1.0.0 | 2026-02-26 | 初始版本 |

---

## 十、关联文档

| 文档 | 路径 |
|------|------|
| 原始开发文档 | [分析文档并输出Skill方案.md](file:///d:/agentsTeam/.trae/documents/skills+doc/分析文档并输出Skill方案.md) |
| 测试文档 | `TESTING.md` (同目录) |
| Skill目录大纲 | [Skill签约目录大纲.md](file:///d:/agentsTeam/.trae/documents/skills+doc/Skill签约目录大纲.md) |
