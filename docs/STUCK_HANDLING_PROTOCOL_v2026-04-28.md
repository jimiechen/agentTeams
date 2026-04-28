# 任务卡死处理协议 v2026-04-28

**协议版本**: v2.0  
**生效日期**: 2026年4月28日  
**制定依据**: `docs/TabAI会话_1777346912451.md`  
**实施状态**: ✅ 已完成代码实现并提交

---

## 一、协议目标

解决 Trae CDP 自动化任务执行中的三类卡死问题，实现：
- **识别率**: 95%+
- **自动恢复率**: 80%+
- **人工介入减少**: 70%

---

## 二、三类失败定义

### 类型A：终端长时间未响应

| 属性 | 描述 |
|------|------|
| **触发场景** | AI 调用 `run_command` 执行构建/测试/启动服务 |
| **UI表现** | 终端窗口显示执行中，无输出滚动，底部出现"后台运行/取消"按钮 |
| **DOM信号** | `.icd-btn.icd-btn-tertiary` 且 `textContent` 含"后台运行"或"取消" |
| **阈值** | 按钮出现后 > 5秒 |
| **恢复动作** | 点击"后台运行"（默认）或"取消" |
| **最大重试** | 2次 |

### 类型B：确认删除文件弹窗

| 属性 | 描述 |
|------|------|
| **触发场景** | AI 调用 `delete_file` 或覆盖已有文件 |
| **UI表现** | 弹出删除文件卡片："xxx 文件将被删除，是否继续？" |
| **DOM信号** | `.icd-delete-files-command-card-v2-actions-delete` 与 `cancel` 同时存在 |
| **阈值** | 弹窗出现后 > 3秒 |
| **恢复动作** | 点击"保留"（默认）或"删除" |
| **最大重试** | 3次 |

### 类型C：模型没响应

| 属性 | 描述 |
|------|------|
| **触发场景** | 大模型 API 抖动 / 网络问题 / Trae 内部排队 |
| **UI表现** | Chat区已开始流式输出但长时间不再新增token，侧边栏显示"进行中" |
| **DOM信号** | `.chat-input-v2-send-button` 下 `.codicon` 含 `stop`，且 `chat-turn` textContent 长时间无变化 |
| **阈值** | textLen 不变 > 30秒 |
| **恢复动作** | 点击停止按钮，重试1次 |
| **最大重试** | 1次（超过则报错） |

---

## 三、诊断优先级

```
删除弹窗（原子性）> 终端按钮（次原子）> 流式停滞（渐进）
```

**原因**:
1. 弹窗 DOM 出现是原子性的（有或无）
2. 终端按钮有毫秒级抖动窗口
3. 流式停滞需滑动窗口方差计算

---

## 四、5信号采集方案

每2秒执行一次 JS 采集：

```javascript
(() => ({
  // 信号1：按钮态
  btnIcon: document.querySelector('.chat-input-v2-send-button .codicon')?.className || '',
  btnDisabled: document.querySelector('.chat-input-v2-send-button')?.disabled || false,

  // 信号2：最后一个 chat-turn
  lastTurnTextLen: (document.querySelectorAll('.chat-turn')?.slice(-1)[0]?.textContent || '').length,

  // 信号3：终端超时按钮
  hasTerminalBtn: !!Array.from(document.querySelectorAll('.icd-btn.icd-btn-tertiary'))
    .find(b => /后台运行|取消/.test(b.textContent)),

  // 信号4：删除文件弹窗
  hasDeleteCard: !!document.querySelector('.icd-delete-files-command-card-v2-actions-delete'),

  // 信号5：侧边栏任务状态
  taskStatus: (() => {
    const active = document.querySelector('.index-module__task-item___zOpfg[class*="selected"]');
    const txt = active?.textContent || '';
    if (txt.includes('完成')) return 'completed';
    if (txt.includes('中断')) return 'interrupted';
    if (txt.includes('进行中')) return 'running';
    return 'unknown';
  })(),

  ts: Date.now(),
}))()
```

---

## 五、恢复动作实现

### 恢复路径A：终端卡死

```typescript
async function recoverTerminalHang(cdp, policy = 'background') {
  const selectorText = policy === 'background' ? '后台运行' : '取消';
  return await cdp.evaluate(`(() => {
    const buttons = document.querySelectorAll('.icd-btn.icd-btn-tertiary');
    const btn = Array.from(buttons).find(b => b.textContent.includes('${selectorText}'));
    if (btn && btn.offsetParent !== null) {
      btn.click();
      return { success: true, action: '${policy}' };
    }
    return { success: false, reason: 'button-not-visible' };
  })()`);
}
```

### 恢复路径B：删除弹窗

```typescript
async function recoverDeleteModal(cdp, policy = 'keep') {
  const selector = policy === 'delete'
    ? '.icd-delete-files-command-card-v2-actions-delete'
    : '.icd-delete-files-command-card-v2-actions-cancel';
  return await cdp.evaluate(`(() => {
    const btn = document.querySelector('${selector}');
    if (btn) {
      btn.click();
      return { success: true, action: '${policy}' };
    }
    return { success: false, reason: 'modal-not-found' };
  })()`);
}
```

