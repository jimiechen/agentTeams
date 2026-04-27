# PRD：Trae Agent Team — 飞书驱动的 Trae 多任务多智能体系统

> 版本：v0.10 Pre-MVP | 日期：2026-04-26 | 状态：**Pre-MVP** 🔬
> 变更说明：从 22 章压缩到 10 章（Beta 实施）+ 14 章移入附录 E（完整版参考），删除 xstate 依赖，chat-fill.yaml 重写到 CDP Method 级，Phase 0 新增 Day 0 物理执行层验证
> 前身版本：v3.0.0（完整版设计参考，已冻结存档）

> ⚠️ **风险免责声明**：本系统通过 CDP 协议自动化操作 Trae IDE，可能违反 Trae 服务条款（ToS）。使用后果由使用者自行承担，不得公开传播或用于商业用途。

### 章节实施范围

| 章节 | 标题 | v0.10 状态 | 说明 |
|------|------|:----------:|------|
| §0 | 项目战略定位 | ✅ 实施 | 生命周期/设计原则/裁剪对照 |
| §1 | 项目背景与前置条件 | ✅ 实施 | 含 §1.4 Trae 调试模式启动 |
| §2 | 系统架构 | ✅ 实施 | 3 层拓扑 + 数据模型 |
| §3 | 核心模块设计 | ✅ 实施 | 精简版（ChatMutex/终端/UI识别/任务流） |
| §4 | CDP Executor 实现细则 | ✅ 实施 | **执行层核心**，代码级 |
| §5 | 拟人化反检测 | ✅ 实施 | 生存关键 |
| §6 | 配额感知与降速 | ✅ 实施 | 生存关键 |
| §7 | 选择器自适应 | ✅ 实施 | 生存关键 |
| §8 | 人机共享 UI | ✅ 实施 | 生存关键（第 4 个） |
| §9 | 技术实现计划 | ✅ 实施 | Day 0 → Phase 1-3 |
| §10 | 风险与缓解 | ✅ 实施 | 精简版 |
| — | 飞书多维表格看板 | ⏸️ v1.0 | → 附录 E |
| — | 飞书群聊指令设计 | ⏸️ v1.0 | → 附录 E |
| — | 配置文件设计 | ⏸️ v1.0 | → 附录 E |
| — | VS Code 插件设计 | ⏸️ Phase 2 | → 附录 E |
| — | 项目结构 | ⏸️ v1.0 | → 附录 E |
| — | CLI 命令设计 | ⏸️ v1.0 | → 附录 E |
| — | 异常处理与自愈 | ⏸️ v1.0 | → 附录 E（保留 CascadeLockReleaser） |
| — | 可观测性设计 | ⏸️ v1.0 | → 附录 E |
| — | 安全设计 | ⏸️ v1.0 | → 附录 E |
| — | 并发压力模型/幂等性 | ⏸️ v1.0 | → 附录 E |
| — | 工程交付标准 DoD | ⏸️ v1.0 | → 附录 E |
| — | 执行契约体系 | ⏸️ v1.0 | → 附录 E |
| — | 角色矩阵与智能体 | ⏸️ v1.0 | → 附录 E |

---

## 0. 项目战略定位

### 0.1 真实定位

**Trae Agent Team 是一个机会窗口期工具**，核心目标是利用 Trae IDE 的免费大模型额度，通过 CDP 自动化实现多角色 AI 编码协作。

- **不是**：长期生产系统、团队协作平台、商业产品
- **是**：个人开发者工具、原型验证
- **有效生命周期**：6~18 个月
- **设计原则**："跑得通的 60 分实现" > "做不完的完美设计"
- **退出策略**：核心模块（CDP 操作、飞书集成）可迁移到其他 AI IDE

### 0.2 v0.10 核心约束

1. **生存优先**：拟人化反检测、配额感知、选择器自适应、人机共享 UI 是四大生存模块
2. **物理验证先行**：Day 0 必须用 200 行代码跑通 CDP→Trae 链路，否则一切推倒重来
3. **无 xstate 依赖**：taskMachine 用纯 TS 枚举（~100 行），ChatMutex 用 async-mutex（~50 行）
4. **单终端单连接**：lark-cli 1 个终端按角色路由，CDP 1 个长连接全局复用
5. **10~15 工作日 MVP**：Day 0 验证 → 拟人化+配额 → 飞书 → Git → MVP

---

## 1. 项目背景与愿景

### 1.1 背景

Trae IDE 提供了强大的免费 AI 编码能力。当前痛点：

1. **单窗口单任务**：一个 Trae 实例同一时间只能处理一个对话任务
2. **手动操作繁琐**：每次任务需要手动输入 prompt、等待完成、再输入下一个
3. **无法并行**：多个任务只能排队执行，浪费算力
4. **进度不透明**：任务进度无法同步给团队

### 1.2 核心目标

**白嫖 Trae 算力，实现任务自动流转**：

- 在飞书群聊中发送任务描述 → 自动填充到 Trae IDE Chat → 自动发送 → AI 自动执行
- 多个 Trae 实例并行工作，每个实例独立处理一个任务
- 任务通过 **MD 文档 + Git 版本控制**管理，确保可追溯、可回滚
- 每个任务对应一个**独立的 lark-cli 终端**，监听群聊消息、接收任务、回报进度

### 1.3 核心链路

```
飞书群聊消息 ──→ lark-cli 监听终端 ──→ 任务解析 ──→ MD 文档创建 + Git 提交
                                                    │
                                                    ▼
                                              并发控制器
                                                    │
                                                    ▼
                                              空闲 Trae 实例
                                                    │
                                                    ▼
                                         CDP 注入 → 自动填充 Chat → 发送
                                                    │
                                                    ▼
                                         Ralph Loop 自动化循环
                                                    │
                                                    ▼
                                         AI 完成任务 → Git 提交 → 飞书回报
```

### 1.4 前置条件：Trae 调试模式启动

> **系统运行的物理前提**：Trae 必须以调试模式启动，暴露 CDP 端口。否则整个系统直接 `ECONNREFUSED` 跑不起来。

Trae 基于 Electron，默认不对外暴露 CDP 端口。必须通过命令行参数启动：

```bash
# macOS
/Applications/Trae.app/Contents/MacOS/Trae --remote-debugging-port=9222

# Windows
"C:\Program Files\Trae\Trae.exe" --remote-debugging-port=9222

# Linux
trae --remote-debugging-port=9222
```

启动后验证：
```bash
curl http://localhost:9222/json
# 应返回 Trae 内部所有 WebView Target 列表（JSON 数组）
```

**启动方式建议**：
- **Phase 1**：手动命令行启动 + 检测端口可用性
- **Phase 2**：VS Code 插件提供"启动 Trae (调试模式)"按钮，自动执行命令并检测端口
- **长期**：创建桌面快捷方式，双击即以调试模式启动

> ⚠️ **如果用户正常点图标启动 Trae，整个系统无法运行。** 这是 PRD 之前 9 轮评审从未明确写出的硬性前置条件。

---

## 2. 系统架构

> **v3.0.0 架构修正**：Trae 的任务列表不是普通的项目列表，而是**按角色分工的任务槽位**。每个任务对应一个特定角色（如 `@core-dev`、`@qa-expert`），任务激活后开启一个**持久化的飞书群聊监听终端**，常驻等待飞书指令，收到指令后才触发 Chat 填充和 Ralph 执行。

### 2.1 三层架构拓扑

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                        第 1 层：控制平面（VS Code 插件）                       ║
║                                                                              ║
║  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     ║
║  │ 角色管理      │  │ 任务管理      │  │ 终端监控      │  │ 手动干预      │     ║
║  │ 7 个角色 Prompt│  │ 创建/分配/监控│  │ 终端在线状态  │  │ 强制激活/重启 │     ║
║  │ 模型/槽位绑定  │  │ 任务状态流转  │  │ 断连/重连告警 │  │ 指令下发      │     ║
║  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘     ║
║         └─────────────────┴─────────────────┴─────────────────┘              ║
║                                    ↕ 双向实时通信                              ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                        第 2 层：执行层（Trae IDE）                             ║
║                                                                              ║
║  ┌─────────────────────────────────────────────────────────────────────┐     ║
║  │                    Trae IDE 任务列表（角色槽位）                       │     ║
║  │                                                                     │     ║
║  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐               │     ║
║  │  │ 槽位 #1      │ │ 槽位 #2      │ │ 槽位 #3      │               │     ║
║  │  │ @core-dev    │ │ @qa-expert   │ │ @architect   │               │     ║
║  │  │              │ │              │ │              │               │     ║
║  │  │ ┌──────────┐ │ │ ┌──────────┐ │ │ ┌──────────┐ │               │     ║
║  │  │ │飞书监听   │ │ │ │飞书监听   │ │ │ │飞书监听   │ │               │     ║
║  │  │ │终端(常驻) │ │ │ │终端(常驻) │ │ │ │终端(常驻) │ │               │     ║
║  │  │ └────┬─────┘ │ │ └────┬─────┘ │ │ └────┬─────┘ │               │     ║
║  │  │      │收到指令│ │      │收到指令│ │      │收到指令│               │     ║
║  │  │      ▼       │ │      ▼       │ │      ▼       │               │     ║
║  │  │ ┌──────────┐ │ │ ┌──────────┐ │ │ ┌──────────┐ │               │     ║
║  │  │ │UI识别    │ │ │ │UI识别    │ │ │ │UI识别    │ │               │     ║
║  │  │ │激活任务  │ │ │ │激活任务  │ │ │ │激活任务  │ │               │     ║
║  │  │ └────┬─────┘ │ │ └────┬─────┘ │ │ └────┬─────┘ │               │     ║
║  │  │      ▼       │ │      ▼       │ │      ▼       │               │     ║
║  │  │ ┌──────────┐ │ │ ┌──────────┐ │ │ ┌──────────┐ │               │     ║
║  │  │ │ChatMutex │ │ │ │ChatMutex │ │ │ │ChatMutex │ │  ← 实例内串行  │     ║
║  │  │ │Chat填充  │ │ │ │Chat填充  │ │ │ │Chat填充  │ │               │     ║
║  │  │ │Ralph Loop│ │ │ │Ralph Loop│ │ │ │Ralph Loop│ │               │     ║
║  │  │ └──────────┘ │ │ └──────────┘ │ │ └──────────┘ │               │     ║
║  │  └──────────────┘ └──────────────┘ └──────────────┘               │     ║
║  └─────────────────────────────────────────────────────────────────────┘     ║
║                                    ↕                                        ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                        第 3 层：指令通道（飞书群聊）                           ║
║                                                                              ║
║  ┌─────────────────────────────────────────────────────────────────────┐     ║
║  │  👤 人类: /task @core-dev 实现登录API                                │     ║
║  │  👤 人类: /task @qa-expert 编写E2E测试                               │     ║
║  │  🤖 @core-dev: ✅ T-001 已完成，产出: src/api/auth.ts               │     ║
║  │  🤖 @qa-expert: 🔄 T-002 进行中 (45%)...                           │     ║
║  │                                                                     │     ║
║  │  指令路由: /task @<角色ID> <内容> → 路由到对应角色的飞书监听终端     │     ║
║  └─────────────────────────────────────────────────────────────────────┘     ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

### 2.2 核心数据模型：角色-任务-终端三元组

> **这是整个系统的核心数据模型**。一个角色对应一个任务槽位，一个任务槽位绑定一个飞书监听终端，飞书指令按角色 ID 路由到对应终端。

```
┌─────────────┐         ┌─────────────┐         ┌─────────────────┐
│   角色       │  1:1    │   任务槽位    │  1:1    │  飞书监听终端    │
│  (Role)     │────────→│  (Task Slot) │────────→│ (LarkTerminal)  │
│             │         │             │         │                 │
│ @core-dev   │         │ 槽位 #1     │         │ 终端进程 PID:xxx │
│ @qa-expert  │         │ 槽位 #2     │         │ WebSocket 连接  │
│ @architect  │         │ 槽位 #3     │         │ 消息过滤(按角色) │
│ ...         │         │ ...         │         │ 指令解析         │
└─────────────┘         └─────────────┘         └─────────────────┘
       │                       │                       │
       │                       │                       │
   .trae/agents/          Trae 任务列表            lark-cli 子进程
   *.md (Prompt)          (角色槽位 UI)            (WebSocket 长连接)
```

**关键约束**：
- **1 个角色 = 1 个任务槽位 = 1 个飞书监听终端**，三者严格绑定
- 飞书指令必须携带角色 ID（`/task @core-dev <内容>`），终端按角色 ID 过滤指令
- 不同角色的槽位之间完全并行，互不影响
- 同一槽位内的 Chat 操作严格串行（ChatMutex 保护）

### 2.3 指令路由流程

```
飞书群聊消息: "/task @core-dev 实现登录API"
      │
      ▼
所有飞书监听终端同时收到消息
      │
      ├── 终端 #1 (@core-dev): 匹配 @core-dev → ✅ 接受指令
      ├── 终端 #2 (@qa-expert): 不匹配 @core-dev → ❌ 丢弃
      └── 终端 #3 (@architect): 不匹配 @core-dev → ❌ 丢弃
      │
      ▼
终端 #1 处理指令:
  1. UI Recognizer 按需探测 → 定位槽位 #1 的 DOM 位置
  2. 点击激活槽位 #1 的 Chat
  3. ChatMutex.acquire() → 获取锁
  4. Chat 自动填充 Prompt → 发送
  5. Ralph Loop 执行
  6. ChatMutex.release() → 释放锁
  7. 飞书回报执行结果
```

### 2.2 技术选型

| 组件 | 技术方案 | 说明 |
|------|---------|------|
| **运行时** | Node.js >= 18 | 主控进程 |
| **CDP 客户端** | chrome-remote-interface | 注入 Trae IDE |
| **飞书监听** | lark-cli（WebSocket 长连接） | 每任务独立终端 |
| **飞书通知** | lark-cli im +messages-send | 状态回报 |
| **任务存储** | MD 文件 + Git | 版本控制、可追溯 |
| **并发控制** | 互斥锁 + 任务队列 | Chat 发送串行化 |
| **进程管理** | Node.js child_process.spawn | 管理 lark-cli 和 Trae 实例 |
| **许可证** | MIT | 开源免费 |

---

## 3. 核心模块设计

### 3.1 任务生命周期（MD 文档 + Git 驱动）

每个任务对应一个 **MD 文档**，通过 Git 版本控制管理全生命周期。

#### 3.1.1 任务 MD 文档格式

```markdown
---
task_id: T-001
title: 实现用户登录 API
assignee: agent-1
status: running
priority: P1
created_at: 2026-04-25T10:30:00Z
updated_at: 2026-04-25T11:15:00Z
completed_at: null
trae_instance: 9222
deps: []
artifacts: []
git_branch: task/T-001
---

# T-001: 实现用户登录 API

## 任务描述

实现用户登录 API，使用 JWT 认证，包含注册和登录两个接口。

## 详细要求

- 使用 Node.js + Express
- JWT token 认证
- 密码 bcrypt 加密
- 包含输入验证和错误处理
- 编写单元测试

## 上下文

- 数据库: PostgreSQL
- ORM: Prisma
- 认证方案: JWT

## 执行记录

### 2026-04-25 10:30:00 — 任务创建
- 来源: 飞书群聊消息
- 创建人: @zhangsan

### 2026-04-25 10:31:00 — 开始执行
- 分配到: agent-1 (Trae 端口 9222)
- Git 分支: task/T-001

### 2026-04-25 10:45:00 — 进度更新 (50%)
- 已完成: 用户注册接口
- 进行中: 用户登录接口

### 2026-04-25 11:15:00 — 任务完成
- 产出文件:
  - src/api/auth/register.ts
  - src/api/auth/login.ts
  - src/api/auth/__tests__/auth.test.ts
- Git commit: abc1234
```

#### 3.1.2 任务状态流转

```
                    飞书群聊 /task 指令
                           │
                           ▼
    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
    │  pending  │───→│ assigned │───→│ running  │───→│ completed│
    │  (待分配)  │    │ (已分配)  │    │ (执行中)  │    │ (已完成)  │
    └──────────┘    └──────────┘    └────┬─────┘    └──────────┘
                         │              │
                         │              ├──→ blocked (阻塞)
                         │              │       │
                         │              │       └──→ running (恢复)
                         │              │
                         │              └──→ failed (失败)
                         │                     │
                         │                     └──→ assigned (重试)
                         │
                         └──→ cancelled (取消)
```

#### 3.1.3 Git 工作流

每个任务在独立的 Git 分支上工作，确保隔离和可追溯：

```bash
# 任务开始时
git checkout -b task/T-001 main
# 创建任务文档
# → .trae-tasks/T-001-implement-login-api.md

# 任务执行中（AI 产生的代码变更自动提交）
git add .
git commit -m "T-001: implement user registration endpoint"

# 任务完成时
git add .
git commit -m "T-001: completed - implement login API"
# 更新任务 MD 文档状态为 completed

# 合并回主分支（可选，人工审批）
git checkout main
git merge task/T-001
```

**Git 自动提交策略**：

| 触发条件 | 提交信息格式 | 说明 |
|---------|-------------|------|
| 任务开始 | `T-{id}: start - {title}` | 创建分支和任务文档 |
| AI 产生文件变更 | `T-{id}: {description}` | AI 每次保存文件时自动提交 |
| 场景恢复（上下文限制） | `T-{id}: context-reset #{n}` | 上下文重置时的检查点 |
| 任务完成 | `T-{id}: completed - {title}` | 最终提交，更新状态 |
| 任务失败 | `T-{id}: failed - {error}` | 记录失败原因 |

---

### 3.2 并发控制器（Chat Mutex）

> **v0.9 Beta 修正**：ChatMutex 在单账号单 IDE 单 Chat 输入框场景下竞争极少发生（一个时刻只有一个任务在 Chat 里执行）。从完整 xstate 状态机降级为简单的 `async-mutex` 实现（~50 行代码），节省的复杂度用于拟人化反检测模块。

#### 3.2.1 问题

Trae IDE 的 Chat 输入框同一时间只能处理一条消息。在单账号角色槽位架构下：
- **不同角色的槽位**操作不同的 Chat 会话，天然并行，不需要锁
- **同一角色的槽位**内，飞书指令快速连续到达时需要串行化保护
- **实际竞争频率极低**：单账号下 7 个角色槽位串行激活，竞争只发生在"两条飞书指令几乎同时到达"的极小时间窗内

#### 3.2.2 方案：async-mutex（替代 xstate）

```typescript
// src/core/chat-mutex.ts — ~50 行实现
export class ChatMutex {
  private _locked = false;
  private _queue: Array<() => void> = [];
  private _owner: string | null = null;
  private _timeout: number;

  constructor(timeout = 30000) {
    this._timeout = timeout;
  }

  async acquire(taskId: string): Promise<void> {
    if (!this._locked) {
      this._locked = true;
      this._owner = taskId;
      return;
    }
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this._queue = this._queue.filter(fn => fn !== resolve);
        reject(new Error(`ChatMutex acquire timeout for ${taskId}`));
      }, this._timeout);
      this._queue.push(() => { clearTimeout(timer); resolve(); });
    });
  }

  release(): void {
    this._locked = false;
    this._owner = null;
    const next = this._queue.shift();
    if (next) next();
  }

  get isLocked(): boolean { return this._locked; }
  get owner(): string | null { return this._owner; }
}
```

> **注意**：xstate 版 `chatMutexMachine` 保留在 `src/cdp/chat-mutex-machine.ts` 作为完整版参考，v0.9 Beta 不使用。

#### 3.2.2 解决方案：互斥锁 + 任务队列

```javascript
class ChatMutex {
  constructor(traePort) {
    this.port = traePort;
    this.locked = false;        // 是否锁定
    this.queue = [];            // 等待队列
    this.currentTask = null;    // 当前执行的任务
  }

  // 获取锁（异步等待）
  async acquire(taskId) {
    if (!this.locked) {
      this.locked = true;
      this.currentTask = taskId;
      return true;
    }
    // 加入等待队列
    return new Promise((resolve) => {
      this.queue.push({ taskId, resolve });
    });
  }

  // 释放锁（触发下一个任务）
  release() {
    this.locked = false;
    this.currentTask = null;

    if (this.queue.length > 0) {
      const next = this.queue.shift();
      this.locked = true;
      this.currentTask = next.taskId;
      next.resolve(true);
    }
  }

  // 查询当前状态
  get status() {
    return {
      locked: this.locked,
      currentTask: this.currentTask,
      queueLength: this.queue.length
    };
  }
}
```

#### 3.2.3 Chat 发送流程（飞书指令驱动）

```
飞书指令到达 @core-dev 终端
      │
      ▼
UI Recognizer 按需探测 → 激活 @core-dev 槽位的 Chat
      │
      ▼
ChatMutex.acquire(taskId) ──→ 获得锁 ──→ CDP 填充 Chat ──→ 点击发送
                                                            │
                                                            ▼
                                                     等待 AI 完成
                                                     (Ralph Loop 监控)
                                                            │
                                                            ▼
                                                     ChatMutex.release()
                                                            │
新飞书指令到达（同一角色）────────────────────────────────→ 排队等待 → 获得锁 → ...
```

#### 3.2.4 多实例并发模型（角色槽位视角）

```
┌─────────────────────────────────────────────────────────────┐
│                    Trae IDE 任务列表                          │
│                                                              │
│  槽位 #1 (@core-dev)    槽位 #2 (@qa-expert)   槽位 #3 (@architect) │
│                                                              │
│  各槽位独立 Chat 会话，天然并行，互不干扰                        │
│                                                              │
│  同一槽位内：                                                 │
│  ┌──────────────────────────────────────┐                    │
│  │  ChatMutex (槽位内串行)               │                    │
│  │                                      │                    │
│  │  飞书指令 A → acquire → 填充 → 发送  │                    │
│  │  飞书指令 B → 排队等待 → A 完成后执行  │                    │
│  └──────────────────────────────────────┘                    │
└─────────────────────────────────────────────────────────────┘
```

**关键原则**：
- **跨实例并行**：不同 Trae 实例同时处理不同任务，互不干扰
- **实例内串行**：同一个 Trae 实例的 Chat 发送严格串行，通过 Mutex 保证
- **任务粒度隔离**：每个任务在独立 Git 分支上，代码变更互不影响

---

### 3.3 lark-cli 单终端（按角色 ID 路由）

> **v0.9 Beta 修正**：从"每角色独立终端"改为"单终端按消息前缀路由"。单人场景下一个群聊、一个 WebSocket 连接足够，节省 6 个连接资源，也降低飞书风控触发概率（7 个账号长期在线可能触发飞书机器人行为检测）。

#### 3.3.1 设计原理

系统使用**一个 lark-cli 终端进程**，统一监听飞书群聊消息，职责：

1. **常驻监听飞书群聊消息**：通过 WebSocket 长连接实时接收所有群聊消息
2. **按角色 ID 路由指令**：解析 `/task @<角色ID> <内容>`，根据角色 ID 分发到对应槽位处理
3. **触发 Chat 操作链路**：匹配指令后，触发 UI 识别 → Chat 激活 → 填充 → 发送
4. **回报执行状态**：将各角色的进度、完成、失败等信息发送到群聊
5. **异常恢复**：终端崩溃重启时，恢复监听状态而不丢失飞书消息

#### 3.3.2 lark-cli 终端架构

```javascript
class LarkTerminal {
  constructor(agentId, config) {
    this.agentId = agentId;
    this.chatId = config.chatId;
    this.process = null;  // lark-cli 子进程
  }

  // 启动独立的 lark-cli 监听进程
  async start() {
    // 使用 lark-cli 的 WebSocket 事件订阅功能
    this.process = spawn('lark-cli', [
      'event', '+subscribe',
      '--chat-id', this.chatId,
      '--event-type', 'im.message.receive_v1'
    ], {
      stdio: ['pipe', 'pipe', 'pipe']  // 捕获 stdout
    });

    // 逐行解析 NDJSON 输出
    this.process.stdout.on('data', (chunk) => {
      const lines = chunk.toString().split('\n').filter(Boolean);
      for (const line of lines) {
        const event = JSON.parse(line);
        this.handleMessage(event);
      }
    });
  }

  // 处理收到的群聊消息（单终端按角色 ID 路由）
  handleMessage(event) {
    const text = event.event.message.content;
    const sender = event.event.sender.sender_id;

    // 只处理 /task 指令
    if (!text.startsWith('/task')) return;

    const match = text.match(/^\/task\s+@(\S+)\s*(.*)/);
    if (!match) return;

    const targetRole = match[1];       // 如 "core-dev"
    const taskContent = match[2];      // 任务内容

    // 单终端路由：根据角色 ID 分发到对应槽位
    const slot = this.slotManager.getSlotByRole(targetRole);
    if (!slot) {
      logger.warn(`未找到角色 ${targetRole} 的槽位，丢弃指令`);
      return;
    }

    slot.onTaskReceived(taskContent, sender);
  }

  // 发送消息到群聊
  async sendMessage(text) {
    await exec(`lark-cli im +messages-send --chat-id ${this.chatId} --text "${text}"`);
  }

  // 发送卡片消息到群聊
  async sendCard(card) {
    await exec(`lark-cli im +messages-send --chat-id ${this.chatId} --card '${JSON.stringify(card)}'`);
  }
}
```

