# 现有脚本 → HeartbeatDetector / RecoveryExecutor 重构方案（第 1 部分）

> 本文档是**工程级重构方案**，用于把你已经完成的  
> `devcli-complete-handler.js`  
> **系统化重构为心跳架构核心代码骨架**。  
>
> ✅ 本部分只覆盖 **HeartbeatDetector（检测层）**  
> ✅ 不包含执行、副作用、Daemon  
> ✅ 可直接落地到现有 `heartbeat-scheme` 体系  
>
> 当前时间基准：2026-04-29

---

## Part A：重构目标与总体拆分

### A.1 重构目标（非常重要）

这次重构的原则只有一句话：

> **不改你任何 DOM / 按钮 / 判断逻辑，只改变"放的位置"。**

因此我们要做到：
- ✅ 复用现有的 `checkTaskStatus`
- ✅ 复用 thinking / stuck / completed 判定
- ❌ 禁止在 Detector 中点击按钮
- ❌ 禁止在 Detector 中 sleep / retry

### A.2 原脚本能力 → 系统职责映射

| 原脚本能力 | 新归属 |
|---|---|
| checkTaskStatus | HeartbeatDetector |
| hasThinking | HeartbeatDetector |
| isStuck | HeartbeatDetector |
| status判断 | ModeDecisionEngine（后续） |
| stop / retry | RecoveryExecutor（后续） |
| 多次检查 | Daemon / Verifying（后续） |

本 Part 只处理 **第一列**。

---

## Part B：HeartbeatDetector 的职责定义

### B.1 核心职责（只做 3 件事）

HeartbeatDetector **只负责**：

1. **采集信号**
2. **结构化返回**
3. **完全无副作用**

```typescript
// ❌ 不允许
click()
sleep()
retry()

// ✅ 允许
evaluate()
parse()
return data
```

### B.2 输出的数据结构（系统级稳定接口）

这是后续所有层都会依赖的 **不可轻易改动的接口**：

```typescript
export interface HeartbeatSignal {
    timestamp: number;
    workspace: string;
    task: {
        found: boolean;
        status: 'completed' | 'in_progress' | 'interrupted' | 'unknown';
        rawText?: string;
    };
    indicators: {
        hasThinking: boolean;
        isStuck: boolean;
    };
    ui: {
        stopButtonVisible: boolean;
        retryButtonVisible: boolean;
    };
}
```

✅ 你现有脚本中的 **所有信息都有位置**  
✅ 后续扩展（排队、FPS、DOM 数量）不破坏结构

---

## Part C：HeartbeatDetector 代码骨架

### C.1 文件结构建议

```
heartbeat/
├── detector/
│   ├── HeartbeatDetector.ts
│   ├── types.ts
│   └── detectTaskStatus.ts
```

### C.2 detectTaskStatus.ts（直接迁移你现有逻辑）

> ⚠️ 下面代码 **逻辑与现有脚本等价**，只是"搬家+包装"。

```typescript
export async function detectTaskStatus(
    trae: any,
    workspace: string
) {
    return await trae.evaluate(`((workspace) => {
        const result = {
            found: false,
            status: 'unknown',
            rawText: '',
            hasThinking: false,
            isStuck: false,
            stopButtonVisible: false,
            retryButtonVisible: false
        };

        // ========== 1. 任务列表检测 ==========
        const items = document.querySelectorAll('.index-module__task-item___zOpfg');
        for (const item of items) {
            const text = item.textContent || '';
            if (text.includes(workspace)) {
                result.found = true;
                result.rawText = text;

                if (text.includes('完成')) result.status = 'completed';
                else if (text.includes('进行中')) result.status = 'in_progress';
                else if (text.includes('中断')) result.status = 'interrupted';

                break;
            }
        }

        // ========== 2. thinking 检测 ==========
        result.hasThinking = document.body.textContent.includes('思考中');

        // ========== 3. 卡住检测（后台运行 / 取消） ==========
        const stuckButtons = Array.from(document.querySelectorAll('button'))
            .some(btn =>
                btn.textContent?.includes('后台运行') ||
                btn.textContent?.includes('取消')
            );
        result.isStuck = stuckButtons;

        // ========== 4. UI 可见性 ==========
        result.stopButtonVisible = !!document.querySelector('.chat-input-v2-send-button');
        result.retryButtonVisible = !!document.querySelector('button[aria-label="重试"]');

        return result;
    })('${workspace}')`);
}
```

✅ **100% 兼容现有 DOM 特征**  
✅ 未来 UI 改，只改这里

---

## Part D：HeartbeatDetector 主类

### D.1 HeartbeatDetector.ts

```typescript
import { detectTaskStatus } from './detectTaskStatus';
import type { HeartbeatSignal } from './types';

export class HeartbeatDetector {
    constructor(
        private readonly trae: any,
        private readonly workspace: string
    ) {}

    async detect(): Promise<HeartbeatSignal> {
        const raw = await detectTaskStatus(this.trae, this.workspace);

        return {
            timestamp: Date.now(),
            workspace: this.workspace,
            task: {
                found: raw.found,
                status: raw.status,
                rawText: raw.rawText
            },
            indicators: {
                hasThinking: raw.hasThinking,
                isStuck: raw.isStuck
            },
            ui: {
                stopButtonVisible: raw.stopButtonVisible,
                retryButtonVisible: raw.retryButtonVisible
            }
        };
    }
}
```

✅ **Detector 到此为止，完全纯净**  
✅ 单元测试非常容易  
✅ 可被 Daemon / 测试 / 手动调用

---

## Part E：这一部分完成后，你现在具备的能力

✅ Detector 和判定彻底解耦  
✅ "为什么进入某模式"可以被日志解释  
✅ 新增模式只需：
- 加一个 ModeRule
- 决定优先级

**不需要改任何已有代码**

---

## 下一部分预告（请确认继续）

**Part B（下一条回复）将覆盖**：

- ✅ ModeDecisionEngine（状态 → 模式）
- ✅ 优先级裁决
- ✅ 完全对齐 Part 3 Health State Machine
- ✅ 不涉及点击、不涉及 sleep

只要你回复一句：

> **继续 Part B**

我将无缝接着输出。
