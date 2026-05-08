---
name: "feishu-bitable-manager"
description: "飞书多维表格管理工具，用于创建通达信3倍量选股追踪系统。支持创建多维表格、盘后维护提醒、每日复盘告警等功能。Invoke when user wants to create Feishu Bitable for stock tracking, setup postmarket reminders, or configure daily review alerts."
---

# 飞书多维表格管理器

飞书多维表格管理工具，用于创建和管理通达信3倍量选股追踪系统。

## 功能

1. **创建多维表格应用**
   - 创建"通达信3倍量选股追踪"多维表格
   - 配置完整的数据表字段（入池日期、价格、形态分析等）
   - 生成配置文件供后续脚本使用

2. **盘后维护提醒**
   - 每日15:00自动发送盘后数据维护提醒
   - 提醒操作员完成通达信盘后数据下载
   - 指导三倍量选股入池操作

3. **每日复盘告警**
   - 每日15:30自动复盘在池股票
   - 检查收盘价是否突破入池最高价/收盘价
   - 触发突破告警并发送飞书消息
   - 形态分析（底分型、阳包阴、地量计算）

## 数据表字段

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

## 使用方式

### 1. 创建多维表格应用

```bash
python scripts/create_bitable.py --name "通达信3倍量选股追踪" --config bitable_config.json
```

参数：
- `--name`: 应用名称（默认：通达信3倍量选股追踪）
- `--folder`: 文件夹Token（可选）
- `--config`: 配置文件保存路径（默认：bitable_config.json）

环境变量：
- `FEISHU_APP_ID`: 飞书应用ID
- `FEISHU_APP_SECRET`: 飞书应用密钥

输出：
- 应用Token
- 数据表ID
- 应用链接
- 配置文件（bitable_config.json）

### 2. 发送盘后维护提醒

```bash
python scripts/send_postmarket_reminder.py --chat <chat_id>
```

参数：
- `--chat`: 飞书群聊ID

提醒内容包含：
- 通达信盘后数据下载指引
- 三倍量选股操作步骤
- 数据录入指引

### 3. 执行每日复盘

```bash
python scripts/daily_review.py --app-token <app_token> --table-id <table_id> --chat <chat_id>
```

参数：
- `--app-token`: 多维表格应用Token
- `--table-id`: 数据表ID
- `--chat`: 飞书群聊ID

复盘功能：
- 获取所有在池股票的最新收盘价
- 对比入池最高价和收盘价
- 更新突破状态字段
- 触发突破告警（突破最高价、突破收盘价、双突破）
- 对新入池股票进行形态分析
- 发送告警消息到飞书群聊

## 定时任务配置

### 使用调度器脚本（推荐）

我们提供了一个统一的调度器脚本来管理所有定时任务：

```bash
# 1. 配置参数（只需执行一次）
python scripts/scheduler.py \
  --app-token <app_token> \
  --table-id <table_id> \
  --chat <chat_id> \
  --python-path <python_path>

# 2. 设置定时任务
python scripts/scheduler.py --setup

# 3. 查看任务状态
python scripts/scheduler.py --list

# 4. 移除定时任务
python scripts/scheduler.py --remove

# 5. 立即执行盘后提醒（测试用）
python scripts/scheduler.py --run-reminder

# 6. 立即执行每日复盘（测试用）
python scripts/scheduler.py --run-review
```

### 手动配置（Linux/Mac crontab）

```bash
# 每日15:00发送盘后维护提醒
0 15 * * 1-5 cd /path/to/feishu-bitable-manager && python scripts/send_postmarket_reminder.py --chat oc_xxx >> logs/reminder.log 2>&1

# 每日15:30执行复盘
30 15 * * 1-5 cd /path/to/feishu-bitable-manager && python scripts/daily_review.py --app-token xxx --table-id xxx --chat oc_xxx >> logs/review.log 2>&1
```

### 手动配置（Windows 任务计划程序）

如果不使用调度器脚本，可以手动创建两个定时任务：

1. **盘后提醒任务**
   - 触发器：每天 15:00
   - 操作：启动程序
   - 程序：`python`
   - 参数：`scripts/send_postmarket_reminder.py --chat oc_xxx`

2. **每日复盘任务**
   - 触发器：每天 15:30
   - 操作：启动程序
   - 程序：`python`
   - 参数：`scripts/daily_review.py --app-token xxx --table-id xxx --chat oc_xxx`

## 告警规则

### 突破告警

| 告警类型 | 触发条件 | 优先级 | 消息内容 |
|----------|----------|--------|----------|
| 突破最高价 | 最新收盘价 > 入池最高价 | 高 | 🚨 突破最高价告警 |
| 突破收盘价 | 最新收盘价 > 入池收盘价 | 中 | 📈 突破收盘价提醒 |
| 双突破 | 同时突破最高价和收盘价 | 高 | 🔥 强势突破告警 |

### 形态告警

| 告警类型 | 触发条件 | 优先级 | 消息内容 |
|----------|----------|--------|----------|
| 高形态得分 | 形态得分 ≥ 3 | 高 | 📊 高形态得分提醒 |
| 强势信号 | 底分型 + 阳包阴 | 高 | 📊 高形态得分提醒 |

## 数据录入流程

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

## 依赖

```bash
pip install requests akshare
```

## 配置文件示例

`bitable_config.json`:
```json
{
  "app_token": "bascnxxx",
  "table_id": "tblxxx",
  "created_at": "2024-02-25T15:30:00"
}
```

## 环境变量

```bash
export FEISHU_APP_ID="cli_xxx"
export FEISHU_APP_SECRET="xxx"
export BITABLE_URL="https://www.feishu.cn/base/xxx"
```

## 注意事项

1. 确保飞书应用有发送消息和访问多维表格的权限
2. 股票数据通过akshare获取，需要网络连接
3. 定时任务只在交易日执行（周一到周五）
4. 突破告警只在首次突破时触发
5. 形态分析只对新入池的股票执行