#### 3.3.3 多终端进程管理

```javascript
class TerminalManager {
  constructor() {
    this.terminals = new Map(); // agentId -> LarkTerminal
  }

  // 为每个 Agent 创建独立终端
  async createTerminal(agentId, config) {
    const terminal = new LarkTerminal(agentId, config);
    await terminal.start();
    this.terminals.set(agentId, terminal);
    return terminal;
  }

  // 广播消息到所有终端（群聊通知）
  async broadcast(text) {
    // 只通过一个终端发送，避免重复
    const first = this.terminals.values().next().value;
    if (first) {
      await first.sendMessage(text);
    }
  }

  // 关闭所有终端
  async shutdownAll() {
    for (const [id, terminal] of this.terminals) {
      terminal.process.kill();
    }
    this.terminals.clear();
  }
}
```

---

### 3.4 UI 自动识别模块（UI Recognizer）

> **v3.0.0 修正**：UI Recognizer 不是在"CDP 连接建立"时一次性触发，而应该在**飞书指令到达、需要激活对应角色槽位时按需触发**——即时识别当前 Trae 任务列表中目标槽位的 DOM 位置，执行点击激活，然后交还给 `chat-fill.yaml`。

#### 3.4.1 问题背景

Trae IDE 频繁更新，每次更新可能改变 DOM 结构、CSS 类名、元素层级。硬编码选择器（如 `.chat-input-v2-container`）会在版本更新后失效，导致：

- Chat 输入框定位失败 → 任务无法发送
- 发送按钮找不到 → 消息卡在输入框
- 状态指示器失效 → Ralph Loop 误判 AI 状态
- 多任务切换时 Chat 面板定位错误 → 消息发到错误的对话

#### 3.4.2 设计目标

1. **按需触发探测**：飞书指令到达、需要激活对应角色槽位时触发（而非启动时一次性探测）
2. **槽位精确定位**：在 Trae 任务列表中识别目标角色槽位的 DOM 位置并点击激活
3. **多版本兼容**：同一份代码兼容 Trae IDE 多个版本的 UI 结构
4. **运行时自适应**：Trae 热更新后自动重新探测，无需重启系统
5. **探测结果缓存**：选择器映射持久化到本地，按需探测时优先使用缓存

#### 3.4.3 架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                    UI Recognizer 模块                         │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              DOM 探测器 (DOM Probe)                   │    │
│  │                                                      │    │
│  │  CDP 连接时自动执行，扫描整个 workbench DOM 树        │    │
│  │  提取所有可交互元素的语义特征                           │    │
│  └──────────────────────┬──────────────────────────────┘    │
│                         │                                   │
│                         ▼                                   │
│  ┌─────────────────────────────────────────────────────┐    │
│  │           元素特征指纹库 (Element Fingerprint)        │    │
│  │                                                      │    │
│  │  为每个关键 UI 元素定义多维度识别特征：                │    │
│  │  • 语义角色 (role, aria-label)                       │    │
│  │  • 文本内容 (placeholder, label)                      │    │
│  │  • 结构位置 (父容器层级, 兄弟元素)                     │    │
│  │  • 视觉特征 (位置, 尺寸, 可见性)                       │    │
│  │  • 行为特征 (contenteditable, tabindex)               │    │
│  └──────────────────────┬──────────────────────────────┘    │
│                         │                                   │
│                         ▼                                   │
│  ┌─────────────────────────────────────────────────────┐    │
│  │           选择器生成器 (Selector Generator)           │    │
│  │                                                      │    │
│  │  根据匹配到的元素自动生成最优 CSS 选择器：             │    │
│  │  优先级: data-testid > aria-label > role+text >      │    │
│  │          class > 结构路径 > XPath                     │    │
│  └──────────────────────┬──────────────────────────────┘    │
│                         │                                   │
│                         ▼                                   │
│  ┌─────────────────────────────────────────────────────┐    │
│  │           选择器缓存 (Selector Cache)                 │    │
│  │                                                      │    │
│  │  持久化到 ~/.trae-agent-team/ui-fingerprint.json     │    │
│  │  包含: Trae 版本号、探测时间、选择器映射表             │    │
│  │  下次启动时优先加载缓存，仅探测变化部分                 │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

#### 3.4.4 关键 UI 元素识别特征

系统需要自动识别以下关键元素，每个元素定义**多级降级识别策略**：

**Chat 输入区（最关键）**

| 优先级 | 识别特征 | 说明 |
|--------|---------|------|
| P0 | `data-testid` 包含 "chat-input" | 最稳定，Trae 团队通常不会改 |
| P1 | `role="textbox"` + `contenteditable="true"` 在 chat 容器内 | WAI-ARIA 标准 |
| P2 | `placeholder` 文本匹配 "发送消息"/"Ask"/"Type" | 多语言适配 |
| P3 | `aria-label` 包含 "chat"/"message"/"input" | 无障碍标签 |
| P4 | 父容器 class 包含 "chat" + 子元素是 `contenteditable` | 结构推断 |
| P5 | 页面右下角区域 + `contenteditable` + 最大文本框 | 位置+属性推断 |

**发送按钮**

| 优先级 | 识别特征 | 说明 |
|--------|---------|------|
| P0 | `data-testid` 包含 "send" | 最稳定 |
| P1 | `aria-label` 包含 "发送"/"send" | 无障碍标签 |
| P2 | 在 chat 输入框同级/相邻 + 包含发送图标（SVG path） | 结构推断 |
| P3 | `button` 元素 + 在 chat 容器内 + 非禁用状态 | 类型+位置推断 |

**Chat 会话列表（多任务切换关键）**

| 优先级 | 识别特征 | 说明 |
|--------|---------|------|
| P0 | `data-testid` 包含 "chat-list"/"conversation-list" | 最稳定 |
| P1 | 包含多条消息记录的列表容器 + 每项有标题和时间 | 结构推断 |
| P2 | 侧边栏中包含对话标题列表的可滚动容器 | 位置+结构推断 |

**AI 状态指示器**

| 优先级 | 识别特征 | 说明 |
|--------|---------|------|
| P0 | `data-testid` 包含 "loading"/"thinking" | 最稳定 |
| P1 | 动画元素（CSS animation）在 chat 输入区附近 | 视觉推断 |
| P2 | chat 输入框 `disabled` 或 `contenteditable="false"` | 状态推断 |
| P3 | 停止按钮出现（发送按钮变为停止图标） | 行为推断 |

**新建对话按钮（上下文恢复时需要）**

| 优先级 | 识别特征 | 说明 |
|--------|---------|------|
| P0 | `data-testid` 包含 "new-chat"/"new-conversation" | 最稳定 |
| P1 | `aria-label` 包含 "新建"/"new" + 在 chat 区域 | 无障碍标签 |
| P2 | chat 区域顶部的 "+" 或 "新建对话" 按钮 | 位置+文本推断 |

#### 3.4.5 DOM 探测器实现

```javascript
class UIRecognizer {
  constructor(cdpClient) {
    this.cdp = cdpClient;
    this.cache = null;           // 选择器缓存
    this.probeScript = null;     // 注入的探测脚本
  }

  // ========== 启动时自动探测 ==========

  async probe() {
    const startTime = Date.now();

    // Step 1: 获取 Trae 版本号
    const traeVersion = await this.detectTraeVersion();

    // Step 2: 加载缓存（如果版本匹配）
    this.cache = await this.loadCache(traeVersion);

    // Step 3: 注入探测脚本到所有 workbench 页面
    const probeResult = await this.runProbeScript();

    // Step 4: 匹配关键元素
    const selectors = this.matchElements(probeResult);

    // Step 5: 验证选择器有效性
    const validated = await this.validateSelectors(selectors);

    // Step 6: 保存缓存
    await this.saveCache({
      traeVersion,
      probedAt: new Date().toISOString(),
      selectors: validated,
      probeDuration: Date.now() - startTime
    });

    return validated;
  }

  // 注入探测脚本，扫描整个 DOM 树
  async runProbeScript() {
    const { Runtime } = this.cdp;

    const { result } = await Runtime.evaluate({
      expression: `
        (() => {
          // 扫描所有可交互元素，提取特征指纹
          const elements = document.querySelectorAll(
            'input, textarea, [contenteditable], button, [role="button"], ' +
            '[role="textbox"], [aria-label], [data-testid], a, select'
          );

          const fingerprints = [];

          for (const el of elements) {
            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);

            fingerprints.push({
              // 基础信息
              tagName: el.tagName,
              type: el.type || '',
              role: el.getAttribute('role') || '',
              dataTestId: el.getAttribute('data-testid') || '',
              ariaLabel: el.getAttribute('aria-label') || '',
              placeholder: el.placeholder || '',

              // 内容
              textContent: (el.textContent || '').trim().slice(0, 200),
              value: el.value || '',

              // 属性
              contentEditable: el.contentEditable || '',
              tabIndex: el.tabIndex,
              disabled: el.disabled,
              hidden: el.hidden || style.display === 'none' || style.visibility === 'hidden',

              // 位置
              rect: {
                x: Math.round(rect.x),
                y: Math.round(rect.y),
                width: Math.round(rect.width),
                height: Math.round(rect.height)
              },

              // CSS 类（取最后 3 级）
              classChain: this._getClassChain(el, 3),

              // 可访问性名称
              accessibleName: el.getAttribute('aria-label') ||
                el.getAttribute('title') ||
                (el.querySelector('label')?.textContent || '').trim() || ''
            });
          }

          return JSON.stringify(fingerprints);
        })()
      `,
      returnByValue: false
    });

    return JSON.parse(result.value);
  }

  // 获取元素的 CSS 类链（向上 3 级）
  _getClassChain(el, depth) {
    const chain = [];
    let current = el;
    for (let i = 0; i < depth && current; i++) {
      if (current.className && typeof current.className === 'string') {
        chain.push(current.className.split(' ').filter(c => c).slice(0, 5));
      }
      current = current.parentElement;
    }
    return chain;
  }

  // ========== 元素匹配 ==========

  matchElements(fingerprints) {
    const selectors = {};

    // 匹配 Chat 输入框
    selectors.chatInput = this._findChatInput(fingerprints);

    // 匹配发送按钮
    selectors.sendButton = this._findSendButton(fingerprints, selectors.chatInput);

    // 匹配 AI 状态指示器
    selectors.statusIndicator = this._findStatusIndicator(fingerprints);

    // 匹配 Chat 会话列表
    selectors.chatList = this._findChatList(fingerprints);

    // 匹配新建对话按钮
    selectors.newChatButton = this._findNewChatButton(fingerprints);

    // 匹配停止按钮
    selectors.stopButton = this._findStopButton(fingerprints);

    // 匹配确认弹窗
    selectors.confirmDialog = this._findConfirmDialog(fingerprints);

    return selectors;
  }

  // 多策略匹配 Chat 输入框
  _findChatInput(fingerprints) {
    // 策略 P0: data-testid
    let match = fingerprints.find(el =>
      el.dataTestId.toLowerCase().includes('chat-input') ||
      el.dataTestId.toLowerCase().includes('chat-input-area')
    );
    if (match) return { selector: `[data-testid="${match.dataTestId}"]`, confidence: 0.99, strategy: 'P0-testid' };

    // 策略 P1: role=textbox + contenteditable
    match = fingerprints.find(el =>
      el.role === 'textbox' && el.contentEditable === 'true'
    );
    if (match) return { selector: `[role="textbox"][contenteditable="true"]`, confidence: 0.95, strategy: 'P1-role' };

    // 策略 P2: placeholder 匹配
    const chatKeywords = ['发送消息', 'send message', 'ask', 'type', '输入', '描述'];
    match = fingerprints.find(el =>
      chatKeywords.some(kw =>
        el.placeholder.toLowerCase().includes(kw)
      ) && el.contentEditable === 'true'
    );
    if (match) return { selector: `[placeholder="${match.placeholder}"]`, confidence: 0.85, strategy: 'P2-placeholder' };

    // 策略 P3: aria-label 匹配
    match = fingerprints.find(el =>
      el.ariaLabel.toLowerCase().includes('chat') ||
      el.ariaLabel.toLowerCase().includes('message') ||
      el.ariaLabel.toLowerCase().includes('input')
    );
    if (match) return { selector: `[aria-label="${match.ariaLabel}"]`, confidence: 0.80, strategy: 'P3-aria' };

    // 策略 P4: contenteditable + 在 chat 容器中
    match = fingerprints.find(el =>
      el.contentEditable === 'true' &&
      el.classChain.some(classes =>
        classes.some(c => c.toLowerCase().includes('chat'))
      )
    );
    if (match) return { selector: this._buildClassSelector(match), confidence: 0.70, strategy: 'P4-structure' };

    // 策略 P5: 位置推断（右下角最大的 contenteditable）
    const editableEls = fingerprints
      .filter(el => el.contentEditable === 'true' && !el.hidden)
      .sort((a, b) => (b.rect.width * b.rect.height) - (a.rect.width * a.rect.height));
    if (editableEls.length > 0) {
      match = editableEls[0];
      return { selector: this._buildPositionSelector(match), confidence: 0.50, strategy: 'P5-position' };
    }

    return null; // 探测失败
  }

  // ========== 选择器验证 ==========

  async validateSelectors(selectors) {
    const { Runtime } = this.cdp;
    const validated = {};

    for (const [key, selectorInfo] of Object.entries(selectors)) {
      if (!selectorInfo) {
        validated[key] = null;
        continue;
      }

      try {
        const { result } = await Runtime.evaluate({
          expression: `document.querySelector('${selectorInfo.selector}') !== null`,
          returnByValue: true
        });

        if (result.value) {
          validated[key] = selectorInfo;
        } else {
          // 选择器失效，标记需要重新探测
          validated[key] = { ...selectorInfo, stale: true };
          console.warn(`[UIRecognizer] 选择器失效: ${key} (${selectorInfo.strategy})`);
        }
      } catch (err) {
        validated[key] = null;
      }
    }

    return validated;
  }

  // ========== 缓存管理 ==========

  async loadCache(traeVersion) {
    const cachePath = path.join(os.homedir(), '.trae-agent-team', 'ui-fingerprint.json');
    try {
      if (fs.existsSync(cachePath)) {
        const cached = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
        if (cached.traeVersion === traeVersion) {
          return cached;
        }
      }
    } catch {}
    return null;
  }

  async saveCache(data) {
    const dir = path.join(os.homedir(), '.trae-agent-team');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const cachePath = path.join(dir, 'ui-fingerprint.json');
    fs.writeFileSync(cachePath, JSON.stringify(data, null, 2));
  }
}
```

#### 3.4.6 Chat 会话切换（多任务关键）

多任务场景下，需要在不同的 Chat 会话之间准确切换：

```javascript
class ChatSwitcher {
  constructor(cdpClient, uiRecognizer) {
    this.cdp = cdpClient;
    this.ui = uiRecognizer;
    this.currentChatId = null;  // 当前激活的 Chat 会话 ID
  }

  // 切换到指定任务的 Chat 会话
  async switchToChat(taskId) {
    const { Runtime, DOM } = this.cdp;

    // Step 1: 如果已经在目标会话，跳过
    if (this.currentChatId === taskId) return true;

    // Step 2: 查找目标会话（通过标题匹配任务 ID）
    const chatListSelector = this.ui.cache.selectors.chatList;
    if (!chatListSelector) {
      throw new Error('Chat 列表选择器未探测到，无法切换会话');
    }

    const { result } = await Runtime.evaluate({
      expression: `
        (() => {
          const chatList = document.querySelector('${chatListSelector.selector}');
          if (!chatList) return null;

          const items = chatList.querySelectorAll('[class*="item"], [class*="row"], li, div');
          for (const item of items) {
            const title = item.textContent?.trim() || '';
            // 匹配任务 ID 或任务标题
            if (title.includes('${taskId}') || title.includes('T-${taskId}')) {
              item.click();
              return { found: true, title: title.slice(0, 100) };
            }
          }
          return { found: false };
        })()
      `,
      returnByValue: true
    });

    const switchResult = JSON.parse(result.value);
    if (!switchResult?.found) {
      // 会话不存在，需要新建
      return await this.createNewChat(taskId);
    }

    // Step 3: 等待 Chat 面板切换完成
    await this.sleep(1000);

    // Step 4: 验证切换成功（检查 Chat 输入框是否就绪）
    const ready = await this.ui.validateSelectors({
      chatInput: this.ui.cache.selectors.chatInput
    });

    if (ready.chatInput && !ready.chatInput.stale) {
      this.currentChatId = taskId;
      return true;
    }

    return false;
  }

  // 新建 Chat 会话（上下文恢复时使用）
  async createNewChat(taskId) {
    const { Runtime } = this.cdp;
    const newChatSelector = this.ui.cache.selectors.newChatButton;

    if (!newChatSelector) {
      throw new Error('新建对话按钮选择器未探测到');
    }

    // 点击新建对话按钮
    await Runtime.evaluate({
      expression: `document.querySelector('${newChatSelector.selector}')?.click()`
    });

    await this.sleep(1500);
    this.currentChatId = taskId;
    return true;
  }

  // 获取当前激活的 Chat 会话信息
  async getCurrentChatInfo() {
    const { Runtime } = this.cdp;
    const { result } = await Runtime.evaluate({
      expression: `
        (() => {
          // 尝试从 chat 标题栏获取当前会话信息
          const titleEl = document.querySelector(
            '[class*="chat"] [class*="title"], [class*="chat"] [class*="header"] h3, ' +
            '[class*="chat"] [class*="header"] span'
          );
          return titleEl?.textContent?.trim() || 'unknown';
        })()
      `,
      returnByValue: true
    });
    return result.value;
  }
}
```

#### 3.4.7 运行时自适应（MutationObserver）

注入到 Trae 页面的 MutationObserver，实时监测 DOM 结构变化：

```javascript
// 注入到 Trae 页面的自适应脚本
const ADAPTIVE_SCRIPT = `
(function() {
  if (window.__TRAE_UI_ADAPTIVE__) return;
  window.__TRAE_UI_ADAPTIVE__ = true;

  const DEBOUNCE_MS = 2000;
  let debounceTimer = null;

  const observer = new MutationObserver((mutations) => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      // 检测关键元素是否仍然存在
      const checks = {
        chatInput: document.querySelector('[contenteditable="true"]') !== null,
        sendButton: document.querySelector('[aria-label*="发送"], [aria-label*="send"]') !== null,
        chatList: document.querySelector('[class*="chat"] [class*="list"], [class*="chat"] [class*="sidebar"]') !== null
      };

      // 通过 CDP 事件通知主进程
      if (window.__TRAE_CDP_CALLBACK__) {
        window.__TRAE_CDP_CALLBACK__({
          type: 'ui-change-detected',
          checks,
          timestamp: Date.now()
        });
      }
    }, DEBOUNCE_MS);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'data-testid', 'aria-label', 'role', 'hidden', 'disabled']
  });
})();
`;
```

#### 3.4.8 CDP 连接启动流程（含 UI 探测）

```
CDP 连接建立
    │
    ▼
获取 Trae 版本号 ──→ 加载本地缓存
    │                    │
    │              版本匹配? ──→ 是 ──→ 快速验证缓存选择器
    │                    │                      │
    │                    否                     │
    │                    │              验证通过? ──→ 是 ──→ ✅ 使用缓存
    │                    │                      │
    │                    │                      否 ──→ 重新探测
    │                    ▼
    │              完整 DOM 探测
    │                    │
    │                    ▼
    │              多策略元素匹配
    │                    │
    │                    ▼
    │              选择器验证
    │                    │
    │                    ▼
    │              保存缓存
    │                    │
    ▼                    ▼
注入自适应脚本 (MutationObserver)
    │
    ▼
注入 Ralph Loop 脚本
    │
    ▼
✅ 就绪，开始接收任务
```

#### 3.4.9 探测结果缓存格式

```json
{
  "traeVersion": "1.8.2",
  "probedAt": "2026-04-25T10:30:00Z",
  "probeDuration": 850,
  "selectors": {
    "chatInput": {
      "selector": "[data-testid=\"chat-input-area\"]",
      "confidence": 0.99,
      "strategy": "P0-testid",
      "fallbacks": [
        { "selector": "[role=\"textbox\"][contenteditable=\"true\"]", "strategy": "P1-role" },
        { "selector": "[placeholder=\"发送消息\"]", "strategy": "P2-placeholder" }
      ]
    },
    "sendButton": {
      "selector": "[data-testid=\"chat-send-button\"]",
      "confidence": 0.99,
      "strategy": "P0-testid"
    },
    "statusIndicator": {
      "selector": "[data-testid=\"chat-loading-indicator\"]",
      "confidence": 0.95,
      "strategy": "P0-testid"
    },
    "chatList": {
      "selector": "[data-testid=\"chat-session-list\"]",
      "confidence": 0.99,
      "strategy": "P0-testid"
    },
    "newChatButton": {
      "selector": "[data-testid=\"new-chat-button\"]",
      "confidence": 0.99,
      "strategy": "P0-testid"
    },
    "stopButton": {
      "selector": "[data-testid=\"chat-stop-button\"]",
      "confidence": 0.95,
      "strategy": "P0-testid"
    },
    "confirmDialog": {
      "selector": "[class*=\"confirm-popover\"]",
      "confidence": 0.80,
      "strategy": "P4-structure"
    }
  },
  "history": [
    {
      "traeVersion": "1.7.9",
      "probedAt": "2026-04-20T08:00:00Z",
      "changedSelectors": ["chatInput", "sendButton"]
    }
  ]
}
```

#### 3.4.10 手动修复与选择器覆盖

当自动探测失败时，支持手动指定选择器：

```yaml
# team.yaml 中的选择器覆盖配置
ui_recognizer:
  auto_probe: true                          # 启动时自动探测
  adaptive: true                            # 运行时自适应
  cache_dir: "~/.trae-agent-team"           # 缓存目录
  probe_timeout: 10000                      # 探测超时 (ms)

  # 手动覆盖（自动探测失败时的后备）
  overrides:
    chat_input: "[data-testid='chat-input-area']"
    send_button: "[data-testid='chat-send-button']"
    chat_list: "[data-testid='chat-session-list']"
    new_chat_button: "[data-testid='new-chat-button']"

  # 探测失败时的降级行为
  on_probe_failure:
    action: "use_overrides"                 # use_overrides | abort | retry
    retry_count: 2                          # 重试次数
    notify: true                            # 飞书通知
```

---

### 3.5 飞书 → IDE Chat 自动填充（核心链路）

#### 3.5.1 完整任务流转流程

```
Step 1: 人类在飞书群聊发送任务
┌─────────────────────────────────────────────┐
│ 飞书群聊                                     │
│                                             │
│ @zhangsan: /task 实现用户登录API，使用JWT，   │
│ 包含注册和登录接口，密码用bcrypt加密           │
└──────────────────┬──────────────────────────┘
                   │ WebSocket 事件推送
                   ▼
Step 2: lark-cli 终端接收并解析
┌─────────────────────────────────────────────┐
│ LarkTerminal (agent-1)                       │
│                                             │
│ 收到消息: "/task 实现用户登录API..."          │
│ 解析结果:                                    │
│   content: "实现用户登录API，使用JWT..."      │
│   sender: "@zhangsan"                        │
│   timestamp: 2026-04-25T10:30:00Z           │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
Step 3: 创建任务 MD 文档 + Git 提交
┌─────────────────────────────────────────────┐
│ TaskManager                                  │
│                                             │
│ 1. 生成任务 ID: T-001                        │
│ 2. 创建 MD 文档:                             │
│    .trae-tasks/T-001-implement-login-api.md  │
│ 3. Git 操作:                                 │
│    git checkout -b task/T-001                │
│    git add .trae-tasks/T-001-*.md            │
│    git commit -m "T-001: start - ..."       │
│ 4. 更新多维表格状态                           │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
Step 4: 并发控制器分配到空闲 Trae 实例
┌─────────────────────────────────────────────┐
│ Dispatcher                                  │
│                                             │
│ 查找空闲实例: Trae #1 (端口 9222) ✅         │
│ ChatMutex.acquire("T-001") → 获得锁         │
│ 分配任务到 Trae #1                           │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
Step 5: CDP 注入 → 自动填充 Chat → 发送
┌─────────────────────────────────────────────┐
│ CDP Injector (Trae #1, 端口 9222)            │
│                                             │
│ 1. 连接 CDP                                  │
│ 2. 定位 Chat 输入框 (DOM 选择器)              │
│ 3. 清空输入框                                │
│ 4. 填充任务 prompt:                          │
│    "先加载 Ralph 开发规则，再决定怎么做。     │
│     使用 Ralph 模式开发。                     │
│                                             │
│     ## 任务 T-001: 实现用户登录API            │
│     实现用户登录API，使用JWT，包含注册和       │
│     登录接口，密码用bcrypt加密。               │
│                                             │
│     ## 详细要求                               │
│     - 使用 Node.js + Express                 │
│     - JWT token 认证                         │
│     - 密码 bcrypt 加密                        │
│     - 包含输入验证和错误处理                   │
│     - 编写单元测试"                           │
│ 5. 点击发送按钮                              │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
Step 6: Ralph Loop 自动化循环
┌─────────────────────────────────────────────┐
│ Ralph Loop (注入到 Trae #1)                  │
│                                             │
│ 循环检测:                                    │
│   AI 是否在工作? → 等待                       │
│   AI 停止了? → 检测原因                       │
│     ├── 上下文限制 → 自动新建任务 → 继续      │
│     ├── 确认弹窗 → 自动点击确认              │
│     ├── 任务完成 → 通知完成                  │
│     └── 错误中断 → 上报错误                  │
│                                             │
│ 同时: 监控文件变更 → 自动 Git 提交            │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
Step 7: 任务完成 → Git 提交 → 飞书回报
┌─────────────────────────────────────────────┐
│ TaskManager                                  │
│                                             │
│ 1. 更新任务 MD 文档状态为 completed           │
│ 2. 记录产出文件列表                          │
│ 3. Git 提交:                                 │
│    git add .                                │
│    git commit -m "T-001: completed"          │
│ 4. ChatMutex.release() → 释放锁             │
│ 5. 飞书群聊回报:                             │
│    "✅ T-001 已完成 by agent-1"              │
│    卡片: 产出文件、耗时、Git commit           │
│ 6. 更新多维表格状态                          │
│ 7. 检查下游依赖任务，触发执行                 │
└─────────────────────────────────────────────┘
```

