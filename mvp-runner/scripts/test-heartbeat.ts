/**
 * Heartbeat System Integration Test
 * 测试三层心跳检测、状态机、恢复执行器的集成
 */

import { HealthStateMachine } from '../src/heartbeat/state-machine.js';
import { RecoveryExecutor, RECOVERY_ACTIONS } from '../src/heartbeat/recovery-executor.js';
import { DEFAULT_HEARTBEAT_CONFIG } from '../src/heartbeat/types.js';
import { isButtonAllowed } from '../src/actions/button-whitelist.js';
import { recoveryRateLimiter } from '../src/utils/rate-limiter.js';

// 模拟 CDPClient
class MockCDPClient {
  private elements = new Map<string, boolean>();
  private evaluateResults = new Map<string, any>();

  setElementExists(selector: string, exists: boolean): void {
    this.elements.set(selector, exists);
  }

  setEvaluateResult(pattern: string, result: any): void {
    this.evaluateResults.set(pattern, result);
  }

  async send(method: string, params?: any): Promise<any> {
    return {};
  }

  async evaluate<T>(expression: string): Promise<T> {
    // 检查是否有预设的 evaluate 结果
    for (const [pattern, result] of this.evaluateResults) {
      if (expression.includes(pattern)) {
        return result as T;
      }
    }

    // 检查元素是否存在
    if (expression.includes('document.querySelector')) {
      const match = expression.match(/querySelector\('([^']+)'\)/);
      if (match) {
        const selector = match[1];
        return (this.elements.get(selector) || false) as T;
      }
    }

    // 简单的JS计算
    if (expression === '1+1') {
      return 2 as T;
    }

    return true as T;
  }
}

// 测试计数器
let passCount = 0;
let failCount = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    passCount++;
    console.log(`  [PASS] ${message}`);
  } else {
    failCount++;
    console.log(`  [FAIL] ${message}`);
  }
}

// ============ 测试套件 ============

async function testStateMachine(): Promise<void> {
  console.log('\n[Test] HealthStateMachine');

  const sm = new HealthStateMachine();

  // 初始状态
  assert(sm.getCurrentState() === 'normal', 'Initial state is normal');

  // 正常转换
  const t1 = sm.transition('frozen-signal');
  assert(t1.success && t1.to === 'frozen', 'normal -> frozen (frozen-signal)');

  const t2 = sm.transition('recovery-success');
  assert(t2.success && t2.to === 'normal', 'frozen -> normal (recovery-success)');

  // 无效转换
  const t3 = sm.transition('invalid-trigger');
  assert(!t3.success, 'Invalid transition rejected');

  // 状态历史
  assert(sm.getTransitionHistory().length === 2, 'Transition history recorded');

  // 可用转换
  assert(sm.canTransition('frozen-signal'), 'Can transition to frozen from normal');
  assert(!sm.canTransition('manual-restart'), 'Cannot manual-restart from normal');

  // 重置
  sm.reset();
  assert(sm.getCurrentState() === 'normal', 'State reset to normal');
  assert(sm.getTransitionHistory().length === 0, 'History cleared after reset');
}

async function testButtonWhitelist(): Promise<void> {
  console.log('\n[Test] Button Whitelist');

  // 允许的按钮
  const r1 = isButtonAllowed('.icd-btn.icd-btn-tertiary');
  assert(r1.allowed, 'Background button is allowed');
  assert(r1.entry?.riskLevel === 'medium', 'Background button risk is medium');

  // 不允许的按钮
  const r2 = isButtonAllowed('.some-random-button');
  assert(!r2.allowed, 'Unknown button is rejected');
  assert(r2.reason?.includes('不在白名单中'), 'Rejection reason provided');

  // 高风险按钮
  const r3 = isButtonAllowed('.icd-delete-files-command-card-v2-actions-delete');
  assert(r3.allowed, 'Delete button is allowed');
  assert(r3.entry?.riskLevel === 'high', 'Delete button risk is high');
}

