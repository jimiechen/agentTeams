# 严重事故报告：心跳检测系统反复刷新导致编辑器异常

**事故等级**: P0 (严重)  
**报告日期**: 2026-04-30  
**报告人**: AI Assistant  
**事故状态**: 已确认，待修复  

---

## 一、事故概述

### 1.1 现象描述

- **问题**: DEVCLI任务处于`interrupted`状态后，心跳检测系统反复触发恢复流程，导致编辑器异常重启3次
- **用户反馈**: 系统没有执行预期的"重试"操作，而是出现异常行为
- **副作用**: 编辑器异常重启3次，严重影响稳定性

### 1.2 影响范围

- **受影响功能**: 心跳检测自动恢复、任务执行流程
- **用户体验**: 任务未按预期恢复，系统反复刷新页面
- **系统稳定性**: 编辑器重启3次，存在严重稳定性问题

---

## 二、日志证据分析

### 2.1 关键日志时间线（基于 terminal-20260430-093746.log）

| 时间 | 事件 | 行号 | 状态 |
|------|------|------|------|
| 01:37:48 | 检测到interrupted任务，标记为frozen | L109 | ⚠️ |
| 01:37:48 | 状态切换: normal → frozen | L116 | 🔄 |
| 01:37:48 | 触发恢复：切换到DEVCLI任务 | L125-126 | ✅ |
| 01:37:50 | ❌ 重试按钮未找到 | L146 | ❌ |
| 01:37:51 | 执行兜底策略：刷新页面 | L147-150 | 🔄 |
| 01:37:52 | 页面刷新成功 | L153 | ✅ |
| 01:38:04 | 再次检测到interrupted任务 | L189 | ⚠️ |
| 01:38:04 | 状态切换: normal → frozen | L196 | 🔄 |
| 01:38:07 | 再次触发恢复 | L203 | 🔄 |
| 01:38:09 | ❌ 重试按钮仍未找到 | L210 | ❌ |
| 01:38:10 | 再次刷新页面 | L214 | 🔄 |

**模式识别**: 系统陷入循环：`检测到interrupted` → `切换任务` → `找不到重试按钮` → `刷新页面` → `重复`

### 2.2 速率限制触发（关键证据）

```
L445: 🚫 Action refresh-page blocked: rate limited (retry in 3512s)
L455: 🚫 Action report-to-group blocked: rate limited (retry in 3512s)
```

**分析**: 系统在约10分钟内触发了超过5次刷新页面操作，触发了速率限制（5次/3600秒）

### 2.3 恢复成功记录（对比分析）

```
L487: ✅ Retry button clicked successfully via method: aria-label
L496: ✅ Task DEVCLI recovered successfully
```

**分析**: 在第6次尝试时，重试按钮终于被成功点击，任务恢复为`in_progress`状态

---

## 三、重试按钮查找机制详细分析

### 3.1 查找流程（调用链）

```
heartbeat detector (每5秒触发)
    ↓
executeRecovery('frozen')
    ↓
executeFrozenRecovery()
    ↓
Step 1: switchToTask('DEVCLI') ✅ (L284)
    ↓
Step 2: delay(2000) - 等待UI渲染 (L299)
    ↓
Step 3: clickRetryButton() ❌ (L303)
    ↓
返回 { clicked: false, method: 'not-found' }
    ↓
Step 4: 执行兜底策略 → 刷新页面 (L334)
```

### 3.2 三路查找算法实现

**文件**: `src/heartbeat/recovery-executor.ts` L349-389

```typescript
private async clickRetryButton(): Promise<{ clicked: boolean; method: string }> {
  try {
    const result = await this.cdp.evaluate<{ clicked: boolean; method: string }>(`
      (() => {
        // 路径 1: aria-label 精确查找（最可靠，优先）
        let btn = document.querySelector('button[aria-label="重试"]');
        if (btn) {
          btn.click();
          return { clicked: true, method: 'aria-label' };
        }

        // 路径 2: 文本内容全量扫描（兜底）
        const allBtns = Array.from(document.querySelectorAll('button'));
        const textBtn = allBtns.find(b => b.textContent?.trim() === '重试');
        if (textBtn) {
          textBtn.click();
          return { clicked: true, method: 'text-content' };
        }

        // 路径 3: 在"手动终止输出"消息旁查找（DEVCLI 手动中断特有场景）
        const turns = document.querySelectorAll('.chat-turn');
        for (let i = turns.length - 1; i >= 0; i--) {
          if (turns[i].textContent?.includes('手动终止输出')) {
            const nearBtn = turns[i].querySelector('button[aria-label="重试"]');
            if (nearBtn) {
              nearBtn.click();
              return { clicked: true, method: 'previous-message' };
            }
            break; // 只找最近一条，找不到就不继续
          }
        }

        // 三路查找均失败
        return { clicked: false, method: 'not-found' };
      })()
    `);
    return result;
  } catch (err) {
    debug('clickRetryButton failed: %s', err instanceof Error ? err.message : 'unknown');
    return { clicked: false, method: 'error' };
  }
}
```