#### 3.5.2 Chat 自动填充的 CDP 实现

```javascript
class ChatFiller {
  constructor(cdpClient) {
    this.cdp = cdpClient;
  }

  // 自动填充 Chat 并发送（核心方法）
  async fillAndSend(taskPrompt) {
    const { Runtime, DOM, Input } = this.cdp;

    // Step 1: 等待 Chat 输入框就绪
    await this.waitForChatReady();

    // Step 2: 聚焦输入框
    await this.focusChatInput();

    // Step 3: 清空已有内容
    await this.clearChatInput();

    // Step 4: 填充任务 prompt
    await this.typePrompt(taskPrompt);

    // Step 5: 等待渲染完成（Lexical 编辑器需要时间处理）
    await this.sleep(500);

    // Step 6: 点击发送按钮
    await this.clickSendButton();

    return true;
  }

  // 等待 Chat 输入框就绪（检查 AI 不在忙碌状态）
  async waitForChatReady() {
    const maxWait = 60000; // 最多等待 60 秒
    const interval = 1000;
    let waited = 0;

    while (waited < maxWait) {
      const isWorking = await this.checkAIWorking();
      if (!isWorking) {
        // 确认输入框可编辑
        const inputReady = await this.checkInputEditable();
        if (inputReady) return true;
      }
      await this.sleep(interval);
      waited += interval;
    }
    throw new Error('Chat 输入框等待超时');
  }

  // 清空 Chat 输入框
  async clearChatInput() {
    const { Runtime } = this.cdp;
    // 使用 execCommand 清空 contenteditable
    await Runtime.evaluate({
      expression: `
        const input = document.querySelector('.chat-input-v2-container [contenteditable="true"]');
        if (input) {
          input.focus();
          document.execCommand('selectAll');
          document.execCommand('delete');
        }
      `
    });
  }

  // 填充 prompt 文本
  async typePrompt(text) {
    const { Runtime } = this.cdp;
    // 使用 execCommand 插入文本（兼容 Lexical 编辑器）
    await Runtime.evaluate({
      expression: `
        const input = document.querySelector('.chat-input-v2-container [contenteditable="true"]');
        if (input) {
          input.focus();
          document.execCommand('insertText', false, ${JSON.stringify(text)});
        }
      `
    });
  }

  // 点击发送按钮
  async clickSendButton() {
    const { DOM } = this.cdp;
    const { root } = await DOM.getDocument();
    // 查找发送按钮
    const sendBtn = await this.findElement(
      '.chat-input-v2-container .send-button, .chat-input-v2-container [aria-label="发送"]'
    );
    if (sendBtn) {
      await DOM.resolveNode({ nodeId: sendBtn.nodeId });
      // 模拟点击
      await this.cdp.Input.dispatchMouseEvent({
        type: 'mousePressed', x: 0, y: 0, button: 'left', clickCount: 1
      });
      await this.cdp.Input.dispatchMouseEvent({
        type: 'mouseReleased', x: 0, y: 0, button: 'left', clickCount: 1
      });
    }
  }
}
```

---

### 3.6 Prompt 模板系统

#### 3.6.1 任务 Prompt 自动生成

从飞书群聊消息到 Trae Chat Prompt 的转换模板：

```javascript
function buildTaskPrompt(taskDoc) {
  return `先加载 Ralph 开发规则，再决定怎么做。
使用 Ralph 模式开发。

## 任务 ${taskDoc.task_id}: ${taskDoc.title}

${taskDoc.description}

## 详细要求

${taskDoc.requirements}

## 上下文信息

${taskDoc.context}

## 注意事项

- 所有代码变更会自动通过 Git 提交
- 完成后请确认所有测试通过
- 如需安装依赖，请先执行 npm install`;
}
```

#### 3.6.2 上下文限制恢复 Prompt

当 AI 遇到上下文长度限制时，自动生成恢复 Prompt：

```javascript
function buildResumePrompt(taskDoc, lastAction) {
  return `继续上一个任务。

## 当前任务: ${taskDoc.task_id} - ${taskDoc.title}

## 已完成的工作

${taskDoc.progress}

## 上次中断位置

${lastAction}

## 请从中断处继续

先查看当前代码状态，然后继续未完成的工作。`;
}
```

---

### 3.7 Ralph 规则系统与 Skills 模板

> **设计依据**：基于 Trae-Ralph 项目的 Rules/Skills 系统，确保 AI 在不间断开发循环中持续遵循项目规范。

#### 3.7.1 规则系统架构

Trae-Ralph 通过将规则文件注入到项目的 `.trae/` 目录，使 AI 每次被 Ralph Loop 唤醒时自动重新加载规则。本系统在此基础上扩展为**多 Agent 规则管理**：

```
┌─────────────────────────────────────────────────────────────┐
│                    规则管理层                                 │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ 全局规则      │  │ 项目规则      │  │ 任务规则      │      │
│  │ (Global)     │  │ (Project)    │  │ (Task)       │      │
│  │              │  │              │  │              │      │
│  │ • 代码风格    │  │ • 架构规范    │  │ • 任务特定    │      │
│  │ • 安全策略    │  │ • API 约定    │  │   约束条件    │      │
│  │ • 测试要求    │  │ • 数据模型    │  │ • 验收标准    │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                 │                 │                │
│         └─────────────────┼─────────────────┘                │
│                           ▼                                  │
│                  规则合并引擎 (RuleMerger)                    │
│                           │                                  │
│                           ▼                                  │
│                  注入到 .trae/rules/ 目录                     │
│                           │                                  │
│                           ▼                                  │
│              AI 每次唤醒时自动重新加载                         │
└─────────────────────────────────────────────────────────────┘
```

#### 3.7.2 Skills 模板系统

基于 Trae-Ralph 的 Skills 模板机制，预置以下开发规范 Skill：

| Skill 名称 | 类型 | 说明 |
|-----------|------|------|
| `ralph-planner` | common | 任务规划与拆解策略 |
| `ralph-task-executor` | common | 任务执行标准流程 |
| `ralph-test-executor` | common | 测试执行与验证规范 |
| `ralph-state-manager` | common | 状态管理与上下文恢复 |
| `ralph-func-analyst` | common | 功能分析与设计决策 |
| `ralph-round-initializer` | common | 每轮对话初始化检查 |
| `ralph-web-architecture` | web | Web 项目架构规范 |
| `ralph-web-requirement` | web | 需求分析与确认 |
| `ralph-web-routine` | web | Web 开发日常流程 |
| `ralph-web-task-planner` | web | Web 任务拆解模板 |
| `ralph-web-test-plan` | web | Web 测试计划生成 |

**注入方式**：

```bash
# 全部注入
trae-agent-team skills:inject -- /path/to/workspace

# 按类型注入
trae-agent-team skills:inject -- --skill-type web /path/to/workspace

# 单个注入
trae-agent-team skills:inject -- ralph-planner /path/to/workspace
```

**Skill 文件格式**（`.trae/skills/{name}/SKILL.md`）：

```markdown
---
name: "ralph-task-executor"
description: "任务执行标准流程，确保 AI 按规范完成开发任务"
---

# 任务执行规范

## 执行前检查
1. 确认当前 Git 分支与任务 ID 匹配
2. 加载项目规则 `.trae/rules/`
3. 检查依赖是否安装

## 执行流程
1. 分析任务需求，确认理解正确
2. 制定实现方案（先思考后编码）
3. 编写代码（遵循项目架构规范）
4. 编写测试（遵循 DoD 测试先行原则）
5. 运行测试，确保全部通过
6. 提交代码（Git 自动提交）

## 完成标准
- [ ] 所有测试通过
- [ ] 代码通过 ESLint 检查
- [ ] Git 已提交
```

#### 3.7.3 规则加载与 Prompt 集成

每次 Ralph Loop 唤醒 AI 时，自动在 Prompt 前缀中注入规则加载指令：

```javascript
function buildRalphPrompt(taskDoc, ruleSet) {
  return `重新加载 rules ${ruleSet.rulePath}。查看 Ralph 开发进程，继续。

## 任务 ${taskDoc.task_id}: ${taskDoc.title}

${taskDoc.description}

## 详细要求

${taskDoc.requirements}

## 当前生效规则

${ruleSet.summary}

## 注意事项

- 所有代码变更会自动通过 Git 提交
- 完成后请确认所有测试通过
- 如需安装依赖，请先执行 npm install
- 遵循 .trae/skills/ 中的开发规范`;
}
```

#### 3.7.4 自定义规则管理

用户可通过 CLI 或飞书指令管理规则：

```bash
# 查看当前规则
trae-agent-team rules list

# 添加自定义规则
trae-agent-team rules add --name "my-convention" --file ./my-rules.md

# 按优先级排序
trae-agent-team rules order --global-first
```

飞书群聊指令：

```
/rules list              # 查看当前生效规则
/rules add <name>        # 添加规则（后续粘贴规则内容）
/rules remove <name>     # 移除规则
/rules reload            # 强制所有 Agent 重新加载规则
```

#### 3.7.5 规则注入生命周期

> **v2.8.0 评审补充**：明确规则何时注入/清理，多任务并行时的隔离策略。

```
任务分配 (task:assigned)
      │
      ▼
规则合并注入
  global → project → task
  按优先级合并到 .trae/rules/
      │
      ▼
AI 每次 Ralph Loop 唤醒时自动加载
      │
      ▼
任务完成 (task:completed)
      │
      ▼
自动清理任务级规则
  保留 global + project 规则
```

| 事件 | 规则操作 | 说明 |
|------|---------|------|
| `task:assigned` | 合并注入 `global + project + task` | 三级规则按优先级合并写入 `.trae/rules/` |
| `task:running` | AI 每次唤醒自动加载 | Ralph Loop 的 `continue` Prompt 包含规则加载指令 |
| `task:completed` | 清理 `task` 级规则 | 保留 global 和 project 规则，删除任务专属规则 |
| `task:failed` | 清理 `task` 级规则 | 同 completed |
| `/rules reload` | 强制重新合并所有规则 | 人工触发，所有 Agent 立即生效 |

**多任务并行隔离**：每个任务的任务级规则存储在独立目录 `.trae/rules/tasks/{taskId}/`，互不干扰。

---

### 3.8 场景检测与自动恢复（Scene Detection）

> **设计依据**：基于 Trae-Ralph 的 8+ 种内置场景检测机制，扩展为多 Agent 并行场景管理。

#### 3.8.1 场景类型体系

| 场景 ID | 类型 | 优先级 | 说明 | 处理策略 |
|---------|------|--------|------|---------|
| `global_confirm_dialog` | GLOBAL | P0+ | 确认弹窗（`.confirm-popover-body`） | 立即点击确认，绕过冷却 |
| `global_interactive_input` | GLOBAL | P0+ | 交互式命令等待输入（`y/n`） | 自动输入 `y` 并回车 |
| `global_task_complete` | GLOBAL | P0+ | 任务完成状态检测 | 通知 TaskManager，释放锁 |
| `terminal_run_command` | OP_TERMINAL | P0 | 运行命令卡片（`.icd-run-command-card-v2`） | 自动点击运行按钮 |
| `terminal_delete_file` | OP_TERMINAL | P0 | 删除文件确认 | 检测二次确认后点击 |
| `click_alert_action` | OP_CLICK | P0 | 系统警告/错误操作（`.icube-alert-action`） | 自动点击确认/重试 |
| `click_service_exception` | OP_CLICK | P0 | 服务端异常重试 | 自动点击重试按钮 |
| `click_generic_continue` | OP_CLICK | P0 | 通用继续按钮 | 自动点击 |
| `restart_regenerate` | OP_RESTART | P1 | 重新生成/重试 | 自动点击重新生成 |
| `reply_context_limit` | OP_RESET_CONTINUE | P1 | 上下文长度限制 | 新建任务 → 全部保留 → 继续 |
| `reply_thinking_limit` | OP_REPLY | P2 | 思考次数上限 | 发送"继续"消息 |
| `stalled_state` | OP_REPLY | P2 | 卡死状态（6 分钟无变化） | 停止 → 发送恢复 Prompt |

#### 3.8.2 多级优先级调度

```
每个 Agent 的 Ralph Loop（5s 间隔）:

  ┌─ P0+ 全局阻断检查 (getGlobalOp)
  │    确认弹窗 → 交互输入 → 任务完成
  │    ⚡ 绕过冷却时间，立即处理
  │
  ├─ P0 关键操作 (getNextPendingOp)
  │    TERMINAL > CLICK > RESTART > REPLY
  │    ⏱️ 全局冷却 60s
  │
  ├─ P1 AI 状态检测 (isAIWorking)
  │    $trae.status.loading → DOM 降级检测
  │    排除: "正在等待你的操作" / "命令运行中"
  │
  ├─ P2 停止状态处理 (processStoppedState)
  │    稳定计数器 ≥ 3 → 触发场景处理
  │
  └─ P2 卡死监控 (monitorStalledState)
       签名 6 分钟无变化 → 强制停止 → 恢复
```

#### 3.8.3 AI 工作状态检测

```javascript
// 多策略 AI 状态检测（从 Trae-Ralph 提取并增强）
function isAIWorking() {
  // 策略 1: $trae 全局对象（首选）
  if (window.$trae) {
    if (isBlockingError()) return false;  // 阻断性异常强制判定停止
    if (window.$trae.status.loading) {
      const text = window.$trae.status.text || '';
      if (text.includes('正在等待你的操作') ||
          text.includes('命令运行中')) {
        return false;  // 视为空闲
      }
      return true;
    }
  }

  // 策略 2: DOM 信号降级
  const stopButton = document.querySelector('.codicon-stop-circle');
  const loadingIndicator = document.querySelector('[class*="loading"]');
  const inputDisabled = document.querySelector('[contenteditable="true"][disabled]');

  return !!(stopButton || loadingIndicator || inputDisabled);
}
```

#### 3.8.4 上下文限制自动恢复

```javascript
async function resetContextAndContinue(taskDoc) {
  // 1. 点击"新建任务"按钮
  await clickElement(selectors.newChatButton);

  // 2. 等待弹窗出现，点击"全部保留"
  await waitForElement(selectors.keepAllButton);
  await clickElement(selectors.keepAllButton);

  // 3. 等待新对话就绪
  await sleep(10000);

  // 4. 发送恢复 Prompt
  const resumePrompt = buildResumePrompt(taskDoc, lastAction);
  await fillChat(resumePrompt);
  await clickSendButton();

  // 5. 记录上下文重置事件
  eventBus.emit('context:reset', { taskId: taskDoc.task_id, resetCount: ++resetCount });
}
```

#### 3.8.5 卡死检测与恢复

```javascript
// 基于 Signature 的卡死检测
const STALLED_CHECK_INTERVAL = 6 * 60 * 1000; // 6 分钟

function monitorStalledState() {
  const currentSignature = getLastTurnSignature();

  if (currentSignature === lastSignature &&
      Date.now() - lastSignatureTime > STALLED_CHECK_INTERVAL) {
    logger.warn('检测到 AI 卡死状态', { agent, duration: '6min+' });

    // 强制停止当前任务
    await clickStopButton();

    // 发送恢复 Prompt
    await sleep(1000);
    await fillChat(CONFIG.messages.stalled);
    await clickSendButton();

    // 重置签名
    lastSignature = null;
    lastSignatureTime = Date.now();
  }
}
```

#### 3.8.6 自定义场景扩展

```bash
# 查看内置场景
trae-agent-team scenarios list

# 创建自定义场景
trae-agent-team scenarios create --id "custom_deploy_confirm" --type "OP_CLICK"

# 测试场景匹配
trae-agent-team scenarios test --id "custom_deploy_confirm" --dom-snapshot ./snapshot.html
```

---

## 4. 飞书多维表格看板与审批系统

### 4.1 设计理念

多维表格作为**人类观察和管控任务流转的中央看板**，是整个系统中人类与 AI 协作的唯一可视化入口。

**核心理念**：

- **人类只看表格，不碰代码**：通过多维表格观察所有任务状态、进度、产出
- **关键节点必须审批**：任务在特定节点暂停，等待人类确认后才继续
- **审批即流转**：人类在表格中修改状态字段 = 下达指令，系统自动响应
- **实时同步**：Agent 的每一次状态变化都实时反映到表格

### 4.2 看板视图设计

#### 4.2.1 主看板视图（Kanban View）

按任务状态分列展示，人类一眼掌握全局：

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    📋 任务看板 — my-project                             │
│                                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │ ⏳ 待分配  │  │ 🔵 待审批  │  │ 🔄 执行中  │  │ ⏸️ 阻塞   │  │ ✅ 已完成  │
│  │          │  │          │  │          │  │          │  │          │  │
│  │ T-005    │  │ T-003    │  │ T-001    │  │          │  │ T-002    │  │
│  │ 创建登录  │  │ E2E测试   │  │ 登录API  │  │          │  │ 注册页面  │  │
│  │ 页面     │  │ ⚠️需审批   │  │ agent-1  │  │          │  │ agent-2  │  │
│  │ P2       │  │ 依赖完成   │  │ 75% ████░│  │          │  │ 23min    │  │
│  │          │  │          │  │          │  │          │  │          │  │
│  │ T-006    │  │          │  │ T-004    │  │          │  │          │  │
│  │ 审查代码  │  │          │  │ 代码审查  │  │          │  │          │  │
│  │ P2       │  │          │  │ agent-3  │  │          │  │          │  │
│  │          │  │          │  │ 30% ██░░░│  │          │  │          │  │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

#### 4.2.2 Agent 视图（分组视图）

按 Agent 分组，查看每个 Agent 的工作负载：

```
┌─────────────────────────────────────────────────────────┐
│  🤖 agent-1 (Trae #1, 端口 9222)                        │
│  ┌───────────────────────────────────────────────────┐  │
│  │ T-001 实现用户登录API    🔄 执行中  75%  ████████░░│  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  🤖 agent-2 (Trae #2, 端口 9223)                        │
│  ┌───────────────────────────────────────────────────┐  │
│  │ T-002 实现注册表单页面    ✅ 已完成  100% ██████████│  │
│  └───────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────┐  │
│  │ T-004 代码审查           🔄 执行中  30%  ███░░░░░░│  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  🤖 agent-3 (空闲)                                       │
│  ┌───────────────────────────────────────────────────┐  │
│  │  暂无任务                                          │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

#### 4.2.3 时间线视图（甘特视图）

展示任务时间线和依赖关系：

```
┌─────────────────────────────────────────────────────────┐
│  📅 时间线                                               │
│                                                         │
│  T-001 ████████████████████████░░░░░░░░░░░  10:30-11:15 │
│         │                                               │
│  T-002 ░░░░░░░░█████████████████████████████  10:35-11:20│
│         │                                               │
│  T-003 ░░░░░░░░░░░░░░░░░░░░░░████████████████  等待审批  │
│         │              │                                  │
│  T-004 ░░░░░░░░░░░░░░░████████████░░░░░░░░░░  11:00-??  │
│                        ↑                                  │
│                   依赖 T-001 完成                           │
└─────────────────────────────────────────────────────────┘
```

### 4.3 多维表格数据表结构

#### 4.3.1 主表：任务表（tasks）

| 字段名 | 字段类型 | 说明 | 示例 |
|--------|---------|------|------|
| 任务 ID | 文本 | 唯一标识 | `T-001` |
| 任务标题 | 文本 | 任务描述 | `实现用户登录API` |
| 任务描述 | 文本 | 详细需求（长文本） | `使用JWT认证，包含注册和登录...` |
| 分配 Agent | 单选 | 执行者 | `agent-1` / `agent-2` / `未分配` |
| 状态 | 单选 | 当前状态 | `待分配` / `待审批` / `执行中` / `阻塞` / `已完成` / `已取消` / `已失败` |
| 审批状态 | 单选 | 审批流程状态 | `无需审批` / `待审批` / `已批准` / `已拒绝` / `已超时` |
| 审批人 | 人员 | 审批操作人 | `@zhangsan` |
| 审批时间 | 日期 | 审批操作时间 | `2026-04-25 10:35` |
| 审批备注 | 文本 | 审批意见 | `API 接口定义需要补充错误码` |
| 优先级 | 单选 | 优先级 | `P0 紧急` / `P1 高` / `P2 中` / `P3 低` |
| 进度 | 数字 | 0-100 | `75` |
| 依赖任务 | 关联 | 前置任务 | `T-001` |
| 开始时间 | 日期 | 任务开始 | `2026-04-25 10:30` |
| 完成时间 | 日期 | 任务完成 | `2026-04-25 11:15` |
| 耗时(分钟) | 数字 | 执行时长 | `45` |
| Git 分支 | 文本 | 分支名 | `task/T-001` |
| Git 提交数 | 数字 | 提交次数 | `5` |
| 产出文件 | 文本 | 相关文件 | `src/api/auth.ts, src/api/auth.test.ts` |
| 错误信息 | 文本 | 失败详情 | `TypeError: Cannot read...` |
| 重试次数 | 数字 | 已重试次数 | `1` |
| 创建来源 | 单选 | 任务来源 | `飞书群聊` / `表格手动` / `依赖触发` |
| 创建人 | 人员 | 创建者 | `@zhangsan` |
| 备注 | 文本 | 补充说明 | 自由文本 |

#### 4.3.2 辅助表：审批记录表（approvals）

| 字段名 | 字段类型 | 说明 |
|--------|---------|------|
| 审批 ID | 文本 | 唯一标识 |
| 任务 ID | 关联 | 关联任务 |
| 审批节点 | 单选 | 审批类型 |
| 审批状态 | 单选 | `待审批` / `已批准` / `已拒绝` / `已超时` |
| 审批人 | 人员 | 操作人 |
| 审批时间 | 日期 | 操作时间 |
| 审批意见 | 文本 | 备注 |
| 超时时间 | 日期 | 超时截止时间 |
| 飞书消息 ID | 文本 | 关联的群聊消息 |

#### 4.3.3 辅助表：Agent 状态表（agents）

| 字段名 | 字段类型 | 说明 |
|--------|---------|------|
| Agent ID | 文本 | 唯一标识 |
| Agent 名称 | 文本 | 显示名称 |
| Trae 端口 | 数字 | CDP 端口 |
| 当前任务 | 关联 | 正在执行的任务 |
| 状态 | 单选 | `空闲` / `忙碌` / `离线` |
| 已完成任务数 | 数字 | 累计完成数 |
| 总工作时长(分钟) | 数字 | 累计工作时长 |
| 最后心跳 | 日期 | 最后活跃时间 |

### 4.4 关键节点审批流程

#### 4.4.1 审批节点定义

任务生命周期中定义以下审批节点：

```
任务创建
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│  审批节点 1：任务启动审批（可选）                          │
│  触发条件：任务优先级为 P0 或包含危险关键词               │
│  审批内容：确认任务描述、分配 Agent、依赖关系              │
│  默认行为：自动通过（P1-P3）/ 需审批（P0）                │
└──────────────────────┬──────────────────────────────────┘
                       │ 人类在表格中批准
                       ▼
              Agent 开始执行
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│  审批节点 2：危险操作审批（实时）                          │
│  触发条件：Agent 检测到删除文件、数据库操作、部署等        │
│  审批内容：操作类型、目标文件/命令、风险评估               │
│  默认行为：必须人工审批，5 分钟超时自动拒绝                │
└──────────────────────┬──────────────────────────────────┘
                       │ 人类在群聊/表格中批准
                       ▼
              Agent 继续执行
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│  审批节点 3：代码合并审批（任务完成后）                     │
│  触发条件：任务完成，准备合并到主分支                      │
│  审批内容：变更文件列表、测试结果、代码差异                 │
│  默认行为：必须人工审批                                   │
└──────────────────────┬──────────────────────────────────┘
                       │ 人类在表格中批准
                       ▼
              合并到主分支