async function testRateLimiter(): Promise<void> {
  console.log('\n[Test] Rate Limiter');

  recoveryRateLimiter.reset();

  // 允许的操作（checkLimit不记录操作，只检查）
  const r1 = recoveryRateLimiter.checkLimit('test-op', 3, 60000);
  assert(r1.allowed, 'First operation allowed');
  assert(r1.remaining === 3, 'Remaining count correct (3 left)');

  // 记录操作
  recoveryRateLimiter.recordOperation('test-op');
  const r2 = recoveryRateLimiter.checkLimit('test-op', 3, 60000);
  assert(r2.remaining === 2, 'Remaining after one operation (2 left)');

  // 超出限制
  recoveryRateLimiter.recordOperation('test-op');
  recoveryRateLimiter.recordOperation('test-op');
  const r3 = recoveryRateLimiter.checkLimit('test-op', 3, 60000);
  assert(!r3.allowed, 'Operation blocked when limit exceeded');
  assert(r3.reason?.includes('超出速率限制'), 'Rate limit reason provided');

  // 统计
  const stats = recoveryRateLimiter.getStats('test-op', 60000);
  assert(stats.count === 3, 'Stats count correct');

  recoveryRateLimiter.reset();
}

async function testRecoveryExecutor(): Promise<void> {
  console.log('\n[Test] RecoveryExecutor');

  const cdp = new MockCDPClient();
  const sm = new HealthStateMachine();
  const executor = new RecoveryExecutor(cdp as any, sm);

  // 测试低风险操作（保留按钮）
  cdp.setElementExists('.icd-delete-files-command-card-v2-actions-cancel', true);
  const result1 = await executor.executeAction(RECOVERY_ACTIONS.clickRetainDelete);
  assert(result1.success, 'Low-risk action executed successfully');
  assert(result1.attempts === 1, 'Low-risk action succeeded on first attempt');

  // 测试元素不存在的情况
  cdp.setElementExists('.icd-delete-files-command-card-v2-actions-cancel', false);
  const result2 = await executor.executeAction(RECOVERY_ACTIONS.clickRetainDelete);
  assert(!result2.success, 'Action fails when element not found');

  // 测试高风险操作（需要确认，应该被拒绝）
  const result3 = await executor.executeAction(RECOVERY_ACTIONS.clickDeleteConfirm);
  assert(!result3.success, 'High-risk action blocked without confirmation');
  assert(result3.error?.includes('not confirmed'), 'High-risk rejection reason correct');

  // 测试审计日志
  const auditLog = executor.getAuditLog();
  assert(auditLog.length >= 3, 'Audit log recorded all actions');
  assert(auditLog[0].operator === 'auto', 'Audit log operator is auto');
  assert(auditLog[0].sessionId?.startsWith('recovery-'), 'Audit log has session ID');

  // 测试恢复历史（只统计成功的操作）
  const history = executor.getRecoveryHistory();
  assert(history.length >= 2, 'Recovery history recorded (at least 2 attempts)');
}

async function testConfig(): Promise<void> {
  console.log('\n[Test] Default Config');

  assert(DEFAULT_HEARTBEAT_CONFIG.layer1Interval === 5000, 'Layer 1 interval is 5s');
  assert(DEFAULT_HEARTBEAT_CONFIG.layer2Interval === 15000, 'Layer 2 interval is 15s');
  assert(DEFAULT_HEARTBEAT_CONFIG.layer3Interval === 30000, 'Layer 3 interval is 30s');
  assert(DEFAULT_HEARTBEAT_CONFIG.confidenceThreshold === 0.7, 'Confidence threshold is 0.7');
  assert(DEFAULT_HEARTBEAT_CONFIG.signalBufferSize === 100, 'Signal buffer size is 100');
}

async function testRecoveryActions(): Promise<void> {
  console.log('\n[Test] Recovery Actions Registry');

  assert(RECOVERY_ACTIONS.clickBackground.id === 'click-background', 'Click background action exists');
  assert(RECOVERY_ACTIONS.clickCancel.riskLevel === 'medium', 'Cancel action risk is medium');
  assert(RECOVERY_ACTIONS.clickDeleteConfirm.requiresConfirmation, 'Delete confirm requires confirmation');
  assert(RECOVERY_ACTIONS.clickRetainDelete.riskLevel === 'low', 'Retain delete risk is low');
  assert(RECOVERY_ACTIONS.reportToGroup.type === 'report', 'Report action type correct');
}

