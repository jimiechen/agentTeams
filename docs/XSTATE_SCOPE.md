---
title: xstate 使用范围界定
version: "1.0.0"
date: 2026-04-26
status: Approved
tags:
  - xstate
  - state-machine
  - architecture
  - scope
related_prd: trae-agent-team-prd.md
---

# xstate 使用范围界定

> 配套文档：[[trae-agent-team-prd]] v2.8.0 第 17.3 章
> 评审驱动：v2.8.0 评审指出 xstate 引入范围过广会增加认知负担与包体积

---

## 1. 设计原则

> **核心原则**：xstate 仅用于具有**多状态、复杂转换、并发竞争、需要持久化**的模块。简单模块保持纯 TypeScript 类 + 事件总线模式。

### 判断标准

| 条件 | 使用 xstate | 不使用 xstate |
|------|:-----------:|:-------------:|
| 状态数 ≥ 4 且有复杂转换 | ✅ | |
| 需要并发竞争（锁/队列） | ✅ | |
| 状态需要持久化（崩溃恢复） | ✅ | |
| 需要时间旅行调试 | ✅ | |
| 需要可视化状态图 | ✅ | |
| 纯配置读写 | | ✅ |
| 纯事件监听/转发 | | ✅ |
| 简单的请求-响应 | | ✅ |
| 工具函数 | | ✅ |

## 2. 使用 xstate 的模块

### 2.1 ChatMutex（并发锁）

- **文件**：`src/cdp/chat-mutex-machine.ts`
- **状态**：idle → locked → idle/timeout
- **理由**：多任务竞争、锁超时、崩溃恢复、状态持久化
- **状态机 ID**：`chatMutexMachine`

### 2.2 TaskLifecycle（任务生命周期）

- **文件**：`src/core/states/task-machine.ts`
- **状态**：pending → assigned → running → completed/failed/blocked/cancelled
- **理由**：6+ 状态、复杂转换、超时阻塞、重试逻辑
- **状态机 ID**：`taskMachine`

### 2.3 ApprovalFlow（审批流程）

- **文件**：`src/task/approval-machine.ts`
- **状态**：pending → waiting_approval → approved/rejected/timeout
- **理由**：三级审批、超时自动操作、人工介入
- **状态机 ID**：`approvalFlowMachine`

## 3. 不使用 xstate 的模块

| 模块 | 模式 | 理由 |
|------|------|------|
| `ConfigManager` | 纯 TS 类 | 配置读写，无状态转换 |
| `Logger` | 纯 TS 类 | 日志输出，无状态 |
| `SecretManager` | 纯 TS 类 | 加密/解密，无状态 |
| `LarkTerminal` | 事件驱动 | WebSocket 事件监听 + 重连，非状态机 |
| `BitableSync` | 轮询同步 | 定时轮询 + 双向同步，非状态机 |
| `ChatFiller` | 策略模式 | P0→P1→P2 降级，用 if/else 即可 |
| `UIRecognizer` | 策略模式 | P0→P5 匹配，用 if/else 即可 |
| `SceneDetector` | 策略模式 | 场景匹配 + 优先级调度 |
| `GitManager` | 事件驱动 | 文件监听 + 自动提交 |
| `Notifier` | 纯 TS 类 | 飞书消息发送 |

## 4. 事件总线模式（非 xstate 模块）

不使用 xstate 的模块通过事件总线通信：

```typescript
// src/core/event-bus.ts
import { EventEmitter } from 'events';

class EventBus extends EventEmitter {
  emit(event: string, data: any): boolean {
    logger.debug('Event emitted', { event, ...data });
    return super.emit(event, data);
  }
}

export const eventBus = new EventBus();

// 使用示例
eventBus.on('task:assigned', (data) => { /* ... */ });
eventBus.emit('task:completed', { taskId: 'T-001' });
```

## 5. 包体积控制

```json
// package.json - xstate 仅作为核心依赖
{
  "dependencies": {
    "xstate": "^5.x"
  }
}
```

xstate 包体积约 30KB（gzipped），仅用于 3 个核心模块，对总体积影响可控。

## 6. chatMutexMachine 完整可运行示例

> **评审驱动**：Claude 最终评审建议补充完整可运行示例，降低团队对 xstate v5 的学习成本。

### 6.1 完整实现（可直接复制到项目中）