### 3.3 判断逻辑分析

**查找失败的条件**（满足任一）：
1. `clicked: false` - 没有成功点击任何按钮
2. `method: 'not-found'` - 三路查找均未找到按钮
3. `method: 'error'` - CDP执行过程中抛出异常

**日志记录位置**（L328）：
```typescript
} else {
  debug('❌ Retry button not found via any method: %s', retryResult.method);
  // 输出: "❌ Retry button not found via any method: not-found"
}
```

### 3.4 查找失败根本原因

**问题1: UI渲染时序问题**
- 任务切换后执行 `delay(2000)` (L299)
- 但重试按钮的渲染可能需要更长时间
- 2秒后执行查找时，按钮可能还未渲染到DOM中

**问题2: 缺乏轮询机制**
- 当前实现是"一次性"查找
- 如果当前时刻按钮不存在，立即返回失败
- 没有等待和重试逻辑

**问题3: 选择器可能不准确**
- 路径1: `button[aria-label="重试"]` - 依赖aria-label属性
- 路径2: `textContent?.trim() === '重试'` - 精确匹配文本
- 路径3: 在".chat-turn"中查找 - 依赖特定DOM结构

**改进建议**（等待审批）：
```typescript
// 建议添加轮询机制
private async clickRetryButtonWithPolling(
  maxAttempts = 5,
  interval = 1000
): Promise<{ clicked: boolean; method: string; attempts: number }> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await this.clickRetryButton();
    if (result.clicked) {
      return { ...result, attempts: attempt };
    }
    if (attempt < maxAttempts) {
      await this.delay(interval);
    }
  }
  return { clicked: false, method: 'not-found-after-polling', attempts: maxAttempts };
}
```

---

## 四、技术根因分析

### 4.1 直接原因：重试按钮查找失败

**证据**（连续5次失败）：
```
L146: ❌ Retry button not found via any method: not-found
L210: ❌ Retry button not found via any method: not-found
L273: ❌ Retry button not found via any method: not-found
L329: ❌ Retry button not found via any method: not-found
L386: ❌ Retry button not found via any method: not-found
```

**根本原因**: 
1. 任务切换后，UI渲染重试按钮存在延迟（超过2秒）
2. `clickRetryButton()`使用一次性查找，没有轮询机制
3. 三路查找的选择器可能不够健壮（依赖aria-label和特定DOM结构）
4. 等待时间2秒（L299: `await this.delay(2000)`）不足以保证重试按钮渲染完成

### 4.2 设计缺陷：恢复策略级联失效

```typescript
// recovery-executor.ts 执行流程
Step 1: 切换到interrupted任务 ✅ 
Step 2: 等待2秒
Step 3: 3路查找点击重试按钮 ❌ (连续5次失败)
Step 4: 兜底策略 → 刷新页面 🔄 (触发3次编辑器重启)
```

**问题**: 
- 刷新页面是"兜底策略"，但频繁刷新会导致编辑器不稳定
- 没有限制刷新次数，导致陷入死循环
- 速率限制触发后，恢复操作被阻塞

### 4.3 并发冲突风险

```
L223: Recovery already in progress, skipping
L342: Still in frozen state with interrupted tasks: DEVCLI, triggering recovery again
```

**分析**: 
- 心跳检测每5秒执行一次（L1间隔）
- 恢复流程可能耗时超过5秒，导致并发检测
- `Recovery already in progress`检查存在竞态条件

---

## 五、事故时间线（精确还原）

