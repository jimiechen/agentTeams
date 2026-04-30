# 紧急代码审查请求：心跳检测恢复机制严重缺陷

**审查等级**: P0 (严重)  
**提交日期**: 2026-04-30  
**提交人**: AI Assistant  
**关联事故**: INCIDENT_REPORT_2026-04-30.md

---

## 一、审查背景

### 1.1 问题概述
心跳检测系统在 DEVCLI 任务处于 `interrupted` 状态时，反复触发恢复流程，导致：
- 重试按钮查找连续5次失败
- 页面刷新触发3次编辑器重启
- 速率限制被触发（5次/3600秒）

### 1.2 日志证据
```
terminal-20260430-093746.log:
- L109: 首次检测到interrupted
- L146,210,273,329,386: 连续5次"Retry button not found"
- L445: "rate limited (retry in 3512s)"
- L487: 第6次尝试成功
```

---

## 二、待审查代码

### 2.1 文件1: recovery-executor.ts

#### 问题代码A: 固定延迟不可靠
```typescript
// Line ~208
await this.delay(2000);  // 固定等待2秒
const retryResult = await this.clickRetryButton();
```

**问题**: 
- 2秒固定延迟不足以保证UI渲染完成
- 没有轮询验证机制
- 导致连续5次查找失败

**建议修复**:
```typescript
private async clickRetryButtonWithRetry(
  maxAttempts = 5, 
  interval = 1000
): Promise<RetryResult> {
  for (let i = 0; i < maxAttempts; i++) {
    const result = await this.clickRetryButton();
    if (result.clicked) return result;
    debug(`Retry button not found, attempt ${i + 1}/${maxAttempts}`);
    await this.delay(interval);
  }
  return { clicked: false, method: 'not-found-after-retry' };
}
```

#### 问题代码B: 刷新页面无次数限制
```typescript
// Line ~330
results.push(await this.executeAction(RECOVERY_ACTIONS.refreshPage));
```

**问题**:
- 兜底策略过于激进
- 连续刷新导致编辑器崩溃（3次重启）
- 没有保护机制

**建议修复**:
```typescript
private refreshCount = 0;
private readonly MAX_REFRESH = 2;
private lastRefreshTime = 0;

private async executeRefreshPage(): Promise<RecoveryResult> {
  // 检查次数限制
  if (this.refreshCount >= this.MAX_REFRESH) {
    debug('Max refresh count reached, skipping');
    return {
      success: false,
      action: { ...RECOVERY_ACTIONS.refreshPage, id: 'refresh-skipped' },
      reason: 'max-refresh-reached',
    };
  }
  
  // 检查时间间隔（至少间隔30秒）
  const now = Date.now();
  if (now - this.lastRefreshTime < 30000) {
    debug('Refresh too frequent, skipping');
    return {
      success: false,
      action: { ...RECOVERY_ACTIONS.refreshPage, id: 'refresh-skipped' },
      reason: 'too-frequent',
    };
  }
  
  this.refreshCount++;
  this.lastRefreshTime = now;
  return this.executeAction(RECOVERY_ACTIONS.refreshPage);
}
```

#### 问题代码C: 互斥锁实现不完整
```typescript
// Line ~223
if (this.recoveryInProgress) {
  debug('Recovery already in progress, skipping');
  return;
}
```

**问题**:
- 仅检查标志位，没有原子操作保护
- 存在竞态条件
- 异常情况下锁无法释放

**建议修复**:
```typescript
private recoveryLock = false;

async executeRecovery(state: HealthState): Promise<void> {
  // 使用try-finally确保锁释放
  if (this.recoveryLock) {
    debug('Recovery already in progress, skipping');
    return;
  }
  
  this.recoveryLock = true;
  const startTime = Date.now();
  
  try {
    await this.doExecuteRecovery(state);
  } catch (err) {
    debug('Recovery failed with error: %s', (err as Error).message);
    throw err;
  } finally {
    this.recoveryLock = false;
    debug('Recovery lock released after %dms', Date.now() - startTime);
  }
}
```

### 2.2 文件2: layer1.ts

#### 问题代码: 状态判断过于简单
```typescript
// Line ~215-219
const hasInterrupted = payload.tasks.some(t => t.status === 'interrupted');
if (hasInterrupted) {
  return 'frozen';  // 直接标记为frozen
}
```

**问题**:
- 没有区分"新interrupted"和"持续interrupted"
- 导致重复触发恢复流程
- 缺乏上下文判断

