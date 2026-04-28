# Trae Agent Team MVP - Code Wiki

## 项目概述

**Trae Agent Team MVP** 是一个基于 Chrome DevTools Protocol (CDP) 的自动化工具，用于控制 Trae IDE 中的 Chat 功能，并通过飞书（Lark）接收指令进行任务调度。

### 核心功能

1. **CDP 自动化控制**：通过 CDP 协议控制 Trae IDE 的 Chat 界面
2. **飞书消息桥接**：监听飞书群消息，支持 `@PMCLI` / `@DEVCLI` 指令
3. **并发控制**：通过 Mutex 保证同一时刻只有一条指令在执行
4. **多工作空间支持**：支持多个独立的工作空间并行运行

---

## 项目架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        外部接口层                               │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    │
│  │   Lark Bot   │    │   Lark Bot   │    │   Lark Bot   │    │
│  │  (PMCLI)     │    │  (DEVCLI)    │    │   (Other)    │    │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘    │
│         │                   │                   │              │
└─────────┼───────────────────┼───────────────────┼──────────────┘
          ▼                   ▼                   ▼
┌─────────────────────────────────────────────────────────────────┐
│                        业务逻辑层                               │
│              ┌──────────────────────────────────┐              │
│              │      MultiTaskRunner             │              │
│              │  (指令路由 / 任务调度 / 结果持久化)   │              │
│              └──────────────────┬───────────────┘              │
│                                 │                              │
│              ┌──────────────────▼───────────────┐              │
│              │           Mutex                  │              │
│              │   (并发控制 - 保证单任务执行)        │              │
│              └──────────────────┬───────────────┘              │
│                                 │                              │
│        ┌───────────┬───────────┼───────────┬───────────┐      │
│        ▼           ▼           ▼           ▼           ▼      │
│   switchTask  fillPrompt   submit    waitResponse  scanTasks   │
│        (Action 模块 - 封装 CDP 操作)                            │
└─────────────────────────────────────────────────────────────────┘
          │           │           │           │
          └───────────┴───────────┼───────────┴───────────┐
                                  ▼                       │
┌─────────────────────────────────────────────────────────────────┐
│                        基础设施层                               │
│              ┌──────────────────────────┐                      │
│              │        CDPClient          │                      │
│              │  (CDP 长连接 / 心跳保活 / 自动重连)              │
│              └──────────────────────────┘                      │
│                                  │                            │
│                                  ▼                            │
│                    ┌──────────────────────┐                    │
│                    │    Trae IDE          │                    │
│                    │  (--remote-debugging) │                    │
│                    └──────────────────────┘                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## 目录结构

```
/workspace/
├── mvp-runner/                    # MVP 运行器主目录
│   ├── src/
│   │   ├── actions/               # CDP 操作封装
│   │   │   ├── fill-prompt.ts     # 填充提示词到输入框
│   │   │   ├── submit.ts          # 提交消息
│   │   │   ├── switch-task.ts     # 切换任务槽位
│   │   │   ├── wait-response.ts   # 等待 AI 响应
│   │   │   ├── scan-tasks.ts      # 扫描任务列表
│   │   │   └── index.ts           # 导出 actions
│   │   ├── cdp/
│   │   │   └── client.ts          # CDP 客户端
│   │   ├── lark/
│   │   │   ├── client.ts          # 飞书客户端
│   │   │   └── parser.ts          # 指令解析器
│   │   ├── selectors/
│   │   │   ├── resolver.ts        # 选择器解析器
│   │   │   └── resolver-class.ts  # 选择器类定义
│   │   ├── workspace/
│   │   │   └── loader.ts          # 工作空间加载器
│   │   ├── config.ts              # 配置加载
│   │   ├── errors.ts              # 错误类型定义
│   │   ├── mutex.ts               # 并发锁
│   │   ├── runner.ts              # 单任务运行器
│   │   ├── runner-multi.ts        # 多任务运行器
│   │   └── index.ts               # 应用入口
│   ├── config/
│   │   ├── pmbot.yaml             # PMBot 配置
│   │   └── selectors.v2026-04-26.json  # 选择器配置
│   ├── .env.example               # 环境变量示例
│   └── package.json               # 依赖配置
├── src/                           # 状态机模块（XState）
│   ├── cdp/
│   │   └── chat-mutex-machine.ts  # ChatMutex 状态机
│   └── core/
│       └── states/
│           └── task-machine.ts    # 任务生命周期状态机
├── exec-units/                    # 执行单元配置
│   ├── chat-fill.yaml
│   ├── chat-mutex.yaml
│   └── ...
└── docs/                          # 文档目录
```

