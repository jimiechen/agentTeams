# DOM 任务锚点可行性验证报告

**调研时间**: 2026-05-08
**调研目标**: 确认 DOM 是否支持"任务级作用域定位"

---

## 1. 代码分析：现有 DOM 结构

### 1.1 任务列表选择器

**文件**: `src/actions/scan-tasks.ts:25`

```typescript
const items = document.querySelectorAll('.index-module__task-item___zOpfg');
```

**分析**:
- 使用 CSS Module 生成的哈希类名 `index-module__task-item___zOpfg`
- 这是经过编译的类名，在开发环境中可能不同
- 任务项包含 `.selected` 类表示当前选中

### 1.2 发送按钮定位

**文件**: `src/actions/state-probe.ts:74`

```typescript
const sendBtn = document.querySelector('.chat-input-v2-send-button');
```

**分析**:
- 发送按钮是全局唯一的
- 可以作为当前活动任务的锚点

### 1.3 Chat 容器定位

**文件**: `src/heartbeat/detector.ts:600`

```typescript
const term = document.querySelector('.terminal, .chat-container, [class*="chat"]');
```

**分析**:
- 存在 `.chat-container` 和 `[class*="chat"]` 选择器
- 但这些是全局的，不一定属于当前任务

---

## 2. 任务容器层级结构（推测）

基于代码分析，推测 DOM 结构如下：

```
<body>
  ├── <div class="index-module__task-item___zOpfg">  <!-- PMCLI 任务 -->
  │   ├── <div class="task-header">PMCLI</div>
  │   └── <div class="chat-container">  <!-- ⚠️ 可能不在这里 -->
  │       └── <div class="chat-turn">...</div>
  │
  ├── <div class="index-module__task-item___zOpfg selected">  <!-- 当前选中: PMCLI -->
  │   ├── <div class="task-header">PMCLI</div>
  │   └── <div class="chat-area">  <!-- 当前任务的 chat 区域 -->
  │       ├── <div class="chat-turn user">用户消息</div>
  │       └── <div class="chat-turn">AI回复</div>  <!-- 目标 -->
  │
  ├── <div class="index-module__task-item___zOpfg">  <!-- "现在几点" 任务 -->
  │   ├── <div class="task-header">现在几点</div>
  │   └── <div class="chat-area">
  │       ├── <div class="chat-turn user">现在几点</div>
  │       └── <div class="chat-turn">14:03</div>  <!-- 污染源 -->
  │
  └── <div class="chat-input-v2-send-button">  <!-- 全局发送按钮 -->
```

**关键发现**: 发送按钮是全局的，不在特定任务容器内。

---

## 3. 三种修复策略可行性矩阵

| 策略 | 描述 | 可行性 | 理由 |
|------|------|--------|------|
| **策略1: data-task-id 属性** | 使用 `[data-task-id="xxx"]` 直接限定 | ❌ 不可行 | 代码中未发现 data-task-id 的使用 |
| **策略2: iframe 隔离** | 任务在独立 iframe | ❌ 不可行 | 代码中未发现 iframe 相关逻辑 |
| **策略3: 当前活动容器** | 用 `.selected` 任务容器作为 root | ⚠️ 部分可行 | `.selected` 存在，但 chat 容器定位需要验证 |

---

## 4. 推荐策略及实现方案

### 4.1 策略3细化：基于 `.selected` 任务容器

**思路**: 先找到 `.selected` 的任务项，然后在其内部查找 chat-turn

**实现代码**（待验证）:

```typescript
async function getLastAIResponse(cdp: CDPClient): Promise<string> {
  const result = await cdp.evaluate(`
    (function() {
      // 步骤1: 找到当前选中的任务
      const selectedTask = document.querySelector('.index-module__task-item___zOpfg.selected');
      if (!selectedTask) {
        // 兜底：使用发送按钮最近的 chat 容器
        const sendBtn = document.querySelector('.chat-input-v2-send-button');
        const chatContainer = sendBtn?.closest('[class*="chat"]');
        const turns = chatContainer?.querySelectorAll('.chat-turn') || [];
        // ... 返回逻辑
      }

      // 步骤2: 在选中任务内查找 chat 容器
      // 可能的路径1: 直接是任务项的子元素
      let chatContainer = selectedTask.querySelector('[class*="chat"]');

      // 可能的路径2: 在 task-panel 等容器内
      if (!chatContainer) {
        chatContainer = selectedTask.closest('[class*="task-panel"], [class*="task-panel"]')?.querySelector('[class*="chat"]');
      }

      // 步骤3: 在 chat 容器内查找 chat-turn
      const turns = chatContainer?.querySelectorAll('.chat-turn') || [];

      // 返回最后一个非用户的消息
      for (let i = turns.length - 1; i >= 0; i--) {
        if (!turns[i].classList.contains('user')) {
          return (turns[i].textContent || '').replace(/复制图片/g, '').trim();
        }
      }
      return '';
    })()
  `);
  return result || '';
}
```

### 4.2 备选方案：发送按钮向上查找

如果任务容器结构不稳定，可以用发送按钮作为锚点：

```typescript
async function getLastAIResponse(cdp: CDPClient): Promise<string> {
  const result = await cdp.evaluate(`
    (function() {
      // 找到发送按钮
      const sendBtn = document.querySelector('.chat-input-v2-send-button');

      // 方法1: 按钮的父容器就是 chat 区域
      let chatContainer = sendBtn?.parentElement?.closest('[class*="chat"]');

      // 方法2: 按钮所在的任务面板
      const taskPanel = sendBtn?.closest('[class*="task"], [class*="panel"]');

      // 方法3: 查找最近的 chat 容器
      if (!chatContainer && taskPanel) {
        chatContainer = taskPanel.querySelector('[class*="chat"]');
      }

      const turns = chatContainer?.querySelectorAll('.chat-turn') || [];

      // 返回最后一个非用户的消息
      for (let i = turns.length - 1; i >= 0; i--) {
        if (!turns[i].classList.contains('user')) {
          return (turns[i].textContent || '').replace(/复制图片/g, '').trim();
        }
      }
      return '';
    })()
  `);
  return result || '';
}
```

---

## 5. 需要验证的假设

在实施修复前，需要验证以下假设：

| # | 假设 | 验证方法 | 优先级 |
|---|------|----------|--------|
| 1 | `.index-module__task-item___zOpfg.selected` 能可靠标识当前任务 | CDP 执行查询 | P0 |
| 2 | 不同任务的 chat-turn 在不同的容器中 | 检查 DOM 结构 | P0 |
| 3 | 发送按钮在当前活动任务的 chat 容器附近 | 验证选择器路径 | P1 |
| 4 | 任务切换后，`.selected` 会更新 | 测试切换操作 | P1 |

---

## 6. 结论

| 策略 | 可行性 | 备注 |
|------|--------|------|
| 策略1: data-task-id | ❌ | DOM 中不存在此属性 |
| 策略2: iframe 隔离 | ❌ | 不适用此架构 |
| **策略3: 活动容器** | **⚠️** | **推荐，但需验证** |

**推荐方案**: 策略3（基于 `.selected` 任务容器）

**下一步行动**:
1. 通过 CDP 实际验证 DOM 结构
2. 确认 chat 容器选择器
3. 编写并测试修复代码

---

*调研人员: RESEARCHCLI*
*状态: 已完成*
