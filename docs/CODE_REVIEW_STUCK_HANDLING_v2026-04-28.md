# 代码评审报告 - 任务卡死处理方案 (v2026-04-28)

**评审日期**: 2026年4月28日  
**评审对象**: `docs/TabAI会话_1777346912451.md` - 三类失败处理协议  
**评审人**: PMCLI Runner  
**状态**: ✅ 评审通过，建议采纳并实施

---

## 一、方案概述

该文档提供了基于 Trae CDP 自动化脚本的三类失败精确识别与恢复方案：

| 失败类型 | 触发场景 | 识别信号 | 恢复动作 |
|---------|---------|---------|---------|
| **终端长时间未响应** | 执行构建/测试/启动服务 | `.icd-btn.icd-btn-tertiary` 含"后台运行/取消" | 点击后台运行或取消 |
| **确认删除文件弹窗** | 删除或覆盖已有文件 | `.icd-delete-files-command-card-v2-actions-delete/cancel` | 点击保留或删除 |
| **模型没响应** | API抖动/网络问题/排队 | `.chat-input-v2-send-button` 下 `.codicon` 含 `stop` | 点击停止按钮 |

---

## 二、评审意见

### ✅ 优点

#### 1. 选择器精确锁版
- 所有选择器来自已验证的脚本，非推测
- 包含完整的 class 链和文本匹配规则
- 考虑了按钮的 `disabled` 和 `visible` 状态

#### 2. 诊断优先级合理
```
删除弹窗（原子性）> 终端按钮（次原子）> 流式停滞（渐进）
```
- 弹窗判定无过渡态，最可靠
- 终端按钮有毫秒级抖动，次之
- 流式停滞需滑动窗口方差计算，最复杂

#### 3. 信号采集高效
- 5个信号一次性采集（单条 JS）
- 每2秒一次心跳，性能开销低
- 信号间无依赖，可独立判定

#### 4. 恢复动作可验证
- 每个恢复动作后有明确的成功判定标准
- 信号消失才算成功，形成闭环
- 失败后有回退策略（Ctrl+C / Page.reload）

#### 5. 配置化策略按Bot隔离
- PMCLI 偏保守（不删文件、终端后台运行）
- DEVCLI 偏激进（允许覆盖、阈值放宽）
- 策略与代码分离，便于调整

### ⚠️ 建议改进

#### 1. 阈值配置需根据实际情况调整
```yaml
# 建议增加自适应阈值
model_stalled:
  threshold_ms: 30000  # 固定值
  # 改为：
  min_threshold_ms: 15000  # 最短等待
  max_threshold_ms: 60000  # 最长等待
  adaptive: true  # 根据历史响应时间自适应
```

#### 2. 重试机制需增加指数退避
```javascript
// 当前：固定重试
max_retries: 1

// 建议：指数退避
retry_policy:
  max_retries: 3
  base_delay_ms: 1000
  max_delay_ms: 30000
  backoff: exponential  # 1s, 2s, 4s...
```

#### 3. 建议增加熔断机制
- 连续失败 N 次后，自动暂停服务
- 通知运维人员介入
- 避免无效重试消耗资源

#### 4. 日志埋点需增加上下文
```javascript
// 当前：
logMetric({ stuck_kind: 'modal-blocking', ...r })

// 建议增加：
logMetric({
  stuck_kind: 'modal-blocking',
  task_name: 'PMCLI',
  slot: 0,
  prompt_length: 100,
  elapsed_ms: 35000,
  recovery_action: 'keep',
  success: true,
  timestamp: Date.now()
})
```

---

## 三、实施计划

### 第一阶段：信号采集（30分钟）
- [ ] 创建 `src/actions/state-probe.ts`
- [ ] 实现 `captureSnapshot()` 函数
- [ ] 测试5个信号的准确性

### 第二阶段：恢复动作（45分钟）
- [ ] 创建 `src/actions/recover.ts`
- [ ] 实现三个恢复函数
- [ ] 每个函数带恢复后验证

### 第三阶段：集成到主循环（1小时）
- [ ] 修改 `wait-response.ts`
- [ ] 增加诊断与分派逻辑
- [ ] 配置化策略加载

### 第四阶段：测试验证（30分钟）
- [ ] 模拟三类失败场景
- [ ] 验证恢复成功率
- [ ] 调整阈值参数

---

## 四、当前实现对比

### 当前实现（简化版）
```typescript
// 仅检测任务状态（侧边栏）
const status = await checkTaskStatus(cdp, taskName);
if (status.status === 'completed') break;
```

### 建议实现（完整版）
```typescript
// 采集5个信号
const snap = await captureSnapshot(cdp);

// 优先级判定
if (snap.hasDeleteCard) {
  await recoverDeleteModal(cdp, policy);
} else if (snap.hasTerminalBtn) {
  await recoverTerminalHang(cdp, policy);
} else if (isModelStalled(window)) {
  await recoverModelStalled(cdp);
}
```

---

## 五、风险评估

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| 选择器失效 | 低 | 高 | 定期验证选择器，增加 fallback |
| 误判正常执行为卡死 | 中 | 中 | 增加滑动窗口方差判定，阈值可调 |
| 恢复动作失败 | 低 | 高 | 增加回退策略（Ctrl+C / reload） |
| 配置冲突 | 低 | 低 | 配置校验，启动时检查 |

---

## 六、结论

### 评审结果：✅ 通过

该方案技术可行，设计合理，与现有系统兼容性良好。建议立即实施。

### 预期收益
- 成功率从 87% 提升到 95%+
- 自动恢复率 80%+
- 人工介入减少 70%

### 实施优先级
**P0** - 4月29日上午完成集成，下午测试验证

---

**评审完成时间**: 2026-04-28 10:00  
**实施负责人**: PMCLI Runner  
**复核人**: 架构师（待签字）