```

#### 4.4.2 审批节点配置

```yaml
# team.yaml 中的审批配置
approval:
  enabled: true

  # 审批节点定义
  gates:
    # 节点 1：任务启动审批
    task_start:
      enabled: true
      # 哪些任务需要审批
      require_for:
        priorities: ["P0"]              # P0 任务必须审批
        keywords: ["部署", "生产", "线上", "release", "deploy"]
      auto_approve:
        priorities: ["P1", "P2", "P3"]  # P1-P3 自动通过
      timeout_minutes: 60               # 1 小时未审批自动通过（非 P0）
      timeout_action: "approve"          # approve | reject | escalate

    # 节点 2：危险操作审批
    dangerous_operation:
      enabled: true
      # 触发审批的操作模式
      patterns:
        - regex: "rm\\s+-rf"             # 删除命令
        - regex: "DROP\\s+TABLE"         # 数据库删除
        - regex: "DELETE\\s+FROM"        # 数据库删除
        - regex: "git\\s+push.*main"    # 推送到主分支
        - regex: "npm\\s+publish"        # 发布包
        - regex: "deploy"                # 部署命令
      timeout_minutes: 5                 # 5 分钟超时
      timeout_action: "reject"           # 超时自动拒绝
      notify: true                       # 飞书通知

    # 节点 3：代码合并审批
    code_merge:
      enabled: true
      require_for: "all"                 # 所有任务合并都需要审批
      timeout_minutes: 1440              # 24 小时
      timeout_action: "reject"
      auto_create_review: true           # 自动创建代码审查任务

  # 审批通知渠道
  notify_channels:
    - lark_card                          # 飞书群聊卡片
    - bitable_record                     # 多维表格记录更新

  # 审批人（默认为任务创建人，可覆盖）
  default_approver: "${DEFAULT_APPROVER}"
```

#### 4.4.3 审批交互流程

**方式一：多维表格内审批（推荐）**

人类直接在多维表格中修改字段，系统通过 Webhook 或轮询检测变更：

```
人类操作流程：
1. 打开飞书多维表格
2. 找到"待审批"列中的任务
3. 查看任务详情和审批备注
4. 修改"审批状态"字段为"已批准"
5. （可选）填写"审批意见"

系统响应：
1. 检测到审批状态变更（轮询/Webhook）
2. 更新任务 MD 文档
3. Git 提交审批记录
4. 通知对应 Agent 继续执行
5. 飞书群聊发送审批结果通知
```

**方式二：飞书群聊审批**

通过群聊交互式卡片一键审批：

```
┌─────────────────────────────────────────────┐
│ ⚠️ 任务审批请求                              │
│                                             │
│ 任务: T-003 编写注册流程E2E测试              │
│ Agent: agent-3                              │
│ 审批节点: 任务启动审批                        │
│ 原因: P1 优先级任务，依赖 T-001/T-002 已完成  │
│                                             │
│ 📋 任务描述:                                 │
│ 使用 Playwright 编写用户注册流程的端到端     │
│ 测试，覆盖正常注册、重复邮箱、密码错误等场景  │
│                                             │
│ ⏰ 超时时间: 60 分钟                         │
│                                             │
│ [✅ 批准]  [❌ 拒绝]  [📋 查看表格]          │
└─────────────────────────────────────────────┘
```

**方式三：CLI 审批**

```bash
# 查看待审批任务
trae-agent-team approval list

# 批准任务
trae-agent-team approval approve T-003 --note "同意，注意覆盖边界场景"

# 拒绝任务
trae-agent-team approval reject T-003 --note "测试范围需要调整"

# 查看审批历史
trae-agent-team approval history
```

#### 4.4.4 审批状态机

```
                    任务触发审批节点
                          │
                          ▼
                   ┌─────────────┐
                   │   待审批     │
                   │  (pending)  │
                   └──────┬──────┘
                          │
            ┌─────────────┼─────────────┐
            ▼             ▼             ▼
     ┌──────────┐  ┌──────────┐  ┌──────────┐
     │  已批准   │  │  已拒绝   │  │  已超时   │
     │ approved │  │ rejected │  │ expired  │
     └────┬─────┘  └────┬─────┘  └────┬─────┘
          │             │             │
          ▼             ▼             ▼
     继续执行      任务取消/重试    按配置处理
                                (approve/reject
                                 /escalate)
```

### 4.5 多维表格同步机制

#### 4.5.1 同步策略

| 事件 | 同步动作 | 频率 |
|------|---------|------|
| 任务创建 | 新增记录 | 实时 |
| 任务状态变更 | 更新"状态"字段 | 实时 |
| 进度更新 | 更新"进度"字段 | 每 30 秒或变化 > 10% |
| 审批状态变更 | 更新"审批状态"字段 | 实时 |
| Agent 心跳 | 更新 Agent 状态表 | 每 60 秒 |
| Git 提交 | 更新"Git 提交数"字段 | 每次 commit |
| 文件产出 | 追加"产出文件"字段 | 每次 AI 保存文件 |
| 错误发生 | 更新"错误信息"字段 | 实时 |

#### 4.5.2 双向同步（表格 → 系统）

系统需要监听人类在表格中的手动修改：

```javascript
class BitableWatcher {
  constructor(config) {
    this.appToken = config.bitable.app_token;
    this.tableId = config.bitable.table_id;
    this.pollInterval = 3000;  // 3 秒轮询
    this.lastSyncTime = Date.now();
  }

  // 轮询检测人类在表格中的修改
  async startWatching() {
    setInterval(async () => {
      await this.checkForHumanChanges();
    }, this.pollInterval);
  }

  async checkForHumanChanges() {
    // 查询最近更新的记录
    const records = await this.queryRecentRecords(this.lastSyncTime);

    for (const record of records) {
      const fields = record.fields;

      // 检测审批状态变更（人类审批）
      if (fields['审批状态'] === '已批准') {
        await this.handleApprovalApproved(record);
      } else if (fields['审批状态'] === '已拒绝') {
        await this.handleApprovalRejected(record);
      }

      // 检测状态手动变更（人类强制修改任务状态）
      if (fields['状态'] === '已取消' && record.lastModifiedBy !== 'system') {
        await this.handleManualCancel(record);
      }

      // 检测优先级变更
      if (fields['优先级'] !== record.originalPriority) {
        await this.handlePriorityChange(record);
      }
    }

    this.lastSyncTime = Date.now();
  }

  // 查询最近更新的记录
  async queryRecentRecords(since) {
    const result = await exec(`
      lark-cli base +record-search \\
        --app-token ${this.appToken} \\
        --table-id ${this.tableId} \\
        --filter '最后更新时间 > "${new Date(since).toISOString()}"' \\
        --sort '最后更新时间 ASC'
    `);
    return JSON.parse(result);
  }
}
```

#### 4.5.3 lark-cli 同步命令参考

```bash
# 创建任务记录
lark-cli base +record-create \
  --app-token "${BITABLE_APP}" \
  --table-id "${BITABLE_TABLE}" \
  --fields '{
    "任务ID": "T-001",
    "任务标题": "实现用户登录API",
    "分配Agent": "agent-1",
    "状态": "执行中",
    "审批状态": "无需审批",
    "优先级": "P1",
    "进度": 0,
    "创建来源": "飞书群聊"
  }'

# 更新任务进度
lark-cli base +record-update \
  --app-token "${BITABLE_APP}" \
  --table-id "${BITABLE_TABLE}" \
  --filter '任务ID = "T-001"' \
  --fields '{"状态": "执行中", "进度": 75}'

# 查询待审批任务
lark-cli base +record-search \
  --app-token "${BITABLE_APP}" \
  --table-id "${BITABLE_TABLE}" \
  --filter '审批状态 = "待审批"' \
  --sort '创建时间 ASC'

# 创建审批记录
lark-cli base +record-create \
  --app-token "${BITABLE_APP}" \
  --table-id "${APPROVALS_TABLE}" \
  --fields '{
    "审批ID": "A-001",
    "任务ID": ["T-001"],
    "审批节点": "任务启动审批",
    "审批状态": "待审批",
    "超时时间": "2026-04-25T11:30:00Z"
  }'
```

### 4.6 看板自动化（飞书多维表格自动化规则）

利用飞书多维表格的**自动化**功能，实现零代码的看板联动：

| 自动化规则 | 触发条件 | 执行动作 |
|-----------|---------|---------|
| 新任务通知 | 新增记录 | 发送飞书群聊通知 |
| 审批超时提醒 | 审批状态="待审批" 且超过超时时间 | 发送催办消息给审批人 |
| 任务完成通知 | 状态变更为"已完成" | 发送群聊通知 + 更新 Agent 状态 |
| 任务失败告警 | 状态变更为"已失败" 且重试次数 >= 3 | 发送紧急告警给创建人 |
| 阻塞任务提醒 | 状态变更为"阻塞" 且超过 10 分钟 | 发送提醒给创建人 |
| Agent 空闲检测 | Agent 状态表显示空闲 > 5 分钟 | 自动分配排队任务 |

### 4.7 群聊指令扩展（审批相关）

| 指令 | 格式 | 说明 |
|------|------|------|
| **查看待审批** | `/approvals` | 列出所有待审批任务 |
| **批准任务** | `/approve {task-id} [--note "意见"]` | 批准任务 |
| **拒绝任务** | `/reject {task-id} [--note "原因"]` | 拒绝任务 |
| **查看审批历史** | `/approval history` | 审批操作记录 |
| **打开看板** | `/board` | 发送多维表格链接 |
| **查看 Agent 负载** | `/agents` | Agent 工作负载概览 |

---

## 5. 飞书群聊指令设计

### 5.1 任务指令

| 指令 | 格式 | 说明 |
|------|------|------|
| **创建任务** | `/task {描述}` | 创建新任务，自动分配到空闲 Agent |
| **指定 Agent** | `/task {描述} -> {agent-id}` | 创建任务并指定执行 Agent |
| **设置优先级** | `/task {描述} !P0` | 创建高优先级任务 |
| **查看任务** | `/tasks` | 列出所有任务状态 |
| **查看详情** | `/task {task-id}` | 查看任务详情 |
| **取消任务** | `/cancel {task-id}` | 取消排队中的任务 |

### 5.2 Agent 管理指令

| 指令 | 格式 | 说明 |
|------|------|------|
| **查看状态** | `/status` | 所有 Agent 和任务状态 |
| **重启 Agent** | `/restart {agent-id}` | 重启指定 Agent |
| **停止 Agent** | `/stop {agent-id}` | 停止指定 Agent |
| **查看日志** | `/log {agent-id} [n]` | 查看最近 n 条日志 |

### 5.3 Git 指令

| 指令 | 格式 | 说明 |
|------|------|------|
| **查看提交** | `/git log [task-id]` | 查看任务相关的 Git 提交 |
| **合并分支** | `/git merge {task-id}` | 将任务分支合并到主分支 |
| **查看差异** | `/git diff {task-id}` | 查看任务代码变更 |

### 5.4 群聊消息示例

```
# 人类发送任务
@zhangsan: /task 实现用户注册API，使用JWT，包含注册和登录接口 !P1