### 恢复路径C：模型停滞

```typescript
async function recoverModelStalled(cdp) {
  const status = await cdp.evaluate(`(() => {
    const btn = document.querySelector('.chat-input-v2-send-button');
    const icon = btn?.querySelector('.codicon');
    return { 
      isStop: (icon?.className || '').match(/stop/i) ? true : false,
      found: !!btn,
    };
  })()`);
  
  if (!status.isStop) return { success: false, reason: 'not-in-stop-state' };

  await cdp.evaluate(`(() => {
    document.querySelector('.chat-input-v2-send-button').click();
    return true;
  })()`);
  
  return { success: true, action: 'stop' };
}
```

---

## 六、配置化策略

### PMCLI（偏保守）

```yaml
# workspaces/PMCLI/pmcli.policy.yaml
stuck_policies:
  terminal_hang:
    threshold_ms: 5000
    action: background
    max_recoveries: 2
  modal_blocking:
    threshold_ms: 3000
    delete_action: keep
    overwrite_action: keep
    max_recoveries: 3
  model_stalled:
    threshold_ms: 30000
    action: stop_and_retry
    max_retries: 1
```

### DEVCLI（偏激进）

```yaml
# workspaces/DEVCLI/devcli.policy.yaml
stuck_policies:
  terminal_hang:
    threshold_ms: 8000
    action: background
    max_recoveries: 3
  modal_blocking:
    threshold_ms: 3000
    delete_action: keep
    overwrite_action: confirm
    max_recoveries: 3
  model_stalled:
    threshold_ms: 45000
    action: stop_and_retry
    max_retries: 2
```

---

## 七、代码实现清单

| 文件 | 功能 | 状态 |
|------|------|------|
| `src/actions/state-probe.ts` | 5信号采集 | ✅ 已完成 |
| `src/actions/recover.ts` | 三类恢复动作 | ✅ 已完成 |
| `src/actions/wait-response.ts` | 集成到主循环 | ✅ 已完成 |

---

## 八、验证闭环

每个恢复动作后必须验证信号消失：

| 恢复类型 | 验证标准 | 失败处理 |
|---------|---------|---------|
| 终端卡死 | `hasTerminalBtn === false` | 重试或回退 |
| 删除弹窗 | `hasDeleteCard === false` | 人工介入 |
| 模型停滞 | `btnIcon` 从 `stop` 变 `ArrowUp` | 重试或报错 |

---

## 九、回退策略

| 场景 | 回退动作 |
|------|---------|
| 终端恢复失败 | 模拟 Ctrl+C（给 terminal textarea 发送 `modifiers:2 + KeyC`） |
| 弹窗恢复失败 | 人工介入（无自动回退） |
| 模型停滞恢复失败 | `Page.reload()`（极端情况） |

---

## 十、实施记录

| 时间 | 动作 | 结果 |
|------|------|------|
| 2026-04-28 09:00 | 代码评审 | ✅ 通过 |
| 2026-04-28 09:30 | 实现 state-probe.ts | ✅ 完成 |
| 2026-04-28 10:00 | 实现 recover.ts | ✅ 完成 |
| 2026-04-28 10:30 | 集成到 wait-response.ts | ✅ 完成 |
| 2026-04-28 11:00 | 提交代码 | ✅ `0ecf5cf` |

---

## 十一、预期收益

| 指标 | 当前 | 目标 | 提升 |
|------|------|------|------|
| 成功率 | 87% | 95%+ | +8% |
| 自动恢复率 | 0% | 80%+ | +80% |
| 人工介入 | 高 | 低 | -70% |
| 平均响应时间 | 27s | <30s | 稳定 |

---

## 十二、后续工作

### 4月29日计划

1. **上午（2小时）**
   - [ ] 部署新版本到测试环境
   - [ ] 模拟三类失败场景测试
   - [ ] 调整阈值参数

2. **下午（2小时）**
   - [ ] 生产环境灰度发布
   - [ ] 监控指标收集
   - [ ] 问题修复

### 待优化项

- [ ] 自适应阈值（根据历史响应时间动态调整）
- [ ] 指数退避重试机制
- [ ] 熔断机制（连续失败N次后暂停服务）
- [ ] 日志集中收集和分析

---

**协议制定**: PMCLI Runner  
**代码实现**: PMCLI Runner  
**审核签字**: 架构师（待）  
**生效日期**: 2026年4月28日

---

## 附件

1. 代码评审报告: `docs/CODE_REVIEW_STUCK_HANDLING_v2026-04-28.md`
2. 源方案文档: `docs/TabAI会话_1777346912451.md`
3. 执行报告: `docs/TASK_EXECUTION_REPORT_2026-04-28.md`
4. 代码提交: `0ecf5cf feat: 集成v2026-04-28方案，实现5信号采集和三类失败恢复`
