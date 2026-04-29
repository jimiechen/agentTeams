# 现有脚本 → HeartbeatDetector / RecoveryExecutor 重构方案（第 2 部分）

> 本部分是**Part B：ModeDecisionEngine（模式判定引擎）**  
>
> ✅ 承接 **Part A：HeartbeatDetector**  
> ✅ 对齐你已经写好的 **Part 3（Health State Machine）**  
> ✅ 仍然 **不产生任何副作用（不点击、不 sleep）**  
>
> 当前时间基准：2026-04-29

---

## Part B：ModeDecisionEngine（模式判定层）

### B.1 这一层存在的根本原因

你原脚本里已经隐含了大量逻辑：

```javascript
if (completed) return;
if (interrupted) retry;
if (thinking && stuck) stop;
```

问题不在"对不对"，而在于：
- ❌ 判断规则分散在流程里
- ❌ 优先级靠代码顺序"碰巧正确"
- ❌ 后续加入新模式（queuing / verifying）复杂度会指数上升

**ModeDecisionEngine 的职责只有一句话**：

> **把"零散判断"收敛为"唯一、可推理的模式裁决"。**

---

## Part B.2：模式枚举（唯一真源）

### B.2.1 HealthMode 定义

```typescript
export type HealthMode =
    | 'healthy'
    | 'completed'
    | 'terminal-hang'
    | 'modal-blocking'
    | 'model-stalled'
    | 'model-queuing'
    | 'task-interrupted'
    | 'unknown';
```

✅ 与 `part3-health-state-machine/3.1-health-modes.md` **完全一致**  
✅ 后续所有模块只认这个枚举

### B.2.2 为什么不在 Detector 里判 mode？

这是一个**非常关键的架构点**：

- Detector：**"我看到了什么"**
- ModeEngine：**"这意味着什么"**

只有拆开，才能做到：
- 规则可调整
- 行为可验证
- 日志可解释

---

## Part B.3：模式优先级（规则而不是 if 顺序）

### B.3.1 优先级表（来自 Part 3.3）

```typescript
export const MODE_PRIORITY: HealthMode[] = [
    'task-interrupted',
    'modal-blocking',
    'terminal-hang',
    'model-queuing',
    'model-stalled',
    'completed',
    'healthy',
    'unknown'
];
```

✅ 这是 **系统级契约**  
✅ 修改优先级 = 修改行为全局生效

---

## Part B.4：单条规则的定义方式

### B.4.1 ModeRule 接口

```typescript
import type { HeartbeatSignal } from '../detector/types';
import type { HealthMode } from './types';

export interface ModeRule {
    mode: HealthMode;
    when: (signal: HeartbeatSignal) => boolean;
}
```

**设计要点：**
- ✅ 每条规则只判断"是不是我"
- ✅ 不知道其他模式是否成立
- ✅ 不关心恢复、不关心历史

---

## Part B.5：把现有逻辑翻译成规则

### B.5.1 task-interrupted

```typescript
const taskInterruptedRule: ModeRule = {
    mode: 'task-interrupted',
    when: s => s.task.found && s.task.status === 'interrupted'
};
```

### B.5.2 terminal-hang（原来的 isStuck）

```typescript
const terminalHangRule: ModeRule = {
    mode: 'terminal-hang',
    when: s => s.task.status === 'in_progress' && s.indicators.isStuck
};
```

### B.5.3 model-stalled（thinking 但没完成）

```typescript
const modelStalledRule: ModeRule = {
    mode: 'model-stalled',
    when: s =>
        s.task.status === 'in_progress' &&
        s.indicators.hasThinking &&
        !s.indicators.isStuck
};
```

### B.5.4 completed

```typescript
const completedRule: ModeRule = {
    mode: 'completed',
    when: s => s.task.found && s.task.status === 'completed'
};
```

### B.5.5 healthy（兜底）

```typescript
const healthyRule: ModeRule = {
    mode: 'healthy',
    when: s =>
        s.task.found &&
        s.task.status === 'in_progress' &&
        !s.indicators.hasThinking &&
        !s.indicators.isStuck
};
```

---

## Part B.6：ModeDecisionEngine 主实现

### B.6.1 规则注册（集中定义）

```typescript
import type { ModeRule } from './rules';

export const MODE_RULES: ModeRule[] = [
    taskInterruptedRule,
    terminalHangRule,
    modelStalledRule,
    completedRule,
    healthyRule
];
```

### B.6.2 决策引擎

```typescript
import type { HeartbeatSignal } from '../detector/types';
import type { HealthMode } from './types';
import { MODE_RULES } from './ruleSet';
import { MODE_PRIORITY } from './priority';

export class ModeDecisionEngine {
    decide(signal: HeartbeatSignal): HealthMode {
        const matched = MODE_RULES
            .filter(rule => rule.when(signal))
            .map(rule => rule.mode);

        if (matched.length === 0) return 'unknown';

        for (const mode of MODE_PRIORITY) {
            if (matched.includes(mode)) {
                return mode;
            }
        }

        return 'unknown';
    }
}
```

✅ **规则可组合**  
✅ **优先级显式**  
✅ **结果可解释（matched 列表）**

---

## Part B.7：这一层完成后具备的能力

✅ Detector 和判定彻底解耦  
✅ "为什么进入某模式"可以被日志解释  
✅ 新增模式只需：
- 加一个 ModeRule
- 决定优先级

**不需要改任何已有代码**

---

## Part C 预告（下一部分）

下一部分将进入 **RecoveryExecutor（执行层）**：

- ✅ stop / retry / click 行为迁移
- ✅ 防抖 + 幂等
- ✅ PMCLI / DEVCLI 策略差异
- ✅ 不引入 Daemon（先聚焦执行）

你只需回复一句：

> **继续 Part C**

我将直接进入执行层骨架。
