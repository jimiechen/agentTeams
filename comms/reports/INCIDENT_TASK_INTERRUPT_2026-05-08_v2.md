# 任务中断事件深度技术分析报告（v2.0）

**事件时间**: 2026-05-08 06:02:53 UTC  
**事件ID**: run-2026-05-08T06-02-53-357Z  
**涉及任务**: PMCLI - "当前分支还有什么问题没提交，检查下"  
**报告版本**: v2.0（架构师评审版）  
**报告生成时间**: 2026-05-08  

---

## 1. 事件摘要

用户在飞书群聊发送 `@PMCLI 当前分支还有什么问题没提交，检查下`，系统正确接收并执行任务。但在任务执行过程中（约 06:03:17），心跳检测系统错误地将任务状态判定为"interrupted"（中断），触发了自动恢复机制。恢复过程中，系统通过 DOM 扫描获取到了另一个任务（"现在几点"）的对话内容，导致最终回复的内容是"几点"任务的结果，而非原始任务的结果。

**关键问题**: `lastTurns` 诊断数据来源于全局 DOM 扫描，未做任务隔离，导致多任务并发时数据混淆。

---

## 2. 时间线还原

```
06:02:53 - 收到消息: "@PMCLI 当前分支还有什么问题没提交，检查下"
06:02:54 - 切换到 PMCLI slot #3
06:02:56 - 填充提示词成功
06:02:58 - 提交任务（按 Enter）
06:03:00 - 开始心跳检测（waitResponse）
06:03:17 - ⚠️ 心跳检测到 "interrupted" 状态
06:03:17 - 触发 model stalled recovery，点击 stop 按钮
06:03:17 - 诊断发现 lastTurns 包含 "现在几点"（另一个任务）
06:03:18 - 尝试恢复，但重试按钮未找到
06:03:23 - 恢复完成（部分成功）
06:03:59 - waitResponse 返回结果（164 chars）
06:03:59 - 结果保存到 PMCLI runs 目录
06:04:05 - 发送卡片消息到飞书（回复的是"几点"的结果）
```

---

## 3. 核心代码分析

### 3.1 lastTurns 维护对象定位

**维护对象**: `RecoveryExecutor.diagnoseRetryButtonAbsence()`  
**文件位置**: `mvp-runner/src/heartbeat/recovery-executor.ts`  
**代码行号**: 第 445-470 行

```typescript
/**
 * 诊断重试按钮缺失原因
 * 收集DOM状态用于后续分析
 */
private async diagnoseRetryButtonAbsence(): Promise<RetryButtonDiagnosis> {
  try {
    const diagnosis = await this.cdp.evaluate<RetryButtonDiagnosis>(`
      (() => {
        // ... 其他诊断代码 ...

        // 倒数三个 chat-turn 的文本
        lastTurns: Array.from(document.querySelectorAll('.chat-turn'))
          .slice(-3)
          .map(t => (t.textContent || '').slice(0, 100))
      })()
    `);
    // ...
  }
}
```

**关键问题**: `document.querySelectorAll('.chat-turn')` 扫描的是 **全局 DOM 中的所有 chat-turn 元素**，而不是当前任务的 chat-turn。

### 3.2 诊断数据结构

```typescript
// recovery-executor.ts 第 93-105 行
export interface RetryButtonDiagnosis {
  timestamp: string;
  error?: string;
  totalButtonElements: number;
  totalRoleButtons: number;
  allAriaLabels: (string | null)[];
  visibleButtonTexts: string[];
  hasChatContainer: boolean;
  chatTurnsCount: number;
  hasModal: boolean;
  currentUrl: string;
  documentTitle: string;
  lastTurns: string[];  // ← 问题字段
}
```

### 3.3 状态探针的 allTasks 采集逻辑

**文件位置**: `mvp-runner/src/actions/state-probe.ts`  
**代码行号**: 第 95-175 行

