# 硬编码选择器全量盘点报告

**调研时间**: 2026-05-08
**调研目标**: 列出所有"全局 DOM 扫描"风险点

---

## 1. 全量选择器清单

### 1.1 统计概览

| 风险等级 | 数量 | 说明 |
|----------|------|------|
| **HIGH** | 4 | 影响最终回复内容 |
| **MEDIUM** | 12 | 影响心跳检测/状态判断 |
| **LOW** | 45+ | 仅用于日志/审计 |

### 1.2 HIGH 风险选择器清单

| 文件 | 行号 | 选择器 | 函数 | **影响** |
|------|------|--------|------|---------|
| `wait-response.ts` | 254 | `.chat-turn` | `getLastAIResponse()` | 返回最后一个非用户的 chat-turn |
| `wait-response.ts` | 291 | `.chat-turn` | `getDetailedResult()` | 获取 AI 响应详情 |
| `wait-response.ts` | 320 | `.chat-turn` | (内联) | 获取代码块 |
| `state-probe.ts` | 80 | `.chat-turn` | `captureSnapshot()` | 信号2：最后一个 chat-turn 长度 |

### 1.3 MEDIUM 风险选择器清单

| 文件 | 行号 | 选择器 | 函数 | 用途 |
|------|------|--------|------|------|
| `state-probe.ts` | 74 | `.chat-input-v2-send-button` | 信号1检测 | 判断发送按钮状态 |
| `state-probe.ts` | 86 | `.icd-btn.icd-btn-tertiary` | 信号3检测 | 查找终端超时按钮 |
| `state-probe.ts` | 99-100 | `.icd-delete/overwrite-*` | 信号4检测 | 弹窗检测 |
| `state-probe.ts` | 103 | `.index-module__task-item*` | 信号5/6 | 任务列表扫描 |
| `detector.ts` | 261 | `.index-module__task-item*` | `getTaskSnapshot()` | 获取任务快照 |
| `detector.ts` | 296 | `.chat-turn, .terminal` | `getTaskSnapshot()` | 获取输出内容 |
| `recovery-executor.ts` | 455-466 | `.chat-turn, [class*="chat"]` | 诊断信息 | 记录 lastTurns |
| `scan-tasks.ts` | 25 | `.index-module__task-item*` | `scanTasks()` | 扫描任务列表 |
| `switch-task.ts` | 17, 59 | `.index-module__task-item*` | `switchTask()` | 切换任务 |
| `fill-prompt.ts` | 18, 27, 44 | `${INPUT_SELECTOR}` | `fillPrompt()` | 填充输入框 |
| `submit.ts` | 18 | `${INPUT_SELECTOR}` | `submit()` | 提交输入 |

### 1.4 LOW 风险选择器清单（仅用于 recovery）

| 文件 | 行号 | 选择器 | 函数 |
|------|------|--------|------|
| `recovery-executor.ts` | 505 | `button[aria-label="重试"]` | clickRetryButton |
| `recovery-executor.ts` | 554-555 | `button[aria-label*="重试"]` | clickRetryButtonWithObserver |
| `recovery-executor.ts` | 435-436 | `button`, `[role="button"]` | 按钮扫描 |
| `recovery-executor.ts` | 553-556 | 多路查找重试按钮 | clickRetryButtonWithObserver |
| `recover.ts` | 72, 99 | `.icd-btn.icd-btn-tertiary` | 点击按钮 |
| `recover.ts` | 276, 316, 335 | `.chat-input-v2-send-button` | 发送按钮 |
| `recover.ts` | 380 | `.terminal textarea` | 终端输入 |

---

## 2. HIGH 风险点详细分析

### 2.1 getLastAIResponse() - 核心污染源

**文件**: `src/actions/wait-response.ts`
**行号**: 252-268

