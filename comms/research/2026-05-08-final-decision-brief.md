# 任务隔离漏洞修复 - 决策简报

**生成时间**: 2026-05-08
**调研人员**: RESEARCHCLI
**文档状态**: 待评审

---

## 执行摘要

本次调研完成了任务隔离漏洞的全量证据收集，覆盖因果链追踪、全局选择器盘点、DOM锚点可行性验证三个维度。

---

## 1. 真正的污染源位置（精确到代码行号）

| 优先级 | 文件 | 函数 | 行号 | 问题描述 |
|--------|------|------|------|----------|
| **P0** | `wait-response.ts` | `getLastAIResponse()` | 252-268 | 使用 `document.querySelectorAll('.chat-turn')` 全局扫描 |
| **P0** | `wait-response.ts` | `getDetailedResult()` | 289-310 | 同样的全局扫描问题 |
| **P0** | `wait-response.ts` | (内联) | 320-331 | 代码块提取无作用域 |
| **P1** | `state-probe.ts` | `captureSnapshot()` | 79-83 | 信号2采集无作用域 |

**核心问题代码**:
```typescript
// wait-response.ts:254
const turns = document.querySelectorAll('.chat-turn');  // ❌ 全局扫描
```

---

## 2. 与 lastTurns 的关系

| 变量/概念 | 位置 | 用途 | 是否影响回复 |
|-----------|------|------|-------------|
| `lastTurns` | `recovery-executor.ts:466` | 诊断日志 | ❌ **无关** |
| `lastTurnTextLen` | `state-probe.ts:29` | 心跳信号 | ❌ **无关** |
| `lastTurnText` | `state-probe.ts:30` | 心跳信号 | ❌ **无关** |

**结论**: `lastTurns` **与飞书错误回复无直接因果关系**。它是诊断日志，仅用于调试目的。修复 `lastTurns` 不会解决污染问题。

**真正的关系**:
- `lastTurns` 在 `recovery-executor.ts` 中用于诊断
- `recovery` 执行后，`getLastAIResponse()` 获取到错误的 chat-turn
- 所以表面上看是"lastTurns 污染"，实际上是 **recovery 后 DOM 结构变化 + 全局选择器** 的共同作用

---

## 3. 全仓 HIGH 风险选择器数量

| 风险等级 | 数量 | 说明 |
|----------|------|------|
| **HIGH** | 4 | 直接影响最终回复内容 |
| **MEDIUM** | 12 | 影响心跳检测/状态判断 |
| LOW | 45+ | 仅用于日志/审计/恢复 |

**HIGH 风险清单**:
1. `wait-response.ts:254` - `.chat-turn` → `getLastAIResponse()`
2. `wait-response.ts:291` - `.chat-turn` → `getDetailedResult()`
3. `wait-response.ts:320` - `.chat-turn` → 代码块提取
4. `state-probe.ts:80` - `.chat-turn` → `captureSnapshot()` 信号2

---

## 4. 推荐的修复策略

### 策略选择

| 策略 | 可行性 | 推荐度 |
|------|--------|--------|
| 策略1: data-task-id 属性 | ❌ 不可行 | - |
| 策略2: iframe 隔离 | ❌ 不可行 | - |
| **策略3: 活动容器作用域** | **⚠️ 可行** | **✅ 推荐** |

### 推荐实现方案

```typescript
// 修复后的 getLastAIResponse()
async function getLastAIResponse(cdp: CDPClient): Promise<string> {
  const result = await cdp.evaluate(`
    (function() {
      // 方案A: 基于 .selected 任务容器
      const selectedTask = document.querySelector('.index-module__task-item___zOpfg.selected');

      let chatContainer = null;

      if (selectedTask) {
        // 在选中任务内查找 chat 容器
        chatContainer = selectedTask.querySelector('[class*="chat"]');
        if (!chatContainer) {
          chatContainer = selectedTask.closest('[class*="task-panel"]')?.querySelector('[class*="chat"]');
        }
      }

      // 方案B: 兜底 - 基于发送按钮向上查找
      if (!chatContainer) {
        const sendBtn = document.querySelector('.chat-input-v2-send-button');
        chatContainer = sendBtn?.closest('[class*="chat"]');
      }

      const turns = chatContainer?.querySelectorAll('.chat-turn') || [];

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

## 5. 预估修复工时

| 阶段 | 任务 | 工时 | 依赖 |
|------|------|------|------|
| **Phase 1** | DOM 结构验证（CDP 执行探测） | 1h | 需要实际 Trae 环境 |
| **Phase 2** | 修复 `getLastAIResponse()` | 2h | Phase 1 |
| **Phase 3** | 修复 `getDetailedResult()` | 1h | Phase 1 |
| **Phase 4** | 修复 `captureSnapshot()` 信号2 | 1h | Phase 1 |
| **Phase 5** | 回归测试 | 2h | Phase 2-4 |
| **总计** | | **7h** | |

---

## 6. 回归测试覆盖场景

| 测试场景 | 预期结果 | 优先级 |
|----------|----------|--------|
| 单任务正常执行 | 回复正确内容 | P0 |
| 双任务并发执行 | 各自回复正确内容 | P0 |
| recovery 后回复 | 回复正确内容 | P0 |
| 任务切换后回复 | 回复正确内容 | P1 |
| 长响应（代码块） | 完整代码块 | P1 |
| 超时场景 | 正确超时错误 | P2 |

---

## 7. 隐藏 bug 风险评估

### 7.1 同类隐藏 bug 触发概率

**评估**: 中等风险

**触发条件**:
1. 页面上同时存在多个任务（PMCLI + 其他任务）
2. 其中一个任务在执行中
3. 另一个任务的 chat-turn 在 DOM 中排在后面
4. 当前任务执行完成后，`getLastAIResponse()` 获取到错误的 chat-turn

**概率估算**:
- 正常单任务执行: 无风险
- 多任务切换但不 recovery: 低风险
- 多任务 + recovery: **高风险**

### 7.2 未触发但可能存在的问题

| 问题 | 描述 | 风险 |
|------|------|------|
| `getDetailedResult()` 同样污染 | 代码块/图片提取可能获取错误内容 | HIGH |
| `captureSnapshot()` 状态误判 | 可能错误报告 interrupted | MEDIUM |
| 多任务切换时的竞态条件 | 任务切换后立即查询 DOM | LOW |

---

## 8. 决策建议

### 8.1 立即行动（1天内）

- [ ] 通过 CDP 验证 DOM 结构
- [ ] 确定 chat 容器选择器
- [ ] 编写修复代码（不合并）

### 8.2 短期行动（1周内）

- [ ] PR 提交修复代码
- [ ] 编写回归测试用例
- [ ] 评审通过后合并

### 8.3 长期优化

- [ ] 将硬编码选择器迁移到配置文件
- [ ] 添加单元测试覆盖选择器行为
- [ ] 考虑添加任务 ID 追踪机制

---

## 9. 评审问题

请评审以下问题后决定下一步：

1. **DOM 验证**: 是否可以通过 CDP 环境验证 `.selected` 任务容器的结构？
2. **修复优先级**: 是否需要同时修复 `state-probe.ts` 的信号2？
3. **测试计划**: 回归测试由谁负责？需要多久准备？

---

## 参考文档

- [因果链追踪报告](./2026-05-08-causal-chain.md)
- [选择器全量盘点报告](./2026-05-08-selector-audit.md)
- [DOM锚点可行性验证](./2026-05-08-dom-anchor-feasibility.md)

---

*调研人员: RESEARCHCLI*
*文档版本: v1.0*
*状态: 待评审*
