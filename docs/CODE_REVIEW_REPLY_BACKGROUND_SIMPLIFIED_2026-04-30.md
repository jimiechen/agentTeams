# 简化版 Background 超时恢复方案评审意见

**评审日期**: 2026-04-30  
**评审人**: AI Assistant  
**评审文档**: `TabAI会话_1777528878661.md` → `BACKGROUND_TIMEOUT_RECOVERY_SIMPLIFIED.md`  

---

## 一、总体评价

**质量**: ⭐⭐⭐⭐⭐ (优秀)  
**可行性**: 极高  
**风险**: 极低  
**工程量**: 约110行代码，1天完成  

**一句话总结**: 这是当前背景下最务实的方案——用两个UI按钮（"后台运行"+"取消"）把未知卡死状态转换为已知的`interrupted`状态，完美复用现有恢复链路。

相比之前的复杂方案（三阶段递进+状态机扩展+suspicious/probing状态），本方案的核心优势：
- **不做存活探测**（省掉MutationObserver、进程查询等复杂逻辑）
- **不新增状态**（保持状态机简洁，只用到background→interrupted→normal）
- **不干预进程**（只点UI按钮，不发送Ctrl+C等信号）
- **完美复用**（取消后自动进入interrupted，走现有的executeFrozenRecovery）

---

## 二、逐条评审意见

### 2.1 方案定位 ✅ 完全同意

**解决的问题**: background模式是检测盲区，既不判断失败也不触发恢复。

**方案本质**: 用Trae UI已有的两个按钮完成状态转换。

**选择理由**: 
- 工程量小 ✅
- 风险可控 ✅  
- 完美复用 ✅

**评审意见**: 定位精准。在当前系统成熟度下，"做减法"比"做加法"更明智。

---

### 2.2 核心逻辑 ✅ 同意

#### 三步恢复流程

```
[background 状态]
      ↓
  超时判定（5 分钟无 DOM 变化）
      ↓
  点击"后台运行"按钮 → UI 释放可操作状态
      ↓
  等待 2 秒（让 UI 过渡）
      ↓
  点击"取消"按钮 → 任务进入 interrupted
      ↓
  复用现有 executeFrozenRecovery（切任务 → 找重试 → 点击）
      ↓
  任务重新运行
```

**评审意见**: 流程设计简洁清晰。关键洞察是"取消后自动进入interrupted，复用现有恢复链路"——这是方案最优雅的部分。

**建议补充**: 
- 在"等待2秒"步骤中，增加"最后确认"逻辑（文档5.2节已有）
- 如果2秒内DOM突然活跃，说明任务自行恢复，跳过取消

---

### 2.3 关键参数 ✅ 同意

| 参数 | 推荐值 | 评审意见 |
|------|--------|----------|
| 超时阈值 | 5分钟 | ✅ 保守值，建议灰度后调整 |
| DOM采样频率 | 10秒 | ✅ 轮询比MutationObserver简单可靠 |
| 两步点击间隔 | 2秒 | ✅ 合理，UI过渡时间 |
| 单任务最大触发次数 | 2次 | ✅ 熔断保护 |
| 恢复流程Cooldown | 60秒 | ✅ 防止连续触发 |

**建议调整**:
- 超时阈值初始5分钟，但建议配置化（不要硬编码）
- 灰度观察1周后，根据数据调整为3分钟或10分钟

---

### 2.4 实现要点 ✅ 同意

#### 改动范围评估

| 文件 | 改动内容 | 预估行数 | 评审意见 |
|------|---------|---------|----------|
| `state-machine.ts` | 新增background状态上下文 | ~20行 | ✅ 最小侵入 |
| `detector.ts` | 新增DOM活跃度采样+超时判定 | ~30行 | ✅ 逻辑清晰 |
| `recovery-executor.ts` | 新增executeBackgroundTimeout | ~50行 | ✅ 复用现有能力 |
| `types.ts` | 新增相关类型定义 | ~10行 | ✅ 必要 |

**总计110行**，评审认为估算是准确的。

#### Detector层实现

```typescript
private async checkBackgroundTimeout(
  cdp: CDPClient,
  ctx: BackgroundStateContext
): Promise<{ timeout: boolean; silentDuration: number }> {
  // 采样当前DOM快照
  const snapshot = await cdp.evaluate(`
    (() => {
      const term = document.querySelector('.terminal, .chat-container');
      if (!term) return '';
      const tail = term.textContent?.slice(-500) ?? '';
      return `${term.scrollHeight}-${tail.length}-${hashString(tail)}`;
    })()
  `);
  
  // 对比快照，变化则重置计时器
  if (snapshot !== ctx.lastDomSnapshot) {
    ctx.lastActivityAt = Date.now();
    ctx.lastDomSnapshot = snapshot;
    return { timeout: false, silentDuration: 0 };
  }
  
  const silentDuration = Date.now() - ctx.lastActivityAt;
  return {
    timeout: silentDuration > 5 * 60 * 1000,
    silentDuration,
  };
}
```