```typescript
// 信号5 & 6：侧边栏任务状态 + 所有任务独立快照
const taskItems = document.querySelectorAll('.index-module__task-item___zOpfg');
let taskStatus = 'unknown';
let taskText = '';
const allTasks = [];

for (const item of taskItems) {
  const text = item.textContent || '';
  const isSelected = item.className.includes('selected') || 
                    item.classList.contains('selected');
  
  // 识别任务名称和状态
  let taskName = 'unknown';
  if (text.includes('PMCLI')) taskName = 'PMCLI';
  else if (text.includes('DEVCLI')) taskName = 'DEVCLI';
  else if (text.includes('WikiBot')) taskName = 'WikiBot';
  
  let status = 'unknown';
  if (text.includes('完成')) status = 'completed';
  else if (text.includes('中断')) status = 'interrupted';
  else if (text.includes('进行中')) status = 'in_progress';
  
  // ... 按钮检测逻辑 ...
  
  allTasks.push({
    taskId: taskName,
    taskName,
    status,
    isActive: isSelected,
    isSelected,
    // ...
  });
}
```

**问题**: `state-probe.ts` 虽然采集了 `allTasks`，但 `wait-response.ts` 在获取最终结果时使用的是 `getLastAIResponse()`，该方法同样扫描全局 `.chat-turn`：

```typescript
// wait-response.ts 第 248-265 行
async function getLastAIResponse(cdp: CDPClient): Promise<string> {
  const result = await cdp.evaluate(`
    (function() {
      const turns = document.querySelectorAll('.chat-turn');
      if (turns.length === 0) return '';
      
      for (let i = turns.length - 1; i >= 0; i--) {
        const turn = turns[i];
        if (!turn.classList.contains('user')) {
          let text = turn.innerText || '';
          text = text.replace(/复制图片/g, '').trim();
          return text;
        }
      }
      
      return '';
    })()
  `);
  
  return result || '';
}
```

### 3.4 多任务并发时的 DOM 结构

当 PMCLI 任务执行时，Trae 界面上同时存在另一个对话（"现在几点"），DOM 结构如下：

```
.chat-turn[0] - "现在几点" 任务的用户输入
.chat-turn[1] - "现在几点" 任务的 AI 回复
.chat-turn[2] - "PMCLI" 任务的用户输入
.chat-turn[3] - "PMCLI" 任务的 AI 回复（正在生成）
```

**问题**: `getLastAIResponse()` 从最后一个非 user turn 获取内容，如果"现在几点"的 turn 在 DOM 中位于 PMCLI 之后，就会获取到错误的内容。

---

## 4. 根本原因分析

### 4.1 直接原因：心跳检测误判任务状态

日志显示（第 5337 行）：
```
Heartbeat #4: btn=disabled, task=interrupted, terminal=false, delete=false
```

**问题**: 任务实际上正在正常执行（AI正在分析"当前分支还有什么问题"），但心跳检测系统错误地将其判定为 `interrupted`。

### 4.2 关键证据：DOM快照显示存在另一个任务

恢复诊断日志（第 5437 行）显示：
```json
{
  "lastTurns": [
    "PMCLI手动终止输出",
    "14:03用户34614810323现在几点",
    "PMCLI正在分析问题..."
  ]
}
```

**重大发现**: 
- `lastTurns[1]` 显示 `"14:03用户34614810323现在几点"`
- 这说明在 PMCLI 任务执行期间，Trae 界面上存在**另一个对话**（"现在几点"）
- 心跳检测的 `scanTasks()` 扫描到了这个对话，导致状态判断错误

### 4.3 根因：多任务并发干扰

**核心问题**: 
1. PMCLI 任务正在 slot #3 执行
2. 但 Trae 界面上同时存在另一个对话（"现在几点"）
3. 心跳检测的 `scanTasks()` 扫描到了所有对话，包括不属于当前任务的对话
4. 系统误判当前任务状态为 `interrupted`

### 4.4 代码层面的根因

**问题 1**: `diagnoseRetryButtonAbsence()` 使用全局 `document.querySelectorAll('.chat-turn')`，未过滤当前任务

**问题 2**: `getLastAIResponse()` 同样使用全局扫描，未区分任务

**问题 3**: `state-probe.ts` 的 `allTasks` 虽然采集了任务列表，但没有将 chat-turn 与具体任务关联

---

## 5. 系统行为分析

### 5.1 正常流程（预期）
```
用户发送消息 → 切换到PMCLI → 填充提示词 → 提交 → 等待响应 → 保存结果 → 回复群聊
```

### 5.2 实际流程（异常）
```
用户发送消息 → 切换到PMCLI → 填充提示词 → 提交 → 
  心跳检测到"interrupted" → 触发恢复 → 
  恢复过程中扫描到"几点"对话 → 
  系统混淆任务 → 最终回复"几点"的结果
```