---

## 核心模块详解

### 1. CDP 客户端模块

#### `src/cdp/client.ts`

**职责**：封装 CDP 长连接，提供心跳保活和自动重连机制。

**核心类：CDPClient**

| 方法 | 说明 | 参数 | 返回值 |
|------|------|------|--------|
| `constructor(opts)` | 构造函数 | `host`, `port`, `targetFilter` | - |
| `connect()` | 连接到 CDP 目标 | - | `Promise<void>` |
| `disconnect()` | 断开连接 | - | `void` |
| `evaluate<T>(expr, returnByValue)` | 执行 JS 表达式 | `expression: string`, `returnByValue?: boolean` | `Promise<T>` |
| `isConnected` | 是否已连接 | - | `boolean` |

**关键特性**：
- 自动选择包含 "Trae" 或 "SOLO" 的页面目标
- 30秒心跳保活机制
- 指数退避自动重连（最多5次）
- 暴露 Runtime/DOM/Input/Page 等 CDP 域

---

### 2. 飞书客户端模块

#### `src/lark/client.ts`

**职责**：处理飞书消息的接收和发送，支持 WebSocket 长连接。

**核心类：LarkBot**

| 方法 | 说明 | 参数 | 返回值 |
|------|------|------|--------|
| `constructor(opts)` | 构造函数 | `appId`, `appSecret`, `chatId`, `mentionKeyword` | - |
| `start(handler)` | 启动 WS 监听 | `handler: LarkHandler` | `Promise<void>` |
| `sendText(text)` | 发送纯文本消息 | `text: string` | `Promise<void>` |
| `reply(messageId, text)` | 回复消息 | `messageId: string`, `text: string` | `Promise<void>` |
| `replyPost(messageId, title, body)` | 回复富文本消息 | `messageId: string`, `title: string`, `body: string` | `Promise<void>` |

**消息过滤逻辑**：
1. 只处理指定群聊 (`chatId`)
2. 只处理群聊文本消息
3. 检查是否 `@` 了目标关键词（如 @PMCLI）
4. 支持文本匹配（不分大小写）

---

### 3. Action 模块

#### `src/actions/fill-prompt.ts`

**职责**：将提示词填充到 Trae Chat 输入框。

**实现步骤**：
1. 聚焦输入框
2. 清空现有内容
3. 使用 `Input.insertText` 触发 Lexical 原生事件
4. 验证填充结果

**选择器**：`.chat-input-v2-input-box-editable`

---

#### `src/actions/submit.ts`

**职责**：提交消息（模拟 Enter 键）。

**实现步骤**：
1. 聚焦输入框
2. 使用 `Input.dispatchKeyEvent` 发送 Enter 键的 down/up 事件

---

#### `src/actions/switch-task.ts`

**职责**：切换到指定任务槽位。

**实现步骤**：
1. 扫描任务列表
2. 根据索引或名称匹配目标任务
3. 点击切换任务

**选择器**：`.index-module__task-item___zOpfg`

---

#### `src/actions/wait-response.ts`

**职责**：等待 AI 响应完成并解析结果。

**核心逻辑**：
- 心跳循环检查任务状态（默认 2秒间隔）
- 支持超时自动终止会话（默认 120秒）
- 任务完成后解析响应内容

**状态判断依据**：
- 通过侧边栏任务文本判断（"完成"/"进行中"/"中断"）
- 通过完成图标验证

---

### 4. 并发控制模块

#### `src/mutex.ts`

**职责**：保证同一时刻只有一条指令在操作 Trae Chat。

**核心函数**：

| 函数 | 说明 | 参数 | 返回值 |
|------|------|------|--------|
| `withChatMutex<T>(label, fn)` | 自动加锁执行 | `label: string`, `fn: () => Promise<T>` | `Promise<T>` |