| 时间 | 事件 | 日志行号 |
|------|------|----------|
| 01:37:46 | 系统启动，心跳检测开始 | L4 |
| 01:37:48 | **首次检测到DEVCLI interrupted** | L109-111 |
| 01:37:48 | 触发frozen恢复流程 | L122-124 |
| 01:37:48 | 切换到DEVCLI任务 ✅ | L125-129 |
| 01:37:50 | 等待2秒后查找重试按钮 ❌ | L145-146 |
| 01:37:51 | 兜底策略：刷新页面（第1次重启） | L147-150 |
| 01:38:04 | **再次检测到DEVCLI interrupted** | L189-191 |
| 01:38:07 | 再次触发恢复 | L202-204 |
| 01:38:09 | 重试按钮仍未找到 ❌ | L209-210 |
| 01:38:10 | 再次刷新页面（第2次重启） | L214-215 |
| ... | 重复上述模式3次 | ... |
| 01:39:35 | 速率限制触发，刷新被阻塞 | L445 |
| 01:39:35 | **第6次尝试，重试按钮找到！** | L487 |
| 01:39:38 | **DEVCLI任务成功恢复** | L496 |
| 01:39:52 | 状态切换: frozen → normal | L498 |

**总计**: 6次恢复尝试，3次页面刷新，编辑器重启3次

---

## 六、修复建议

### 6.1 立即修复（紧急 - P0）

#### 修复1: 增加重试按钮轮询查找
```typescript
// recovery-executor.ts
private async clickRetryButtonWithRetry(maxAttempts = 5, interval = 1000): Promise<RetryResult> {
  for (let i = 0; i < maxAttempts; i++) {
    const result = await this.clickRetryButton();
    if (result.clicked) return result;
    await this.delay(interval);
  }
  return { clicked: false, method: 'not-found-after-retry' };
}
```

#### 修复2: 限制刷新页面次数
```typescript
// recovery-executor.ts
private refreshCount = 0;
private readonly MAX_REFRESH = 2;

if (this.refreshCount >= this.MAX_REFRESH) {
  debug('Max refresh reached, skipping refresh');
  return { success: false, reason: 'max-refresh-reached' };
}
```

#### 修复3: 修复互斥锁
```typescript
// recovery-executor.ts
private recoveryLock = false;

async executeRecovery(state: HealthState): Promise<void> {
  if (this.recoveryLock) {
    debug('Recovery already in progress, skipping');
    return;
  }
  this.recoveryLock = true;
  try {
    await this.doExecuteRecovery(state);
  } finally {
    this.recoveryLock = false;
  }
}
```

### 6.2 中期修复（高优先级 - P1）

1. **优化重试按钮检测逻辑**
   - 使用更可靠的选择器
   - 添加视觉验证（截图对比）

2. **改进恢复策略**
   - 刷新页面前先尝试其他恢复手段
   - 添加指数退避机制

3. **完善状态机**
   - 区分"新interrupted"和"持续interrupted"
   - 避免重复触发恢复

### 6.3 长期改进（技术债 - P2）

1. **统一恢复入口**
   - 合并 `wait-response.ts` 和 `recovery-executor.ts` 的恢复逻辑
   - 避免多处代码操作同一UI

2. **增强可观测性**
   - 每次恢复操作添加唯一追踪ID
   - 记录恢复前后的UI状态截图

---

## 七、责任认定

| 问题 | 责任方 | 说明 |
|------|--------|------|
| 重试按钮查找失败 | 开发实现 | 缺乏轮询机制和重试逻辑 |
| 兜底策略过于激进 | 架构设计 | 刷新页面没有次数限制 |
| 并发控制缺失 | 开发实现 | 缺乏有效的互斥锁机制 |
| 测试覆盖不足 | QA | 缺少长时间interrupted场景测试 |

---

## 八、附件

### 8.1 关键日志文件
- `terminal-20260430-093746.log` (完整日志，1108行)
- `terminal-20260429-202211.log` (历史日志)

### 8.2 相关代码文件
- `src/heartbeat/recovery-executor.ts`
- `src/heartbeat/layer1.ts`
- `src/heartbeat/detector.ts`

### 8.3 日志关键行引用
```
L109: 首次检测到interrupted
L146: 第1次重试按钮查找失败
L210: 第2次重试按钮查找失败
L445: 速率限制触发
L487: 第6次尝试成功
L496: 任务恢复成功
```

---

**报告人**: AI Assistant  
**审核状态**: 待专家评审  
**下一步**: 等待架构师评审并制定修复计划

---

## 九、修复验证清单

- [ ] 重试按钮轮询查找机制实现
- [ ] 刷新页面次数限制添加
- [ ] 互斥锁机制完善
- [ ] 集成测试通过
- [ ] 长时间interrupted场景测试通过
- [ ] 代码审查通过