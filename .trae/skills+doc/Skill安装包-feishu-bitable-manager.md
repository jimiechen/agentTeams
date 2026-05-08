# Skill 安装包: feishu-bitable-manager (飞书多维表格管理器)

> **Skill名称:** feishu-bitable-manager
> **版本:** 1.0.0
> **分类:** 飞书集成与通知
> **状态:** 待签约

---

## 一、Skill 概述

飞书多维表格管理工具，用于创建和管理通达信3倍量选股追踪系统。包含创建多维表格、盘后维护提醒、每日复盘告警、突破检测、形态分析等功能。

---

## 二、安装信息

### 2.1 代码位置

| 项目 | 路径 |
|------|------|
| **Skill根目录** | `d:\agentsTeam\skills\nanobot\feishu-bitable-manager\` |
| **SKILL.md** | `d:\agentsTeam\skills\nanobot\feishu-bitable-manager\SKILL.md` |
| **创建表格** | `scripts/create_bitable.py` |
| **盘后提醒** | `scripts/send_postmarket_reminder.py` |
| **每日复盘** | `scripts/daily_review.py` |
| **通达信选股** | `scripts/tdx_to_bitable.py` |
| **定时任务** | `scripts/run_triple_volume_task.ps1` |
| **数据同步检查** | `scripts/check_tdx_data_sync.py` |
| **调度器** | `scripts/scheduler.py` |
| **飞书通知** | `scripts/feishu_notifier.py` |
| **配置** | `scripts/scheduler_config.json` |
| **输出目录** | `d:\agentsTeam\skills\nanobot\feishu-bitable-manager\output\` |

### 2.2 环境依赖

| 依赖项 | 版本要求 | 安装方式 |
|--------|----------|----------|
| Python | 3.7+ | 系统自带 |
| requests | 最新版 | `pip install requests` |
| akshare | 最新版 | `pip install akshare` |
| tqcenter | 最新版 | 随通达信安装 |
| PowerShell | - | Windows系统自带 |

### 2.3 环境变量

| 变量名 | 说明 |
|--------|------|
| `FEISHU_APP_ID` | 飞书应用ID |
| `FEISHU_APP_SECRET` | 飞书应用密钥 |
| `FEISHU_APP_TOKEN` | 多维表格App Token |
| `FEISHU_TABLE_ID` | 多维表格Table ID |
| `FEISHU_CHAT_ID` | 飞书群聊ID |

---

## 三、核心功能

### 3.1 功能列表

| # | 功能 | 说明 |
|---|------|------|
| 1 | **创建多维表格** | 创建"通达信3倍量选股追踪"多维表格应用 |
| 2 | **盘后维护提醒** | 每日15:00自动发送盘后数据维护提醒 |
| 3 | **每日复盘告警** | 每日15:30自动复盘在池股票 |
| 4 | **突破检测** | 检查收盘价是否突破入池最高价/收盘价 |
| 5 | **形态分析** | 底分型、阳包阴、地量计算 |
| 6 | **数据同步检查** | 选股前置的通达信数据同步验证 |
| 7 | **定时任务调度** | Windows任务计划程序统一管理 |

### 3.2 数据表字段

| 字段名 | 类型 | 说明 |
|--------|------|------|
| 入池日期 | 日期 | 首次三倍量入池日期 |
| 股票代码 | 文本 | 股票代码 |
| 股票名称 | 文本 | 股票名称 |
| 入池开盘价 | 数字 | 入池当日开盘价 |
| 入池收盘价 | 数字 | 入池当日收盘价 |
| 入池最高价 | 数字 | 入池当日最高价 |
| 最新收盘价 | 数字 | 最新交易日收盘价 |
| 成交量 | 数字 | 入池当日成交量 |
| 3倍量确认 | 复选框 | 是否满足3倍量条件 |
| 突破最高价 | 复选框 | 是否突破入池最高价 |
| 突破收盘价 | 复选框 | 是否突破入池收盘价 |
| 突破告警 | 复选框 | 是否触发突破告警 |
| 告警时间 | 日期时间 | 突破告警触发时间 |
| 底分型 | 复选框 | 是否形成底分型 |
| 阳包阴 | 复选框 | 是否形成阳包阴形态 |
| 5日地量 | 复选框 | 是否为5日内最低成交量 |
| 10日地量 | 复选框 | 是否为10日内最低成交量 |
| 20日地量 | 复选框 | 是否为20日内最低成交量 |
| 30日地量 | 复选框 | 是否为30日内最低成交量 |
| 60日地量 | 复选框 | 是否为60日内最低成交量 |
| 形态得分 | 数字 | 触发的形态数量统计 |
| 备注 | 文本 | 其他备注信息 |

---

## 四、使用方法

### 4.1 创建多维表格

```bash
cd d:\agentsTeam\skills\nanobot\feishu-bitable-manager
python scripts\create_bitable.py --name "通达信3倍量选股追踪" --config bitable_config.json
```

参数：
- `--name`: 应用名称（默认：通达信3倍量选股追踪）
- `--folder`: 文件夹Token（可选）
- `--config`: 配置文件保存路径（默认：bitable_config.json）

### 4.2 发送盘后维护提醒

```bash
python scripts\send_postmarket_reminder.py --chat <chat_id>
```

### 4.3 执行每日复盘

```bash
python scripts\daily_review.py --app-token <app_token> --table-id <table_id> --chat <chat_id>
```

### 4.4 执行通达信选股并同步

```bash
python scripts\tdx_to_bitable.py
```

### 4.5 调度器管理

```bash
# 配置参数（只需执行一次）
python scripts\scheduler.py --app-token <token> --table-id <id> --chat <chat_id> --python-path <path>