### 5.3 回复内容错位原因

虽然保存到文件的结果是正确的（"当前分支..."任务的结果），但发送给飞书的回复内容被替换成了"几点"任务的结果。这是因为：
1. `getLastAIResponse()` 扫描全局 `.chat-turn`，获取到最后一个 AI turn
2. 如果"现在几点"的回复在 DOM 中位于 PMCLI 回复之后，就会获取到错误内容
3. 恢复机制切换到了错误的对话上下文

---

## 6. 影响评估

| 影响项 | 严重程度 | 说明 |
|--------|----------|------|
| 任务结果错误 | 高 | 用户收到的是"几点"的回答，而非分支检查 |
| 用户体验 | 高 | 用户会感到困惑，认为系统答非所问 |
| 数据完整性 | 中 | 本地保存的结果是正确的，但群聊回复错误 |
| 系统稳定性 | 中 | 心跳检测误判导致不必要的恢复操作 |

---

## 7. 修复建议

### 7.1 短期修复（立即实施）

#### 修复 1: 增强心跳检测的准确性

在 `scanTasks()` 中增加过滤逻辑，只扫描当前选中的任务：

```typescript
// state-probe.ts 修改建议
const taskItems = document.querySelectorAll('.index-module__task-item___zOpfg');
// 只处理当前选中的任务
const selectedItem = Array.from(taskItems).find(item => 
  item.classList.contains('selected')
);
if (selectedItem) {
  // 只采集当前任务的 chat-turn
  const taskContainer = selectedItem.closest('[data-task-panel]');
  const turns = taskContainer?.querySelectorAll('.chat-turn') || [];
}
```

#### 修复 2: 恢复机制增加任务匹配验证

在 `getLastAIResponse()` 中增加任务名称验证：

```typescript
// wait-response.ts 修改建议
async function getLastAIResponse(cdp: CDPClient, taskName?: string): Promise<string> {
  const result = await cdp.evaluate(`
    (function() {
      // 先找到当前任务的容器
      const selectedTask = document.querySelector('.index-module__task-item___zOpfg.selected');
      const taskContainer = selectedTask?.closest('[data-task-panel]');
      const turns = taskContainer?.querySelectorAll('.chat-turn') || document.querySelectorAll('.chat-turn');
      
      // 验证 turn 是否属于当前任务
      for (let i = turns.length - 1; i >= 0; i--) {
        const turn = turns[i];
        if (!turn.classList.contains('user')) {
          let text = turn.innerText || '';
          // 验证内容是否包含任务名称或相关上下文
          text = text.replace(/复制图片/g, '').trim();
          return text;
        }
      }
      
      return '';
    })()
  `);
  
  return result || '';
}
```

#### 修复 3: 诊断方法增加任务隔离

```typescript
// recovery-executor.ts 修改建议
private async diagnoseRetryButtonAbsence(taskName?: string): Promise<RetryButtonDiagnosis> {
  // ...
  lastTurns: (() => {
    // 只获取当前任务的 chat-turn
    const selectedTask = document.querySelector('.index-module__task-item___zOpfg.selected');
    const taskContainer = selectedTask?.closest('[data-task-panel]');
    const turns = taskContainer?.querySelectorAll('.chat-turn') || [];
    return Array.from(turns)
      .slice(-3)
      .map(t => (t.textContent || '').slice(0, 100));
  })()
}
```

### 7.2 长期修复（后续迭代）

#### 修复 4: 重构任务隔离机制

每个任务应该有独立的执行上下文，避免不同任务的对话互相干扰：

```typescript
// 建议新增 TaskContext 管理器
class TaskContext {
  private taskId: string;
  private container: Element | null;
  
  constructor(taskId: string) {
    this.taskId = taskId;
    this.container = this.findTaskContainer();
  }
  
  private findTaskContainer(): Element | null {
    const items = document.querySelectorAll('.index-module__task-item___zOpfg');
    for (const item of items) {
      if (item.textContent?.includes(this.taskId)) {
        return item.closest('[data-task-panel]');
      }
    }
    return null;
  }
  
  getChatTurns(): Element[] {
    return Array.from(this.container?.querySelectorAll('.chat-turn') || []);
  }
  
  getLastAITurn(): Element | null {
    const turns = this.getChatTurns();
    for (let i = turns.length - 1; i >= 0; i--) {
      if (!turns[i].classList.contains('user')) {
        return turns[i];
      }
    }
    return null;
  }
}
```