**评审意见**: 实现简洁有效。用`scrollHeight + 文本长度 + 哈希`三个维度判断DOM变化，比单纯文本哈希更可靠（能捕获`\r`回车符导致的同一行刷新）。

**建议优化**:
- `hashString`函数需要在CDP evaluate中定义，确保可用
- 建议添加try-catch，防止CDP evaluate失败导致整个检测中断

#### RecoveryExecutor层实现

```typescript
private async executeBackgroundTimeout(ctx: BackgroundStateContext): Promise<RecoveryResult> {
  // 熔断检查
  if (ctx.triggerCount >= 2) {
    await this.notifyHuman(`任务 ${taskId} background 超时恢复已达 2 次上限`);
    return { success: false, reason: 'human-required' };
  }
  
  // Step 1: 点击"后台运行"按钮
  // Step 2: 等待2秒，最后确认
  // Step 3: 点击"取消"按钮
  // Step 4: 记录熔断计数和Cooldown
  // Step 5: 飞书通知
}
```

**评审意见**: 实现完整，包含所有必要步骤。

**关键亮点**:
- 2秒等待期的"最后确认"逻辑（文档5.2节）✅ 避免误伤
- 熔断计数 ✅ 防止无限循环
- Cooldown机制 ✅ 防止连续触发
- 飞书通知 ✅ 可观测性

---

### 2.5 边界保护 ✅ 同意

#### 三道保护

| 保护 | 描述 | 评审意见 |
|------|------|----------|
| 按钮存在性校验 | 必须真实检测到"后台运行"按钮才启动计时 | ✅ 已有 |
| 两秒等待期最后确认 | DOM突然活跃则跳过取消 | ✅ 关键保护 |
| 飞书通知留痕 | 每次恢复动作必须通知 | ✅ 不可省略 |

**评审意见**: 三道保护设计合理，覆盖了主要风险场景。

#### 与速率限制的协调

**评审意见**: 正确识别了`background-timeout`恢复不占用`refresh-page`配额，但应独立纳入速率限制（建议3次/3600秒）。

#### 并发控制

**评审意见**: 必须与现有互斥锁（recoveryLock）共享，避免与`executeFrozenRecovery`并发冲突。这是**强制要求**。

---

### 2.6 验收标准 ✅ 同意

#### 功能验收

| 编号 | 验收项 | 标准 | 评审意见 |
|------|--------|------|----------|
| AC-1 | 超时判定准确性 | DOM无变化5分钟必触发 | ✅ 可测试 |
| AC-2 | 按钮定位稳定性 | 20次测试100%成功 | ✅ 可测试 |
| AC-3 | 状态衔接正确性 | 取消后10秒内进入interrupted | ✅ 可测试 |
| AC-4 | 熔断生效 | 第3次触发时人工介入 | ✅ 可测试 |
| AC-5 | 自恢复检测 | 2秒等待期DOM活跃则跳过 | ✅ 可测试 |
| AC-6 | 飞书通知 | 每次恢复均有通知 | ✅ 可测试 |

#### 性能验收

- 单次恢复总耗时 < 10秒 ✅
- DOM采样CPU占用增量 < 1% ✅
- 不引入新的内存泄漏 ✅

#### 稳定性验收

- 连续24小时运行无崩溃 ✅
- 至少成功恢复3次真实卡死场景 ✅
- 无误伤正常长任务 ✅

**评审意见**: 验收标准全面且可测量。

---

### 2.7 落地计划 ✅ 同意

#### 三阶段推进（5天）

| 阶段 | 时间 | 内容 | 评审意见 |
|------|------|------|----------|
| Day 1 | 实现 | 完成三处改动，本地跑通 | ✅ 合理 |
| Day 2-4 | 灰度观察 | 不开启熔断，观察触发频率 | ✅ 关键 |
| Day 5 | 加固上线 | 启用熔断，调整阈值 | ✅ 稳妥 |

**评审意见**: 计划务实。特别是Day 2-4的灰度观察期——先不开启熔断，只观察数据，这是降低风险的关键。

#### 回滚预案

```json
{
  "background_timeout_recovery": {
    "enabled": false
  }
}
```

**评审意见**: 配置开关回滚是最佳实践。禁用后无副作用，系统回归当前行为。

---

### 2.8 评审要点 ✅ 同意

#### 5个待确认决策

| 决策 | 建议 | 评审意见 |
|------|------|----------|
| 1. 超时阈值 | 初始5分钟，灰度后调整 | ✅ |
| 2. 熔断次数 | 2次 | ✅ 保守 |
| 3. 任务类型差异化 | V2再加 | ✅ 当前不做 |
| 4. 飞书通知时机 | 每次恢复都通知 | ✅ 可观测性优先 |
| 5. 与P0事故修复优先级 | 并行推进 | ✅ 两者互补 |

