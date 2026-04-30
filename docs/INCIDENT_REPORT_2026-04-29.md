# 严重事故报告：心跳检测系统误触发消息发送

**事故等级**: P0 (严重)  
**报告日期**: 2026-04-29  
**报告人**: AI Assistant  
**事故状态**: 调查中  

---

## 一、事故概述

### 1.1 现象描述

- **预期行为**: 当 DEVCLI 任务处于 `interrupted` 状态时，系统应自动点击"重试"按钮恢复任务
- **实际行为**: 系统在输入框发送了新提示词"日志上没有中止的信号吗"，而非点击重试按钮
- **副作用**: 编辑器异常重启 3 次

### 1.2 影响范围

- **受影响功能**: 心跳检测自动恢复、任务执行流程
- **用户体验**: 任务未按预期恢复，产生了意外的 AI 交互
- **系统稳定性**: 编辑器重启 3 次，存在严重稳定性问题

---

## 二、技术根因分析

### 2.1 代码架构问题

系统存在**两个独立的恢复机制**，导致冲突：

| 机制 | 位置 | 触发条件 | 行为 |
|------|------|----------|------|
| **心跳恢复** | `recovery-executor.ts` | 检测到 `frozen` 状态 | 切换任务 → 点击重试按钮 |
| **任务等待恢复** | `wait-response.ts` | 模型停滞/终端挂起 | 发送恢复消息到输入框 |

### 2.2 直接原因

**根本原因**: `wait-response.ts` 中的 `recoverModelStalled` 函数被错误触发

```typescript
// wait-response.ts 第 157 行
const result = await recoverModelStalled(cdp, {
  taskId: taskName,
  logger: opts?.logger,
});
```

当任务处于 `interrupted` 状态时，快照历史可能满足 `isModelStalled` 条件（30秒无输出变化），导致系统认为"模型停滞"，从而调用 `recoverModelStalled` 发送了恢复消息。

### 2.3 为什么点击了"重试"但未生效

从截图看，系统确实显示了"重试"按钮，说明恢复执行器的 `clickRetryButton()` 可能没有成功执行，或者执行后没有正确等待验证结果。

### 2.4 编辑器重启原因分析

**可能原因 1**: 无限循环导致内存溢出
- 心跳检测 → 触发恢复 → 恢复失败 → 再次检测 → 再次触发...
- 死循环导致编辑器崩溃

**可能原因 2**: CDP 连接异常
- 恢复操作过程中 CDP 连接中断
- 未捕获的异常导致进程崩溃

**可能原因 3**: 并发冲突
- `wait-response.ts` 和 `recovery-executor.ts` 同时操作 UI
- 冲突导致页面状态异常

---

## 三、代码审查发现

### 3.1 致命缺陷 1: 恢复机制冲突

```typescript
// recovery-executor.ts
// 预期: 只点击重试按钮
await this.clickRetryButton();

// wait-response.ts  
// 实际: 同时可能触发 sendContinueMessage
await recoverModelStalled(cdp, ...);
```

**问题**: 两个恢复机制没有互斥逻辑，可能同时执行

### 3.2 致命缺陷 2: 状态检测不准确

```typescript
// layer1.ts 第 215-219 行
const hasInterrupted = payload.tasks.some(t => t.status === 'interrupted');
if (hasInterrupted) {
  return 'frozen';  // 正确识别
}
```

但 `wait-response.ts` 没有检查 `interrupted` 状态，而是依赖 `isModelStalled`：

```typescript
// wait-response.ts 第 152 行
if (isModelStalled(snapshots, 30000)) {
  // 可能误触发，因为 interrupted 状态下也无输出变化
}
```

### 3.3 致命缺陷 3: 恢复操作后无正确验证

```typescript
// recovery-executor.ts
await this.clickRetryButton();
await this.delay(3000);
// 验证逻辑可能有问题
const stillInterrupted = await this.findInterruptedTask();
```

**问题**: 验证时可能没有正确等待 UI 更新完成

---

## 四、事故时间线（推测）

| 时间 | 事件 | 状态 |
|------|------|------|
| T+0s | DEVCLI 任务被手动中断 | `interrupted` |
| T+5s | 心跳检测识别为 `frozen` | 触发恢复 |
| T+5s | 尝试点击重试按钮（可能失败） | - |
| T+35s | `wait-response` 检测到"模型停滞" | 误触发 |
| T+35s | 发送错误消息"日志上没有中止的信号吗" | ❌ 事故 |
| T+? | 编辑器重启（共3次） | 严重故障 |

---

## 五、修复建议

### 5.1 立即修复（紧急）

1. **禁用冲突的恢复机制**
   - 临时注释掉 `wait-response.ts` 中的 `recoverModelStalled` 调用
   - 仅保留 `recovery-executor.ts` 的恢复逻辑

2. **添加互斥锁**
   - 确保心跳恢复和任务等待恢复不会同时执行

3. **修复验证逻辑**
   - 增加更可靠的恢复结果验证

### 5.2 中期修复（高优先级）

1. **统一恢复策略**
   - 将 `wait-response.ts` 的恢复逻辑合并到 `recovery-executor.ts`
   - 避免多处代码操作同一 UI

2. **增强状态检测**
   - `wait-response.ts` 应优先检查 `interrupted` 状态
   - 区分"模型停滞"和"任务中断"

3. **添加熔断机制**
   - 连续恢复失败 N 次后停止尝试
   - 避免无限循环

### 5.3 长期改进（技术债）

1. **完善日志追踪**
   - 每次恢复操作添加唯一追踪 ID
   - 便于事后分析

2. **集成测试覆盖**
   - 添加 `interrupted` 状态的自动化测试
   - 验证恢复流程

---

## 六、责任认定

| 问题 | 责任方 | 说明 |
|------|--------|------|
| 恢复机制冲突 | 架构设计 | 缺乏统一的恢复策略 |
| 状态检测不准确 | 开发实现 | 未充分考虑多种异常状态 |
| 测试覆盖不足 | QA | 缺少 `interrupted` 场景测试 |

---

## 七、附件

- 截图证据：`trae-screenshot-2026-04-29.png`
- 相关代码：
  - `src/heartbeat/recovery-executor.ts`
  - `src/actions/wait-response.ts`
  - `src/heartbeat/layer1.ts`
  - `src/heartbeat/detector.ts`

---

**报告人**: AI Assistant  
**审核状态**: 待专家评审  
**下一步**: 等待架构师评审并制定修复计划