# 系统自动回复
🤖 System:
  📋 任务已创建
  ID: T-001
  标题: 实现用户注册API
  优先级: P1
  分配到: agent-1 (Trae #1)
  Git 分支: task/T-001
  状态: ⏳ 排队中

# 任务开始执行
🤖 agent-1:
  🚀 T-001 开始执行
  已填充到 Trae Chat，AI 正在处理...

# 进度更新
🤖 agent-1:
  📊 T-001 进度更新 (50%)
  ✅ 用户注册接口已完成
  🔄 用户登录接口开发中...

# 任务完成
🤖 agent-1:
  ✅ T-001 已完成
  耗时: 23 分钟
  📎 产出:
    - src/api/auth/register.ts
    - src/api/auth/login.ts
    - src/api/auth/__tests__/auth.test.ts
  🔗 Git: task/T-001 (3 commits)
  💬 查看: /git diff T-001

# 查看所有任务
@zhangsan: /tasks

🤖 System:
  ┌────────┬──────────────────────┬────────┬────────┐
  │ ID     │ 标题                  │ Agent  │ 状态   │
  ├────────┼──────────────────────┼────────┼────────┤
  │ T-001  │ 实现用户注册API       │ agent-1│ ✅ 完成 │
  │ T-002  │ 编写E2E测试           │ agent-2│ 🔄 45% │
  │ T-003  │ 创建登录页面           │ -      │ ⏳ 排队 │
  └────────┴──────────────────────┴────────┴────────┘
```

---

## 6. 配置文件设计

### 6.1 主配置文件（team.yaml）

```yaml
version: "2.0"
name: "my-project"

# Trae IDE 配置
trae:
  path: "D:\\Program Files\\Trae\\Trae.exe"  # Trae 可执行文件路径
  instances:
    - id: agent-1
      port: 9222
      workspace: "./ws/agent-1"
    - id: agent-2
      port: 9223
      workspace: "./ws/agent-2"
    - id: agent-3
      port: 9224
      workspace: "./ws/agent-3"
  startup_delay: 5000      # 启动等待时间 (ms)
  check_interval: 5000     # Ralph Loop 检查间隔 (ms)
  stable_count: 3          # 状态稳定判定次数

# 飞书配置
lark:
  app_id: "${LARK_APP_ID}"
  app_secret: "${LARK_APP_SECRET}"
  chat_id: "${LARK_CHAT_ID}"
  bitable:
    app_token: "${LARK_BITABLE_APP}"
    table_id: "${LARK_BITABLE_TABLE}"

# Git 配置
git:
  auto_commit: true                    # AI 文件变更自动提交
  commit_interval: 30000               # 自动提交间隔 (ms)
  branch_prefix: "task/"               # 任务分支前缀
  auto_merge: false                    # 完成后是否自动合并到主分支
  task_docs_dir: ".trae-tasks"         # 任务 MD 文档目录

# 并发控制
concurrency:
  max_parallel: 3                      # 最大并行任务数
  chat_send_timeout: 10000             # Chat 发送超时 (ms)
  task_queue_size: 100                 # 任务队列最大长度

# 安全策略
safety:
  auto_confirm: false                  # 是否自动确认弹窗
  dangerous_commands:                  # 危险命令（需人工审批）
    - "rm -rf"
    - "DROP TABLE"
    - "DELETE FROM"
  allowed_terminal_commands:           # 允许的终端命令白名单
    - "npm"
    - "node"
    - "npx"
    - "git"
    - "cat"
    - "ls"
```

### 6.2 任务依赖配置（tasks.yaml）

```yaml
# tasks.yaml — 任务依赖和优先级定义
tasks:
  - id: "T-001"
    title: "定义 API 接口规范"
    priority: "P0"
    auto_assign: true

  - id: "T-002"
    title: "实现用户注册 API"
    priority: "P1"
    deps: ["T-001"]

  - id: "T-003"
    title: "实现注册表单页面"
    priority: "P1"
    deps: ["T-001"]

  - id: "T-004"
    title: "编写注册流程 E2E 测试"
    priority: "P2"
    deps: ["T-002", "T-003"]
```

---

## 7. VS Code 插件设计

> **评审重点**：本章为 v2.3.0 新增内容，涵盖 VS Code 插件的完整设计方案，包括配置面板、CDP 探测集成、Trae 版本适配、侧边栏状态视图。

### 7.1 插件概述

#### 7.1.1 定位

> **v3.0.0 修正**：VS Code 插件的定位是**控制平面**而非展示层。它与 TaskManager 之间有双向实时通信。

VS Code 插件是 Trae Agent Team 的**控制平面**，提供：

1. **角色配置管理** — 管理每个角色的 Prompt、模型选择、任务槽位绑定（对应 `.trae/agents/` 的 7 个 Prompt 文件）
2. **任务创建与分配** — 创建任务并分配到角色槽位，监控任务状态流转
3. **飞书终端监控** — 实时查看每个角色槽位的飞书监听终端状态（在线/断连/重连中）
4. **手动干预入口** — 强制激活某个槽位、重启飞书终端、手动下发指令
5. **Trae 版本适配管理** — CDP UI 探测 + 选择器自动生成 + 手动覆盖

**双向实时通信**：插件通过 WebSocket 与 TaskManager 通信，既能下发指令（创建任务、重启终端），也能实时接收状态变更（终端断连、任务完成、异常告警）。

#### 7.1.2 插件元信息

| 字段 | 值 |
|------|-----|
| **插件 ID** | `trae-agent-team` |
| **显示名称** | Trae Agent Team |
| **描述** | 飞书驱动的 Trae 多任务多智能体协作系统 - Agent 配置与 Trae 版本适配管理 |
| **版本** | 0.1.0 |
| **最低 VS Code 版本** | 1.85.0 |
| **分类** | Programming Languages, Other |
| **主入口** | `./src/extension.js` |
| **核心依赖** | `chrome-remote-interface@^0.32.2` |

#### 7.1.3 激活事件

| 激活方式 | 事件 |
|---------|------|
| 命令激活 | `onCommand:traeAgentTeam.openConfig` |
| 命令激活 | `onCommand:traeAgentTeam.probeUI` |
| 命令激活 | `onCommand:traeAgentTeam.startTeam` |
| 命令激活 | `onCommand:traeAgentTeam.stopTeam` |
| 视图激活 | `onView:traeAgentTeamStatus` |

---

### 7.2 配置面板设计（4-Tab Webview）

#### 7.2.1 整体布局

配置面板采用 **Webview Panel** 实现，支持两种打开方式：
- **侧边栏视图**：通过 Activity Bar 的 "Trae Agent Team" 图标打开
- **编辑器面板**：通过命令 `Trae Team: 打开配置面板` 打开（`ViewColumn.One`）

面板顶部为 4 个 Tab 页签，每个 Tab 对应一个配置域：

```
┌─────────────────────────────────────────────────────────────┐
│  Trae Agent Team                                            │
│  飞书驱动的 Trae 多任务多智能体协作系统 — 配置面板            │
├────────────┬────────────┬────────────┬───────────────────────┤
│ Agent 配置 │ Trae 适配  │ 飞书集成   │ 审批策略              │
├────────────┴────────────┴────────────┴───────────────────────┤
│                                                              │
│  [当前 Tab 内容区域]                                         │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

#### 7.2.2 Tab 1：Agent 配置

**功能**：管理 Trae IDE 路径和多 Agent 实例参数绑定。

| 配置项 | 类型 | 说明 |
|--------|------|------|
| Trae IDE 可执行文件路径 | 文件浏览 | 选择 Trae IDE 的 `.exe` 文件 |
| Agent ID | 文本 | 实例标识（如 `agent-1`） |
| CDP 调试端口 | 数字 | 远程调试端口（默认 9222 起步递增） |
| 工作区路径 | 文件夹浏览 | 该 Agent 绑定的工作区目录 |
| 启用状态 | 开关 | 是否启用该 Agent 实例 |

**交互流程**：

```
用户点击「浏览」→ VS Code 文件选择对话框 → 选择 Trae IDE 路径
用户点击「+ 添加 Agent」→ 新增 Agent 卡片（自动分配端口和 ID）
用户修改参数 → 点击「保存配置」→ 写入 ~/.trae-agent-team/team-config.json
```

**Agent 卡片 UI**：

```
┌──────────────────────────────────────────────┐
│  agent-1                          [已启用]   │
├──────────────────────────────────────────────┤
│  CDP 端口: [9222]    状态: [●──] ON          │
│  工作区:   [/path/to/ws]  [浏览]             │
└──────────────────────────────────────────────┘
```

#### 7.2.3 Tab 2：Trae 适配

**功能**：CDP UI 自动探测、选择器覆盖配置、历史探测记录。

**子模块 1：UI 自动探测**

| 配置项 | 说明 |
|--------|------|
| 探测端口 | 指定 Trae 实例的 CDP 调试端口 |
| 探测按钮 | 触发 CDP 连接并扫描 DOM 元素 |
| 探测结果 | 展示 6 类关键 UI 元素的匹配状态 |

**探测结果展示**：

```
┌──────────────────────────────────────────────────────┐
│  端口 9222 探测结果                      5/6 匹配 ✅ │
├──────────────────────────────────────────────────────┤
│  Chat 输入框        ✅ P0  [data-testid="chat-input"]│
│  发送按钮           ✅ P0  [data-testid="send-btn"]  │
│  AI 状态指示器      ✅ P1  [role="loading"]          │
│  Chat 会话列表      ✅ P0  [data-testid="chat-list"] │
│  新建对话按钮       ✅ P0  [data-testid="new-chat"]  │
│  确认弹窗           ❌ 未匹配                        │
├──────────────────────────────────────────────────────┤
│  [应用探测结果到选择器覆盖]                            │
└──────────────────────────────────────────────────────┘
```

**子模块 2：选择器覆盖（手动配置）**

当自动探测失败或结果不准确时，支持手动指定 CSS 选择器：

| UI 元素 | 选择器 Key | 默认值 |
|---------|-----------|--------|
| Chat 输入框 | `chat_input` | 自动探测 |
| 发送按钮 | `send_button` | 自动探测 |
| AI 状态指示器 | `status_indicator` | 自动探测 |
| Chat 会话列表 | `chat_list` | 自动探测 |
| 新建对话按钮 | `new_chat_button` | 自动探测 |
| 确认弹窗 | `confirm_dialog` | 自动探测 |

**子模块 3：历史探测记录**

展示所有已保存的 UI 指纹文件（`~/.trae-agent-team/fingerprints/ui-fingerprint-{port}.json`），包含：
- Trae 版本号
- 探测时间
- 匹配率
- 各元素选择器

#### 7.2.4 Tab 3：飞书集成

**功能**：配置飞书应用凭证和多维表格绑定。

| 配置项 | 类型 | 说明 |
|--------|------|------|
| App ID | 文本 | 飞书应用 ID（`cli_xxx`） |
| App Secret | 密码 | 飞书应用密钥 |
| 群聊 ID | 文本 | 监听的飞书群聊 ID（`oc_xxx`） |
| 多维表格 App Token | 文本 | 飞书多维表格 Token（`bascnxxx`） |
| 数据表 ID | 文本 | 任务数据表 ID（`tblxxx`） |

#### 7.2.5 Tab 4：审批策略

**功能**：配置三级审批节点的参数。

| 审批节点 | 配置项 | 默认值 |
|---------|--------|--------|
| **总开关** | 启用审批 | `true` |
| **任务启动审批** | 需要审批的优先级 | `P0` |
| | 超时时间 | 60 分钟 |
| | 超时操作 | 自动通过 |
| **危险操作审批** | 超时时间 | 5 分钟 |
| | 超时操作 | 自动拒绝 |
| **代码合并审批** | 超时时间 | 1440 分钟（24 小时） |
| | 超时操作 | 自动拒绝 |

---

### 7.3 CDP UI 探测集成

#### 7.3.1 探测流程

```
用户点击「探测」按钮
       │
       ▼
UIProbeRunner.probe(port)
       │
       ├── 1. CDP 连接 Trae 实例（chrome-remote-interface）
       │
       ├── 2. 发现 Target → 定位 workbench 页面
       │
       ├── 3. 注入 PROBE_SCRIPT → 扫描所有交互元素
       │      (input, textarea, [contenteditable], button, [role="button"],
       │       [role="textbox"], [aria-label], [data-testid], a, select)
       │
       ├── 4. 提取元素指纹
       │      (tagName, type, role, dataTestId, ariaLabel, placeholder,
       │       contentEditable, disabled, hidden, rect, classChain)
       │
       ├── 5. 多策略匹配（matchElements）
       │      P0: data-testid 正则匹配
       │      P1: role + contentEditable 匹配
       │      P2: placeholder 关键词匹配
       │      P3: ariaLabel 关键词匹配
       │      P4: classChain 模糊匹配
       │      P5: tagName + 位置推断
       │
       └── 6. 返回匹配结果 → 渲染到 Webview
```

#### 7.3.2 探测结果缓存

探测结果自动缓存到 `~/.trae-agent-team/fingerprints/` 目录：

```
~/.trae-agent-team/
├── team-config.json                    # 主配置
└── fingerprints/
    ├── ui-fingerprint-9222.json        # Agent-1 指纹
    ├── ui-fingerprint-9223.json        # Agent-2 指纹
    └── ui-fingerprint-9224.json        # Agent-3 指纹
```

指纹文件结构：

```json
{
  "traeVersion": "1.2.3",
  "probedAt": "2026-04-25T10:30:00Z",
  "port": 9222,
  "results": {
    "chatInput": { "matched": true, "strategy": "P0", "selector": "[data-testid=\"chat-input\"]" },
    "sendButton": { "matched": true, "strategy": "P0", "selector": "[data-testid=\"send-btn\"]" }
  }
}
```

#### 7.3.3 版本适配工作流

```
Trae IDE 更新 → UI 结构变化
       │
       ▼
用户打开配置面板 → Tab「Trae 适配」
       │
       ▼
点击「探测」→ 自动扫描新 UI → 生成新选择器
       │
       ├── 全部匹配 → 自动更新缓存 → ✅ 适配成功
       │
       └── 部分失败 → 展示失败项
              │
              ├── 用户手动填写选择器覆盖 → 保存
              │
              └── 或等待系统自适应（MutationObserver 运行时调整）
```

---

### 7.4 侧边栏状态视图

#### 7.4.1 入口

Activity Bar 中注册 "Trae Agent Team" 图标，点击展开侧边栏。

#### 7.4.2 视图内容

展示所有已启用 Agent 的实时状态：

```
┌──────────────────────────────┐
│  Agent 状态                  │
├──────────────────────────────┤
│  🟢 agent-1                  │
│  端口: 9222                  │
│  工作区: /path/to/ws         │
├──────────────────────────────┤
│  🟡 agent-2                  │
│  端口: 9223                  │
│  工作区: /path/to/ws2        │
├──────────────────────────────┤
│  ⚪ agent-3                  │
│  端口: 9224                  │
│  工作区: 未配置               │
└──────────────────────────────┘
```

**状态指示**：

| 状态 | 颜色 | 含义 |
|------|------|------|
| 🟢 绿色 | `idle` | 空闲，可接受新任务 |
| 🟡 黄色 | `busy` | 执行中 |
| ⚪ 灰色 | `offline` | 离线 / 未连接 |

---

### 7.5 注册命令

| 命令 ID | 标题 | 功能 |
|---------|------|------|
| `traeAgentTeam.openConfig` | Trae Team: 打开配置面板 | 在编辑器中打开 Webview 配置面板 |
| `traeAgentTeam.probeUI` | Trae Team: 探测 Trae UI | 对第一个 Agent 实例执行 CDP UI 探测 |
| `traeAgentTeam.startTeam` | Trae Team: 启动 Agent Team | 启动 Agent Team（需配合 CLI） |
| `traeAgentTeam.stopTeam` | Trae Team: 停止 Agent Team | 停止 Agent Team（需配合 CLI） |

---

### 7.6 配置管理

#### 7.6.1 配置文件

| 路径 | 说明 |
|------|------|
| `~/.trae-agent-team/team-config.json` | 主配置文件（全局） |

#### 7.6.2 配置结构

```jsonc
{
  "version": "2.3.0",
  "name": "my-project",
  "trae": {
    "path": "/path/to/trae.exe",           // Trae IDE 可执行文件路径
    "instances": [
      {
        "id": "agent-1",                    // Agent 实例 ID
        "port": 9222,                       // CDP 调试端口
        "workspace": "/path/to/workspace",  // 绑定工作区
        "enabled": true                     // 是否启用
      }
    ],
    "startupDelay": 5000,                   // 启动等待时间(ms)
    "checkInterval": 5000,                  // 健康检查间隔(ms)
    "stableCount": 3                        // 稳定检测次数
  },
  "lark": {
    "appId": "cli_xxx",
    "appSecret": "xxx",
    "chatId": "oc_xxx",
    "bitable": {
      "appToken": "bascnxxx",
      "tableId": "tblxxx"
    }
  },
  "git": {
    "autoCommit": true,
    "commitInterval": 30000,
    "branchPrefix": "task/",
    "autoMerge": false,
    "taskDocsDir": ".trae-tasks"
  },
  "concurrency": {
    "maxParallel": 3,
    "chatSendTimeout": 10000,
    "taskQueueSize": 100
  },
  "uiRecognizer": {
    "autoProbe": true,
    "adaptive": true,
    "cacheDir": "~/.trae-agent-team",
    "probeTimeout": 10000,
    "overrides": {}                        // 手动选择器覆盖
  },
  "approval": {
    "enabled": true,
    "gates": {
      "taskStart": { "enabled": true, "timeoutMinutes": 60, "timeoutAction": "approve" },
      "dangerousOperation": { "enabled": true, "timeoutMinutes": 5, "timeoutAction": "reject" },
      "codeMerge": { "enabled": true, "timeoutMinutes": 1440, "timeoutAction": "reject" }
    }
  }
}
```

#### 7.6.3 ConfigManager API

| 方法 | 说明 |
|------|------|
| `load()` | 从磁盘加载配置，与默认值合并 |
| `save(newConfig)` | 保存配置到磁盘，触发 `onDidChange` 事件 |
| `get()` | 获取当前配置（内存缓存） |
| `getTraeVersion(port)` | 从指纹文件读取指定端口的 Trae 版本号 |
| `getAllFingerprints()` | 获取所有已保存的指纹记录 |

---

### 7.7 插件源码结构

```
trae-agent-team/                          # VS Code 插件项目
├── src/
│   └── extension.js                      # 插件入口（含所有模块）
│       ├── ConfigManager                 # 配置管理类
│       ├── UIProbeRunner                 # CDP UI 探测器
│       ├── ConfigWebviewProvider         # 配置面板 Webview（4-Tab）
│       ├── StatusWebviewProvider         # 侧边栏状态 Webview
│       └── activate() / deactivate()     # 生命周期
├── .vscode/
│   └── launch.json                       # 调试配置
├── package.json                          # 插件清单
└── media/
    ├── icon.png                          # 插件图标
    └── icon.svg                          # Activity Bar 图标
```

---

### 7.8 与 CLI 的协作关系

VS Code 插件负责**配置管理**，CLI 负责**运行时执行**：

```
┌─────────────────────────────┐     ┌─────────────────────────────┐
│     VS Code 插件             │     │     CLI (trae-agent-team)   │
│                             │     │                             │
│  ✅ 配置管理（读写 config）  │────→│  📖 读取配置                │
│  ✅ CDP UI 探测             │────→│  📖 读取指纹缓存            │
│  ✅ Agent 参数绑定          │────→│  📖 读取实例配置            │
│  ✅ 可视化状态展示          │←────│  📊 推送运行状态            │
│  ⚠️ 启动/停止（预留）       │────→│  🚀 实际进程管理            │
└─────────────────────────────┘     └─────────────────────────────┘
         共享配置文件: ~/.trae-agent-team/team-config.json
```

| 功能 | VS Code 插件 | CLI |
|------|:-----------:|:---:|
| 配置读写 | ✅ 主责 | 📖 只读 |
| CDP UI 探测 | ✅ 主责 | 📖 读取结果 |
| Agent 进程管理 | ⚠️ 触发 | ✅ 主责 |
| lark-cli 终端管理 | — | ✅ 主责 |
| 任务调度执行 | — | ✅ 主责 |
| 飞书消息监听 | — | ✅ 主责 |
| Git 自动提交 | — | ✅ 主责 |
| 状态展示 | ✅ 主责 | — |

---

### 7.9 评审检查清单

| # | 检查项 | 状态 | 备注 |
|---|--------|------|------|
| 1 | Agent 配置面板是否覆盖所有必要参数？ | ✅ 通过 | ID、端口、工作区、启用状态 |
| 2 | CDP UI 探测的 6 类元素是否充分？ | ✅ 通过 | chatInput/sendButton/statusIndicator/chatList/newChatButton/confirmDialog |
| 3 | 多策略匹配 P0-P5 降级是否合理？ | ✅ 通过 | dataTestId → role → placeholder → ariaLabel → classChain → tagName+位置 |
| 4 | 选择器手动覆盖机制是否灵活？ | ✅ 通过 | 支持任意 CSS 选择器 |
| 5 | 版本适配工作流是否闭环？ | ✅ 通过 | 探测 → 匹配 → 缓存 → 手动覆盖 → 自适应 |
| 6 | 飞书集成配置是否完整？ | ✅ 通过 | AppID/Secret/ChatID/Bitable |
| 7 | 审批策略配置是否满足需求？ | ✅ 通过 | 三级审批 + 超时 + 自动操作 |
| 8 | 插件与 CLI 的职责划分是否清晰？ | ✅ 通过 | 插件=配置管理，CLI=运行时 |
| 9 | 配置文件结构是否与 PRD 第 6 章一致？ | ✅ 通过 | v2.4.0 已统一 |
| 10 | 侧边栏状态视图是否满足监控需求？ | ✅ 通过 | 三种状态 + v2.4.0 增强可观测性 |
| 11 | 敏感信息是否支持加密存储？ | ✅ v2.4.0 新增 | SecretStorage + 环境变量 + AES-256-GCM |
| 12 | 插件-CLI 配置同步协议是否明确？ | ✅ v2.4.0 新增 | 共享 team-config.json + 启动校验 |

---

## 8. 项目结构

```
trae-agent-team/
├── bin/
│   └── cli.js                          # CLI 入口
├── src/
│   ├── core/
│   │   ├── index.ts                    # 主控入口
│   │   ├── dispatcher.ts               # 并发控制器（任务队列 + Chat Mutex）
│   │   ├── task-manager.ts             # 任务管理（MD 文档 + Git）
│   │   └── event-bus.ts                # 内部事件总线
│   ├── cdp/
│   │   ├── instance-manager.ts         # 多 Trae 实例管理
│   │   ├── injector.ts                 # CDP 注入器
│   │   ├── chat-filler.ts              # Chat 自动填充（核心）
│   │   ├── chat-switcher.ts            # Chat 会话切换（多任务）
│   │   ├── ralph-loop.ts               # Ralph Loop 增强
│   │   ├── scene-detector.ts           # 场景检测器（12 种内置场景） ⭐ v2.6.0
│   │   ├── task-classifier.ts          # 任务分类器（DOM 元素分类） ⭐ v2.6.0
│   │   └── rule-engine.ts              # 规则合并引擎（全局/项目/任务三级） ⭐ v2.6.0
│   │   ├── builder.ts                  # 脚本构建器
│   │   └── ui-recognizer/              # UI 自动识别模块
│   │       ├── index.ts                # UIRecognizer 主入口
│   │       ├── probe.ts                # DOM 探测器
│   │       ├── matcher.ts              # 元素多策略匹配器
│   │       ├── cache.ts                # 选择器缓存管理
│   │       ├── validator.ts            # 选择器验证器
│   │       └── adaptive.ts             # 运行时自适应 (MutationObserver)
│   ├── lark/
│   │   ├── terminal-manager.ts         # lark-cli 多终端管理
│   │   ├── terminal.ts                 # 单个 lark-cli 终端
│   │   ├── message-parser.ts           # 群聊消息解析
│   │   ├── command-handler.ts          # 群聊指令处理
│   │   ├── notifier.ts                 # 状态通知（卡片消息）
│   │   ├── bitable-sync.ts             # 多维表格同步
│   │   └── bitable-watcher.ts          # 多维表格变更监听（人类操作检测）
│   ├── git/
│   │   ├── manager.ts                  # Git 操作管理
│   │   ├── auto-commit.ts              # 文件变更自动提交
│   │   └── branch.ts                   # 分支管理
│   ├── task/
│   │   ├── document.ts                 # 任务 MD 文档读写
│   │   ├── lifecycle.ts                # 任务状态流转
│   │   ├── queue.ts                    # 任务优先级队列
│   │   ├── prompt-builder.ts           # Prompt 模板生成
│   │   └── approval.ts                 # 审批流程管理
│   ├── config/
│   │   ├── loader.ts                   # 配置加载
│   │   └── schema.ts                   # 配置验证
│   ├── vscode/                         # VS Code 插件模块（详见第 8 章）
│   │   ├── extension.ts                # 插件入口（activate/deactivate）
│   │   ├── config-manager.ts           # 配置管理类（读写 team-config.json）
│   │   ├── ui-probe-runner.ts          # CDP UI 探测器
│   │   ├── config-webview.ts           # 配置面板 Webview Provider（4-Tab）
│   │   └── status-webview.ts           # 侧边栏状态 Webview Provider
│   └── utils/
│       ├── logger.ts                   # 结构化日志（JSON 格式）
│       ├── mutex.ts                    # 互斥锁实现（含超时保护）
│       ├── retry.ts                    # 重试策略（含退避）
│       ├── metrics.ts                  # 指标埋点（Counter/Histogram/Gauge）
│       ├── health-checker.ts           # 健康检查（Agent 心跳 + CDP 探测）
│       └── secret-manager.ts           # 敏感信息加密管理
├── templates/
│   ├── task-template.md                # 任务 MD 文档模板
│   └── skills/                         # Skills 模板（注入到 .trae/skills/） ⭐ v2.6.0
│       ├── common/                     # 通用 Skills
│       │   ├── ralph-planner/
│       │   ├── ralph-task-executor/
│       │   ├── ralph-test-executor/
│       │   ├── ralph-state-manager/
│       │   ├── ralph-func-analyst/
│       │   └── ralph-round-initializer/
│       └── web/                        # Web 项目 Skills
│           ├── ralph-web-architecture/
│           ├── ralph-web-requirement/
│           ├── ralph-web-routine/
│           ├── ralph-web-task-planner/
│           └── ralph-web-test-plan/
├── docs/
│   ├── DO_AND_TESTING_SPEC.md          # AI 开发与测试规范 (DoD)
│   ├── CDP_MOCK_STRATEGY.md            # CDP Mock 策略说明 ⭐ v2.6.0 新增
│   ├── CONFIGURATION.md
│   └── LARK-SETUP.md
├── scripts/
│   └── check-coverage.js               # 覆盖率阈值检查脚本
├── tests/
│   ├── e2e/                            # E2E 测试（Playwright）
│   │   └── full-chain.test.ts
│   ├── chaos/                          # 混沌测试
│   │   └── chaos-scenarios.test.ts
│   └── fixtures/                       # 测试夹具
│       ├── dom-snapshots/              # DOM 快照（UIRecognizer 测试）
│       └── ndjson-samples/             # lark-cli 消息样本
├── .github/
│   ├── workflows/
│   │   └── ci.yml                      # CI 质量门禁配置（可执行版本） ⭐ v2.6.0
│   └── PULL_REQUEST_TEMPLATE.md        # PR 模板（含 DoD 检查清单） ⭐ v2.6.0
├── .cursorrules                         # AI 协作指令集（Cursor/Copilot） ⭐ v2.6.0
├── media/
│   ├── icon.png                        # 插件图标
│   └── icon.svg                        # Activity Bar 图标
├── package.json                        # 主包描述（CLI + VS Code 插件）
├── team.yaml                           # 主配置文件
├── tasks.yaml                          # 任务依赖配置
└── README.md
```

---

## 9. CLI 命令设计

```bash
# 初始化项目
trae-agent-team init [options]
  --trae-path <path>         # Trae 可执行文件路径
  --instances <count>        # Trae 实例数量（默认 3）
  --no-lark                  # 不启用飞书集成

# 启动系统
trae-agent-team start [options]
  --config <path>            # 指定配置文件
  --detach                   # 后台运行
  --monitor                  # 仅监控模式（不注入）

# 停止系统
trae-agent-team stop [options]
  --force                    # 强制停止

# 任务管理（CLI 方式，与飞书群聊指令等效）
trae-agent-team task create <description> [options]
  --agent <id>               # 指定 Agent
  --priority <level>         # 优先级 P0-P3
  --deps <task-ids>          # 依赖任务

trae-agent-team task list
trae-agent-team task info <task-id>
trae-agent-team task cancel <task-id>

# Agent 管理
trae-agent-team agent list
trae-agent-team agent restart <id>
trae-agent-team agent log <id> [lines]

# Git 操作
trae-agent-team git log [task-id]
trae-agent-team git diff <task-id>
trae-agent-team git merge <task-id>

# 飞书集成
trae-agent-team lark setup          # 配置飞书
trae-agent-team lark test           # 测试连接
trae-agent-team lark terminals      # 查看 lark-cli 终端状态

# 审批管理
trae-agent-team approval list       # 查看待审批任务
trae-agent-team approval approve <task-id> [--note "意见"]  # 批准
trae-agent-team approval reject <task-id> [--note "原因"]   # 拒绝
trae-agent-team approval history     # 审批历史

# 状态查看
trae-agent-team status              # 全局状态
trae-agent-team dashboard           # 终端仪表盘
```

---

## 10. 异常处理与自愈机制

> **评审驱动**：v2.3.0 评审识别 ChatMutex 锁死、CDP 断连、Git 冲突等中高风险，本章补充完整异常处理设计。

### 10.1 异常处理配置

```yaml
# team.yaml 异常处理配置段
error_handling:
  # Chat 填充
  chat_fill_retry: 3                      # Chat 填充失败重试次数
  chat_fill_retry_interval: 2000          # 重试间隔(ms)
  chat_fill_timeout: 15000                # 单次填充超时(ms)

  # CDP 连接
  cdp_reconnect_interval: 5000            # CDP 断连重连间隔(ms)
  cdp_reconnect_max_attempts: 5           # 最大重连次数
  cdp_health_check_interval: 30000        # CDP 健康检查间隔(ms)

  # 进程管理
  process_crash_action: "restart"         # 进程崩溃处理：restart / abort / notify
  process_restart_max: 3                  # 单实例最大重启次数/小时
  process_health_check_interval: 30000    # 进程健康检查间隔(ms)

  # Git
  git_conflict_strategy: "notify_human"   # Git 冲突策略：notify_human / auto_resolve / abort
  git_auto_commit_retry: 2                # Git 提交失败重试次数

  # 飞书
  lark_reconnect_interval: 3000           # lark-cli WebSocket 重连间隔(ms)
  lark_reconnect_max_attempts: 10         # 最大重连次数
  lark_rate_limit_rpm: 50                 # 飞书 API 速率限制(请求/分钟)
  lark_message_batch_interval: 1000       # 消息批量发送间隔(ms)
```

### 10.2 ChatMutex 异常保护

#### 10.2.1 锁超时自动释放

```javascript
class ChatMutex {
  constructor(traePort) {
    this.port = traePort;
    this.locked = false;
    this.queue = [];
    this.currentTask = null;
    this.lockTimeout = 30000;             // 锁超时 30s（可配置）
    this.lockTimer = null;
  }

  async acquire(taskId) {
    if (!this.locked) {
      this.locked = true;
      this.currentTask = taskId;
      this._startLockTimer();
      return true;
    }
    return new Promise((resolve) => {
      this.queue.push({ taskId, resolve });
    });
  }

  release() {
    this._clearLockTimer();
    this.locked = false;
    this.currentTask = null;
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      this.locked = true;
      this.currentTask = next.taskId;
      this._startLockTimer();
      next.resolve(true);
    }
  }

  _startLockTimer() {
    this._clearLockTimer();
    this.lockTimer = setTimeout(() => {
      // 锁超时 → 强制释放 + 告警
      logger.warn(`ChatMutex[${this.port}] 锁超时释放`, { task: this.currentTask });
      this.release();
      eventBus.emit('mutex:timeout', { port: this.port, task: this.currentTask });
    }, this.lockTimeout);
  }

  _clearLockTimer() {
    if (this.lockTimer) {
      clearTimeout(this.lockTimer);
      this.lockTimer = null;
    }
  }
}
```

#### 10.2.2 进程崩溃兜底

- ChatMutex 状态通过 `process.on('exit')` 写入临时文件 `~/.trae-agent-team/.mutex-state-{port}.json`
- 主控进程启动时扫描残留锁文件，超过 60s 自动清理
- 清理时飞书告警通知：`⚠️ Agent-{id} 锁异常释放，可能存在未完成任务`

### 10.3 CDP 连接自愈

```
CDP 连接异常
      │
      ├── 连接超时/拒绝
      │     └── 重试（间隔 5s，最多 5 次）
      │           └── 全部失败 → 标记实例 offline → 飞书告警
      │
      ├── 连接中断（运行中）
      │     └── 自动重连（间隔 5s）
      │           ├── 重连成功 → 恢复任务（检查 AI 状态）
      │           └── 重连失败 → 标记任务 failed → 释放锁 → 飞书告警
      │
      └── 健康检查失败（30s 一次）
            └── Runtime.evaluate 探测 → 失败则触发重连流程
```

### 10.4 Git 冲突处理

| 场景 | 检测方式 | 处理策略 |
|------|---------|---------|
| **分支冲突**（合并时） | `git merge` 返回非零 | 暂停合并 → 飞书告警 → 等待人工 `/git resolve` |
| **同文件并发修改** | `git status` 检测 uncommitted changes | 等待当前提交完成 → 重试 |
| **提交失败**（磁盘满/权限） | `git commit` 返回非零 | 重试 2 次 → 仍失败 → 飞书告警 → 任务暂停 |
| **远程推送失败** | `git push` 返回非零 | 退避重试（5s/15s/45s）→ 仍失败 → 飞书告警 |

### 10.5 lark-cli 稳定性保障

#### 10.5.1 心跳检测 + 自动重连

```javascript
class LarkTerminal {
  constructor(chatId) {
    this.chatId = chatId;
    this.process = null;
    this.lastMessageTime = Date.now();
    this.heartbeatInterval = 60000;       // 60s 心跳
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
  }

  startHeartbeat() {
    this.heartbeatTimer = setInterval(() => {
      const elapsed = Date.now() - this.lastMessageTime;
      if (elapsed > 120000) {             // 2 分钟无消息
        logger.warn(`lark-cli[${this.chatId}] 心跳超时，尝试重连`);
        this.reconnect();
      }
    }, this.heartbeatInterval);
  }

  async reconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error(`lark-cli[${this.chatId}] 重连次数耗尽`);
      eventBus.emit('lark:offline', { chatId: this.chatId });
      return;
    }
    this.reconnectAttempts++;
    this.stop();                          // 终止旧进程
    await this.start();                   // 启动新进程
    this.lastMessageTime = Date.now();
  }
}
```

#### 10.5.2 消息去重

- 每条消息提取 `message_id`，维护最近 1000 条消息 ID 的 LRU 缓存
- 重复消息直接丢弃，避免任务重复创建

### 10.6 关键操作校验

| 操作 | 校验方式 | 失败处理 |
|------|---------|---------|
| Chat 填充 | 填充后读取输入框内容比对 | 不一致 → 重试 → 仍失败 → 降级策略 |
| 消息发送 | 监听 Chat 列表新增消息 | 未出现 → 重试 → 仍失败 → 飞书告警 |
| Git 提交 | `git log -1` 校验 commit hash | 不一致 → 重试 → 仍失败 → 任务暂停 |
| 飞书通知 | 检查 API 返回 `code: 0` | 失败 → 退避重试 → 仍失败 → 本地日志记录 |

### 10.7 跨节点级联失败恢复

> **评审驱动**：Claude 最终评审指出链路过长、单点过多，任意环节失败可能导致全链路阻塞，需明确跨节点的级联失败恢复策略。

#### 10.7.1 级联失败场景矩阵

| 失败节点 | 上游影响 | 下游影响 | 恢复策略 | 任务状态回滚 |
|---------|---------|---------|---------|------------|
| **CDP 填充失败**（全部策略） | ChatMutex 持有锁 | Ralph Loop 未启动 | 释放锁 + 飞书告警 | `running` → `assigned`（可重新分配） |
| **CDP 连接中断**（运行中） | ChatMutex 持有锁 | AI 执行中断 | 重连 5 次 → 失败则释放锁 | `running` → `failed`（需人工确认） |
| **lark-cli WebSocket 断连** | 无上游 | 任务监听中断 | 自动重连（指数退避） | 不影响已有任务状态 |
| **lark-cli 重连耗尽** | 无上游 | 新任务无法接收 | 飞书告警 + 暂停任务队列 | 队列中任务保持 `pending` |
| **Git 提交失败**（磁盘满） | AI 已完成 | 飞书回报缺失 | 重试 2 次 → 暂停任务 | `running` → `blocked` |
| **Ralph 执行卡死**（6min 无签名） | ChatMutex 持有锁 | 无下游 | 超时检测 → 释放锁 | `running` → `assigned`（可重试） |

#### 10.7.2 状态机级联事件定义

```typescript
// 跨节点级联事件（在 taskMachine 中处理）
type CascadeEvent =
  | { type: 'CDP_FILL_FAILED'; reason: string; strategies: string[] }
  | { type: 'CDP_DISCONNECTED'; reconnectAttempts: number }
  | { type: 'LARK_OFFLINE'; chatId: string }
  | { type: 'GIT_COMMIT_FAILED'; reason: string }
  | { type: 'RALPH_STALLED'; lastSignatureAt: number };

// taskMachine 中的级联处理
// running 状态下收到 CDP_FILL_FAILED → 回滚到 assigned
// running 状态下收到 CDP_DISCONNECTED 且重连耗尽 → 转为 failed
// running 状态下收到 GIT_COMMIT_FAILED → 转为 blocked
// running 状态下收到 RALPH_STALLED → 回滚到 assigned
```

#### 10.7.3 ChatMutex 锁释放保证

**核心原则**：任何导致任务无法继续执行的失败，**必须**释放 ChatMutex 锁。

```typescript
// 锁释放保证机制
class CascadeLockReleaser {
  constructor(mutex: ChatMutex, taskMachine: TaskMachine) {
    // 监听所有可能导致任务中断的事件
    const lockReleasingEvents = [
      'CDP_FILL_FAILED',
      'CDP_DISCONNECTED',    // 仅在重连耗尽时
      'RALPH_STALLED',
      'TASK_TIMEOUT',        // 10min 超时
    ];

    for (const event of lockReleasingEvents) {
      taskMachine.on(event, (data) => {
        // 确认锁仍被当前任务持有
        if (mutex.isLockedBy(data.taskId)) {
          mutex.forceRelease(data.taskId, event);
          logger.warn('级联锁释放', { taskId: data.taskId, trigger: event });
        }
      });
    }
  }
}
```

#### 10.7.4 任务状态回滚规则

| 当前状态 | 触发事件 | 目标状态 | 是否可自动恢复 |
|---------|---------|---------|:------------:|
| `running` | CDP_FILL_FAILED | `assigned` | ✅ 自动重新分配 |
| `running` | RALPH_STALLED | `assigned` | ✅ 自动重新分配 |
| `running` | CDP_DISCONNECTED（重连耗尽） | `failed` | ❌ 需人工确认 |
| `running` | GIT_COMMIT_FAILED | `blocked` | ❌ 需人工介入 |
| `assigned` | LARK_OFFLINE | `pending` | ✅ lark 恢复后自动分配 |
| `blocked` | GIT_RESOLVED | `running` | ✅ 自动恢复 |

---

## 11. 可观测性设计

> **评审驱动**：v2.3.0 评审建议增加结构化日志、指标埋点、错误快速入口。

### 11.1 结构化日志

所有日志输出采用 JSON 格式，便于 ELK/Loki 收集和分析：

```json
{
  "timestamp": "2026-04-25T10:30:00.123Z",
  "level": "INFO",
  "module": "chat-filler",
  "agent": "agent-1",
  "port": 9222,
  "taskId": "T-001",
  "action": "fill_chat",
  "strategy": "P0",
  "duration_ms": 245,
  "success": true
}
```

**日志级别规范**：

| 级别 | 用途 | 示例 |
|------|------|------|
| `DEBUG` | 详细调试信息 | DOM 选择器匹配过程、CDP 协议交互 |
| `INFO` | 正常业务流程 | 任务创建、Chat 填充成功、Git 提交 |
| `WARN` | 可恢复的异常 | 重试操作、降级策略触发、锁超时释放 |
| `ERROR` | 需要关注的错误 | CDP 连接失败、Git 冲突、飞书 API 错误 |
| `FATAL` | 系统级故障 | 进程崩溃、配置文件损坏 |

### 11.2 关键指标埋点

| 指标 | 类型 | 采集点 | 说明 |
|------|------|--------|------|
| `task.total` | Counter | Dispatcher | 任务总数 |
| `task.success` | Counter | TaskManager | 任务成功数 |
| `task.failed` | Counter | TaskManager | 任务失败数 |
| `task.duration` | Histogram | TaskManager | 任务执行耗时分布 |
| `chat.fill.attempt` | Counter | ChatFiller | Chat 填充尝试次数 |
| `chat.fill.success` | Counter | ChatFiller | Chat 填充成功次数 |
| `chat.fill.duration` | Histogram | ChatFiller | Chat 填充耗时 |
| `chat.fill.strategy_used` | Gauge | ChatFiller | 当前使用的填充策略级别 |
| `cdp.reconnect` | Counter | InstanceManager | CDP 重连次数 |
| `cdp.connection_uptime` | Gauge | InstanceManager | CDP 连接持续时间 |
| `git.commit` | Counter | GitManager | Git 提交次数 |
| `git.conflict` | Counter | GitManager | Git 冲突次数 |
| `lark.message_sent` | Counter | Notifier | 飞书消息发送数 |
| `lark.api_error` | Counter | Notifier | 飞书 API 错误数 |
| `mutex.wait_time` | Histogram | ChatMutex | 锁等待时间分布 |
| `mutex.timeout` | Counter | ChatMutex | 锁超时次数 |

### 11.3 VS Code 侧边栏增强

在现有 Agent 状态视图基础上，增加以下可观测性入口：

```
┌──────────────────────────────┐
│  Agent 状态                  │
├──────────────────────────────┤
│  🟢 agent-1                  │
│  端口: 9222 | 任务: T-001    │
│  运行: 2h 15m               │
├──────────────────────────────┤
│  🟡 agent-2                  │
│  端口: 9223 | 任务: T-002    │
│  ⚠️ 填充重试 1/3            │
├──────────────────────────────┤
│  📊 系统概览                 │
│  成功率: 92% | 活跃: 2/3     │
│  今日任务: 8 完成 / 1 失败   │
├──────────────────────────────┤
│  🔴 最近错误 (3)             │
│  • [10:25] agent-2 填充超时  │
│  • [09:50] Git 冲突 T-003    │
│  • [09:12] CDP 重连 agent-3  │
└──────────────────────────────┘
```

**新增区域**：

| 区域 | 内容 |
|------|------|
| **Agent 任务信息** | 当前执行的任务 ID、运行时长 |
| **Agent 告警** | 填充重试、降级策略触发等警告 |
| **系统概览** | 成功率、活跃 Agent 数、今日任务统计 |
| **最近错误** | 最近 10 条 ERROR 级别日志，点击可查看详情 |

### 11.4 告警规则

| 告警 | 条件 | 通知方式 | 级别 |
|------|------|---------|------|
| Agent 离线 | 心跳超时 2 分钟 | 飞书群聊 + VS Code 侧边栏 | ERROR |
| Chat 填充连续失败 | 3 次重试均失败 | 飞书群聊 + VS Code 侧边栏 | ERROR |
| 锁超时 | ChatMutex 超时自动释放 | 飞书群聊 | WARN |
| Git 冲突 | 检测到合并冲突 | 飞书群聊（@相关人） | WARN |
| 飞书 API 限流 | 触发速率限制 | 本地日志 | WARN |
| 资源占用过高 | 单实例内存 > 2GB | 飞书群聊 | WARN |

---

## 12. 安全设计

### 12.1 任务审批策略

| 操作级别 | 示例 | 处理方式 |
|---------|------|---------|
| **自动执行** | 写代码、运行测试、Git 提交 | 自动执行，飞书通知 |
| **飞书审批** | 删除文件、数据库操作、部署 | 发送审批卡片，5 分钟超时自动拒绝 |
| **禁止执行** | `rm -rf /`、访问敏感路径 | 直接拒绝，飞书告警 |

### 12.2 Git 安全

- 每个任务在**独立分支**工作，不会直接修改主分支
- 自动合并默认关闭，需人工通过 `/git merge` 触发
- Git 提交信息包含任务 ID，便于追溯

### 12.3 飞书安全

- App Secret 通过**环境变量**传递
- lark-cli 使用**最小权限**登录
- 群聊指令需要**特定前缀**（`/task`、`/status` 等）才触发

#### 12.3.1 飞书 WebSocket 鉴权与 Token 刷新

> **评审驱动**：Claude 最终评审指出 lark-cli 作为系统入口，鉴权 token 管理不当存在任务注入风险。

**鉴权机制**：

| 层级 | 机制 | 说明 |
|------|------|------|
| **WebSocket 连接** | App ID + App Secret 签名 | lark-cli 启动时通过 `lark-cli event` 自动鉴权 |
| **消息来源校验** | message_id + timestamp 签名验证 | 防止伪造消息注入 |
| **指令前缀白名单** | 仅响应 `/task`、`/status`、`/git` 等前缀 | 忽略其他消息 |
| **发送者身份校验** | 可选配置 `allowed_senders` | 限制仅特定飞书用户可发送任务指令 |

**Token 刷新策略**：

```yaml
# team.yaml 飞书鉴权配置段
lark:
  auth:
    app_id: "${TRAE_TEAM_LARK_APP_ID}"       # 环境变量注入
    app_secret: "${TRAE_TEAM_LARK_APP_SECRET}" # 通过 SecretManager 加载
    token_refresh:
      enabled: true
      interval_minutes: 120                   # token 自动刷新间隔
      retry_on_failure: 3                     # 刷新失败重试次数
    message_verification:
      enabled: true                           # 消息签名校验
      allowed_senders: []                     # 空=不限制，生产环境建议配置
    command_prefix:
      - "/task"
      - "/status"
      - "/git"
      - "/approve"
      - "/reject"
```

**SecretManager 与 lark-cli Token 刷新协同**：

```typescript
// Token 刷新流程
class LarkTokenManager {
  constructor(secretManager: SecretManager) {
    this.secretManager = secretManager;
  }

  async refreshToken(): Promise<void> {
    const appId = await this.secretManager.loadSecret('lark.appId');
    const appSecret = await this.secretManager.loadSecret('lark.appSecret');

    // 优先级链覆盖 lark-cli token 刷新场景：
    // 1. 环境变量（CI/CD 环境）
    // 2. SecretStorage（VS Code 插件环境）
    // 3. 加密配置文件（通用环境）
    // 4. 明文配置（仅开发环境，输出 WARN）

    const token = await this.requestTenantToken(appId, appSecret);
    await this.secretManager.store('lark.accessToken', token);
  }
}
```

### 12.4 敏感信息加密存储

> **评审驱动**：v2.3.0 评审建议 App Secret 等敏感信息支持加密存储。

| 存储方式 | 适用场景 | 实现 |
|---------|---------|------|
| **VS Code SecretStorage** | VS Code 插件环境 | `context.secrets.store('lark.appSecret', value)` |
| **环境变量** | CLI 运行环境 | `process.env.TRAE_TEAM_LARK_SECRET` |
| **加密配置文件** | 通用场景 | AES-256-GCM 加密，密钥由用户首次设置时指定 |

**优先级**：环境变量 > SecretStorage > 加密配置文件 > 明文配置（仅开发环境）

```javascript
// 密钥加载优先级
async function loadSecret(key) {
  // 1. 环境变量
  const envKey = `TRAE_TEAM_${key.toUpperCase().replace('.', '_')}`;
  if (process.env[envKey]) return process.env[envKey];

  // 2. VS Code SecretStorage（插件环境）
  if (vscode && vscode.context) {
    const stored = await vscode.context.secrets.get(key);
    if (stored) return stored;
  }

  // 3. 加密配置文件
  const encrypted = config[key];
  if (encrypted && encrypted.encrypted) {
    return decrypt(encrypted.value, getMasterKey());
  }

  // 4. 明文（开发环境告警）
  if (config[key] && typeof config[key] === 'string') {
    logger.warn(`敏感配置 ${key} 使用明文存储，建议启用加密`);
    return config[key];
  }

  throw new Error(`未找到密钥配置: ${key}`);
}
```

### 12.5 命令白名单校验

> **评审驱动**：v2.3.0 评审建议增加命令白名单，防止 AI 执行危险命令。

```yaml
# team.yaml 安全配置段
security:
  # 命令白名单（允许 AI 通过 CDP 执行的操作）
  command_whitelist:
    allowed_patterns:
      - "git (add|commit|status|log|diff|branch|checkout|merge)"
      - "npm (run|test|install)"
      - "node (.*)\\.test\\.(js|ts)"
      - "cat (.*)"
      - "ls (.*)"
      - "echo (.*)"
    blocked_patterns:
      - "rm -rf /"
      - "sudo (.*)"
      - "chmod 777 (.*)"
      - "curl.*\\|.*sh"
      - "wget.*\\|.*sh"
      - "DROP (TABLE|DATABASE)"
      - "> /etc/(.*)"

  # CDP 端口访问限制
  cdp:
    allowed_hosts:
      - "127.0.0.1"
      - "localhost"
    max_port: 9300
    min_port: 9222
```

**执行流程**：

```
AI 生成命令
      │
      ▼
命令白名单校验
      │
      ├── 命中 allowed_patterns → ✅ 放行
      │
      ├── 命中 blocked_patterns → ❌ 拒绝 + 飞书告警
      │
      └── 未匹配任何规则 → ⚠️ 飞书审批（等待人工确认）
```

### 12.6 CDP 端口访问控制

- CDP 调试端口**仅允许 localhost** 连接，禁止外网访问
- Trae IDE 启动参数强制绑定 `--remote-debugging-address=127.0.0.1`
- 端口范围限制在 `9222-9300`，防止端口扫描
- CDP 连接时校验 Target URL 包含 `workbench` 关键字，防止注入恶意页面

---

## 9. 技术实现计划

### Day 0：物理执行层可行性验证（2 天时间盒）

> **这是整个项目唯一真正重要的事。** 在此之前，所有 PRD 章节都是建立在未经验证的技术假设上。Day 0 跑通之前，不启动任何其他工作。

**验证目标**：用 200 行代码证明 "CDP 连接 Trae → 自动切任务 → 自动填 Prompt → 自动回车 → 有 AI 响应" 这条链路物理可行。

**Day 0 验证清单**：

| # | 验证项 | 验收标准 | 时间盒 |
|---|--------|---------|--------|
| 1 | Trae 调试模式启动 | `--remote-debugging-port=9222` 启动成功，`curl /json` 返回 Target 列表 | 1h |
| 2 | CDP 连接 + Target 定位 | `chrome-remote-interface` 连接主窗口 Target，`Runtime.enable()` 成功 | 2h |
| 3 | Chat 输入框 DOM 穿透 | `querySelector` 找到输入框，确认无 Shadow DOM 强隔离 | 2h |
| 4 | `Input.insertText` 写入 | 逐字符写入 "hello world" 到 Chat 输入框，视觉确认内容正确 | 3h |
| 5 | `Input.dispatchKeyEvent` 提交 | Enter 键触发 Chat 提交，Trae 开始 AI 响应 | 2h |
| 6 | 任务槽位点击切换 | `Input.dispatchMouseEvent` 点击目标任务槽位，Chat 切换成功 | 4h |
| 7 | 录屏存证 | 完整链路录屏（飞书指令→切任务→填 Prompt→回车→AI 响应） | 1h |

**Day 0 通过标准**：上述 7 项全部通过，录屏存证。任何一项失败则停止，评估替代路径（Electron IPC 注入等）。

**Day 0 验证脚本骨架**（~200 行）：

```typescript
// scripts/day0-proof.ts
import CDP from 'chrome-remote-interface';

async function main() {
  // Step 1: 连接
  const targets = await CDP.List({ port: 9222 });
  const main = targets.find(t => t.type === 'page' && t.title.includes('Trae'));
  const client = await CDP({ target: main.webSocketDebuggerUrl });
  const { Runtime, Input, DOM } = client;
  await Promise.all([Runtime.enable(), DOM.enable()]);

  // Step 2: 点击目标任务槽位
  const { result: coords } = await Runtime.evaluate({
    expression: `(() => {
      const items = document.querySelectorAll('[data-testid="task-list-item"]');
      const item = items[0]; // 第一个任务
      const r = item.getBoundingClientRect();
      return JSON.stringify({ x: r.left + r.width/2, y: r.top + r.height/2 });
    })()`,
    returnByValue: true,
  });
  const { x, y } = JSON.parse(coords.value);
  await Input.dispatchMouseEvent({ type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await Input.dispatchMouseEvent({ type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  console.log('✅ Step 2: 任务槽位点击成功');

  // Step 3: 聚焦并填充 Chat 输入框
  await new Promise(r => setTimeout(r, 1000));
  const prompt = 'hello world, print "Day 0 proof" in console.log';
  for (const char of prompt) {
    await Input.insertText({ text: char });
    await new Promise(r => setTimeout(r, 50 + Math.random() * 70));
  }
  console.log('✅ Step 3: Prompt 填充完成');

  // Step 4: 回车提交
  await new Promise(r => setTimeout(r, 500));
  await Input.dispatchKeyEvent({ type: 'keyDown', key: 'Enter' });
  await Input.dispatchKeyEvent({ type: 'keyUp', key: 'Enter' });
  console.log('✅ Step 4: 提交成功，等待 AI 响应...');
}

main().catch(e => { console.error('❌ Day 0 验证失败:', e.message); process.exit(1); });
```

### Phase 1：MVP（10 工作日）

> Day 0 通过后启动。目标：飞书发指令 → 拟人化填充 → AI 执行 → Git 提交 → 飞书回报。

| 天数 | 交付物 |
|------|--------|
| D3-4 | 拟人化模块（§5）+ 配额感知（§6）集成到 Day 0 脚本 |
| D5-6 | lark-cli 单终端 + 角色路由 + 飞书回报 |
| D7-8 | taskMachine（纯 TS）+ async-mutex + Git 自动提交 |
| D9-10 | 人机共享 UI（§8）+ 选择器自适应（§7）+ 端到端冒烟测试 |
| D11-12 | Bug 修复 + 录屏演示 + MVP 发布 |

### Phase 2：增强（按需，不预设时间表）

根据 MVP 使用中暴露的真实痛点决定：
- VS Code 插件（启停开关 + 日志查看器）
- 飞书多维表格看板
- CLI 命令
- DoD 门禁完善

### Phase 3：完整版（按需）

附录 E 中的 14 章内容，根据实际需要逐步实施。
| W13-14 | 上下文恢复 + 错误处理 + VS Code ↔ CLI 状态联动 + 混沌测试 |

**Phase 3 目标**：多任务并行、依赖自动触发、完整监控

---

## 14. 风险与缓解

| 风险 | 影响 | 概率 | 缓解措施 | 状态 |
|------|------|------|---------|------|
| **Lexical 编辑器兼容性** | 🔴 高 | 中 | Phase 0 预研验证 3 种填充策略 | 📋 待预研 |
| **CDP 多实例资源占用** | 🔴 高 | 高 | 资源监控告警 + 实例数动态限制 + Phase 0 基准测试 | 📋 待预研 |
| **lark-cli WebSocket 稳定性** | 🔴 高 | 中 | 心跳检测 + 自动重连 + 消息去重 + Phase 0 24h 测试 | 📋 待预研 |
| Trae IDE 更新导致 DOM 选择器失效 | 🟡 中 | 中 | UI Recognizer 自动探测 + 多策略降级 + 手动覆盖 + 缓存加速 | ✅ 已设计 |
| ChatMutex 锁死（进程崩溃） | 🟡 中 | 低 | 锁超时自动释放 + 残留锁文件清理 + 飞书告警 | ✅ v2.4.0 新增 |
| Git 冲突（多任务修改同一文件） | 🟡 中 | 中 | 分支隔离 + 冲突检测 + 飞书告警 + 人工介入流程 | ✅ v2.4.0 新增 |
| 飞书 API 频率限制 | 🟡 中 | 中 | 消息合并 + 速率控制 + 退避重试 | ✅ v2.4.0 新增 |
| 插件-CLI 配置不一致 | 🟡 中 | 低 | 配置加载优先级 + 启动时配置校验 + 版本号匹配 | ✅ v2.4.0 新增 |
| AI 上下文限制频繁触发 | 🟢 低 | 高 | 自动恢复 Prompt + 任务拆分建议 | ✅ 已设计 |
| 敏感信息泄露 | 🟢 低 | 低 | 加密存储 + 环境变量 + 命令白名单 | ✅ v2.4.0 新增 |

---

## 15. 成功指标

| 指标 | MVP 目标 | 完整版目标 |
|------|---------|-----------|
| **端到端任务流转成功率** | 80% | 95% |
| **Chat 填充成功率** | 90% | 99% |
| **并行任务数** | 2-3 | 4-8 |
| **任务完成到飞书通知延迟** | < 10 秒 | < 3 秒 |
| **上下文恢复成功率（自动）** | 60% | 75% |
| **上下文恢复成功率（含人工辅助）** | 70% | 90% |
| **Git 自动提交可靠性** | 95% | 99% |
| **CDP UI 探测匹配率** | 80%（4/6 元素） | 100%（6/6 元素） |
| **VS Code 插件配置保存成功率** | 100% | 100% |
| **版本适配（Trae 更新后）探测到修复时间** | < 5 分钟 | < 1 分钟 |
| **系统可用性（排除计划维护）** | 95% | 99% |
| **MTTR（平均故障恢复时间）** | < 5 分钟 | < 2 分钟 |
| **告警响应率** | 90% | 99% |

---

## 16. 并发压力模型与任务幂等性

> **评审驱动**：Claude 最终评审指出并发水位线和幂等性设计是当前文档最薄弱的部分，需在 Phase 0 前明确。

### 16.1 并发压力模型

#### 16.1.1 系统容量基线

| 参数 | MVP 目标 | 完整版目标 | 说明 |
|------|---------|-----------|------|
| **最大并发任务数** | 3 | 8 | 受 Trae 实例数和机器资源限制 |
| **最大 Trae 实例数** | 3 | 8 | 每实例约 500MB-1.5GB 内存 |
| **CDP 连接池大小** | 3（每实例 1 连接） | 8 | 每连接独立 WebSocket |
| **lark-cli 终端数** | 3（每任务 1 终端） | 8 | 每终端约 30MB 内存 |
| **ChatMutex 队列深度** | 10 | 50 | 超过阈值触发背压告警 |
| **飞书 API 速率** | 50 RPM | 50 RPM | 飞书硬性限制 |

#### 16.1.2 资源水位线

```yaml
# team.yaml 并发配置段
concurrency:
  max_tasks: 3                          # 最大并发任务数
  max_trae_instances: 3                 # 最大 Trae 实例数
  cdp_connection_pool:
    min_idle: 1                          # 最小空闲连接
    max_per_instance: 1                  # 每实例最大连接数
    health_check_interval_ms: 30000      # 连接健康检查间隔
  chat_mutex:
    queue_depth_limit: 10                # 等待队列最大深度
    backpressure_threshold: 8            # 背压告警阈值
  resource_limits:
    max_memory_per_instance_mb: 1500     # 单实例内存上限
    max_total_memory_mb: 6000            # 总内存上限
    cpu_warning_threshold: 80            # CPU 告警阈值(%)
```

#### 16.1.3 背压与降级策略

```
并发任务数达到 backpressure_threshold (8)
      │
      ▼
触发背压告警（飞书 + 日志 WARN）
      │
      ├── 新任务进入队列等待（不拒绝）
      │     └── 队列深度达到 limit (50) → 拒绝新任务 + 飞书告警
      │
      └── 优先级调度：P0+ 任务优先分配空闲实例
            └── P1/P2 任务继续排队
```

### 16.2 任务幂等性设计

> **核心原则**：自动化链路中任何步骤因网络/进程原因重试，不得产生副作用（重复提交、重复通知等）。

#### 16.2.1 幂等性矩阵

| 操作 | 幂等性 | 去重机制 | 说明 |
|------|:------:|---------|------|
| **lark-cli 消息接收** | ✅ 幂等 | message_id LRU 缓存（1000 条） | 重复消息直接丢弃 |
| **任务创建** | ✅ 幂等 | taskId 全局唯一（`T-{timestamp}-{seq}`） | 重复创建检测 |
| **Chat 填充** | ✅ 幂等 | 填充前检查输入框是否已有内容 | 已有内容则跳过 |
| **Git add** | ✅ 幂等 | `git add` 天然幂等 | 重复 add 无副作用 |
| **Git commit** | ⚠️ 条件幂等 | commit message 含 taskId + 时间戳 | 相同内容不会产生重复 commit（git 自动合并） |
| **Git push** | ✅ 幂等 | 相同 commit hash 推送无副作用 | 远程已有则跳过 |
| **飞书通知发送** | ⚠️ 非幂等 | 通知前检查最近是否已发送相同内容 | 5s 内相同通知去重 |
| **锁获取** | ✅ 幂等 | 同一 taskId 重复 acquire 返回已持有状态 | 不重复入队 |

#### 16.2.2 执行卡片幂等性标注

每个 YAML 执行卡片的 step 新增 `idempotent` 字段：

```yaml
steps:
  - name: stage_changes
    action: git add -A
    idempotent: true                    # ✅ 天然幂等

  - name: commit
    action: git commit -m '{taskId}: auto-save - {timestamp}'
    idempotent: true                    # ✅ 相同 tree hash 不产生新 commit
    dedup_check: git log --oneline -1 | grep '{taskId}'

  - name: push_to_remote
    action: git push origin state.branch
    idempotent: true                    # ✅ 相同 commit 推送无副作用

  - name: notify_lark
    action: send_lark_card(task_result)
    idempotent: false                   # ⚠️ 非幂等
    dedup_strategy: "5s 内相同 taskId 通知去重"
```

#### 16.2.3 重试安全保证

```typescript
// 幂等性检查装饰器
function idempotentStep<T>(
  stepName: string,
  fn: () => Promise<T>,
  dedupCheck?: () => Promise<boolean>
): Promise<T> {
  return async () => {
    // 重试前检查是否已完成
    if (dedupCheck && await dedupCheck()) {
      logger.info(`步骤 ${stepName} 已完成，跳过重试`);
      return;
    }
    return fn();
  };
}
```

---

## 17. 工程交付标准 (DoD)

> **评审驱动**：v2.4.0 复核评审指出 PRD 缺少"怎么验证与交付"的工程契约，要求补充 DoD 规范。
> **配套文档**：完整规范见 [`docs/DO_AND_TESTING_SPEC.md`](docs/DO_AND_TESTING_SPEC.md)

### 16.1 DoD 概述

Definition of Done (DoD) 是本项目的**工程交付契约**，定义了"什么算完成"的统一标准。在 AI 辅助开发场景下，DoD 是防止"能跑但不可测"代码进入主分支的关键护栏。

### 16.2 通用 DoD（所有模块）

| # | 条件 | 验证方式 |
|---|------|---------|
| 1 | 代码通过 ESLint 检查 | `npm run lint` 零 error |
| 2 | 所有测试通过 | `npm test` 全绿 |
| 3 | 测试覆盖率达标 | 按模块要求（核心 ≥90%，一般 ≥80%） |
| 4 | 类型安全 | `tsc --noEmit` 零 error |
| 5 | 无新增 TODO/FIXME | CI 自动检测 |
| 6 | 关键路径有测试覆盖 | 状态机、降级策略、异常路径 |
| 7 | AI 生成代码已审查 | 人类 Code Review 通过 |
| 8 | 文档同步更新 | 配置/API 变更同步到 PRD |
| 9 | 结构化日志输出 | 关键操作有 JSON 日志 |
| 10 | 错误路径有告警 | 异常场景触发告警 |

### 16.3 AI 编码专项 DoD

| # | 条件 | 说明 |
|---|------|------|
| A1 | AI Prompt 可追溯 | 代码注释标注来源 Prompt |
| A2 | 测试先行 | AI 生成功能代码时必须同时生成测试 |
| A3 | 边界用例覆盖 | 空输入、超长输入、并发冲突、网络超时 |
| A4 | 无"魔法数字" | 超时、重试次数等提取为可配置项 |
| A5 | 降级路径可测试 | 每个 fallback 可通过 mock 触发验证 |
| A6 | 禁止硬编码凭证 | 通过 `secret-manager.ts` 加载 |

### 16.4 核心模块测试策略

| 模块 | 测试类型 | 覆盖率要求 |
|------|---------|-----------|
| ChatMutex | 单元测试（FakeTimers） | ≥90% |
| UIRecognizer | 集成测试（CDP Mock + JSDOM） | ≥85% |
| ChatFiller | E2E 冒烟（Playwright + Lexical Mock） | ≥80% |
| LarkTerminal | 集成测试（child_process Mock） | ≥85% |
| BitableSync | 契约测试（lark-cli Mock） | ≥80% |
| TaskManager | 单元测试（Git Mock） | ≥90% |
| ConfigManager | 单元测试（fs Mock） | ≥90% |
| Dispatcher | 集成测试（全模块 Mock） | ≥85% |
| SecretManager | 单元测试（crypto Mock） | ≥95% |

### 16.5 CI/CD 质量门禁

PR 合并前必须通过以下自动化门禁：

```
ESLint → TypeScript 类型检查 → 单元测试 → 覆盖率阈值 → 无新增 TODO → 日志格式检查
```

### 16.6 混沌测试（每月执行）

| 注入场景 | 预期行为 |
|---------|---------|
| 网络抖动（500ms 延迟 + 10% 丢包） | CDP 重连 + 飞书告警 |
| 进程崩溃（kill -9 lark-cli） | 自动重启 + 消息不丢失 |
| DOM 结构突变 | UIRecognizer 降级 + 缓存兜底 |
| 磁盘满 | Git 提交失败 → 飞书告警 → 任务暂停 |
| CDP 端口占用 | 实例启动失败 → 飞书告警 |
| 飞书 API 限流（429） | 退避重试 + 速率控制 |
| 配置文件损坏 | 使用默认配置 + 告警 |

### 16.7 版本演进 DoD 阶段性要求

| 阶段 | DoD 重点 | 全局覆盖率 |
|------|---------|-----------|
| Phase 0 预研 | 预研验收报告 + 技术可行性结论 | — |
| Phase 1 MVP | 核心链路 E2E + 单元测试 | ≥70% |
| Phase 2 飞书集成 | 集成测试 + 契约测试 | ≥75% |
| Phase 3 多任务编排 | 并发测试 + 混沌测试 | ≥80% |
| 正式发布 | 全量测试 + 安全审计 + 性能基准 | ≥85% |

> 📖 **完整规范**：测试用例模板（Given-When-Then）、AI 协作工作流、技术债务管理规则等详见 [`docs/DO_AND_TESTING_SPEC.md`](docs/DO_AND_TESTING_SPEC.md)

---

## 18. 执行契约体系 (Executable Contracts)

> **评审驱动**：v2.6.0 复核评审建议将 PRD 从"描述性文档"升级为"可执行状态机 + 事件流 + 验证环"的执行契约。

### 17.1 设计理念

传统 PRD 描述"系统应该做什么"，执行契约定义"系统如何重复执行、如何验证、如何降级"。核心思路：

| 传统 PRD 写法 | 执行契约写法 |
|-------------|------------|
| "系统应支持多任务并行" | `State: queue → acquire → fill → wait → release` |
| "AI 完成后自动提交代码" | `Trigger: file_change → Stage → Commit → Verify → Notify` |
| "UI 识别失败应降级" | `If P0 fail → Try P1 → If P1 fail → Try P2 → Log & Alert` |

### 17.2 执行卡片（exec-units/）

每个核心模块对应一个 YAML 执行卡片，定义**触发条件 → 状态流转 → 执行动作 → 验证闭环 → 降级/重试**：

| 执行卡片 | 模块 | 触发条件 | 核心循环 |
|---------|------|---------|---------|
| `chat-mutex.yaml` | ChatMutex | 任务分配到实例 | 获取锁 → 超时保护 → 排队 → 释放 |
| `ui-recognizer.yaml` | UIRecognizer | CDP 连接建立 | 加载缓存 → 全量探测 → P0-P5 匹配 → 缓存写入 |
| `chat-fill.yaml` | ChatFiller | 锁获取成功 | 检查输入 → P0/P1/P2 降级填充 → 内容校验 → 发送 |
| `git-auto-commit.yaml` | GitManager | 文件变更/任务完成 | 检查分支 → 暂存 → 提交 → 验证 → 推送 |
| `lark-terminal.yaml` | LarkTerminal | 系统启动/断连 | 启动进程 → 心跳检测 → 消息去重 → 重连 |

**执行卡片标准结构**：

```yaml
id: UNIT-XXX-01
module: ModuleName
trigger: event_name
xstate_binding:
  machine_id: xxxMachine
  events: [...]
  guards: [...]
  actions: [...]
state_schema: { ... }
steps:
  - name: step_name
    action: function_call()
    guard: condition
    on_fail: fallback_step
verify:
  - condition: "assertion"
    severity: ERROR|WARN|FATAL
fallback:
  - condition: failure_condition
    action: recovery_action
    notify: lark_card("message")
metrics:
  - "module.action.metric_name"
```

### 17.3 xstate 状态机

> **v2.8.0 评审补充**：严格限定 xstate 使用范围，避免简单模块过度工程化。

执行卡片中的 `xstate_binding` 绑定到实际的状态机实现：

| 状态机 | 文件 | 状态 | 使用 xstate |
|--------|------|------|:-----------:|
| `taskMachine` | `src/core/states/task-machine.ts` | pending → assigned → running → completed/failed/blocked/cancelled | ✅ |
| `chatMutexMachine` | `src/cdp/chat-mutex-machine.ts` | idle → locked → idle/timeout | ✅ |
| `approvalFlowMachine` | `src/task/approval-machine.ts` | pending → approved/rejected/timeout | ✅ |

**xstate 使用边界**（详见 `docs/XSTATE_SCOPE.md`）：

| ✅ 使用 xstate | ❌ 不使用 xstate |
|---------------|-----------------|
| ChatMutex（并发锁状态） | ConfigManager（纯配置读写） |
| TaskLifecycle（任务状态流转） | Logger（纯日志输出） |
| ApprovalFlow（审批状态机） | SecretManager（加密/解密） |
| — | LarkTerminal（事件驱动，非状态机） |
| — | BitableSync（轮询同步，非状态机） |

> 不使用 xstate 的模块保持纯 TypeScript 类 + 事件总线（`eventBus.emit/on`）模式。

**状态机设计原则**：
- 每个状态机必须有明确的 `initial`、`final` 和异常状态
- 状态必须可持久化（支持崩溃恢复）
- 所有超时/重试参数必须可配置
- 天然支持时间旅行调试

### 17.4 AI Prompt 与执行契约集成

AI 编码助手通过 `.ai-prompts/executable-contract.md` 模板，严格按执行卡片生成代码：

```
人类定义规则（YAML 卡片）
    ↓
AI 按卡片生成代码 + 测试
    ↓
CI 门禁验证（DoD 10+6 项）
    ↓
系统自动验证（verify 节点）
    ↓
异常自动降级（fallback 节点）
```

---

## 19. 角色矩阵与 Trae IDE 智能体

> **评审驱动**：v2.6.0 评审建议补充 CDP/UI 专家、AI 提示词工程师、DevOps 专家角色。

### 19.1 角色矩阵

| 角色 | ID | 职责 | 推荐模型 |
|------|-----|------|---------|
| 🏗️ 系统架构师 | `@architect` | 状态机设计、执行卡片生成、架构评审 | Claude 3.5 Sonnet / Qwen-Max |
| 💻 核心开发 | `@core-dev` | CDP 模块、并发控制、飞书集成实现 | Qwen 2.5-Coder 32B / DeepSeek-Coder-V2 |
| 🧪 测试专家 | `@qa-expert` | Vitest/Playwright 用例、覆盖率、混沌测试 | Claude 3.5 Haiku / GPT-4o |
| 🛡️ 安全审查官 | `@security-reviewer` | 代码审查、DoD 合规、AI 代码溯源 | Claude 3.5 Sonnet |
| 🤖 AI 协作工程师 | `@ai-prompt-eng` | 执行卡片维护、Prompt 模板、工作流编排 | Claude 3.5 Sonnet / Qwen-Max |
| 🔧 DevOps 专家 | `@devops-eng` | CI/CD 门禁、Husky、混沌测试调度 | Qwen-Plus / Gemini 1.5 Pro |
| 📊 项目管理 | `@pm-lead` | 里程碑管理、飞书看板、审批流、指标跟踪 | — |

### 19.2 智能体配置

智能体提示词位于 `.trae/agents/` 目录，每个智能体包含：
- **YAML Frontmatter**：ID、角色、能力、约束、输出格式、版本号
- **Markdown 正文**：职责描述、工作规范、参考文档

全局约束定义在 `.trae/rules.md`，自动注入到每个智能体的 System Prompt。

> **v2.8.0 评审补充**：Prompt 版本管理，防止多角色 Prompt 漂移。

**Prompt 版本管理规范**：

| 规则 | 说明 |
|------|------|
| 版本号格式 | `v1.0.0@2026-04-26`，附在 Frontmatter `version` 字段 |
| 注册中心 | `prompts/registry.yaml` 记录所有 Prompt 的 ID、版本、最后更新时间 |
| CI Prompt Lint | `scripts/lint-prompts.js` 校验格式、必填字段、全局规则注入一致性（详见 19.2.3） |
| 更新流程 | 修改 `.md` 文件 → 更新 `registry.yaml` 版本号 → CI 自动校验 |
| 季度回顾 | 每季度检查 Prompt 一致性，清理过时约束 |

### 19.3 协同工作流

```
👤 人类/PM                    🏗️ @architect              💻 @core-dev
    │                              │                          │
    │  需求描述 /task               │                          │
    ├─────────────────────────────►│                          │
    │                              │  生成 exec-units/*.yaml  │
    │                              │  + xstate 状态机         │
    │                              ├─────────────────────────►│
    │                              │                          │  Prompt → 代码 + 测试
    │                              │                          │
    │                              │                    🧪 @qa-expert
    │                              │                          │
    │                              │                    🛡️ @security-reviewer
    │                              │                          │
    │                              │                    🚦 CI Quality Gate
    │                              │                          │
    │                              │                    🔧 @devops-eng
    │                              │                          │
    │  ◄──────────────────────────────────────────────────────┤
    │  验收通过 / 飞书看板更新                                     │
```

### 19.4 快捷键配置

| 快捷键 | 智能体 |
|--------|--------|
| `Cmd+Shift+A` | @architect |
| `Cmd+Shift+C` | @core-dev |
| `Cmd+Shift+T` | @qa-expert |
| `Cmd+Shift+S` | @security-reviewer |
| `Cmd+Shift+P` | @ai-prompt-eng |
| `Cmd+Shift+D` | @devops-eng |
| `Cmd+Shift+M` | @pm-lead |

### 19.5 Prompt Lint 检查项规范

> **评审驱动**：Claude 最终评审指出 CI Prompt Lint 流于形式的风险，需明确具体检查项。

**`scripts/lint-prompts.js` 必须检查以下 3 类 9 项**：

| 类别 | 检查项 | 严重级别 | 说明 |
|------|--------|---------|------|
| **必填字段完整性** | YAML Frontmatter 包含 `id` | ERROR | 缺少则 Prompt 无法被路由 |
| | YAML Frontmatter 包含 `role` | ERROR | 缺少则角色定义不完整 |
| | YAML Frontmatter 包含 `version`（`vX.Y.Z@date` 格式） | ERROR | 缺少则版本管理失效 |
| | YAML Frontmatter 包含 `capabilities` | WARN | 缺少则能力边界不明确 |
| **全局规则注入校验** | Prompt 正文引用 `rules.md` 约束 | ERROR | 未引用则全局规则（DoD 10+6 项）未注入 |
| | Prompt 正文包含安全红线声明 | ERROR | 未包含则安全约束可能被绕过 |
| | Prompt 正文包含输出格式声明 | WARN | 未包含则 AI 输出格式不一致 |
| **一致性校验** | `registry.yaml` 中版本号与 Frontmatter 一致 | ERROR | 不一致说明更新遗漏 |
| | `agents.config.yaml` 中引用的 agent ID 与文件名匹配 | ERROR | 不匹配则路由失败 |

```bash
# 执行 Prompt Lint
node scripts/lint-prompts.js --agents-dir .trae/agents/ --rules .trae/rules.md --registry prompts/registry.yaml

# 输出示例
# ✅ architect.md: Frontmatter 完整, rules.md 已引用, registry 版本一致
# ❌ core-dev.md: 缺少 version 字段 (ERROR)
# ⚠️ qa-expert.md: 未声明输出格式 (WARN)
```

---

## 附录 A：lark-cli 事件监听参考

```bash
# 监听群聊消息（NDJSON 输出）
lark-cli event +subscribe --chat-id "oc_xxx" --event-type im.message.receive_v1

# 输出格式（每行一个 JSON）
{"event":{"message":{"content":"{\"text\":\"/task 实现登录API\"}"},...}}
{"event":{"message":{"content":"{\"text\":\"/status\"}"},...}}

# 发送消息
lark-cli im +messages-send --chat-id "oc_xxx" --text "任务已完成"

# 更新多维表格
lark-cli base +record-update --app-token "xxx" --table-id "xxx" \
  --filter '任务ID = "T-001"' \
  --fields '{"状态": "已完成", "进度": 100}'
```

## 附录 B：CDP Chat 填充降级策略

```javascript
// 策略 1: execCommand insertText（首选，兼容 Lexical）
async function fillStrategy1(text) {
  await Runtime.evaluate({
    expression: `
      const el = document.querySelector('[contenteditable="true"]');
      el.focus();
      document.execCommand('selectAll');
      document.execCommand('delete');
      document.execCommand('insertText', false, ${JSON.stringify(text)});
    `
  });
}

// 策略 2: Lexical 编辑器直接操作（降级）
async function fillStrategy2(text) {
  await Runtime.evaluate({
    expression: `
      const spans = document.querySelectorAll('span[data-lexical-text="true"]');
      for (const span of spans) span.remove();
      const el = document.querySelector('[contenteditable="true"]');
      el.focus();
      document.execCommand('insertText', false, ${JSON.stringify(text)});
    `
  });
}

// 策略 3: 剪贴板粘贴（最终降级）
async function fillStrategy3(text) {
  await Runtime.evaluate({
    expression: `
      navigator.clipboard.writeText(${JSON.stringify(text)});
      document.execCommand('paste');
    `
  });
}
```

## 附录 C：参考资料

- [Trae-Ralph](https://github.com/ylubi/Trae-Ralph) — CDP 注入、Ralph Loop、场景检测
- [Feishu CLI](https://feishu-cli.com/zh/) — 飞书 CLI、事件订阅、19 个 Agent Skills
- [@larksuiteoapi/lark-mcp](https://www.npmjs.com/package/@larksuiteoapi/lark-mcp) — 飞书 MCP 工具
- [chrome-remote-interface](https://github.com/nicedoc/chrome-remote-interface) — CDP 客户端
- [Multi-Agent Orchestration Patterns](https://beam.ai/agentic-insights/multi-agent-orchestration-patterns-production) — 编排模式

---

## 20. 拟人化反检测模块（Humanization）

> **v0.9 Beta 新增**：这是系统最大的认知盲区。当前所有 CDP 操作都是"最快速度完成任务"的逻辑，但对 Trae 风控系统而言，这是最典型的自动化脚本特征。**不做此模块，单账号系统预期寿命从 12 个月降到 2~3 个月。**

### 20.1 设计目标

让 CDP 操作的行为模式尽可能接近人类开发者使用 Trae IDE 的真实行为，降低被 Trae 风控系统识别为自动化脚本的概率。

### 20.2 三层拟人化策略

#### 20.2.1 字符级打字模拟

```typescript
// src/cdp/humanization/typing-simulator.ts
interface TypingConfig {
  charDelay: { min: number; max: number };      // 单字符间隔 30~120ms
  punctuationDelay: { min: number; max: number }; // 标点/空格额外延迟 50~200ms
  thinkPause: { min: number; max: number };      // "思考停顿"概率和时长
  thinkPauseProbability: number;                  // 思考停顿概率 0.1~0.3
  typoProbability: number;                        // 打字错误概率 0.01~0.03
}

const DEFAULT_TYPING_CONFIG: TypingConfig = {
  charDelay: { min: 30, max: 120 },
  punctuationDelay: { min: 50, max: 200 },
  thinkPause: { min: 500, max: 3000 },
  thinkPauseProbability: 0.15,
  typoProbability: 0.02,
};

async function humanizedType(
  cdp: CDPConnection,
  selector: string,
  text: string,
  config = DEFAULT_TYPING_CONFIG
): Promise<void> {
  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    // 随机思考停顿（每 50~100 个字符可能触发一次）
    if (i > 0 && i % randomInt(50, 100) === 0 && Math.random() < config.thinkPauseProbability) {
      await sleep(randomInt(config.thinkPause.min, config.thinkPause.max));
    }

    // 标点和空格额外延迟
    if (/[。！？，、；：\s]/.test(char)) {
      await sleep(randomInt(config.punctuationDelay.min, config.punctuationDelay.max));
    } else {
      await sleep(randomInt(config.charDelay.min, config.charDelay.max));
    }

    // 模拟打字错误（1~3% 概率，打错后立即退格修正）
    if (Math.random() < config.typoProbability && /[a-zA-Z]/.test(char)) {
      const wrongChar = String.fromCharCode(char.charCodeAt(0) + (Math.random() > 0.5 ? 1 : -1));
      await cdp.Input.insertText(wrongChar);
      await sleep(randomInt(100, 300));  // 发现错误后的短暂停顿
      await cdp.Input.dispatchKeyEvent({ type: 'keyDown', key: 'Backspace' });
      await cdp.Input.dispatchKeyEvent({ type: 'keyUp', key: 'Backspace' });
      await sleep(randomInt(50, 150));
    }

    await cdp.Input.insertText(char);
  }
}
```

#### 20.2.2 操作间延迟

```typescript
// src/cdp/humanization/action-delay.ts
interface ActionDelayConfig {
  clickToFill: { min: number; max: number };       // 点击任务→填充 Prompt 1~5s
  activateToRead: { min: number; max: number };     // 激活新任务→"阅读上下文" 2~8s
  fillToSend: { min: number; max: number };         // 填充完成→点击发送 1~3s
  sendToNext: { min: number; max: number };         // 发送后→下一个操作 3~10s
}

const DEFAULT_ACTION_DELAY: ActionDelayConfig = {
  clickToFill: { min: 1000, max: 5000 },
  activateToRead: { min: 2000, max: 8000 },
  fillToSend: { min: 1000, max: 3000 },
  sendToNext: { min: 3000, max: 10000 },
};

async function humanizedDelay(action: keyof ActionDelayConfig): Promise<void> {
  const { min, max } = DEFAULT_ACTION_DELAY[action];
  await sleep(randomInt(min, max));
}
```

#### 20.2.3 行为多样性（无意义动作注入）

```typescript
// src/cdp/humanization/behavior-diversity.ts
interface BehaviorConfig {
  scrollProbability: number;           // 随机滚动概率 0.1
  cursorMoveProbability: number;       // 随机光标移动概率 0.05
  blurFocusProbability: number;        // 失焦再聚焦概率 0.03
  idleProbability: number;             // 空闲发呆概率 0.02
}

const DEFAULT_BEHAVIOR: BehaviorConfig = {
  scrollProbability: 0.1,
  cursorMoveProbability: 0.05,
  blurFocusProbability: 0.03,
  idleProbability: 0.02,
};

async function injectRandomBehavior(cdp: CDPConnection): Promise<void> {
  const rand = Math.random();

  if (rand < DEFAULT_BEHAVIOR.scrollProbability) {
    // 随机滚动页面
    const scrollY = randomInt(-200, 200);
    await cdp.Input.dispatchMouseEvent({
      type: 'mouseWheel',
      x: randomInt(100, 800),
      y: randomInt(100, 600),
      deltaY: scrollY,
    });
  } else if (rand < DEFAULT_BEHAVIOR.cursorMoveProbability) {
    // 随机移动光标
    await cdp.Input.dispatchMouseEvent({
      type: 'mouseMoved',
      x: randomInt(100, 800),
      y: randomInt(100, 600),
    });
  } else if (rand < DEFAULT_BEHAVIOR.blurFocusProbability) {
    // 失焦再聚焦（模拟看别处再回来）
    await cdp.Page.bringToFront();
    await sleep(randomInt(500, 2000));
  }
  // idleProbability: 什么都不做，自然停顿
}
```

### 20.3 拟人化参数配置

```yaml
# team.yaml 拟人化配置段
humanization:
  enabled: true
  # Phase 0 预研结果决定以下参数的保守程度
  profile: "conservative"  # conservative / moderate / aggressive

  typing:
    char_delay: { min: 30, max: 120 }
    punctuation_delay: { min: 50, max: 200 }
    think_pause: { min: 500, max: 3000 }
    think_pause_probability: 0.15
    typo_probability: 0.02

  action_delay:
    click_to_fill: { min: 1000, max: 5000 }
    activate_to_read: { min: 2000, max: 8000 }
    fill_to_send: { min: 1000, max: 3000 }
    send_to_next: { min: 3000, max: 10000 }

  behavior:
    scroll_probability: 0.1
    cursor_move_probability: 0.05
    blur_focus_probability: 0.03
```

### 20.4 在执行卡片中的集成

所有 CDP 操作的执行卡片 YAML 新增 `humanization` 段：

```yaml
# chat-fill.yaml 新增段
humanization:
  typing: true           # 启用字符级打字模拟
  action_delay: true     # 启用操作间延迟
  behavior_diversity: true # 启用无意义动作注入
  profile: "${team.humanization.profile}"  # 引用全局配置
```

---

## 21. 配额感知与降速模块（Quota Manager）

> **v0.9 Beta 新增**：单账号场景下没有账号池兜底，唯一的生存策略就是**绝不触碰单账号的使用上限**。

### 21.1 设计目标

实时跟踪单账号的 Trae 使用量，在接近配额上限时自动降速或暂停，避免触发封禁。

### 21.2 三层配额保护

```
日消耗 0% ─────────────── 70% ─────────────── 90% ─────── 100%
         正常运行区间        ⚠️ 降速区间          🛑 熔断区间
                              │                    │
                              ▼                    ▼
                         降低并发度            暂停所有
                         增加操作延迟          非关键任务
                         飞书告警              进入冷却期
```

### 21.3 配额跟踪

```typescript
// src/core/quota-manager.ts
interface QuotaRecord {
  timestamp: number;
  charCount: number;       // 本次发送的字符数
  promptTokens: number;    // 估算的 token 数
  role: string;            // 哪个角色发送的
}

interface QuotaThresholds {
  warnPercent: number;     // 70% 告警
  throttlePercent: number; // 90% 降速
  dailyLimit: number;      // 日配额上限（Phase 0 实测确定）
}

class QuotaManager {
  private records: QuotaRecord[] = [];
  private thresholds: QuotaThresholds;

  // 记录一次 Chat 发送
  recordUsage(charCount: number, role: string): void {
    this.records.push({
      timestamp: Date.now(),
      charCount,
      promptTokens: Math.ceil(charCount / 2),  // 粗略估算
      role,
    });
    this.checkThresholds();
  }

  // 获取今日已用百分比
  getDailyUsagePercent(): number {
    const todayStart = new Date().setHours(0, 0, 0, 0);
    const todayRecords = this.records.filter(r => r.timestamp >= todayStart);
    const totalChars = todayRecords.reduce((sum, r) => sum + r.charCount, 0);
    return (totalChars / this.thresholds.dailyLimit) * 100;
  }

  // 检查阈值并触发动作
  private checkThresholds(): void {
    const usage = this.getDailyUsagePercent();

    if (usage >= this.thresholds.throttlePercent) {
      // 90%+ → 熔断：暂停所有非关键任务
      eventBus.emit('quota:throttle', { usage });
      larkNotify('🛑 日配额已用 ' + usage.toFixed(0) + '%，暂停非关键任务');
    } else if (usage >= this.thresholds.warnPercent) {
      // 70%+ → 降速：增加延迟、降低并发
      eventBus.emit('quota:warn', { usage });
      larkNotify('⚠️ 日配额已用 ' + usage.toFixed(0) + '%，进入降速模式');
    }
  }

  // 是否允许发送（熔断时返回 false）
  canSend(): boolean {
    return this.getDailyUsagePercent() < this.thresholds.throttlePercent;
  }
}
```

### 21.4 窗口感知（Trae 额度用尽检测）

```typescript
// 检测 Trae 是否弹出"今日额度已用完"提示
async function detectQuotaExhausted(cdp: CDPConnection): Promise<boolean> {
  const selectors = [
    '[data-testid="quota-exhausted"]',
    '.quota-limit-dialog',
    '.rate-limit-notice',
    // Phase 0 预研后补充实际 DOM 选择器
  ];

  for (const selector of selectors) {
    const node = await cdp.DOM.querySelector({ selector });
    if (node) {
      logger.error('检测到 Trae 额度用尽提示', { selector });
      eventBus.emit('quota:exhausted');
      return true;
    }
  }
  return false;
}
```

### 21.5 会话保活

```typescript
// 避免长时间空闲导致登录态失效
class SessionKeeper {
  private interval: NodeJS.Timer;
  private keepAliveIntervalMs = 30 * 60 * 1000; // 每 30 分钟

  start(cdp: CDPConnection): void {
    this.interval = setInterval(async () => {
      // 轻量交互：移动鼠标 + 聚焦窗口，不触发 Chat 操作
      await cdp.Input.dispatchMouseEvent({
        type: 'mouseMoved',
        x: randomInt(100, 400),
        y: randomInt(100, 300),
      });
      await cdp.Page.bringToFront();
      logger.debug('会话保活：轻量交互');
    }, this.keepAliveIntervalMs);
  }
}
```

### 21.6 配额配置

```yaml
# team.yaml 配额配置段
quota:
  enabled: true
  daily_limit_chars: 50000              # Phase 0 实测确定
  warn_percent: 70                       # 70% 告警
  throttle_percent: 90                   # 90% 熔断
  cooldown_duration_minutes: 360         # 熔断冷却期 6h
  session_keepalive_interval_minutes: 30 # 会话保活间隔
  quota_exhausted_selectors:             # Trae 额度用尽 DOM 选择器
    - '[data-testid="quota-exhausted"]'
    - '.quota-limit-dialog'
```

---

## 22. CDP 选择器自适应与兼容矩阵（Selector Adaptation）

> **v0.9 Beta 新增**：UI Recognizer 当前缺失一个关键机制——**选择器失效的自动降级路径**。Trae 每次更新都可能让选择器失效，需要三层降级策略 + 版本兼容矩阵。

### 22.1 三层选择器策略

```
P0: 语义化属性（最稳定）
  ├── aria-label, data-testid, role 属性
  └── 稳定性：⭐⭐⭐⭐⭐（Trae 很少改这些）

P1: 结构化路径（中等稳定）
  ├── CSS 选择器（class 链、DOM 路径）
  └── 稳定性：⭐⭐⭐（Trae 更新可能改 class 名）

P2: 图像识别（兜底方案）
  ├── OCR 文字识别 + 坐标定位
  └── 稳定性：⭐⭐（不依赖 DOM，但速度慢、精度低）
```

### 22.2 选择器探测与缓存

```typescript
// src/cdp/selector-adapter.ts
interface SelectorEntry {
  element: string;           // 元素用途（如 "chat-input", "send-button"）
  p0: string;                // 语义化选择器
  p1: string;                // CSS 选择器
  p2?: { ocrText: string; region: { x: number; y: number; w: number; h: number } };
  lastVerified: number;      // 上次验证时间
  status: 'valid' | 'degraded' | 'failed';
}

class SelectorAdapter {
  private cache: Map<string, SelectorEntry>;
  private cdp: CDPConnection;

  // 按需探测：飞书指令到达时触发
  async probe(element: string): Promise<SelectorEntry | null> {
    const entry = this.cache.get(element);

    // P0: 语义化属性
    if (entry?.p0) {
      const node = await this.cdp.DOM.querySelector({ selector: entry.p0 });
      if (node) return { ...entry, status: 'valid', lastVerified: Date.now() };
    }

    // P1: CSS 选择器
    if (entry?.p1) {
      const node = await this.cdp.DOM.querySelector({ selector: entry.p1 });
      if (node) {
        this.cache.set(element, { ...entry, status: 'degraded', lastVerified: Date.now() });
        logger.warn(`选择器降级: ${element} P0 失效，使用 P1`);
        return entry;
      }
    }

    // P2: 图像识别（兜底）
    if (entry?.p2) {
      const found = await this.ocrLocate(entry.p2.ocrText, entry.p2.region);
      if (found) {
        this.cache.set(element, { ...entry, status: 'degraded', lastVerified: Date.now() });
        logger.warn(`选择器降级: ${element} P0/P1 失效，使用 P2 OCR`);
        return entry;
      }
    }

    // 全部失效
    this.cache.set(element, { ...entry, status: 'failed', lastVerified: Date.now() });
    logger.error(`选择器全部失效: ${element}，写入 SELECTOR_FAILED.md`);
    this.writeFailureReport(element);
    return null;
  }
}
```

### 22.3 Trae 版本→选择器映射表

```yaml
# docs/TRADE_SELECTOR_MATRIX.yaml
trae_version: "1.8.2"
last_updated: "2026-04-26"

selectors:
  chat_input:
    p0: '[data-testid="chat-input"] [contenteditable="true"]'
    p1: '.chat-panel .input-area .ProseMirror'
    p2: { ocr_text: "Ask Trae anything", region: { x: 300, y: 800, w: 600, h: 40 } }

  send_button:
    p0: '[data-testid="chat-send-button"]'
    p1: '.chat-panel .input-area button[aria-label="Send"]'
    p2: { ocr_text: "Send", region: { x: 880, y: 810, w: 60, h: 30 } }

  task_slot:
    p0: '[data-testid="task-item-{role}"]'
    p1: '.task-list .task-item:nth-child({index})'
    p2: null  # 任务槽位不支持 OCR 兜底

  ralph_continue_button:
    p0: '[data-testid="ralph-continue"]'
    p1: '.chat-response button.continue-btn'
    p2: { ocr_text: "Continue", region: { x: 500, y: 600, w: 100, h: 30 } }
```

### 22.4 选择器失效自动报警

```typescript
// 选择器失效时自动写入报告
writeFailureReport(element: string): void {
  const reportPath = 'SELECTOR_FAILED.md';
  const entry = this.cache.get(element);
  const content = `
## 选择器失效报告

- **时间**: ${new Date().toISOString()}
- **元素**: ${element}
- **P0 选择器**: ${entry?.p0} → ❌ 失效
- **P1 选择器**: ${entry?.p1} → ❌ 失效
- **P2 OCR**: ${entry?.p2 ? '❌ 失效' : '未配置'}
- **Trae 版本**: ${getCurrentTraeVersion()}
- **操作**: 请手动检查 DOM 结构并更新 TRADE_SELECTOR_MATRIX.yaml
`;
  fs.appendFileSync(reportPath, content);
  larkNotify(`🔴 选择器失效: ${element}，请检查 Trae 版本更新`);
}
```

---

## 23. CDP Executor 实现细则

> **PRD 最大认知盲区**：前 9 轮评审一直在讨论"编排层"（状态机、飞书路由、VS Code 插件），但真正决定系统能不能跑起来的"执行层"——三步 CDP 调用的具体实现——从未被展开。**Phase 0 Sprint 1 的第一件事就是用 100 行代码把 Step 1-3 跑通，录屏证明可行。如果这一步跑不通，整个系统推倒重来。**

### 23.1 执行主体

**CDP Executor** 是一个基于 `chrome-remote-interface` 的 Node.js 模块，通过 Chrome DevTools Protocol 直连 Trae 的 Electron 渲染进程。它不依赖 Trae 的任何 API，只依赖 Trae 启动时暴露的 CDP 调试端口（`--remote-debugging-port=9222`）。

物理上，CDP Executor 和 TaskManager 跑在同一个 Node.js 进程中。

### 23.2 连接管理

```typescript
// src/cdp/executor.ts
import CDP from 'chrome-remote-interface';

class CDPExecutor {
  private client: CDP.Client | null = null;
  private port: number;
  private heartbeatTimer: NodeJS.Timer | null = null;

  constructor(port = 9222) {
    this.port = port;
  }

  // 建立长连接（TaskManager 启动时调用一次，全局复用）
  async connect(): Promise<void> {
    // 1. 列出所有 Target，找到主窗口
    const targets = await CDP.List({ port: this.port });
    const mainTarget = targets.find(t =>
      t.type === 'page' && t.title.includes('Trae')
    );
    if (!mainTarget) throw new Error('未找到 Trae 主窗口 Target');

    // 2. 连接到主 Target
    this.client = await CDP({ target: mainTarget.webSocketDebuggerUrl });
    const { Runtime, DOM, Input, Page, Network } = this.client;
    await Promise.all([Runtime.enable(), DOM.enable(), Page.enable()]);

    // 3. 断连检测
    this.client.on('disconnect', () => {
      logger.error('CDP 连接断开，启动自动重连');
      this.reconnect();
    });

    // 4. 心跳保活（每 30s）
    this.heartbeatTimer = setInterval(async () => {
      try {
        await this.client!.Runtime.evaluate({ expression: '1' });
      } catch {
        logger.warn('CDP 心跳失败，触发重连');
        this.reconnect();
      }
    }, 30000);
  }

  // 自动重连（指数退避，最多 5 次）
  private reconnectAttempt = 0;
  private async reconnect(): Promise<void> {
    if (this.reconnectAttempt >= 5) {
      logger.error('CDP 重连 5 次失败，停止重连');
      eventBus.emit('cdp:reconnect_failed');
      return;
    }
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempt), 30000);
    this.reconnectAttempt++;
    logger.info(`CDP ${delay}ms 后重连（第 ${this.reconnectAttempt} 次）`);
    await sleep(delay);
    try {
      await this.connect();
      this.reconnectAttempt = 0;
      logger.info('CDP 重连成功');
    } catch {
      this.reconnect();
    }
  }

  get isConnected(): boolean {
    return this.client !== null;
  }
}
```

### 23.3 三步操作（强制技术路径）

> **反自动化检测强制规范**：所有 CDP 操作**必须**使用 `Input.dispatchMouseEvent` + `Input.insertText` 路径，**禁止**使用 `element.click()` 和 `element.value = xxx`。

#### Step 1：定位目标任务槽位并点击切换

```typescript
async switchToTaskSlot(roleId: string): Promise<void> {
  const { Runtime, Input } = this.client!;

  // 1. 获取目标节点的屏幕坐标
  const { result } = await Runtime.evaluate({
    expression: `
      (function() {
        const items = document.querySelectorAll('[data-testid="task-list-item"]');
        for (const item of items) {
          if (item.textContent.includes('${roleId}')) {
            const rect = item.getBoundingClientRect();
            return JSON.stringify({
              x: Math.round(rect.left + rect.width / 2),
              y: Math.round(rect.top + rect.height / 2)
            });
          }
        }
        return null;
      })()
    `,
    returnByValue: true,
  });

  if (!result.value) throw new Error(`未找到角色 ${roleId} 的任务槽位`);
  const { x, y } = JSON.parse(result.value);

  // 2. 拟人化鼠标移动（贝塞尔曲线，非直线）
  await humanMove(Input, x, y);
  await sleep(randomDelay(80, 200)); // 悬停

  // 3. 模拟真实鼠标点击（mousedown → mouseup，非 element.click()）
  await Input.dispatchMouseEvent({ type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await sleep(randomDelay(40, 120)); // 真实点击按下时长
  await Input.dispatchMouseEvent({ type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });

  logger.info(`已切换到角色 ${roleId} 的任务槽位`);
}
```

#### Step 2：聚焦 Chat 输入框

```typescript
async focusChatInput(): Promise<{ x: number; y: number }> {
  const { Runtime, Input } = this.client!;

  const { result } = await Runtime.evaluate({
    expression: `
      (function() {
        const input = document.querySelector('[data-testid="chat-input"]')
          || document.querySelector('.chat-panel .input-area [contenteditable="true"]');
        if (!input) return null;
        input.focus();
        const rect = input.getBoundingClientRect();
        return JSON.stringify({
          x: Math.round(rect.left + 20),
          y: Math.round(rect.top + rect.height / 2)
        });
      })()
    `,
    returnByValue: true,
  });

  if (!result.value) throw new Error('未找到 Chat 输入框');
  const { x, y } = JSON.parse(result.value);

  // 点击输入框确保聚焦
  await Input.dispatchMouseEvent({ type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await Input.dispatchMouseEvent({ type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  await sleep(randomDelay(200, 500)); // 聚焦后的思考停顿

  return { x, y };
}
```

#### Step 3：逐字符填充 Prompt 并回车提交

```typescript
async fillAndSubmit(prompt: string): Promise<void> {
  const { Input } = this.client!;

  // 1. 逐字符输入（拟人化，见 §20）
  for (let i = 0; i < prompt.length; i++) {
    const char = prompt[i];
    await Input.insertText({ text: char });
    await sleep(randomDelay(30, 120));

    // 标点和空格额外停顿
    if ('，。！？,.!?；：;：'.includes(char)) {
      await sleep(randomDelay(100, 300));
    }

    // 思考停顿（每 50~100 字符）
    if (i > 0 && i % randomInt(50, 100) === 0 && Math.random() < 0.15) {
      await sleep(randomDelay(500, 3000));
    }
  }

  // 2. 提交前犹豫
  await sleep(randomDelay(500, 1500));

  // 3. 回车提交（可配置：Enter / Cmd+Enter / Ctrl+Enter）
  const submitKey = config.get('chat.submit_key', 'Enter');
  if (submitKey === 'Enter') {
    await Input.dispatchKeyEvent({ type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await Input.dispatchKeyEvent({ type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  } else {
    // Cmd+Enter (macOS) 或 Ctrl+Enter (Windows/Linux)
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await Input.dispatchKeyEvent({ type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, modifiers: modifier });
    await Input.dispatchKeyEvent({ type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, modifiers: modifier });
  }

  logger.info('Prompt 已提交');
}
```

### 23.4 任务完成状态感知

> **组合策略：文件系统监听（主力）+ DOM 轮询（兜底）**

```typescript
// 主策略：文件系统监听（chokidar + Git 状态）
class TaskCompletionDetector {
  private watcher: chokidar.FSWatcher;
  private lastChangeTime: number = 0;
  private completionThresholdMs = 10000; // 10s 无变化判定完成

  start(workspaceDir: string): void {
    this.watcher = chokidar.watch(workspaceDir, {
      ignored: /node_modules|\.git|dist/,
      persistent: true,
    });

    this.watcher.on('all', () => {
      this.lastChangeTime = Date.now();
    });

    // 每 5s 检查一次
    setInterval(() => {
      if (Date.now() - this.lastChangeTime > this.completionThresholdMs
          && this.lastChangeTime > 0) {
        eventBus.emit('task:completed', { reason: 'file_stable' });
      }
    }, 5000);
  }

  // 兜底策略：DOM 轮询（仅当文件系统无变化时启用）
  async domPollingCheck(): Promise<boolean> {
    const { Runtime } = this.client!;
    const { result } = await Runtime.evaluate({
      expression: `
        (function() {
          const messages = document.querySelectorAll('.chat-response .assistant-message');
          const last = messages[messages.length - 1];
          if (!last) return false;
          // 检查是否有"复制"按钮（通常意味着生成结束）
          return !!last.querySelector('[data-testid="copy-button"]');
        })()
      `,
      returnByValue: true,
    });
    return result.value === true;
  }
}
```

**超时策略**：10 分钟无任何变化（文件 + DOM）→ 判定失败 → 飞书告警 → 释放 ChatMutex → 任务状态回滚到 `assigned`。

### 23.5 错误处理矩阵

| 错误类型 | 检测方式 | 降级路径 | 恢复流程 |
|---------|---------|---------|---------|
| **CDP 连接断开** | `client.on('disconnect')` | 暂停所有操作 | 指数退避重连（最多 5 次）→ 失败则飞书告警 |
| **Target 丢失** | Trae 崩溃（`/json` 无响应） | 暂停所有操作 | 等待 Trae 重启 → 重新连接 |
| **选择器失效** | `querySelector` 返回 null | 触发 §22 三层降级 | P0→P1→P2 → 全部失败写 SELECTOR_FAILED.md |
| **输入框失焦** | `document.activeElement` 不是输入框 | 重新聚焦 | 等待 2s → 重新 focus → 仍失败则暂停 |
| **提交无响应** | 10min 无文件变化 + DOM 无新消息 | 判定失败 | 飞书告警 → 释放锁 → 回滚任务状态 |
| **配额耗尽** | §21 窗口感知检测到额度提示 | 立即停止 | 进入冷却期 → 飞书通知 |
| **用户手动操作冲突** | §24 空闲检测 | 暂停自动化 | 等待用户空闲 → 恢复执行 |

### 23.6 选择器版本化

```yaml
# selectors/v1.8.json（按 Trae 版本分离）
{
  "trae_version": "1.8.2",
  "selectors": {
    "task_list_item": "[data-testid='task-list-item']",
    "chat_input": "[data-testid='chat-input'] [contenteditable='true']",
    "chat_input_fallback": ".chat-panel .input-area .ProseMirror",
    "send_button": "[data-testid='chat-send-button']",
    "copy_button": "[data-testid='copy-button']",
    "ralph_continue": "[data-testid='ralph-continue']"
  }
}
```

系统启动时根据检测到的 Trae 版本加载对应选择器集，版本不匹配时使用最新版本并输出 WARN。

---

## 24. 人机共享 UI（Human-Machine Coexistence）

> **v0.9 Beta 新增**：这是单账号单人使用场景下的**致命体验问题**——CDP Executor 操作 Trae 时会接管鼠标键盘，如果用户同时在操作，会产生乱码或任务错位。**不处理此问题，系统体验极差到不可用。**

### 24.1 问题本质

CDP Executor 通过 `Input.dispatchMouseEvent` 和 `Input.insertText` 模拟用户操作。当用户同时手动使用 Trae 时：
- 系统的 `insertText` 和用户的手动输入会**混叠**，产生乱码
- 系统的 `dispatchMouseEvent` 和用户的手动点击会**冲突**，导致错误元素被点击
- 任务可能被发送到错误的 Chat 会话

### 24.2 解决方案：空闲检测 + 独占模式混合

#### 24.2.1 默认模式：空闲检测

```typescript
// src/cdp/idle-detector.ts
class IdleDetector {
  private lastUserActivity: number = Date.now();
  private idleThresholdMs = 30000; // 30s 无操作判定为空闲

  async start(cdp: CDPExecutor): Promise<void> {
    // 注入用户活动监听器
    await cdp.client.Runtime.evaluate({
      expression: `
        (function() {
          window.__traeUserActivity = Date.now();
          document.addEventListener('mousemove', () => window.__traeUserActivity = Date.now());
          document.addEventListener('keydown', () => window.__traeUserActivity = Date.now());
          document.addEventListener('mousedown', () => window.__traeUserActivity = Date.now());
        })()
      `,
    });

    // 每 5s 检查一次用户活跃状态
    setInterval(async () => {
      const { result } = await cdp.client.Runtime.evaluate({
        expression: 'Date.now() - (window.__traeUserActivity || 0)',
        returnByValue: true,
      });
      this.lastUserActivity = Date.now() - result.value;
    }, 5000);
  }

  isIdle(): boolean {
    return (Date.now() - this.lastUserActivity) > this.idleThresholdMs;
  }
}
```

**空闲检测下的执行流程**：
```
飞书指令到达
      │
      ▼
检查用户是否空闲（30s 无操作）
      │
      ├── ✅ 空闲 → 正常执行 CDP 操作
      │
      └── ❌ 活跃 → 暂停执行 + 飞书通知
            "⏳ 用户正在使用 Trae，任务已排队，空闲后自动执行"
            │
            ▼
      每 5s 重新检查
            │
            ├── 检测到空闲 → 自动恢复执行
            └── 超过 10 分钟仍活跃 → 飞书催办通知
```

#### 24.2.2 独占模式（手动切换）

用户可手动切换到独占模式（适用场景：睡前启动 7 角色全自动化、午休时批量执行）：

```yaml
# team.yaml
execution:
  mode: "idle_detect"          # idle_detect（默认）/ exclusive（独占）
  idle_threshold_seconds: 30   # 空闲判定阈值
  active_pause_notify: true    # 检测到用户活跃时飞书通知
  max_queue_wait_minutes: 10   # 排队最大等待时间
```

**独占模式**：
- 跳过空闲检测，直接执行所有 CDP 操作
- 飞书通知"🔒 Trae 已进入独占模式，请勿手动操作"
- VS Code 插件（Phase 2）显示红色状态栏"独占模式运行中"
- 用户可通过飞书指令 `/mode idle` 切回空闲检测模式

#### 24.2.3 输入框冲突保护

即使在空闲检测通过后执行，仍需二次确认输入框状态：

```typescript
async safeFillPrompt(prompt: string): Promise<void> {
  // 执行前再次确认输入框未被用户占用
  const { result } = await this.client.Runtime.evaluate({
    expression: `
      (function() {
        const active = document.activeElement;
        const chatInput = document.querySelector('[data-testid="chat-input"]');
        return active === chatInput || chatInput?.contains(active);
      })()
    `,
    returnByValue: true,
  });

  if (!result.value) {
    // 输入框失焦，重新聚焦
    await this.focusChatInput();
    await sleep(500);
  }

  // 执行填充
  await this.fillAndSubmit(prompt);
}
```

### 24.3 与其他生存模块的关系

```
┌─────────────────────────────────────────────────┐
│           单账号模式四大生存模块                    │
│                                                   │
│  §20 拟人化反检测  ← 让系统"像人"                 │
│  §21 配额感知      ← 让系统"不贪"                 │
│  §22 选择器自适应  ← 让系统"不瞎"                 │
│  §24 人机共享 UI   ← 让系统"不抢"                 │
│                                                   │
│  四者缺一不可，共同决定系统在单账号场景下的可用性     │
└─────────────────────────────────────────────────┘
```

---

## 附录 D：评审历史

| 版本 | 日期 | 评审结论 | 主要变更 |
|------|------|---------|---------|
| v2.3.0 | 2026-04-25 | 🟡 有条件通过 | 新增 VS Code 插件设计 |
| v2.4.0 | 2026-04-25 | 🟡 有条件通过 | 新增异常处理/安全/可观测性 + Phase 0 预研 |
| v2.5.0 | 2026-04-26 | 🟡 有条件通过 | 新增 DoD & AI 测试规范 |
| v2.6.0 | 2026-04-26 | 🟢 推荐通过 | 补充 Ralph 规则系统/场景检测/CDP Mock/工程化配置 |
| v2.7.0 | 2026-04-26 | 🟢 正式通过 | 新增执行契约体系/角色矩阵/智能体提示词 |
| v2.8.0 | 2026-04-26 | ✅ **Approved** | 落实 5 项优化建议：CDP 协议锁定、xstate 范围限定、Prompt 版本管理、混沌测试频次、规则注入生命周期 |
| v2.9.0 | 2026-04-26 | ✅ **Approved** | Claude 最终评审：跨节点级联恢复、并发压力模型、任务幂等性、CDP Domain 粒度锁定、降级阈值报警、Git 暂存/提交分离、智能体上下文共享、Prompt Lint 9 项检查、混沌沙箱 3min 熔断、覆盖率分层（90%/70%）、飞书 token 刷新、chatMutexMachine 可运行示例 |
| v3.0.0 | 2026-04-26 | ✅ **Approved** | **架构级修正**：明确角色-任务-终端三元组数据模型，重写 3 层拓扑（控制平面/执行层/指令通道），修正 ChatMutex 触发时机（飞书指令→Chat 操作串行化）、lark-terminal 角色路由过滤、UI Recognizer 按需触发、VS Code 插件定位为控制平面（双向通信） |
| v0.9 Beta | 2026-04-26 | 🧪 **Pilot Ready** | 战略重新定位：砍 ~40% 过度工程，新增 4 个生存关键模块，新增 §23 CDP Executor + §24 人机共享 UI |
| v0.10 Pre-MVP | 2026-04-26 | 🔬 **Pre-MVP** | **深度精简**：22 章→10 章（14 章移入附录 E），删除 xstate，chat-fill.yaml 重写到 CDP Method 级，新增 Day 0 物理执行层验证（200 行代码时间盒），MVP 周期 10~15 工作日 |