**建议修复**:
```typescript
// 添加interrupted持续时间判断
private interruptedStartTime: Map<string, number> = new Map();

private checkInterruptedStatus(tasks: Task[]): 'frozen' | 'normal' {
  const interruptedTasks = tasks.filter(t => t.status === 'interrupted');
  
  for (const task of interruptedTasks) {
    const startTime = this.interruptedStartTime.get(task.name);
    const now = Date.now();
    
    if (!startTime) {
      // 首次检测到interrupted，记录时间
      this.interruptedStartTime.set(task.name, now);
      debug('First time detecting interrupted task: %s', task.name);
      return 'normal';  // 首次不触发恢复
    }
    
    const duration = now - startTime;
    if (duration > 10000) {  // 超过10秒才触发恢复
      debug('Task %s has been interrupted for %dms, triggering recovery', 
        task.name, duration);
      return 'frozen';
    }
  }
  
  // 清理已恢复的任务
  for (const [name, _] of this.interruptedStartTime) {
    if (!interruptedTasks.find(t => t.name === name)) {
      this.interruptedStartTime.delete(name);
      debug('Task %s recovered, cleared tracking', name);
    }
  }
  
  return 'normal';
}
```

---

## 三、审查Checklist

### 3.1 修复方案A - 快速修复（推荐立即实施）

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 重试按钮轮询查找 | ⬜ | 最多5次尝试，间隔1秒 |
| 刷新页面次数限制 | ⬜ | 最多2次，间隔30秒 |
| 互斥锁完善 | ⬜ | try-finally确保释放 |
| 日志增强 | ⬜ | 添加更多调试信息 |

### 3.2 修复方案B - 架构重构（中期实施）

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 统一恢复入口 | ⬜ | 合并wait-response和recovery-executor |
| 状态机优化 | ⬜ | 区分新旧interrupted状态 |
| 熔断机制 | ⬜ | 连续失败N次后停止 |
| 可观测性 | ⬜ | 添加追踪ID和截图 |

---

## 四、测试要求

### 4.1 必须测试场景

1. **interrupted任务恢复**
   - 模拟interrupted状态
   - 验证重试按钮被成功点击
   - 验证不触发页面刷新

2. **重试按钮查找失败**
   - 模拟UI延迟渲染
   - 验证轮询机制生效
   - 验证最大尝试次数限制

3. **刷新页面限制**
   - 连续触发恢复5次
   - 验证第3次及以后不执行刷新
   - 验证速率限制不被触发

4. **并发恢复请求**
   - 同时触发多个恢复请求
   - 验证互斥锁生效
   - 验证只有一个恢复流程执行

### 4.2 性能要求

- 恢复流程总耗时 < 30秒
- 重试按钮查找轮询间隔 1秒
- 刷新页面最小间隔 30秒

---

## 五、评审意见模板

### 5.1 架构师评审

```markdown
## 架构师评审意见

**评审人**: [姓名]
**评审日期**: [日期]

### 总体评价
[ ] 同意修复方案A（快速修复）
[ ] 建议增加修复方案B（架构重构）
[ ] 需要重新设计

### 具体意见
1. [意见1]
2. [意见2]

### 优先级建议
[ ] P0 - 立即修复
[ ] P1 - 本周修复
[ ] P2 - 排期修复

**签字**: _______
```

### 5.2 开发负责人评审

```markdown
## 开发负责人评审意见

**评审人**: [姓名]
**评审日期**: [日期]

### 技术可行性
[ ] 修复方案可行
[ ] 需要调整实现细节
[ ] 存在技术风险

### 预计工作量
- 修复方案A: [X] 小时
- 修复方案B: [X] 天

### 测试覆盖
[ ] 单元测试已覆盖
[ ] 集成测试已覆盖
[ ] 需要补充测试用例

**签字**: _______
```

---

## 六、附件

### 6.1 相关文档
- [事故报告](INCIDENT_REPORT_2026-04-30.md)
- [日志文件](../mvp-runner/logs/terminal/terminal-20260430-093746.log)

### 6.2 相关代码
- `src/heartbeat/recovery-executor.ts`
- `src/heartbeat/layer1.ts`
- `src/heartbeat/detector.ts`

---

**提交人**: AI Assistant  
**提交时间**: 2026-04-30  
**期望完成时间**: 2026-04-30（P0紧急）