#### 修复 5: 增强状态机逻辑

增加更多的状态校验点，减少误判的可能性：

```typescript
// detector.ts 修改建议
private async checkTaskConsistency(snap: SystemSnapshot, taskName: string): Promise<boolean> {
  const currentTask = snap.allTasks.find(t => t.name === taskName);
  if (!currentTask) return false;
  
  // 验证当前选中的任务是否匹配
  if (!currentTask.isSelected) {
    debug('Task %s is not selected, possible context switch', taskName);
    return false;
  }
  
  // 验证 chat-turn 内容是否匹配任务上下文
  const lastTurn = snap.lastTurnText;
  if (lastTurn && !lastTurn.includes(taskName)) {
    debug('Last turn does not contain task name %s, possible contamination', taskName);
    return false;
  }
  
  return true;
}
```

#### 修复 6: 改进恢复策略

恢复前进行更全面的诊断，如果检测到多个任务，应该暂停恢复并告警：

```typescript
// recovery-executor.ts 修改建议
async executeRecovery(taskName: string, mode: HeartbeatMode): Promise<RecoveryResult[]> {
  // 预恢复诊断
  const diagnosis = await this.diagnoseRetryButtonAbsence(taskName);
  
  // 检查是否存在多任务干扰
  const hasMultipleTasks = diagnosis.lastTurns.some(turn => 
    !turn.includes(taskName) && !turn.includes('手动终止')
  );
  
  if (hasMultipleTasks) {
    debug('⚠️ Multiple tasks detected in DOM, aborting recovery to prevent contamination');
    return [{
      success: false,
      action: RECOVERY_ACTIONS.reportToGroup,
      attempts: 0,
      timestamp: Date.now(),
      duration: 0,
      error: 'Multiple tasks detected, manual intervention required'
    }];
  }
  
  // 继续正常恢复流程
  // ...
}
```

---

## 8. 相关日志位置

- **主日志**: `mvp-runner/logs/terminal/terminal-20260508-131845.log`
  - 第 5196-5810 行：完整的事件时间线
  - 第 5337 行：首次检测到 interrupted 状态
  - 第 5437 行：诊断信息显示存在"几点"对话

- **任务结果文件**: `workspaces/PMCLI/runs/20260508/2026-05-08T06-02-53-357Z.md`
  - 保存了正确的任务结果（虽然回复给用户的不是这个）

---

## 9. 代码引用

### 9.1 lastTurns 采集代码

**文件**: `mvp-runner/src/heartbeat/recovery-executor.ts`  
**行号**: 462-470

```typescript
lastTurns: Array.from(document.querySelectorAll('.chat-turn'))
  .slice(-3)
  .map(t => (t.textContent || '').slice(0, 100))
```

### 9.2 状态探针 allTasks 采集代码

**文件**: `mvp-runner/src/actions/state-probe.ts`  
**行号**: 95-175

```typescript
const taskItems = document.querySelectorAll('.index-module__task-item___zOpfg');
// ... 任务状态识别逻辑 ...
```

### 9.3 结果获取代码

**文件**: `mvp-runner/src/actions/wait-response.ts`  
**行号**: 248-265

```typescript
async function getLastAIResponse(cdp: CDPClient): Promise<string> {
  const result = await cdp.evaluate(`
    (function() {
      const turns = document.querySelectorAll('.chat-turn');
      // ... 全局扫描逻辑 ...
    })()
  `);
}
```

---

## 10. 结论

这是一起由**心跳检测系统误判任务状态**导致的事件。根本原因是 Trae 界面上同时存在多个对话，心跳检测扫描到了不属于当前任务的对话内容，导致：
1. 错误判定任务为 "interrupted"
2. 触发不必要的恢复机制
3. 最终回复了错误的内容给用户

**核心代码问题**: `lastTurns` 和 `getLastAIResponse()` 都使用全局 `document.querySelectorAll('.chat-turn')`，未做任务隔离。

**建议立即实施短期修复**（修复 1-3），避免类似事件再次发生。

---

*报告生成时间: 2026-05-08*  
*调查人员: TESTCLI*  
*状态: 待架构师评审*
