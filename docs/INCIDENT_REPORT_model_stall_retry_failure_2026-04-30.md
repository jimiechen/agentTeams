# 🚨 事故报告：模型停滞恢复后重试机制失效

**日期**: 2026-04-30
**严重程度**: P0 - 核心功能缺陷
**状态**: 待专家评审

---

## 📋 事故概述

### 现象
1. 用户发送消息 "远程仓库有哪些分支，远程主干代码和现在分支有哪些差异"
2. 模型停滞检测触发，恢复机制点击 stop 按钮
3. 任务被中断（`interrupted` 状态）
4. 系统误认为任务"完成"，返回仅 17 字符的部分响应
5. 用户收到不完整回复后发送新消息 "日志上没有中止的信号吗"
6. 系统将新消息作为新请求处理，未执行重试

### 影响
- 用户体验：收到不完整的 AI 响应
- 系统行为：未执行预期的重试逻辑
- 后续问题：用户意图被打断，需要重新发送原始请求

---

## 🔍 根因分析

### 错误代码位置
**文件**: `src/actions/state-probe.ts`
**行号**: 203-207

### 问题代码
```typescript
// 侧边栏显示中断
if (lastSample.taskStatus === 'interrupted') {
  debug('Task interrupted detected from sidebar');
  return true;  // ❌ BUG: 将 "interrupted" 错误地视为 "completed"
}
```

### 根因说明

`isTaskCompleted()` 函数将任务状态 `interrupted` 错误地判定为"已完成"。这导致：

1. **恢复流程错误终止**：
   - 模型停滞 → 恢复机制点击 stop → 任务状态变为 `interrupted`
   - `isTaskCompleted()` 返回 `true`（因为 `interrupted` 被当作完成）
   - 等待循环提前退出，返回部分响应（17 字符）

2. **重试机制失效**：
   - 等待循环没有进入重试分支
   - 用户收到的是中断前的部分响应，而非完整的重试结果

### 调用链分析

```
waitForTaskCompletion()
  ↓
isModelStalled() === true  (30秒无文本变化)
  ↓
recoverModelStalled()  点击 stop 按钮
  ↓
任务状态变为 'interrupted'
  ↓
isTaskCompleted(snapshots) === true  ← BUG: interrupted 不应视为完成
  ↓
等待循环退出，返回部分响应
  ↓
用户收到不完整回复
```

---

## 🛠️ 修复方案

### 方案 A：移除 interrupted 作为完成的判定（推荐）

```typescript
// src/actions/state-probe.ts

/**
 * 检测任务是否完成
 */
export function isTaskCompleted(snapshots: SystemSnapshot[]): boolean {
  if (snapshots.length === 0) return false;

  const lastSample = snapshots[snapshots.length - 1];

  // ✅ 只在侧边栏显示真正完成时返回 true
  if (lastSample.taskStatus === 'completed') {
    debug('Task completed detected from sidebar');
    return true;
  }

  // ❌ 移除：将 interrupted 视为完成的错误逻辑
  // if (lastSample.taskStatus === 'interrupted') {
  //   debug('Task interrupted detected from sidebar');
  //   return true;
  // }

  return false;
}
```

### 方案 B：区分"自然完成"和"中断完成"

如果需要区分完成方式，可以新增函数：

```typescript
/**
 * 检测任务是否终止（完成或中断）
 */
export function isTaskTerminated(snapshots: SystemSnapshot[]): boolean {
  if (snapshots.length === 0) return false;
  const lastSample = snapshots[snapshots.length - 1];
  return lastSample.taskStatus === 'completed' ||
         lastSample.taskStatus === 'interrupted';
}
```

然后在等待循环中根据实际情况选择判定方式。

---

## 📊 影响评估

| 维度 | 影响 |
|------|------|
| 功能正确性 | 🔴 严重 - 重试机制失效 |
| 用户体验 | 🔴 严重 - 收到不完整响应 |
| 系统稳定性 | 🟡 中等 - 错误状态被误判 |
| 恢复可靠性 | 🔴 严重 - 中断后无法自动恢复 |

---

## 🧪 验证用例

### 用例 1：模型停滞后自动重试
```
步骤：
1. 发送 "@DEVCLI 写一个包含无限循环的代码"
2. 等待模型停滞检测（约30秒）
3. 观察是否自动点击 stop 并重试

预期：模型停滞后自动重试，最终返回完整响应
实际（BUG）：返回部分响应后退出
```

### 用例 2：中断后正确识别状态
```
步骤：
1. 手动点击 Trae 的停止按钮
2. 检查 isTaskCompleted() 返回值

预期：返回 false（任务未完成）
实际（BUG）：返回 true（误判为完成）
```

---

## 📝 专家评审问题

1. **设计问题**：`isTaskCompleted()` 的语义是"任务是否完成"，`interrupted` 状态是否应该被视为"完成"？

2. **恢复语义**：当恢复机制点击 stop 后，任务状态变为 `interrupted`，此时应该：
   - A. 视为任务失败，触发重试？
   - B. 视为任务终止，返回已生成的部分内容？
   - C. 视为特殊状态，等待用户进一步指示？

3. **重试边界**：如果恢复后任务仍然 `interrupted`，应该重试多少次？

---

## 🔄 变更记录

| 日期 | 版本 | 变更内容 |
|------|------|----------|
| 2026-04-30 | v1.0 | 初稿创建，提交评审 |

---

## 👥 评审人员

- [ ] 技术经理
- [ ] 架构师
- [ ] 后端负责人

---

**报告生成时间**: 2026-04-30T[TIME]
**报告人**: AI Assistant
