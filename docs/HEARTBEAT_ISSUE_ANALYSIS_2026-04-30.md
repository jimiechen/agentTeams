# Heartbeat 检测问题分析报告

**日期**: 2026-04-30
**问题**: DEVCLI 长时间未响应但心跳检测未触发恢复

---

## 一、问题现象

从日志可以看到：
```
Tasks[2]: PMCLI(completed), DEVCLI(in_progress)
Active: PMCLI, Status: completed
Buttons: background=false, cancel=false
```

- DEVCLI 状态为 `in_progress`
- 但当前活动任务是 PMCLI（completed）
- 页面上没有"取消"按钮

## 二、根本原因

### 2.1 设计缺陷

当前心跳检测架构存在**根本性设计缺陷**：

**Layer 1 只检测当前活动任务的按钮状态**，当切换到其他任务时，无法检测非活动任务的真实状态。

```
当前流程：
1. 扫描任务列表 → 发现 DEVCLI(in_progress)
2. 检测页面按钮 → 但当前是 PMCLI 页面，没有取消按钮
3. 判定 mode=normal → 错过 DEVCLI 卡住的情况
```

### 2.2 代码分析

**layer1.ts**:
- `scanAllTasks()` 扫描所有任务状态 ✅
- `hasElement()` 检测页面按钮 ❌ 只检测当前页面
- `determineMode()` 基于当前页面按钮做决策 ❌

**问题**: 虽然扫描到了 DEVCLI(in_progress)，但 `hasCancelBtn` 检测的是当前页面（PMCLI）的按钮，所以返回 false。

### 2.3 为什么修改未生效

之前的修改：
1. 增加了 `allTasks` 到 `SystemSnapshot` ✅
2. 在 `wait-response.ts` 中记录所有任务状态 ✅
3. 但在 **Layer 1 的 `determineMode` 中，仍然基于 `hasCancelBtn` 做决策** ❌

## 三、解决方案

### 方案1: 切换到非活动任务检测（成本高）

当发现非活动任务 in_progress 时，切换到该任务检测按钮：

```typescript
if (inProgressTasks.length > 0 && !activeInProgress) {
  // 切换到 DEVCLI 任务
  await switchToTask('DEVCLI');
  // 检测按钮
  const hasCancel = await hasElement('取消');
  if (hasCancel) {
    // DEVCLI 确实在运行
  } else {
    // DEVCLI 可能卡住了
  }
  // 切换回原来的任务
}
```

**缺点**: 
- Layer 1 应该是轻量级检测（<5ms）
- 切换任务成本高，可能干扰用户操作
- 频繁切换任务可能导致状态混乱

### 方案2: 增加 Layer 2 深度检测（推荐）

Layer 1 保持轻量级，只做基本检测。
当 Layer 1 发现异常信号（如非活动任务 in_progress）时，触发 Layer 2 深度检测：

```typescript
// Layer 2: 深度检测
async function deepCheck() {
  // 1. 记录当前任务
  const currentTask = getActiveTask();
  
  // 2. 遍历所有 in_progress 任务
  for (const task of inProgressTasks) {
    // 切换到任务
    await switchToTask(task.name);
    await sleep(1000); // 等待 UI 更新
    
    // 检测按钮状态
    const hasCancel = await hasElement('取消');
    const hasBackground = await hasElement('后台运行');
    
    if (hasCancel || hasBackground) {
      // 任务确实在运行，但可能卡住
      // 记录最后活动时间
    }
  }
  
  // 3. 切换回原始任务
  await switchToTask(currentTask);
}
```

### 方案3: 基于任务列表状态的智能判断

不切换任务，而是基于任务列表的文本信息判断：

```typescript
// 扫描任务列表时，不仅看状态文本，还看其他信号
const tasks = await scanAllTasks(cdp);
for (const task of tasks) {
  if (task.status === 'in_progress') {
    // 检查任务项是否有其他视觉指示器
    // 如：动画、图标、颜色等
    const isReallyRunning = await checkTaskVisualIndicator(task.index);
  }
}
```

## 四、实施建议

### 短期方案（立即实施）

1. **修改 Layer 1 日志**：明确显示哪些任务在后台运行
2. **增加告警**：当发现非活动任务 in_progress 超过阈值时，发送告警到群聊
3. **手动恢复**：通知管理员手动检查 DEVCLI 状态

### 长期方案（架构调整）

1. **实施 Layer 2 深度检测**：
   - 15秒周期
   - 遍历所有 in_progress 任务
   - 切换任务检测真实状态
   
2. **任务级心跳**：
   - 每个任务独立的心跳检测
   - 记录每个任务的最后活动时间
   - 单独的超时判断

3. **状态持久化**：
   - 记录所有任务的状态历史
   - 检测状态异常变化

## 五、当前代码问题

### 5.1 已实施的修改（但未解决根本问题）

1. `state-probe.ts`: 增加 `allTasks` 信号 ✅
2. `wait-response.ts`: 记录所有任务状态 ✅
3. `layer1.ts`: 增加非活动任务检测日志 ✅
4. `detector.ts`: 增加 `checkInactiveTasks` ✅

### 5.2 仍然存在的问题

1. **Layer 1 仍然基于当前页面按钮做决策**
2. **没有任务切换机制**
3. **没有任务级超时检测**
4. **恢复机制只针对当前活动任务**

## 六、下一步行动

1. 确认方案（推荐方案2）
2. 实施 Layer 2 深度检测
3. 增加任务级状态跟踪
4. 完善恢复机制，支持非活动任务

---

**报告人**: AI Assistant
**时间**: 2026-04-30
