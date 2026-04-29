# 心跳检测优化方案：从现有脚本到完整心跳机制

## 一、现有脚本的能力盘点与问题诊断

### 已经做对的部分

你现有的 `devcli-complete-handler.js` 已经具备了一个"原始心跳"的雏形，核心能力完整：
- `checkTaskStatus` 能读取任务列表状态（completed / in_progress / interrupted）
- `hasThinking` 能识别模型是否在生成
- `isStuck` 能识别"后台运行/取消"按钮出现
- `clickStopButton` + `clickRetryButton` 能完成最核心的两个恢复动作
- 3次状态检查形成了一个"操作前 → 中断后 → 重试后"的验证闭环

这是**非常扎实的基础**，不需要推倒重来。

### 现有脚本的结构性问题

当前脚本的问题不在逻辑，而在于**架构边界缺失**，体现在4个方面：

**问题一：检测与执行混在一起**。`checkTaskStatus` 读信号，`clickStopButton` 做动作，两者在同一个 `handleDevcliComplete` 流程里串行调用。一旦要支持多工作区并发，或者要单独测试"只检测不执行"，就会非常困难。

**问题二：模式判定隐藏在流程里**。`if (check2.status !== 'interrupted') return` 这类判断散落在函数体中，优先级靠代码顺序"碰巧正确"。当前只有 2 种分支，但 heartbeat-scheme 设计了 5 种中断模式，加入 `model-queuing`、`modal-blocking` 后复杂度会指数上升。

**问题三：没有持续心跳，只有"一次性触发"**。现有脚本是**被动调用**的——出了问题才跑一次。而心跳机制的核心是**主动轮询**：每 5 秒采一次信号，发现异常才触发执行。这是两种完全不同的运行模式。

**问题四：没有防抖和幂等保护**。如果 `model-stalled` 持续 60 秒，现有脚本会触发多次 retry，而没有"正在恢复中，跳过本次"的保护。

---

## 二、优化方案：三层重构路径

整体思路是**渐进式改造**，不打断现有能力，分三层叠加：

### 第一层：信号采集层（Detector）——无副作用化

这是最小改动，也是最关键的一步。把 `checkTaskStatus` 从"流程里的一步"变成"独立的信号采集器"。

核心改变只有一个：**Detector 永远不调用任何 click / sleep，只返回数据**。

```typescript
// 改造前：检测和判断混在一起
const check1 = await checkTaskStatus(trae, taskType);
if (check1.status === 'completed') return;  // 判断逻辑在外面流程里

// 改造后：Detector 只输出结构化信号
const signal: HeartbeatSignal = await detector.detect();
// signal 包含所有原始信息，不含任何判断
```

`HeartbeatSignal` 的数据结构直接对应现有脚本的返回值，字段一一映射：

```typescript
interface HeartbeatSignal {
    timestamp: number;
    workspace: string;
    task: {
        found: boolean;
        status: 'completed' | 'in_progress' | 'interrupted' | 'unknown';
    };
    indicators: {
        hasThinking: boolean;   // ← 直接来自现有 hasThinking
        isStuck: boolean;       // ← 直接来自现有 isStuck
    };
    ui: {
        stopButtonVisible: boolean;
        retryButtonVisible: boolean;
    };
}
```

这一步**零逻辑改动**，只是把已有代码"搬进"一个类。

---

### 第二层：模式判定层（ModeDecisionEngine）——规则化

把散落在 `handleDevcliComplete` 里的 `if/else` 判断，收敛为**一张优先级表 + 一组规则**。

现有脚本已经隐含了这些规则，只是没有显式化：

| 现有脚本判断 | 对应 HealthMode |
|---|---|
| `status === 'interrupted'` | `task-interrupted` |
| `isStuck === true` | `terminal-hang` |
| `hasThinking && !isStuck` | `model-stalled`（新增） |
| `status === 'completed'` | `completed` |
| 其他正常运行 | `healthy` |

优先级从高到低：`task-interrupted` > `terminal-hang` > `model-stalled` > `completed` > `healthy`。

这样做的收益是：**加入任何新模式（如 modal-blocking、model-queuing），只需加一条规则，不改已有代码**。

---

### 第三层：持续心跳守护（HeartbeatDaemon）——主动化

这是最大的能力跃升，也是现有脚本和完整心跳机制的**本质差距**所在。

现有脚本是"呼叫救护车"模式——出事了才打电话。HeartbeatDaemon 是"24小时心电监护"模式——持续采集，发现异常立即响应。

改造方式是在 `runner-multi.ts` 的任务启动时，同步启动一个 Daemon：

```typescript
// 任务启动时
const daemon = new HeartbeatDaemon(detector, executor, {
    interval: 5000,       // 每 5 秒采一次信号
    workspace: 'DEVCLI'
});
daemon.start();         // 非阻塞，后台运行

await runner.waitForTask();   // 主流程照常等待

daemon.stop();          // 任务结束时停止
```

Daemon 内部的逻辑极其简单：

```
每 5 秒：
  1. detector.detect() → 采集信号
  2. engine.decide(signal) → 判定模式
  3. 如果 mode !== 'healthy'：
      executor.execute(mode) → 触发恢复
  4. 写入 heartbeat.jsonl
```

这样现有脚本的 `clickStopButton` 和 `clickRetryButton` 就成了 `RecoveryExecutor` 里的两个动作，**逻辑完全复用，只是被 Daemon 自动调用而不是手动触发**。

---

## 三、防抖与幂等保护

这是现有脚本最容易出问题的地方，必须在 `RecoveryExecutor` 层加入：

**防抖**：同一个 mode 连续触发时，只执行一次。`model-stalled` 可能持续 60 秒，期间 Daemon 会采集 12 次信号，但只应触发 1 次 stop+retry。

```typescript
// 简单实现：记录上次执行时间
if (Date.now() - lastExecutionTime < DEBOUNCE_MS) {
    return;  // 跳过本次
}
```

**幂等**：`terminal-hang` 的"后台运行"按钮点了一次就消失了，第二次点击找不到按钮应该静默成功，而不是报错。现有脚本的 `clickStopButton` 已经做了 `found: false` 的处理，这个模式可以直接复用。

---

## 四、MVP 落地优先级建议

结合 Part 11 的 3 天 MVP 计划，改造优先级如下：

**Day 1**：把 `checkTaskStatus` 抽成独立的 `HeartbeatDetector` 类，输出 `HeartbeatSignal`，确保现有功能不变。这一步改动最小，收益最大——所有后续层都依赖这个稳定接口。

**Day 2**：加入 `HeartbeatDaemon`，让检测从"手动触发"变成"自动轮询"。只接入 `terminal-hang` 和 `task-interrupted` 两个显式模式，`model-stalled` 先不加，控制风险。

**Day 3**：加入防抖保护，接入 `heartbeat.jsonl` 写入，跑 5 小时稳定性测试验收。

`model-stalled` 和 `modal-blocking` 建议放到完整版阶段，因为它们需要 Layer 2 内容心跳（文本增量检测），与现有脚本的信号采集方式不同，需要额外的 DOM 观察逻辑，不适合在 MVP 阶段引入。

---

## 总结

**现有脚本的逻辑是对的，缺的是"持续运行"和"架构边界"**。按照上面三层路径改，Day 1 完成 Detector 抽象后，整个系统就有了可测试、可扩展的基础，后续每一步都是在这个基础上叠加，而不是推倒重来。

---

*文档版本: 2026-04-29*
*适用: devcli-complete-handler.js 心跳检测优化*