# 设置定时任务
python scripts\scheduler.py --setup

# 查看任务状态
python scripts\scheduler.py --list

# 移除定时任务
python scripts\scheduler.py --remove

# 立即执行盘后提醒（测试用）
python scripts\scheduler.py --run-reminder

# 立即执行每日复盘（测试用）
python scripts\scheduler.py --run-review
```

---

## 五、定时任务配置

### 5.1 Windows 任务计划程序

| 任务名称 | 执行时间 | 执行命令 | 状态 |
|----------|----------|----------|------|
| **Nanobot_TripleVolume_Daily** | 每天 15:30:30 | `powershell.exe -File run_triple_volume_task.ps1` | ✅ 活跃 |
| **TripleVolume_PostmarketReminder** | 每天 15:00:00 | `python send_postmarket_reminder.py` | ⚠️ 需nanobot |
| **TripleVolume_DailyReview** | 每天 15:30:30 | `python daily_review.py` | ⚠️ 需nanobot |

### 5.2 主选股任务执行流程

```
15:30 定时任务触发 (Nanobot_TripleVolume_Daily)
    ↓
[Step 1/2] 数据同步检查 (check_tdx_data_sync.py)
    ↓ 随机选择大盘股检查今日数据
    ↓ 数据已同步?
    ├── Yes → [Step 2/2] 执行选股 (tdx_to_bitable.py)
    │           ↓
    │       执行3倍量选股
    │           ↓
    │       保存结果到CSV/JSON
    │           ↓
    │       创建通达信板块
    │           ↓
    │       同步到飞书多维表格
    └── No  → 中止任务，记录日志
```

### 5.3 数据同步检查

| 检查项 | 说明 |
|--------|------|
| **检查股票池** | 000001.SZ, 000002.SZ, 600000.SH, 600519.SH, 000858.SZ |
| **检查逻辑** | 随机选择一只股票，验证今日数据是否已同步 |
| **通过条件** | 数据日期为当天，收盘价和成交量有效 |
| **失败处理** | 脚本退出(exit 1)，不执行选股 |

---

## 六、告警规则

### 6.1 突破告警

| 告警类型 | 触发条件 | 优先级 | 消息内容 |
|----------|----------|--------|----------|
| 突破最高价 | 最新收盘价 > 入池最高价 | 高 | 🚨 突破最高价告警 |
| 突破收盘价 | 最新收盘价 > 入池收盘价 | 中 | 📈 突破收盘价提醒 |
| 双突破 | 同时突破最高价和收盘价 | 高 | 🔥 强势突破告警 |

### 6.2 形态告警

| 告警类型 | 触发条件 | 优先级 |
|----------|----------|--------|
| 高形态得分 | 形态得分 ≥ 3 | 高 |
| 强势信号 | 底分型 + 阳包阴 | 高 |

---

## 七、数据录入流程

```
15:00 收盘
  │
  ▼
发送盘后维护提醒
  │
  ▼
操作员完成通达信盘后数据下载
  │
  ▼
执行三倍量选股
  │
  ▼
录入选股结果到多维表格
  │
  ▼
15:30 自动复盘
  │
  ▼
更新最新收盘价
检查突破状态
形态分析
  │
  ▼
发送告警消息
```

---

## 八、集成关系

### 8.1 上游依赖

| Skill/服务 | 关系 | 说明 |
|------------|------|------|
| triple-volume-picker | **数据依赖** | 获取选股结果 |
| 通达信金融终端 | **强依赖** | 数据源 |
| 飞书应用 | **强依赖** | 通知和表格存储 |

### 8.2 下游消费

| Skill/服务 | 关系 | 说明 |
|------------|------|------|
| 飞书群聊 | 消息推送 | 发送提醒和告警 |
| 飞书多维表格 | 数据存储 | 存储选股和复盘数据 |

---

## 九、故障排查

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| 飞书通知失败 | AppID/Secret错误 | 检查环境变量配置 |
| 表格创建失败 | 权限不足 | 检查飞书应用权限 |
| 数据同步检查失败 | 通达信未启动 | 启动通达信并下载盘后数据 |
| 选股脚本异常 | 通达信连接冲突 | 确保无其他进程连接通达信 |
| 复盘任务失败 | nanobot未启动 | 启动nanobot gateway |

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
| 改造监控文档 | [改造股票监控系统，整合通达信数据.md](file:///d:/agentsTeam/.trae/documents/skills+doc/改造股票监控系统，整合通达信数据.md) |
| Skill目录大纲 | [Skill签约目录大纲.md](file:///d:/agentsTeam/.trae/documents/skills+doc/Skill签约目录大纲.md) |
