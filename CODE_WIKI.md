# Trae Agent Team 项目 Code Wiki

## 目录

- [项目概述](#项目概述)
- [项目架构](#项目架构)
- [主要模块职责](#主要模块职责)
- [关键类与函数](#关键类与函数)
- [依赖关系](#依赖关系)
- [项目运行方式](#项目运行方式)
- [技能系统](#技能系统)

---

## 项目概述

### 项目简介

Trae Agent Team 是一个基于 Trae IDE 的智能代理协作平台，主要功能包括：

1. **CDP 自动化**：通过 Chrome DevTools Protocol 自动化 Trae IDE 的 Chat 交互
2. **飞书集成**：通过飞书 Bot 接收指令并返回结果
3. **多智能体协作**：多个智能体协同工作（PMCLI、DEVCLI、WikiBot 等）
4. **股票分析系统**：集成通达信股票分析功能（3倍量选股、实时监控等）
5. **心跳检测与自愈**：三层心跳检测机制，自动恢复异常状态

### 项目目标

- 验证 Trae IDE 可通过 CDP 协议自动化操控
- 实现飞书 Bot 与 Trae IDE 的双向交互
- 构建多智能体协作工作流
- 提供股票分析自动化工具集

### 核心特性

- ✅ CDP 协议自动化 Trae IDE 交互
- ✅ 飞书机器人消息接收与回复
- ✅ 多工作空间并行处理
- ✅ 三层心跳检测与自愈机制
- ✅ WikiBot 文档蒸馏与合并
- ✅ 通达信股票分析技能系统

---

## 项目架构

### 整体架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                        飞书 (Lark)                              │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐              │
│  │  PMCLI Bot │  │ DEVCLI Bot │  │ WikiBot    │              │
│  └─────┬──────┘  └─────┬──────┘  └─────┬──────┘              │
└────────┼───────────────┼───────────────┼───────────────────────┘
         │               │               │
         └───────────────┴───────────────┘
                         │
         ┌───────────────▼───────────────┐
         │    MVP Runner (Node.js)       │
         │  ┌─────────────────────────┐ │
         │  │  MultiTaskRunner        │ │
         │  └───────────┬─────────────┘ │
         │  ┌───────────▼─────────────┐ │
         │  │  LarkBot / WikiBotHandler│ │
         │  └───────────┬─────────────┘ │
         └──────────────┼───────────────┘
                        │
         ┌──────────────▼───────────────┐
         │    CDP Client (Chrome DevTools)│
         └──────────────┬───────────────┘
                        │
         ┌──────────────▼───────────────┐
         │    Trae IDE (Electron App)   │
         └──────────────────────────────┘
                        │
         ┌──────────────▼───────────────┐
         │    技能系统 (Skills)          │
         │  - feishu-bitable-manager    │
         │  - triple-volume-picker      │
         │  - tdx-realtime-monitor      │
         │  - tlby-automation           │
         │  - tdx-test-screenshot       │
         └──────────────────────────────┘
```

### 目录结构

```
/workspace
├── .trae/                           # Trae IDE 配置
│   ├── agents/                      # 智能体配置
│   │   ├── ai-prompt-eng.md
│   │   ├── architect.md
│   │   ├── core-dev.md
│   │   ├── devops-eng.md
│   │   ├── pm-lead.md
│   │   ├── qa-expert.md
│   │   └── security-reviewer.md
│   ├── skills/                      # 技能系统
│   │   ├── feishu-bitable-manager/  # 飞书多维表格管理
│   │   ├── tdx-3bl-updater/         # 通达信3倍量更新
│   │   ├── tdx-realtime-monitor/    # 实时监控
│   │   ├── tdx-test-screenshot/     # 截图功能
│   │   ├── tlby-automation/         # 天龙博弈自动化
│   │   └── triple-volume-picker/    # 3倍量选股
│   └── agents.config.yaml           # 智能体配置文件
├── mvp-runner/                      # MVP 运行器
│   ├── src/                         # 源代码
│   │   ├── cdp/                     # CDP 客户端
│   │   ├── lark/                    # 飞书集成
│   │   ├── actions/                 # 动作模块
│   │   ├── heartbeat/               # 心跳检测
│   │   ├── wikibot/                 # WikiBot
│   │   ├── skills/                  # 技能模块
│   │   ├── utils/                   # 工具函数
│   │   └── index.ts                 # 入口文件
│   ├── config/                      # 配置文件
│   └── package.json                 # 依赖配置
├── exec-units/                      # 执行单元配置
│   ├── chat-fill.yaml
│   ├── chat-mutex.yaml
│   ├── git-auto-commit.yaml
│   ├── lark-terminal.yaml
│   └── ui-recognizer.yaml
├── docs/                            # 文档
│   ├── prd/                         # PRD 文档
│   └── Tabbit/                      # Tabbit 相关
├── heartbeat-scheme/                # 心跳方案设计
├── comms/                           # 通信与报告
│   ├── reports/                     # 报告
│   └── research/                    # 研究文档
├── package.json                     # 根项目依赖
└── README.md                        # 项目说明
```

### 技术栈

| 组件 | 技术 |
|------|------|
| 运行时 | Node.js 20+ |
| 编程语言 | TypeScript |
| CDP 协议 | chrome-remote-interface |
| 飞书 SDK | @larksuiteoapi/node-sdk |
| 配置管理 | dotenv + yaml |
| 并发控制 | async-mutex, p-queue, p-retry |
| 日志 | debug |
| 股票分析 | Python + tqcenter (通达信量化) |

---

## 主要模块职责

### 1. MVP Runner 模块 ([mvp-runner/](file:///workspace/mvp-runner/))

**核心职责**：
- 启动和管理整个系统
- 协调飞书 Bot 与 Trae IDE 的交互
- 处理多工作空间任务
- 管理心跳检测与自愈机制

**主要文件**：
- [src/index.ts](file:///workspace/mvp-runner/src/index.ts) - 程序入口
- [src/runner-multi.ts](file:///workspace/mvp-runner/src/runner-multi.ts) - 多任务运行器
- [src/runner.ts](file:///workspace/mvp-runner/src/runner.ts) - 单任务运行器
- [src/config.ts](file:///workspace/mvp-runner/src/config.ts) - 配置加载

### 2. CDP Client 模块 ([mvp-runner/src/cdp/](file:///workspace/mvp-runner/src/cdp/))

**核心职责**：
- 建立与 Trae IDE 的 CDP 连接
- 提供 DOM 操作、Runtime 执行、输入模拟等能力
- 心跳保活与自动重连

**主要文件**：
- [client.ts](file:///workspace/mvp-runner/src/cdp/client.ts) - CDP 客户端实现

**关键功能**：
- 连接 Trae IDE 的主 WebView Target
- 启用 Runtime、DOM、Input、Page 等域
- 10秒间隔心跳检测（可配置）
- 指数退避自动重连（最多5次）

### 3. 飞书集成模块 ([mvp-runner/src/lark/](file:///workspace/mvp-runner/src/lark/))

**核心职责**：
- 接收飞书群消息
- 解析 @提及指令
- 发送文本、富文本、卡片消息
- 上传文档到飞书云文档

**主要文件**：
- [client.ts](file:///workspace/mvp-runner/src/lark/client.ts) - 飞书 Bot 客户端
- [parser.ts](file:///workspace/mvp-runner/src/lark/parser.ts) - 消息解析器
- [lark-doc-uploader.ts](file:///workspace/mvp-runner/src/lark-doc-uploader.ts) - 文档上传

**支持的回复模式**：
- `post` - 富文本消息
- `card` - 交互式卡片 + 云文档
- `hybrid` - 混合模式

### 4. Actions 动作模块 ([mvp-runner/src/actions/](file:///workspace/mvp-runner/src/actions/))

**核心职责**：
- 封装 Trae IDE 的常见操作
- 提供可复用的动作单元

**主要动作**：
- [fill-prompt.ts](file:///workspace/mvp-runner/src/actions/fill-prompt.ts) - 填充 Prompt
- [submit.ts](file:///workspace/mvp-runner/src/actions/submit.ts) - 提交消息
- [wait-response.ts](file:///workspace/mvp-runner/src/actions/wait-response.ts) - 等待响应
- [switch-task.ts](file:///workspace/mvp-runner/src/actions/switch-task.ts) - 切换任务
- [scan-tasks.ts](file:///workspace/mvp-runner/src/actions/scan-tasks.ts) - 扫描任务列表
- [recover.ts](file:///workspace/mvp-runner/src/actions/recover.ts) - 异常恢复

### 5. 心跳检测模块 ([mvp-runner/src/heartbeat/](file:///workspace/mvp-runner/src/heartbeat/))

**核心职责**：
- 三层心跳检测机制
- 健康状态机管理
- 自动恢复执行器

**主要文件**：
- [detector.ts](file:///workspace/mvp-runner/src/heartbeat/detector.ts) - 心跳检测器
- [state-machine.ts](file:///workspace/mvp-runner/src/heartbeat/state-machine.ts) - 状态机
- [recovery-executor.ts](file:///workspace/mvp-runner/src/heartbeat/recovery-executor.ts) - 恢复执行器
- [layer1.ts](file:///workspace/mvp-runner/src/heartbeat/layer1.ts) - 第一层快速检测

**三层检测**：
- **Layer 1** - 快速检测：CDP 连接状态
- **Layer 2** - 内容检测：DOM 元素可见性
- **Layer 3** - 深度检测：完整交互流程

### 6. WikiBot 模块 ([mvp-runner/src/wikibot/](file:///workspace/mvp-runner/src/wikibot/))

**核心职责**：
- 文档蒸馏 (distill)：从 PMCLI/DEVCLI 提取关键信息
- 文档合并 (merge)：合并更新到知识库
- 状态查询 (status)：查看系统状态

**主要文件**：
- [index.ts](file:///workspace/mvp-runner/src/wikibot/index.ts) - WikiBot 入口
- [handler.ts](file:///workspace/mvp-runner/src/wikibot/handler.ts) - 消息处理器
- [query.ts](file:///workspace/mvp-runner/src/wikibot/query.ts) - 查询处理

**相关技能**：
- [wiki-distill.ts](file:///workspace/mvp-runner/src/skills/wiki-distill.ts) - 蒸馏技能
- [wiki-merge.ts](file:///workspace/mvp-runner/src/skills/wiki-merge.ts) - 合并技能
- [wiki-scheduler.ts](file:///workspace/mvp-runner/src/skills/wiki-scheduler.ts) - 调度器

### 7. 技能系统 ([.trae/skills/](file:///workspace/.trae/skills/))

#### 7.1 飞书多维表格管理 ([feishu-bitable-manager/](file:///workspace/.trae/skills/feishu-bitable-manager/))

**功能**：
- 创建"通达信3倍量选股追踪"多维表格
- 盘后维护提醒（每日15:00）
- 每日复盘告警（每日15:30）
- 突破检测与形态分析

**主要脚本**：
- [create_bitable.py](file:///workspace/.trae/skills/feishu-bitable-manager/scripts/create_bitable.py) - 创建多维表格
- [send_postmarket_reminder.py](file:///workspace/.trae/skills/feishu-bitable-manager/scripts/send_postmarket_reminder.py) - 发送盘后提醒
- [daily_review.py](file:///workspace/.trae/skills/feishu-bitable-manager/scripts/daily_review.py) - 每日复盘
- [scheduler.py](file:///workspace/.trae/skills/feishu-bitable-manager/scripts/scheduler.py) - 定时任务调度器

#### 7.2 三倍量选股 ([triple-volume-picker/](file:///workspace/.trae/skills/triple-volume-picker/))

**功能**：
- 从通达信量化平台获取全市场数据
- 筛选当日成交量 ≥ 前日3倍的股票
- 自动创建通达信自定义板块

**主要脚本**：
- [tdx_triple_volume.py](file:///workspace/.trae/skills/triple-volume-picker/scripts/tdx_triple_volume.py) - 主选股脚本
- [trading_calendar.py](file:///workspace/.trae/skills/triple-volume-picker/scripts/trading_calendar.py) - 交易日历

**技术依赖**：
- Python 3.7+
- tqcenter (通达信量化平台接口)
- pandas

#### 7.3 其他技能

- **tdx-realtime-monitor** - 实时监控自定义板块股票
- **tlby-automation** - 天龙博弈股票软件自动化
- **tdx-test-screenshot** - 通达信截图功能
- **tdx-3bl-updater** - 3倍量数据更新器

### 8. 执行单元配置 ([exec-units/](file:///workspace/exec-units/))

**配置文件**：
- [chat-fill.yaml](file:///workspace/exec-units/chat-fill.yaml) - 聊天填充
- [chat-mutex.yaml](file:///workspace/exec-units/chat-mutex.yaml) - 聊天互斥
- [git-auto-commit.yaml](file:///workspace/exec-units/git-auto-commit.yaml) - Git 自动提交
- [lark-terminal.yaml](file:///workspace/exec-units/lark-terminal.yaml) - 飞书终端
- [ui-recognizer.yaml](file:///workspace/exec-units/ui-recognizer.yaml) - UI 识别

---

## 关键类与函数

### MVP Runner 核心类

#### 1. `CDPClient` ([src/cdp/client.ts](file:///workspace/mvp-runner/src/cdp/client.ts))

```typescript
class CDPClient {
  constructor(opts: CDPClientOptions = {})
  async connect(): Promise<void>
  async disconnect(): void
  async evaluate<T = any>(expression: string, returnByValue = true): Promise<T>
  
  // 域对象
  Runtime: CDP.StableDomains['Runtime']
  DOM: CDP.StableDomains['DOM']
  Input: CDP.StableDomains['Input']
  Page: CDP.StableDomains['Page']
}
```

**主要方法**：
- `connect()` - 连接 Trae IDE，启用相关域，启动心跳
- `disconnect()` - 断开连接，停止心跳
- `evaluate()` - 执行 JavaScript 表达式
- `isConnected` - 检查连接状态 getter

**心跳机制**：
- 每10秒发送一次心跳（可通过 `HEARTBEAT_INTERVAL_MS` 配置）
- 心跳失败触发自动重连
- 指数退避重连策略（1s, 2s, 4s, 8s, 16s）
- 最多重连5次

#### 2. `LarkBot` ([src/lark/client.ts](file:///workspace/mvp-runner/src/lark/client.ts))

```typescript
class LarkBot {
  constructor(opts: LarkBotOptions)
  async start(handler: MessageHandler): Promise<void>
  async sendText(text: string): Promise<void>
  async sendRichPost(content: any): Promise<void>
  async sendCard(card: any): Promise<void>
}
```

**主要功能**：
- 监听飞书群消息
- 解析 @提及指令
- 发送各种类型的消息
- 支持消息确认机制

#### 3. `MultiTaskRunner` ([src/runner-multi.ts](file:///workspace/mvp-runner/src/runner-multi.ts))

```typescript
class MultiTaskRunner {
  constructor(cfg: AppConfig, cdp: CDPClient, bots: LarkBot[], workspaces: Workspace[])
  async handle(msg: any, keyword: string): Promise<void>
}
```

**职责**：
- 管理多个工作空间
- 路由消息到对应的工作空间
- 协调任务执行

#### 4. `WikiBotHandler` ([src/wikibot/handler.ts](file:///workspace/mvp-runner/src/wikibot/handler.ts))

```typescript
class WikiBotHandler {
  constructor(cfg: WikiBotConfig, cdp: CDPClient, bot: LarkBot)
  shouldHandle(msg: any): boolean
  async handle(msg: any): Promise<void>
}
```

**支持的命令**：
- `@WikiBot distill` - 蒸馏文档
- `@WikiBot merge` - 合并文档
- `@WikiBot status` - 查询状态

### 动作模块函数

#### 1. `fillPrompt()` ([src/actions/fill-prompt.ts](file:///workspace/mvp-runner/src/actions/fill-prompt.ts))

```typescript
async function fillPrompt(cdp: CDPClient, text: string): Promise<void>
```

**功能**：
- 定位 Chat 输入框
- 清除现有内容
- 输入新的 Prompt 文本

#### 2. `submit()` ([src/actions/submit.ts](file:///workspace/mvp-runner/src/actions/submit.ts))

```typescript
async function submit(cdp: CDPClient): Promise<void>
```

**功能**：
- 模拟 Enter 键提交
- 支持 Cmd/Ctrl + Enter 降级
- 支持点击发送按钮降级

#### 3. `waitResponse()` ([src/actions/wait-response.ts](file:///workspace/mvp-runner/src/actions/wait-response.ts))

```typescript
async function waitResponse(cdp: CDPClient, timeoutMs: number): Promise<string>
```

**功能**：
- 监听 Network 事件（信号 A）
- 监听 DOM 变化（信号 B）
- 监听文本稳定（信号 C）
- 返回最终响应文本

#### 4. `switchTask()` ([src/actions/switch-task.ts](file:///workspace/mvp-runner/src/actions/switch-task.ts))

```typescript
async function switchTask(cdp: CDPClient, taskIndex: number): Promise<void>
```

**功能**：
- 定位任务列表
- 点击指定索引的任务项
- 等待页面稳定

### 心跳检测类

#### 1. `HeartbeatDetector` ([src/heartbeat/detector.ts](file:///workspace/mvp-runner/src/heartbeat/detector.ts))

```typescript
class HeartbeatDetector {
  constructor()
  async check(): Promise<HealthStatus>
  start(intervalMs: number): void
  stop(): void
}
```

#### 2. `HealthStateMachine` ([src/heartbeat/state-machine.ts](file:///workspace/mvp-runner/src/heartbeat/state-machine.ts))

```typescript
class HealthStateMachine {
  constructor()
  transition(event: HealthEvent): HealthState
  get currentState(): HealthState
}
```

**状态**：
- `HEALTHY` - 健康
- `DEGRADED` - 降级
- `UNHEALTHY` - 不健康
- `RECOVERING` - 恢复中

#### 3. `RecoveryExecutor` ([src/heartbeat/recovery-executor.ts](file:///workspace/mvp-runner/src/heartbeat/recovery-executor.ts))

```typescript
class RecoveryExecutor {
  constructor(cdp: CDPClient)
  async execute(strategy: RecoveryStrategy): Promise<boolean>
}
```

**恢复策略**：
- `RECONNECT_CDP` - 重连 CDP
- `REFRESH_PAGE` - 刷新页面
- `RECREATE_TAB` - 重建标签页
- `FULL_RESTART` - 完全重启

### 配置加载函数

#### `loadConfig()` ([src/config.ts](file:///workspace/mvp-runner/src/config.ts))

```typescript
function loadConfig(configPath = './config/pmbot.yaml'): AppConfig
```

**环境变量**：
- `LARK_APP_ID` - 飞书应用 ID（必需）
- `LARK_APP_SECRET` - 飞书应用密钥（必需）
- `LARK_CHAT_ID` - 飞书群聊 ID（必需）
- `LARK_MENTION_KEYWORD` - 提及关键词
- `LARK_REPLY_MODE` - 回复模式（post/card/hybrid）
- `LARK_ROOT_FOLDER_TOKEN` - 飞书云文档根文件夹
- `CDP_HOST` - CDP 主机（默认 localhost）
- `CDP_PORT` - CDP 端口（默认 9222）
- `HEARTBEAT_INTERVAL_MS` - 心跳间隔（默认 10000）
- `WIKIBOT_ENABLED` - 是否启用 WikiBot
- `WIKIBOT_SLOT_INDEX` - WikiBot 槽位索引
- `WIKIBOT_DISTILL_TIMEOUT` - 蒸馏超时（默认 600000）
- `WIKIBOT_MERGE_TIMEOUT` - 合并超时（默认 120000）

---

## 依赖关系

### 核心依赖树

```
mvp-runner (Node.js)
├── @larksuiteoapi/node-sdk ^1.36.0
│   └── 飞书开放平台 SDK
├── chrome-remote-interface ^0.33.2
│   └── Chrome DevTools Protocol 客户端
├── async-mutex ^0.5.0
│   └── 异步互斥锁
├── p-queue ^9.2.0
│   └── Promise 队列控制
├── p-retry ^6.2.0
│   └── Promise 重试
├── debug ^4.3.4
│   └── 调试日志
├── dotenv ^16.4.5
│   └── 环境变量加载
├── yaml ^2.3.4
│   └── YAML 解析
└── typescript ^5.3.3 (dev)
    └── TypeScript 编译器
```

### 技能系统依赖

#### Python 技能依赖

```
feishu-bitable-manager
├── requests
└── akshare

triple-volume-picker
├── tqcenter (通达信量化)
└── pandas

tdx-realtime-monitor
├── tqcenter
└── pandas

tlby-automation
└── (自动化操作依赖)

tdx-test-screenshot
└── (截图操作依赖)
```

### 外部依赖服务

| 服务 | 用途 | 必需 |
|------|------|------|
| Trae IDE | 自动化操控目标 | ✅ |
| 飞书开放平台 | 消息收发 | ✅ |
| 通达信金融终端 | 股票分析（技能用） | 可选 |
| 天龙博弈软件 | 股票分析（技能用） | 可选 |

---

## 项目运行方式

### 前置准备

#### 1. 环境要求

- Node.js 20+
- Python 3.7+（使用技能时）
- Trae IDE（需要以调试模式启动）

#### 2. 启动 Trae IDE 调试模式

```bash
# macOS
/Applications/Trae.app/Contents/MacOS/Trae --remote-debugging-port=9222 --remote-allow-origins=*

# Windows
"C:\Program Files\Trae\Trae.exe" --remote-debugging-port=9222 --remote-allow-origins=*

# Linux
trae --remote-debugging-port=9222 --remote-allow-origins=*
```

#### 3. 配置环境变量

复制 `.env.example` 为 `.env` 并填写：

```bash
cd mvp-runner
cp .env.example .env
# 编辑 .env 文件
```

必需配置项：
```env
LARK_APP_ID=cli_xxx
LARK_APP_SECRET=xxx
LARK_CHAT_ID=oc_xxx
```

可选配置项：
```env
LARK_MENTION_KEYWORD=PMCLI
LARK_REPLY_MODE=post
CDP_HOST=localhost
CDP_PORT=9222
WIKIBOT_ENABLED=false
```

#### 4. 安装依赖

```bash
cd mvp-runner
npm install
```

### 启动 MVP Runner

#### 开发模式

```bash
npm run dev
```

#### 生产模式

```bash
npm start
```

#### 其他可用命令

```bash
# 运行 MVP 模式
npm run mvp

# 测试选择器
npm run test:selectors

# 测试动作
npm run test:actions

# 解析任务内容
npm run parse

# 发送到 AI
npm run send

# 测试完整流程
npm run test:pipeline
```

### 使用方式

#### 1. 基本使用

在飞书群中 @Bot 发送消息：

```
@PMCLI 帮我写一个 Hello World 程序
```

#### 2. WikiBot 命令

```
@WikiBot distill  # 蒸馏文档
@WikiBot merge    # 合并文档
@WikiBot status   # 查询状态
```

### 技能系统使用

#### 三倍量选股

```bash
cd .trae/skills/triple-volume-picker
python scripts/tdx_triple_volume.py
```

#### 飞书多维表格管理

```bash
cd .trae/skills/feishu-bitable-manager

# 创建多维表格
python scripts/create_bitable.py --name "通达信3倍量选股追踪"

# 设置定时任务
python scripts/scheduler.py --setup

# 手动触发提醒
python scripts/scheduler.py --run-reminder

# 手动触发复盘
python scripts/scheduler.py --run-review
```

---

## 技能系统

### 技能列表

| 技能名称 | 目录 | 功能 | 语言 |
|----------|------|------|------|
| feishu-bitable-manager | [.trae/skills/feishu-bitable-manager/](file:///workspace/.trae/skills/feishu-bitable-manager/) | 飞书多维表格管理 | Python |
| triple-volume-picker | [.trae/skills/triple-volume-picker/](file:///workspace/.trae/skills/triple-volume-picker/) | 3倍量选股 | Python |
| tdx-realtime-monitor | [.trae/skills/tdx-realtime-monitor/](file:///workspace/.trae/skills/tdx-realtime-monitor/) | 实时监控 | Python |
| tlby-automation | [.trae/skills/tlby-automation/](file:///workspace/.trae/skills/tlby-automation/) | 天龙博弈自动化 | Python |
| tdx-test-screenshot | [.trae/skills/tdx-test-screenshot/](file:///workspace/.trae/skills/tdx-test-screenshot/) | 通达信截图 | Python |
| tdx-3bl-updater | [.trae/skills/tdx-3bl-updater/](file:///workspace/.trae/skills/tdx-3bl-updater/) | 3倍量更新 | Python |

### 技能配置

每个技能目录下都有 `SKILL.md` 文档，包含：
- 功能介绍
- 使用方法
- 依赖说明
- 示例代码

### 技能调用

技能可以通过以下方式调用：
1. 直接执行脚本
2. 通过 Trae IDE 的 Skill 系统
3. 集成到 MVP Runner 的工作流

---

## 开发指南

### 代码规范

- 使用 TypeScript 编写
- 遵循 ESLint 规则
- 使用 Prettier 格式化
- 提交前运行测试

### 测试

```bash
cd mvp-runner
npm run test:selectors
npm run test:actions
```

### 调试

```bash
# 启用所有调试日志
DEBUG=mvp:* npm run dev

# 启用特定模块日志
DEBUG=mvp:cdp,mvp:lark npm run dev
```

---

## 故障排查

### 常见问题

#### 1. CDP 连接失败

**症状**：`No matching target found`

**解决**：
- 确认 Trae IDE 已启动
- 确认使用了 `--remote-debugging-port=9222` 参数
- 检查端口是否被占用

#### 2. 飞书消息无响应

**症状**：发送消息后 Bot 无回复

**解决**：
- 检查 `.env` 配置是否正确
- 确认飞书应用权限已配置
- 查看控制台日志

#### 3. 心跳频繁失败

**症状**：频繁触发重连

**解决**：
- 增加心跳间隔：`HEARTBEAT_INTERVAL_MS=30000`
- 检查网络稳定性
- 确认 Trae IDE 未被最小化

---

## 参考资料

- [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/)
- [飞书开放平台文档](https://open.feishu.cn/document)
- [通达信量化平台文档](https://help.tdx.com.cn/quant/)
- [项目 PRD 文档](file:///workspace/day0-mvp-prd.md)
- [心跳方案设计](file:///workspace/heartbeat-scheme/README.md)

---

## 更新日志

| 日期 | 版本 | 更新内容 |
|------|------|----------|
| 2026-05-20 | 1.0 | 初始版本，完整 Wiki 文档 |

---

**文档维护者**：Trae Agent Team
**最后更新**：2026-05-20