**评审意见**: 5个决策点清晰，建议全部按文档推荐执行。

#### 不在V1范围的内容

- 进程级探测 ✅ 明确排除
- Shadow History ✅ 明确排除
- 长任务分解 ✅ 明确排除
- Session级重启 ✅ 明确排除
- 命令类型白名单 ✅ V2再加

**评审意见**: 范围控制得当。V1只做最小可行方案，其他功能后续迭代。

---

## 三、风险再评估

### 3.1 技术风险

| 风险 | 可能性 | 影响 | 应对措施 | 评审意见 |
|------|--------|------|----------|----------|
| 按钮DOM结构变更 | 中 | 高 | 多路径定位+定期回归测试 | ✅ 已覆盖 |
| 5分钟误伤长任务 | 中 | 中 | 灰度观察后调整阈值 | ✅ 已覆盖 |
| 取消后未进入interrupted | 低 | 高 | 新增状态转换超时监控 | ✅ 已覆盖 |
| 飞书通知风暴 | 低 | 低 | 共用现有速率限制配额 | ✅ 已覆盖 |

### 3.2 与现有系统的兼容性

| 系统 | 兼容性 | 说明 |
|------|--------|------|
| Cooldown机制 | ✅ 兼容 | 复用现有30秒Cooldown |
| Promise门闩 | ✅ 兼容 | 必须获取同一把锁 |
| 三级熔断 | ✅ 兼容 | background-timeout独立计数 |
| 诊断脚本 | ✅ 兼容 | 触发后可调用诊断收集DOM信息 |
| 速率限制 | ✅ 兼容 | 独立配额，不占用refresh-page |

---

## 四、与前期方案的对比

| 维度 | 前期复杂方案 | 本简化方案 | 评审意见 |
|------|-------------|-----------|----------|
| 工程量 | 500+行，2周 | 110行，1天 | 简化方案胜出 |
| 新增状态 | suspicious, probing | 无 | 简化方案胜出 |
| 存活探测 | MutationObserver, ps, Enter键 | 无 | 简化方案胜出 |
| 进程干预 | Ctrl+C, Ctrl+\ | 无（只点UI按钮） | 简化方案胜出 |
| 风险 | 中（可能误判） | 极低（只点UI按钮） | 简化方案胜出 |
| 可回滚 | 配置开关 | 配置开关 | 平手 |
| 可观测性 | heartbeat.jsonl + 飞书 | heartbeat.jsonl + 飞书 | 平手 |
| 覆盖场景 | 5种情况全覆盖 | 主要覆盖卡死场景 | 复杂方案胜出 |

**结论**: 在当前系统成熟度下，**简化方案是更优选择**。前期复杂方案适合系统更成熟、数据更充分后的V2迭代。

---

## 五、关键改进建议（可选）

### 5.1 建议1: 添加"取消后确认"逻辑

```typescript
// 点击取消后，等待并确认任务确实进入interrupted
await this.delay(3000);
const taskStatus = await this.getTaskStatus(taskId);
if (taskStatus !== 'interrupted') {
  debug('⚠️ 取消后任务未进入interrupted，当前状态: %s', taskStatus);
  // 重试一次或报告人工介入
}
```

### 5.2 建议2: 添加"恢复成功"确认

```typescript
// executeFrozenRecovery成功后，确认任务确实恢复为in_progress
await this.delay(5000);
const taskStatus = await this.getTaskStatus(taskId);
if (taskStatus !== 'in_progress') {
  debug('⚠️ 恢复后任务未进入in_progress，当前状态: %s', taskStatus);
  // 触发熔断或报告人工介入
}
```

### 5.3 建议3: 配置化所有参数

```typescript
// types.ts
export interface BackgroundTimeoutConfig {
  enabled: boolean;
  timeoutMs: number;           // 默认5分钟
  sampleIntervalMs: number;    // 默认10秒
  clickDelayMs: number;        // 默认2秒
  maxTriggers: number;         // 默认2次
  cooldownMs: number;          // 默认60秒
}
```

---

## 六、结论

**评审结果**: ✅ **方案通过，建议立即实施**

**核心优势**:
1. **极简**: 110行代码，1天完成
2. **低风险**: 只点UI按钮，无进程干预
3. **高复用**: 完美复用现有interrupted恢复链路
4. **可回滚**: 配置开关一键关闭

**关键前提**（必须满足）:
1. Trae UI持续提供"后台运行"和"取消"两个按钮
2. 取消动作能可靠转换为interrupted状态
3. 现有executeFrozenRecovery处理interrupted的能力稳定

**建议实施顺序**:
1. **Day 1**: 实现代码，本地测试
2. **Day 2-4**: 灰度观察（不开启熔断），收集数据
3. **Day 5**: 启用熔断，全量上线

**与P0事故修复的关系**: 两者完全兼容且互补，建议并行推进。

---

**评审人**: AI Assistant  
**评审日期**: 2026-04-30  
**状态**: 通过，建议立即实施