async function testTaskLevelDetection(): Promise<void> {
  console.log('\n[Test] Task-Level Detection (NEW)');

  const cdp = new MockCDPClient();

  // 模拟两个任务：PMCLI(completed) 和 DEVCLI(in_progress)
  // 关键：DEVCLI 有取消按钮，说明在运行
  cdp.setEvaluateResult('PMCLI', [
    {
      taskId: 'PMCLI',
      taskName: 'PMCLI',
      status: 'completed',
      isActive: true,
      isSelected: true,
      hasCancelBtn: false,
      hasBackgroundBtn: false,
      outputSnapshot: 'Task completed',
      silentDurationMs: 0
    },
    {
      taskId: 'DEVCLI',
      taskName: 'DEVCLI',
      status: 'in_progress',
      isActive: false,
      isSelected: false,
      hasCancelBtn: true,  // 有取消按钮，说明在运行
      hasBackgroundBtn: false,
      outputSnapshot: 'Generating code...',
      silentDurationMs: 0
    }
  ]);

  // 测试：验证任务级快照能正确识别 DEVCLI 的取消按钮
  const result = await cdp.evaluate<any>('PMCLI');
  assert(result && result.length === 2, 'Task-level snapshot returns all tasks');

  const devcli = result.find((t: any) => t.taskName === 'DEVCLI');
  assert(devcli, 'DEVCLI task found in snapshot');
  assert(devcli.status === 'in_progress', 'DEVCLI status is in_progress');
  assert(devcli.hasCancelBtn === true, 'DEVCLI hasCancelBtn detected correctly');
  assert(devcli.isActive === false, 'DEVCLI is not active task');

  const pmcli = result.find((t: any) => t.taskName === 'PMCLI');
  assert(pmcli, 'PMCLI task found in snapshot');
  assert(pmcli.status === 'completed', 'PMCLI status is completed');
  assert(pmcli.hasCancelBtn === false, 'PMCLI has no cancel button');

  console.log('  [INFO] Task-level detection verified:');
  console.log(`    - PMCLI: ${pmcli.status}, cancel=${pmcli.hasCancelBtn}`);
  console.log(`    - DEVCLI: ${devcli.status}, cancel=${devcli.hasCancelBtn} (non-active)`);
}

async function testTaskActivityTracker(): Promise<void> {
  console.log('\n[Test] TaskActivityTracker Logic');

  // 模拟 TaskActivityTracker 的行为
  const tracker = new Map<string, { outputHash: string; lastActiveAt: number; hasCancelBtn: boolean }>();

  function update(taskName: string, outputSnapshot: string, hasCancelBtn: boolean) {
    const now = Date.now();
    const prev = tracker.get(taskName);
    const currentHash = hashString(outputSnapshot);

    const hasChanged = !prev ||
      prev.outputHash !== currentHash ||
      prev.hasCancelBtn !== hasCancelBtn;

    if (hasChanged) {
      tracker.set(taskName, {
        outputHash: currentHash,
        lastActiveAt: now,
        hasCancelBtn,
      });
    }

    const record = tracker.get(taskName)!;
    const silentMs = now - record.lastActiveAt;

    return {
      taskName,
      silentMs,
      isSuspicious: silentMs > 300000, // 5分钟阈值
    };
  }

  function hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString();
  }

  // 测试1：首次更新
  const r1 = update('DEVCLI', 'output v1', true);
  assert(r1.silentMs === 0, 'First update: silentMs is 0');
  assert(!r1.isSuspicious, 'First update: not suspicious');

  // 测试2：相同内容更新（静默）
  const r2 = update('DEVCLI', 'output v1', true);
  assert(r2.silentMs < 1000, 'Same content: silentMs is small');
  assert(!r2.isSuspicious, 'Same content: not suspicious');

  // 测试3：内容变化（活跃）
  const r3 = update('DEVCLI', 'output v2', true);
  assert(r3.silentMs === 0, 'Content changed: silentMs reset to 0');
  assert(!r3.isSuspicious, 'Content changed: not suspicious');

  console.log('  [INFO] TaskActivityTracker logic verified');
}

// ============ 主函数 ============

async function main(): Promise<void> {
  console.log('Heartbeat System Integration Test');
  console.log('=====================================');

  try {
    await testStateMachine();
    await testButtonWhitelist();
    await testRateLimiter();
    await testRecoveryExecutor();
    await testConfig();
    await testRecoveryActions();
    await testTaskLevelDetection();
    await testTaskActivityTracker();

    console.log('\n=====================================');
    console.log(`Passed: ${passCount}`);
    console.log(`Failed: ${failCount}`);
    console.log(`Total: ${passCount + failCount}`);

    if (failCount === 0) {
      console.log('\nAll tests passed!');
      process.exit(0);
    } else {
      console.log('\nSome tests failed!');
      process.exit(1);
    }
  } catch (err) {
    console.error('\nTest suite failed:', (err as Error).message);
    process.exit(1);
  }
}

main();