**使用方式**：
```typescript
await withChatMutex('run-task', async () => {
  await switchTask(cdp, slot);
  await fillPrompt(cdp, prompt);
  await submit(cdp);
  const response = await waitResponse(cdp);
  return response;
});
```

---

### 5. 多任务运行器

#### `src/runner-multi.ts`

**职责**：处理多工作空间的指令路由和任务调度。

**核心类：MultiTaskRunner**

| 方法 | 说明 |
|------|------|
| `handle(msg, botKeyword)` | 通用消息处理器 |
| `replyByKeyword(keyword, messageId, text, body?)` | 根据关键字回复 |
| `persist(runId, parsed, response, ...)` | 保存执行结果 |
| `persistToWorkspace(...)` | 保存到工作空间 |

**执行流程**：
```
1. 白名单校验
2. 解析指令（parseCommand）
3. 扫描任务列表（scanTasks）
4. 匹配工作空间和目标任务
5. 立即 ACK 回复
6. 加锁执行（withChatMutex）
   - switchTask → fillPrompt → submit → waitResponse
7. 保存结果
8. 发送响应到群聊
```

---

### 6. 选择器解析器

#### `src/selectors/resolver.ts`

**职责**：选择器配置外化，支持版本适配。

**核心功能**：
- 从配置文件加载选择器（支持多版本）
- 优先使用 primary 选择器，失败时尝试 fallback
- 缓存解析结果提高性能

**配置文件格式**：
```json
{
  "trae_version": "v2026.04.26",
  "chat": {
    "input": { "primary": ".chat-input-v2-input-box-editable", "fallback": [...] },
    "send_button": { "primary": "...", "fallback": [...] }
  },
  "task_list": {
    "item": { "primary": ".index-module__task-item___zOpfg" }
  }
}
```

---

### 7. 状态机模块

#### `src/core/states/task-machine.ts`

**职责**：管理任务生命周期状态流转。

**状态流转**：
```
pending → assigned → running → completed
                           → failed → (retry) → assigned
                           → blocked → (unblock) → running
                           → cancelled
```

**状态说明**：

| 状态 | 说明 | 触发事件 |
|------|------|----------|
| `pending` | 任务创建待分配 | `CREATE`, `ASSIGN`, `CANCEL` |
| `assigned` | 任务已分配给 Agent | `START`, `CANCEL` |
| `running` | 任务执行中 | `COMPLETE`, `FAIL`, `BLOCK`, `CANCEL` |
| `completed` | 任务完成 | - |
| `failed` | 任务失败 | `RETRY`, `CANCEL` |
| `blocked` | 任务阻塞 | `UNBLOCK`, `RETRY`, `CANCEL` |
| `cancelled` | 任务取消 | - |

**保护机制**：
- 10分钟无响应自动标记为 blocked
- 最多重试 3 次

---

#### `src/cdp/chat-mutex-machine.ts`

**职责**：管理 ChatMutex 并发锁状态。

**状态流转**：
```
idle ←── RELEASE/TIMEOUT ── locked
           │                  │
           └── ACQUIRE ──────→┘
```

**关键特性**：
- 队列机制（最大 100 任务）
- 30秒锁超时自动释放
- 状态持久化到文件系统

---

## 配置说明

### 环境变量（.env）

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `LARK_APP_ID` | 飞书应用 ID | 必需 |
| `LARK_APP_SECRET` | 飞书应用密钥 | 必需 |
| `LARK_CHAT_ID` | 目标群聊 ID | 必需 |
| `LARK_MENTION_KEYWORD` | 触发关键词 | PMCLI |
| `CDP_HOST` | CDP 主机 | localhost |
| `CDP_PORT` | CDP 端口 | 9222 |

### 配置文件（pmbot.yaml）

```yaml
mention_keyword: PMCLI          # 触发关键词
allowed_users: []               # 用户白名单（空数组不限制）
default_slot: 0                 # 默认槽位
response_max_chars: 2000        # 飞书回复截断长度
response_timeout_ms: 300000     # 响应超时（5分钟）
ack_on_receive: true            # 收到指令立即回复
online_notice: true             # 启动时发送上线通知
workspaces_base_dir: "../workspaces"  # 工作空间目录
```

