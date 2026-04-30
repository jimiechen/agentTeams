# 代码评审请求：心跳检测系统严重缺陷

**评审类型**: 紧急安全评审  
**提交日期**: 2026-04-29  
**分支**: `main`  
**相关提交**: 
- `47d091d` - feat(heartbeat): implement 3-way retry button lookup
- `05bc2c4` - fix(heartbeat): prioritize interrupted check and fix recovery order
- `aba8d9f` - fix(lark): handle sendText errors gracefully

---

## 一、评审重点

### 1.1 核心问题：恢复机制冲突

请重点审查以下文件的交互逻辑：

| 文件 | 问题 | 风险等级 |
|------|------|----------|
| `src/heartbeat/recovery-executor.ts` | 心跳恢复逻辑 | 🔴 高 |
| `src/actions/wait-response.ts` | 任务等待恢复逻辑 | 🔴 高 |
| `src/heartbeat/detector.ts` | 状态检测触发 | 🟡 中 |
| `src/heartbeat/layer1.ts` | 任务状态识别 | 🟡 中 |

### 1.2 具体问题

**问题 1: 两处恢复代码同时操作 UI**

```typescript
// recovery-executor.ts: 点击重试按钮
await this.clickRetryButton();

// wait-response.ts: 可能同时发送消息
await recoverModelStalled(cdp, ...);
```

**问题 2: `isModelStalled` 可能误判 `interrupted` 状态**

```typescript
// wait-response.ts:152
if (isModelStalled(snapshots, 30000)) {
  // interrupted 状态下也无输出，会被误判为停滞
}
```

**问题 3: 缺少互斥机制**

两个恢复机制没有协调，可能同时执行导致冲突。

---

## 二、建议修复方案

### 方案 A: 快速修复（推荐立即实施）

1. 在 `wait-response.ts` 中添加 `interrupted` 状态检查：

```typescript
// 在 isModelStalled 检查之前
if (snap.taskStatus === 'interrupted') {
  debug('Task is interrupted, skipping model stall recovery');
  continue;  // 让 heartbeat recovery 处理
}
```

2. 添加全局恢复锁：

```typescript
// 在 runner-multi.ts 中添加
private isRecovering = false;

// 在触发恢复前检查
if (this.isRecovering) {
  log('Recovery already in progress, skipping');
  return;
}
```

### 方案 B: 架构重构（长期）

将 `wait-response.ts` 的恢复逻辑完全迁移到 `recovery-executor.ts`，统一恢复策略。

---

## 三、评审 checklist

- [ ] 确认恢复机制冲突的解决方案
- [ ] 验证 `interrupted` 状态检测准确性
- [ ] 检查是否存在无限循环风险
- [ ] 确认编辑器重启根因
- [ ] 批准修复方案 A 或 B

---

## 四、联系方式

**提交人**: AI Assistant  
**事故报告**: `docs/INCIDENT_REPORT_2026-04-29.md`  
**紧急程度**: P0 (24小时内需响应)

---

等待专家评审意见。