```typescript
// src/cdp/chat-mutex-machine.ts
import { setup, assign, createActor } from 'xstate';
import { logger } from '../utils/logger';
import { eventBus } from '../core/event-bus';
import * as fs from 'fs';
import * as path from 'path';

// 状态持久化目录
const MUTEX_STATE_DIR = path.join(
  process.env.HOME || '/tmp',
  '.trae-agent-team',
  '.mutex-state'
);

interface MutexContext {
  port: number;
  taskId: string | null;
  queue: Array<{ taskId: string; resolve: (value: boolean) => void }>;
  lockTimeout: number;       // 默认 30000ms
  acquiredAt: number | null;
}

type MutexEvent =
  | { type: 'ACQUIRE'; taskId: string; resolve: (value: boolean) => void }
  | { type: 'RELEASE' }
  | { type: 'TIMEOUT' }
  | { type: 'PROCESS_CRASH' };

export const chatMutexMachine = setup({
  types: {
    context: {} as MutexContext,
    events: {} as MutexEvent,
  },
  guards: {
    isQueueEmpty: ({ context }) => context.queue.length === 0,
    hasTimeout: ({ context }) => context.acquiredAt !== null,
  },
  actions: {
    setLock: assign({
      taskId: (_, params) => params.taskId,
      acquiredAt: () => Date.now(),
    }),
    clearLock: assign({
      taskId: null,
      acquiredAt: null,
    }),
    enqueueTask: assign({
      queue: ({ context }, params) => [
        ...context.queue,
        { taskId: params.taskId, resolve: params.resolve },
      ],
    }),
    dequeueAndLock: assign({
      taskId: ({ context }) => {
        const next = context.queue[0];
        return next ? next.taskId : null;
      },
      acquiredAt: () => Date.now(),
      queue: ({ context }) => context.queue.slice(1),
    }),
    logTimeout: ({ context }) => {
      logger.warn(`ChatMutex[${context.port}] 锁超时释放`, {
        task: context.taskId,
        duration: Date.now() - (context.acquiredAt || 0),
      });
      eventBus.emit('mutex:timeout', {
        port: context.port,
        task: context.taskId,
      });
    },
    persistState: ({ context }) => {
      const stateFile = path.join(MUTEX_STATE_DIR, `mutex-${context.port}.json`);
      fs.mkdirSync(MUTEX_STATE_DIR, { recursive: true });
      fs.writeFileSync(stateFile, JSON.stringify({
        port: context.port,
        taskId: context.taskId,
        acquiredAt: context.acquiredAt,
        timestamp: Date.now(),
      }));
    },
    clearPersistedState: ({ context }) => {
      const stateFile = path.join(MUTEX_STATE_DIR, `mutex-${context.port}.json`);
      if (fs.existsSync(stateFile)) {
        fs.unlinkSync(stateFile);
      }
    },
    notifyQueueAdvanced: ({ context }) => {
      const next = context.queue[0];
      if (next) {
        logger.info(`ChatMutex[${context.port}] 队列推进`, {
          nextTask: next.taskId,
          remaining: context.queue.length - 1,
        });
      }
    },
  },
}).createMachine({
  id: 'chatMutex',
  initial: 'idle',
  context: {
    port: 9222,
    taskId: null,
    queue: [],
    lockTimeout: 30000,
    acquiredAt: null,
  },
  states: {
    idle: {
      on: {
        ACQUIRE: {
          target: 'locked',
          actions: ['setLock', 'persistState'],
        },
      },
    },
    locked: {
      entry: ['persistState'],
      on: {
        RELEASE: [
          {
            guard: 'isQueueEmpty',
            target: 'idle',
            actions: ['clearLock', 'clearPersistedState'],
          },
          {
            target: 'locked',
            actions: [
              'dequeueAndLock',
              'notifyQueueAdvanced',
              'persistState',
            ],
          },
        ],
        TIMEOUT: [
          {
            guard: 'isQueueEmpty',
            target: 'idle',
            actions: ['logTimeout', 'clearLock', 'clearPersistedState'],
          },
          {
            target: 'locked',
            actions: [
              'logTimeout',
              'dequeueAndLock',
              'notifyQueueAdvanced',
              'persistState',
            ],
          },
        ],
        ACQUIRE: {
          actions: ['enqueueTask'],
        },
      },
      after: {
        LOCK_TIMEOUT: {
          target: 'locked',
          actions: ['logTimeout'],
        },
      },
    },
  },
});
```

### 6.2 使用示例

```typescript
// 创建实例
const port = 9222;
const actor = createActor(chatMutexMachine, {
  input: { port },
});
actor.start();

// 设置超时（使用 after 配置）
// 在 createMachine 的 locked 状态中:
// after: { LOCK_TIMEOUT: { ... } }
// 其中 LOCK_TIMEOUT = context.lockTimeout

// 获取锁
async function acquireLock(taskId: string): Promise<boolean> {
  return new Promise((resolve) => {
    actor.send({ type: 'ACQUIRE', taskId, resolve });
  });
}

// 释放锁
function releaseLock() {
  actor.send({ type: 'RELEASE' });
}

// 使用示例
await acquireLock('T-001');  // 立即获取
await acquireLock('T-002');  // 进入队列等待
releaseLock();                // T-002 自动获取
```

### 6.3 测试示例

```typescript
import { createActor } from 'xstate';
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('chatMutexMachine', () => {
  it('应在 idle 状态下立即获取锁', () => {
    const actor = createActor(chatMutexMachine, { input: { port: 9222 } });
    actor.start();
    expect(actor.getSnapshot().value).toBe('idle');

    actor.send({ type: 'ACQUIRE', taskId: 'T-001', resolve: () => {} });
    expect(actor.getSnapshot().value).toBe('locked');
    expect(actor.getSnapshot().context.taskId).toBe('T-001');
  });

  it('应在锁释放后推进队列', () => {
    const actor = createActor(chatMutexMachine, { input: { port: 9222 } });
    actor.start();

    const resolveT002 = vi.fn();
    actor.send({ type: 'ACQUIRE', taskId: 'T-001', resolve: () => {} });
    actor.send({ type: 'ACQUIRE', taskId: 'T-002', resolve: resolveT002 });

    expect(actor.getSnapshot().context.queue.length).toBe(1);

    actor.send({ type: 'RELEASE' });
    expect(actor.getSnapshot().context.taskId).toBe('T-002');
    expect(actor.getSnapshot().context.queue.length).toBe(0);
  });
});
```