---

## 依赖关系

| 依赖 | 版本 | 用途 |
|------|------|------|
| `chrome-remote-interface` | ^0.33.2 | CDP 协议客户端 |
| `@larksuiteoapi/node-sdk` | ^1.36.0 | 飞书 SDK |
| `async-mutex` | ^0.5.0 | 异步互斥锁 |
| `yaml` | ^2.3.4 | YAML 解析 |
| `debug` | ^4.3.4 | 调试日志 |
| `dotenv` | ^16.4.5 | 环境变量加载 |
| `p-retry` | ^6.2.0 | 重试机制 |

---

## 运行方式

### 前置条件

1. 启动 Trae IDE 并开启远程调试：
   ```bash
   trae --remote-debugging-port=9222
   ```

2. 配置环境变量：
   ```bash
   cp .env.example .env
   # 编辑 .env 填入飞书配置
   ```

### 启动命令

```bash
# 进入 mvp-runner 目录
cd mvp-runner

# 安装依赖
npm install

# 开发模式（带热重载）
npm run dev

# 生产模式
npm run start

# 运行 MVP 测试
npm run mvp

# 运行选择器测试
npm run test:selectors

# 运行动作测试
npm run test:actions
```

### 指令格式

在飞书群中发送以下格式的消息：

| 格式 | 说明 | 示例 |
|------|------|------|
| `@PMCLI <prompt>` | 使用默认槽位执行 | `@PMCLI 写一个快排算法` |
| `@PMCLI #2 <prompt>` | 使用指定槽位 | `@PMCLI #2 修复登录接口` |
| `@PMCLI slot=2 <prompt>` | 使用指定槽位（完整格式） | `@PMCLI slot=2 修复登录接口` |

---

## 错误处理体系

### 错误类型

| 错误类 | 错误码 | 说明 |
|--------|--------|------|
| `ConnectionError` | CDP_CONNECTION | CDP 连接失败 |
| `SelectorResolutionError` | SELECTOR_FAILED | 选择器解析失败 |
| `TaskSwitchError` | TASK_SWITCH | 任务切换失败 |
| `FillPromptError` | FILL_PROMPT | 提示词填充失败 |
| `SubmitError` | SUBMIT | 提交失败 |
| `ResponseTimeoutError` | RESPONSE_TIMEOUT | 响应超时 |

### 错误处理策略

1. **选择器失效**：立即终止整个运行，提示用户重新生成选择器配置
2. **任务执行失败**：记录错误并继续执行后续任务
3. **CDP 断开**：自动重连（指数退避）
4. **响应超时**：尝试终止会话并返回错误信息

---

## 工作空间机制

### 工作空间目录结构

```
workspaces/
├── PMCLI/
│   ├── .env.pmcli        # 飞书配置
│   └── runs/             # 执行结果
│       ├── 2026-04-28T12-00-00.000Z.md
│       └── ...
└── DEVCLI/
    ├── .env.devcli
    └── runs/
```

### 工作空间配置加载

`loadWorkspaces()` 函数会扫描 `../workspaces` 目录，每个子目录视为一个工作空间：

1. 查找 `.env.<workspace-name>` 文件
2. 加载环境变量（LARK_APP_ID, LARK_APP_SECRET, CHAT_ID, MENTION_KEYWORD）
3. 创建对应的 LarkBot 实例

---

## 安全注意事项

1. **敏感信息保护**：飞书配置（appId/appSecret）存储在 `.env` 文件中，不应提交到版本控制
2. **用户白名单**：通过 `allowed_users` 配置限制可使用的用户
3. **权限校验**：每条消息都会检查发送者是否在白名单中
4. **输入验证**：对用户输入进行清洗和验证，防止注入攻击

---

## 扩展建议

1. **多 CDP 目标支持**：支持连接多个 Trae 实例
2. **任务队列持久化**：将任务队列持久化到数据库
3. **监控告警**：集成 Prometheus/Grafana 监控
4. **日志聚合**：使用 ELK 或 Loki 聚合日志
5. **API 接口**：提供 REST API 供外部系统调用
6. **Web UI**：提供可视化管理界面