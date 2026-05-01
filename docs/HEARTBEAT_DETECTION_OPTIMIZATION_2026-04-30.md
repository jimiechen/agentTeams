# 心跳检测方案优化文档

**日期**: 2026-04-30
**问题**: 任务排队时被误判为"长时间未响应"
**参考**: devcli-complete-handler.js, devcli-handler-guide.md

---

## 一、问题分析

### 1.1 现象

从日志可以看到：
```
Tasks[2]: PMCLI(in_progress), DEVCLI(interrupted)
Active: PMCLI, Status: in_progress
Buttons: background=false, cancel=false
```

**实际情况**: DEVCLI 正在排队等待执行，但系统误判为"长时间未响应"，触发了恢复流程。

### 1.2 根本原因

当前检测逻辑存在以下缺陷：

1. **只检测取消按钮存在性**：如果任务在排队，页面上可能没有取消按钮，被误判为卡住
2. **没有区分"排队中"和"卡住"**：排队时任务状态是 `in_progress`，但没有活动迹象
3. **静默时长阈值过于敏感**：5分钟阈值对于排队场景太短
4. **没有检测"思考中"状态**：参考 devcli 脚本，`hasThinking` 是一个重要信号

### 1.3 参考脚本分析

**devcli-complete-handler.js 的关键检测逻辑**：

```javascript
// 检查是否有"思考中"
const hasThinking = document.body.textContent.includes('思考中') ||
                   document.body.textContent.includes('Thinking');

// 检查是否卡住（有后台运行/取消按钮）
let hasBackgroundBtn = false;
let hasCancelBtn = false;
document.querySelectorAll('button').forEach(btn => {
    const btnText = btn.textContent || '';
    if (btnText.includes('后台')) hasBackgroundBtn = true;
    if (btnText.includes('取消')) hasCancelBtn = true;
});
const isStuck = hasBackgroundBtn && hasCancelBtn;
```

**关键发现**：
- `hasThinking` 表示 AI 正在处理，不是卡住
- `isStuck` 需要同时有"后台运行"和"取消"按钮
- 排队时通常没有这些按钮

---

## 二、优化方案

### 2.1 新增检测信号

参考 devcli 脚本，增加以下信号检测：

| 信号 | 说明 | 检测方式 |
|------|------|---------|
| `hasThinking` | 是否显示"思考中" | `document.body.textContent.includes('思考中')` |
| `hasQueueIndicator` | 是否显示排队提示 | 检测"排队"、"等待"等文本 |
| `hasGeneratingIndicator` | 是否正在生成 | 检测"生成中"、"Generating"等 |
| `isStuck` | 是否真正卡住 | 同时有后台运行+取消按钮 |

### 2.2 优化可疑任务判断逻辑

**当前逻辑（问题）**：
```typescript
// 关键判断：in_progress 但长时间没有取消按钮
if (task.status === 'in_progress' && !task.hasCancelBtn && !task.hasBackgroundBtn) {
  // 被判为可疑
}
```

**优化后逻辑**：
```typescript
// 关键判断：in_progress 且没有活动迹象
if (task.status === 'in_progress') {
  // 如果有"思考中"或"生成中"，不是卡住
  if (snapshot.hasThinking || snapshot.hasGeneratingIndicator) {
    return { isSuspicious: false, reason: 'AI is thinking' };
  }
  
  // 如果有排队提示，不是卡住
  if (snapshot.hasQueueIndicator) {
    return { isSuspicious: false, reason: 'Task is queued' };
  }
  
  // 如果同时有后台运行和取消按钮，才是真正卡住
  if (task.hasCancelBtn && task.hasBackgroundBtn) {
    return { isSuspicious: true, reason: 'Task is stuck (has both buttons)' };
  }
  
  // 其他情况，需要结合静默时长判断
  if (silentMs > suspiciousThresholdMs) {
    return { isSuspicious: true, reason: 'Long silence without activity indicators' };
  }
}
```

### 2.3 优化静默时长计算

**当前问题**：
- 阈值固定为 5 分钟
- 没有考虑任务类型差异

**优化方案**：
- **排队任务**：阈值延长至 10 分钟
- **生成中任务**：阈值缩短至 2 分钟（如果输出没有变化）
- **思考中任务**：不计算静默时长

### 2.4 优化按钮检测

参考 devcli 脚本的按钮检测逻辑：

```typescript
// 检测所有按钮，而不仅仅是 .icd-btn-tertiary
const allBtns = document.querySelectorAll('button');
for (const btn of allBtns) {
  const text = btn.textContent || '';
  if (text.includes('取消')) hasCancelBtn = true;
  if (text.includes('后台')) hasBackgroundBtn = true;
  if (text.includes('重试')) hasRetryBtn = true;
  if (text.includes('停止')) hasStopBtn = true;
}
```

### 2.5 增加状态机细分

将 `in_progress` 状态细分为：

```typescript
type TaskSubState = 
  | 'thinking'      // 思考中
  | 'generating'    // 生成中
  | 'queued'        // 排队中
  | 'stuck'         // 卡住
  | 'unknown';      // 未知
```

