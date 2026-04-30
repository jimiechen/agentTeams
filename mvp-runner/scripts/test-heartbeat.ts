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

  setElementExists(selector: string, exists: boolean): void {
    this.elements.set(selector, exists);
  }

  async send(method: string, params?: any): Promise<any> {
    return {};
  }

  async evaluate<T>(expression: string): Promise<T> {
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
    console.log(`  ✅ ${message}`);
  } else {
    failCount++;
    console.log(`  ❌ ${message}`);
  }
}

// ============ 测试套件 ============

async function testStateMachine(): Promise<void> {
  console.log('\n📋 Testing HealthStateMachine');

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
  console.log('\n📋 Testing Button Whitelist');

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
  console.log('\n📋 Testing Rate Limiter');

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
  console.log('\n📋 Testing RecoveryExecutor');

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
  console.log('\n📋 Testing Default Config');

  assert(DEFAULT_HEARTBEAT_CONFIG.layer1Interval === 5000, 'Layer 1 interval is 5s');
  assert(DEFAULT_HEARTBEAT_CONFIG.layer2Interval === 15000, 'Layer 2 interval is 15s');
  assert(DEFAULT_HEARTBEAT_CONFIG.layer3Interval === 30000, 'Layer 3 interval is 30s');
  assert(DEFAULT_HEARTBEAT_CONFIG.confidenceThreshold === 0.7, 'Confidence threshold is 0.7');
  assert(DEFAULT_HEARTBEAT_CONFIG.signalBufferSize === 100, 'Signal buffer size is 100');
}

async function testRecoveryActions(): Promise<void> {
  console.log('\n📋 Testing Recovery Actions Registry');

  assert(RECOVERY_ACTIONS.clickBackground.id === 'click-background', 'Click background action exists');
  assert(RECOVERY_ACTIONS.clickCancel.riskLevel === 'medium', 'Cancel action risk is medium');
  assert(RECOVERY_ACTIONS.clickDeleteConfirm.requiresConfirmation, 'Delete confirm requires confirmation');
  assert(RECOVERY_ACTIONS.clickRetainDelete.riskLevel === 'low', 'Retain delete risk is low');
  assert(RECOVERY_ACTIONS.reportToGroup.type === 'report', 'Report action type correct');
}

// ============ 主函数 ============

async function main(): Promise<void> {
  console.log('🚀 Heartbeat System Integration Test');
  console.log('=====================================');

  try {
    await testStateMachine();
    await testButtonWhitelist();
    await testRateLimiter();
    await testRecoveryExecutor();
    await testConfig();
    await testRecoveryActions();

    console.log('\n=====================================');
    console.log(`✅ Passed: ${passCount}`);
    console.log(`❌ Failed: ${failCount}`);
    console.log(`📊 Total: ${passCount + failCount}`);

    if (failCount === 0) {
      console.log('\n🎉 All tests passed!');
      process.exit(0);
    } else {
      console.log('\n⚠️ Some tests failed!');
      process.exit(1);
    }
  } catch (err) {
    console.error('\n💥 Test suite failed:', (err as Error).message);
    process.exit(1);
  }
}

main();