```typescript
async function getLastAIResponse(cdp: CDPClient): Promise<string> {
  const result = await cdp.evaluate(`
    (function() {
      const turns = document.querySelectorAll('.chat-turn');  // ❌ 全局扫描
      if (turns.length === 0) return '';

      for (let i = turns.length - 1; i >= 0; i--) {
        const turn = turns[i];
        if (!turn.classList.contains('user')) {
          let text = turn.innerText || '';
          text = text.replace(/复制图片/g, '').trim();
          return text;  // 返回最后一个非用户 chat-turn
        }
      }
      return '';
    })()
  `);
  return result || '';
}
```

**问题描述**:
- 使用 `document.querySelectorAll('.chat-turn')` 全局扫描所有 chat-turn
- 当页面上存在多个任务（PMCLI + "现在几点"）时，会匹配到所有任务的 chat-turn
- 返回最后一个非用户 chat-turn，不一定是当前执行任务的回复

**影响范围**:
- 直接决定发送给飞书的消息内容
- 可能导致用户收到错误任务的回复

### 2.2 getDetailedResult() - 同样的问题

**文件**: `src/actions/wait-response.ts`
**行号**: 276-361

```typescript
export async function getDetailedResult(cdp: CDPClient): Promise<TaskResult> {
  // ...
  const data = await cdp.evaluate(`
    (function() {
      const turns = document.querySelectorAll('.chat-turn');  // ❌ 同样问题
      // ...
    })()
  `);
}
```

**问题描述**: 与 `getLastAIResponse()` 相同。

### 2.3 captureSnapshot() - 信号采集

**文件**: `src/actions/state-probe.ts`
**行号**: 79-83

```typescript
// 信号2：最后一个chat-turn（当前活动任务）
const turns = document.querySelectorAll('.chat-turn');
const lastTurn = turns[turns.length - 1];
const lastTurnText = lastTurn?.textContent || '';
const lastTurnTextLen = lastTurnText.length;
```

**问题描述**:
- 虽然不直接影响回复，但影响心跳检测逻辑
- 可能误判任务状态（interrupted vs running）

---

## 3. 建议的统一替换模式

### 3.1 当前模式（有问题）

```typescript
// 全局扫描
document.querySelectorAll('.chat-turn')
```

### 3.2 推荐替换模式

```typescript
// 模式 A: 基于当前选中任务容器
const selectedTask = document.querySelector('.index-module__task-item___zOpfg.selected');
const taskChatContainer = selectedTask?.querySelector('[class*="chat"]');
const turns = taskChatContainer?.querySelectorAll('.chat-turn') || [];

// 模式 B: 基于发送按钮所在容器向上查找
const sendBtn = document.querySelector('.chat-input-v2-send-button');
const chatContainer = sendBtn?.closest('[class*="chat"]');
const turns = chatContainer?.querySelectorAll('.chat-turn') || [];

// 模式 C: 基于 button 的 data 属性（如果存在）
const sendBtn = document.querySelector('.chat-input-v2-send-button');
const taskId = sendBtn?.closest('[data-task-id]')?.getAttribute('data-task-id');
```

### 3.3 需要验证的前提条件

1. 确认 `.index-module__task-item___zOpfg.selected` 是否可靠标识当前任务
2. 确认 chat 容器是否有稳定的类名或 data 属性
3. 确认不同任务之间的 chat-turn 是否确实在不同的 DOM 容器中

---

## 4. 修复优先级

| 优先级 | 组件 | 工作量 | 风险 |
|--------|------|--------|------|
| P0 | `getLastAIResponse()` | 中 | 高 |
| P0 | `getDetailedResult()` | 中 | 高 |
| P1 | `captureSnapshot()` 信号2 | 低 | 中 |
| P2 | 其他 recovery/scanner | 低 | 低 |

---

## 5. 总结

| 类别 | 数量 |
|------|------|
| HIGH 风险点 | 4 |
| MEDIUM 风险点 | 12 |
| LOW 风险点 | 45+ |
| **总计** | **60+** |

**关键结论**:
1. 真正的污染源是 `wait-response.ts` 中的全局 `.chat-turn` 选择器
2. `lastTurns` 变量仅用于诊断，不影响回复
3. 修复需要限定作用域到当前选中任务的容器

---

*调研人员: RESEARCHCLI*
*状态: 已完成*