---

## 三、代码实现建议

### 3.1 修改 `state-probe.ts`

```typescript
export interface TaskSnapshot {
  taskId: string;
  taskName: string;
  status: 'in_progress' | 'completed' | 'interrupted' | 'unknown';
  isActive: boolean;
  isSelected: boolean;
  hasCancelBtn: boolean;
  hasBackgroundBtn: boolean;
  hasRetryBtn: boolean;           // 新增：重试按钮
  hasStopBtn: boolean;            // 新增：停止按钮
  hasThinking: boolean;           // 新增：思考中
  hasQueueIndicator: boolean;     // 新增：排队提示
  hasGeneratingIndicator: boolean; // 新增：生成中
  outputSnapshot: string;
  silentDurationMs: number;
}
```

### 3.2 修改 `detector.ts`

```typescript
class TaskActivityTracker {
  update(taskName: string, snapshot: TaskSnapshot) {
    // 如果有活动迹象，重置静默时长
    if (snapshot.hasThinking || 
        snapshot.hasGeneratingIndicator || 
        snapshot.hasQueueIndicator) {
      this.lastActivityMap.set(taskName, {
        outputHash: currentHash,
        lastActiveAt: Date.now(),
        hasCancelBtn: snapshot.hasCancelBtn,
      });
      return { isSuspicious: false, reason: 'Activity detected' };
    }
    
    // 判断是否真的卡住
    const isReallyStuck = snapshot.status === 'in_progress' 
                       && !snapshot.hasThinking
                       && !snapshot.hasGeneratingIndicator
                       && !snapshot.hasQueueIndicator
                       && silentMs > this.suspiciousThresholdMs;
    
    return { isSuspicious: isReallyStuck };
  }
}
```

### 3.3 修改 `recovery-executor.ts`

增加对排队任务的识别：

```typescript
async executeSuspiciousTaskRecovery(taskName: string): Promise<RecoveryResult[]> {
  // 先检查任务是否真的卡住，还是只是排队
  const snapshot = await this.getTaskSnapshot(taskName);
  
  if (snapshot.hasQueueIndicator) {
    return [{ 
      success: false, 
      action: { id: 'queued', type: 'report' },
      error: 'Task is queued, not stuck'
    }];
  }
  
  if (snapshot.hasThinking || snapshot.hasGeneratingIndicator) {
    return [{ 
      success: false, 
      action: { id: 'active', type: 'report' },
      error: 'Task is active, not stuck'
    }];
  }
  
  // 真正卡住，执行恢复
  // ...
}
```

---

## 四、实施计划

### 第一阶段：增加信号检测（1天）

1. 修改 `state-probe.ts`，增加 `hasThinking`、`hasQueueIndicator` 等字段
2. 修改 `detector.ts`，优化 `TaskActivityTracker` 判断逻辑
3. 修改 `recovery-executor.ts`，增加排队任务识别

### 第二阶段：优化阈值（1天）

1. 根据任务类型设置不同的静默阈值
2. 增加动态阈值调整机制
3. 测试验证

### 第三阶段：完善日志（0.5天）

1. 增加详细的信号检测日志
2. 增加恢复决策日志
3. 输出优化报告

---

## 五、验证方法

### 5.1 模拟排队场景

```typescript
// 模拟排队任务
const queuedTask = {
  taskName: 'DEVCLI',
  status: 'in_progress',
  hasCancelBtn: false,
  hasBackgroundBtn: false,
  hasThinking: false,
  hasQueueIndicator: true,  // 排队中
  hasGeneratingIndicator: false,
};

// 应该判断为：不可疑
assert(!isSuspicious(queuedTask), 'Queued task should not be suspicious');
```

### 5.2 模拟卡住场景

```typescript
// 模拟卡住任务
const stuckTask = {
  taskName: 'DEVCLI',
  status: 'in_progress',
  hasCancelBtn: true,
  hasBackgroundBtn: true,
  hasThinking: false,
  hasQueueIndicator: false,
  hasGeneratingIndicator: false,
};

// 应该判断为：可疑
assert(isSuspicious(stuckTask), 'Stuck task should be suspicious');
```

### 5.3 模拟思考中场景

```typescript
// 模拟思考中任务
const thinkingTask = {
  taskName: 'DEVCLI',
  status: 'in_progress',
  hasCancelBtn: false,
  hasBackgroundBtn: false,
  hasThinking: true,  // 思考中
  hasQueueIndicator: false,
  hasGeneratingIndicator: false,
};

// 应该判断为：不可疑
assert(!isSuspicious(thinkingTask), 'Thinking task should not be suspicious');
```

---

## 六、预期效果

1. **减少误判**：排队任务不会被误判为卡住
2. **提高准确性**：通过多信号综合判断，降低误报率
3. **优化恢复**：只对真正卡住的任务执行恢复
4. **改善体验**：减少不必要的任务中断和重试

---

**报告人**: AI Assistant
**时间**: 2026-04-30
