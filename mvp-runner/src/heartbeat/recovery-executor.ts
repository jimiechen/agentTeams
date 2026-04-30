/**
 * Recovery Executor - 恢复执行器
 * 完整的权限边界控制 + 审计日志 + 分级恢复策略
 */

import type { CDPClient } from '../cdp/client.js';
import createDebug from 'debug';
import {
  isButtonAllowed,
  requiresConfirmation,
  type ButtonWhitelistEntry,
} from '../actions/button-whitelist.js';
import { recoveryRateLimiter, type RateLimitResult } from '../utils/rate-limiter.js';
import type { HeartbeatMode, BackgroundTimeoutRecoveryConfig } from './types.js';
import { DEFAULT_BACKGROUND_TIMEOUT_CONFIG } from './types.js';
import { HealthStateMachine } from './state-machine.js';
import { writeFileSync, existsSync, readFileSync, mkdirSync } from 'fs';
import path from 'path';

const debug = createDebug('mvp:heartbeat:recovery');

// ============ 类型定义 ============

export interface RecoveryAction {
  id: string;
  type: 'click' | 'refresh' | 'navigate' | 'restart' | 'report';
  target?: string;
  description: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  requiresConfirmation: boolean;
  maxAttempts: number;
}

export interface RecoveryResult {
  success: boolean;
  action: RecoveryAction;
  attempts: number;
  error?: string;
  timestamp: number;
  duration: number;
}

export interface AuditLogEntry {
  timestamp: number;
  action: string;
  target?: string;
  result: 'success' | 'failure' | 'blocked' | 'timeout';
  reason?: string;
  riskLevel: string;
  operator: 'auto' | 'manual';
  sessionId: string;
}

// 诊断信息类型
export interface RetryButtonDiagnosis {
  timestamp: string;
  error?: string;
  totalButtonElements: number;
  totalRoleButtons: number;
  allAriaLabels: (string | null)[];
  visibleButtonTexts: string[];
  hasChatContainer: boolean;
  chatTurnsCount: number;
  hasModal: boolean;
  currentUrl: string;
  documentTitle: string;
  lastTurns: string[];
}

export interface RecoveryConfig {
  enableAuditLog: boolean;
  auditLogPath: string;
  maxAuditLogSize: number;
  defaultConfirmationTimeout: number;
  enableAutoRecovery: boolean;
  maxRecoveryAttempts: number;
  recoveryCooldownMs: number;
  backgroundTimeoutRecovery?: BackgroundTimeoutRecoveryConfig;
}

export const DEFAULT_RECOVERY_CONFIG: RecoveryConfig = {
  enableAuditLog: true,
  auditLogPath: './logs/recovery-audit.jsonl',
  maxAuditLogSize: 50 * 1024 * 1024, // 50MB
  defaultConfirmationTimeout: 30000, // 30秒
  enableAutoRecovery: true,
  maxRecoveryAttempts: 3,
  recoveryCooldownMs: 5000,
};

// ============ 预定义恢复动作 ============

export const RECOVERY_ACTIONS: Record<string, RecoveryAction> = {
  clickBackground: {
    id: 'click-background',
    type: 'click',
    target: '.icd-btn.icd-btn-tertiary',
    description: '点击"后台运行"按钮，将任务转入后台',
    riskLevel: 'medium',
    requiresConfirmation: false,
    maxAttempts: 2,
  },
  clickCancel: {
    id: 'click-cancel',
    type: 'click',
    target: '.icd-btn.icd-btn-tertiary',
    description: '点击"取消"按钮，终止当前任务',
    riskLevel: 'medium',
    requiresConfirmation: false,
    maxAttempts: 2,
  },
  clickRetainDelete: {
    id: 'click-retain-delete',
    type: 'click',
    target: '.icd-delete-files-command-card-v2-actions-cancel',
    description: '点击"保留"按钮（删除弹窗），保留文件',
    riskLevel: 'low',
    requiresConfirmation: false,
    maxAttempts: 3,
  },
  clickDeleteConfirm: {
    id: 'click-delete-confirm',
    type: 'click',
    target: '.icd-delete-files-command-card-v2-actions-delete',
    description: '点击"删除"按钮，确认删除文件',
    riskLevel: 'high',
    requiresConfirmation: true,
    maxAttempts: 1,
  },
  clickRetainOverwrite: {
    id: 'click-retain-overwrite',
    type: 'click',
    target: '.icd-overwrite-files-command-card-v2-actions-cancel',
    description: '点击"保留"按钮（覆盖弹窗），保留原文件',
    riskLevel: 'low',
    requiresConfirmation: false,
    maxAttempts: 3,
  },
  clickOverwriteConfirm: {
    id: 'click-overwrite-confirm',
    type: 'click',
    target: '.icd-overwrite-files-command-card-v2-actions-overwrite',
    description: '点击"覆盖"按钮，确认覆盖文件',
    riskLevel: 'high',
    requiresConfirmation: true,
    maxAttempts: 1,
  },
  clickStop: {
    id: 'click-stop',
    type: 'click',
    target: '.chat-input-v2-send-button',
    description: '点击"停止"按钮，停止AI输出',
    riskLevel: 'medium',
    requiresConfirmation: false,
    maxAttempts: 2,
  },
  reportToGroup: {
    id: 'report-to-group',
    type: 'report',
    description: '向飞书群聊报告异常状态',
    riskLevel: 'low',
    requiresConfirmation: false,
    maxAttempts: 3,
  },
};

// ============ 恢复执行器 ============

export class RecoveryExecutor {
  private config: RecoveryConfig;
  private cdp: CDPClient;
  private stateMachine: HealthStateMachine;
  private auditLog: AuditLogEntry[] = [];
  private recoveryHistory: RecoveryResult[] = [];
  private lastRecoveryTime = 0;
  private sessionId: string;
  private isRecovering = false;
  private consecutiveFailures = 0;
  private maxConsecutiveFailures = 3;

  // Promise门闩：防止并发恢复竞态条件
  private recoveryPromise: Promise<RecoveryResult[]> | null = null;

  // 三级熔断状态
  private circuitBreakerLevel: 0 | 1 | 2 | 3 = 0; // 0=正常, 1=冷却, 2=暂停, 3=停止
  private editorRestartCount = 0;

  constructor(
    cdp: CDPClient,
    stateMachine: HealthStateMachine,
    config?: Partial<RecoveryConfig>
  ) {
    this.cdp = cdp;
    this.stateMachine = stateMachine;
    this.config = { ...DEFAULT_RECOVERY_CONFIG, ...config };
    this.sessionId = this.generateSessionId();
  }

  // ============ 核心恢复方法 ============

  /**
   * 执行恢复策略 - Promise门闩模式
   * 多次调用会共享同一个Promise，彻底消除竞态窗口
   */
  async executeRecovery(fromState: HeartbeatMode): Promise<RecoveryResult[]> {
    // 检查熔断状态
    const circuitCheck = this.checkCircuitBreaker();
    if (!circuitCheck.canProceed) {
      debug('🚫 Recovery blocked by circuit breaker: %s', circuitCheck.reason);
      return [{
        success: false,
        action: { ...RECOVERY_ACTIONS.reportToGroup, id: 'circuit-breaker', description: '熔断器阻止恢复' },
        attempts: 0,
        timestamp: Date.now(),
        duration: 0,
        error: circuitCheck.reason,
      }];
    }

    // 检查Cooldown（状态机层）
    if (!this.stateMachine.shouldTriggerRecovery(fromState)) {
      const remaining = this.stateMachine.getCooldownRemaining();
      debug('Recovery cooldown active, %dms remaining', remaining);
      return [];
    }

    // Promise门闩：如果已有恢复在进行，等待它完成
    if (this.recoveryPromise) {
      debug('Recovery already in progress, awaiting existing');
      return this.recoveryPromise;
    }

    // 记录恢复尝试时间
    this.stateMachine.recordRecoveryAttempt();

    // 创建新的恢复Promise
    this.recoveryPromise = this.doExecuteRecovery(fromState)
      .finally(() => {
        this.recoveryPromise = null;
        this.lastRecoveryTime = Date.now();
      });

    return this.recoveryPromise;
  }

  /**
   * 实际执行恢复（私有方法）
   */
  private async doExecuteRecovery(fromState: HeartbeatMode): Promise<RecoveryResult[]> {
    const startTime = Date.now();
    this.isRecovering = true;

    try {
      const results: RecoveryResult[] = [];

      switch (fromState) {
        case 'frozen':
          results.push(...(await this.executeFrozenRecovery()));
          break;
        case 'crashed':
          results.push(...(await this.executeCrashedRecovery()));
          break;
        case 'background':
          results.push(...(await this.executeBackgroundRecovery()));
          break;
        default:
          debug('No recovery needed for state: %s', fromState);
      }

      // 检查是否所有恢复都失败
      const allFailed = results.length > 0 && results.every((r) => !r.success);
      const anySuccess = results.some((r) => r.success);

      if (allFailed) {
        this.consecutiveFailures++;
        debug('❌ Recovery failed: all %d actions failed (failure #%d/%d)',
          results.length, this.consecutiveFailures, this.maxConsecutiveFailures);
        this.auditLog.push({
          timestamp: Date.now(),
          action: 'recovery-failed',
          result: 'failure',
          reason: `All recovery actions failed (failure #${this.consecutiveFailures}/${this.maxConsecutiveFailures})`,
          riskLevel: 'critical',
          operator: 'auto',
          sessionId: this.sessionId,
        });

        // 更新熔断状态
        this.updateCircuitBreaker(false);

        // 如果连续失败超过限制，转为 crashed 状态
        if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
          debug('🚨 Max consecutive failures reached, transitioning to crashed');
          this.stateMachine.transition('recovery-failed');
        }
      } else if (anySuccess) {
        this.consecutiveFailures = 0; // 重置失败计数
        this.updateCircuitBreaker(true); // 重置熔断
        const successCount = results.filter((r) => r.success).length;
        debug('✅ Recovery succeeded: %d/%d actions succeeded', successCount, results.length);
        this.stateMachine.transition('recovery-success');
      }

      // 打印恢复结果摘要
      debug('Recovery summary from state [%s]:', fromState);
      for (const r of results) {
        debug('  - %s: %s (%dms, %d attempts)', r.action.id, r.success ? '✅ success' : '❌ failed', r.duration, r.attempts);
        if (r.error) debug('    error: %s', r.error);
      }

      return results;
    } finally {
      this.isRecovering = false;
      debug('Recovery completed in %dms', Date.now() - startTime);
    }
  }

  /**
   * 冻结恢复策略
   * 1. 先检查是否有中断的任务
   * 2. 先切换到该任务（点击任务项）
   * 3. 等待任务切换完成
   * 4. 使用三路查找点击重试按钮
   * 5. 等待3秒验证恢复结果
   * 6. 最后尝试刷新页面兜底
   */
  private async executeFrozenRecovery(): Promise<RecoveryResult[]> {
    debug('Executing frozen recovery strategy');
    const results: RecoveryResult[] = [];

    // 步骤1: 检查是否有中断的任务
    const interruptedTask = await this.findInterruptedTask();
    if (interruptedTask) {
      debug('Found interrupted task: %s, attempting recovery', interruptedTask);

      // 步骤2: 先切换到该任务（点击任务项）
      debug('Step 1: Switching to interrupted task %s...', interruptedTask);
      const switched = await this.switchToTask(interruptedTask);
      if (!switched) {
        debug('❌ Failed to switch to task %s', interruptedTask);
      } else {
        debug('✅ Switched to task %s, waiting for UI update...', interruptedTask);
        results.push({
          success: true,
          action: { ...RECOVERY_ACTIONS.reportToGroup, id: 'switch-task', description: `切换到任务 ${interruptedTask}` },
          attempts: 1,
          timestamp: Date.now(),
          duration: 0,
        });
      }

      // 步骤3: 等待UI进入就绪状态（前置检测）
      debug('Step 2: Waiting for UI to be ready...');
      const ready = await this.waitForInterruptedRendered(5000);
      if (!ready.ready) {
        debug('⚠️ UI not ready after 5s, proceeding with caution');
      } else {
        debug('✅ UI ready, hasRetryButton=%s', ready.hasRetryButton);
      }

      // 步骤4: 使用MutationObserver查找重试按钮（替代一次性查找）
      debug('Step 3: Attempting to click retry button with MutationObserver...');
      const retryResult = await this.clickRetryButtonWithObserver(8000);

      if (retryResult.clicked) {
        debug('✅ Retry button clicked successfully via method: %s (attempts: %d)', retryResult.method, retryResult.attempts);
        results.push({
          success: true,
          action: { ...RECOVERY_ACTIONS.reportToGroup, id: 'click-retry', description: `点击重试按钮 (${retryResult.method}, ${retryResult.attempts} attempts)` },
          attempts: retryResult.attempts,
          timestamp: Date.now(),
          duration: 0,
        });

        // 步骤5: 等待3秒验证恢复结果
        debug('Waiting 3s to verify recovery...');
        await this.delay(3000);

        // 验证：检查任务是否恢复
        const stillInterrupted = await this.findInterruptedTask();
        if (!stillInterrupted) {
          debug('✅ Task %s recovered successfully', interruptedTask);
          return results;
        } else {
          debug('⚠️ Task %s still interrupted after retry', interruptedTask);
        }
      } else {
        debug('❌ Retry button not found via any method: %s (attempts: %d)', retryResult.method, retryResult.attempts);

        // 执行诊断脚本收集DOM信息
        debug('Running diagnosis for retry button absence...');
        const diagnosis = await this.diagnoseRetryButtonAbsence();
        debug('Diagnosis complete: %d buttons found, %d with aria-label',
          diagnosis.totalButtonElements, diagnosis.allAriaLabels.length);

        // 记录到审计日志
        this.auditLog.push({
          timestamp: Date.now(),
          action: 'diagnose-retry-button',
          result: 'failure',
          reason: `Retry button not found. DOM has ${diagnosis.totalButtonElements} buttons, ${diagnosis.chatTurnsCount} chat turns`,
          riskLevel: 'medium',
          operator: 'auto',
          sessionId: this.sessionId,
        });

        // 不执行刷新页面，直接返回失败
        results.push({
          success: false,
          action: { ...RECOVERY_ACTIONS.reportToGroup, id: 'retry-not-found', description: '重试按钮未找到' },
          attempts: retryResult.attempts,
          timestamp: Date.now(),
          duration: 0,
          error: `Retry button not found after ${retryResult.attempts} attempts. Visible buttons: ${diagnosis.visibleButtonTexts.join(', ')}`,
        });

        return results;
      }
    }

    // 如果没有找到中断任务，报告状态
    results.push(await this.executeAction(RECOVERY_ACTIONS.reportToGroup));

    return results;
  }

  /**
   * 诊断重试按钮缺失原因
   * 收集DOM状态用于后续分析
   */
  private async diagnoseRetryButtonAbsence(): Promise<RetryButtonDiagnosis> {
    try {
      const diagnosis = await this.cdp.evaluate<RetryButtonDiagnosis>(`
        (() => {
          const allButtons = Array.from(document.querySelectorAll('button'));
          const allRoleButtons = Array.from(document.querySelectorAll('[role="button"]'));

          return {
            timestamp: new Date().toISOString(),
            totalButtonElements: allButtons.length,
            totalRoleButtons: allRoleButtons.length,

            // 所有按钮的 aria-label（排除空值）
            allAriaLabels: allButtons
              .map(b => b.getAttribute('aria-label'))
              .filter(Boolean),

            // 所有可见按钮的文本
            visibleButtonTexts: allButtons
              .filter(b => b.offsetParent !== null)
              .map(b => (b.textContent || '').trim())
              .filter(t => t.length > 0 && t.length < 30),

            // 检查关键容器是否存在
            hasChatContainer: !!document.querySelector('[class*="chat"]'),
            chatTurnsCount: document.querySelectorAll('.chat-turn').length,

            // 检查是否有遮罩层覆盖
            hasModal: !!document.querySelector('[role="dialog"], [class*="modal"], [class*="mask"]'),

            // 当前 URL 和页面标题
            currentUrl: location.href,
            documentTitle: document.title,

            // 倒数三个 chat-turn 的文本
            lastTurns: Array.from(document.querySelectorAll('.chat-turn'))
              .slice(-3)
              .map(t => (t.textContent || '').slice(0, 100))
          };
        })()
      `);

      debug('Retry button diagnosis: %j', diagnosis);
      return diagnosis;
    } catch (err) {
      debug('Diagnosis failed: %s', err instanceof Error ? err.message : 'unknown');
      return {
        timestamp: new Date().toISOString(),
        error: 'Diagnosis failed',
        totalButtonElements: 0,
        totalRoleButtons: 0,
        allAriaLabels: [],
        visibleButtonTexts: [],
        hasChatContainer: false,
        chatTurnsCount: 0,
        hasModal: false,
        currentUrl: '',
        documentTitle: '',
        lastTurns: []
      };
    }
  }

  /**
   * 三路查找重试按钮
   * 路径1: aria-label 精确查找（最可靠，优先）
   * 路径2: 文本内容全量扫描（兜底）
   * 路径3: 在"手动终止输出"消息旁查找（DEVCLI 手动中断特有场景）
   */
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

          return { clicked: false, method: 'not-found' };
        })()
      `);
      return result;
    } catch (err) {
      debug('clickRetryButton failed: %s', err instanceof Error ? err.message : 'unknown');
      return { clicked: false, method: 'error' };
    }
  }

  /**
   * 使用MutationObserver查找重试按钮
   * 响应时间从最差5秒降到毫秒级
   */
  private async clickRetryButtonWithObserver(timeoutMs = 5000): Promise<{ clicked: boolean; method: string; attempts: number }> {
    try {
      const result = await this.cdp.evaluate<{ clicked: boolean; method: string; attempts: number }>(`
        new Promise((resolve) => {
          const tryFind = () => {
            // 多路查找
            const candidates = [
              document.querySelector('button[aria-label="重试"]'),
              document.querySelector('button[aria-label*="重试"]'),  // 模糊匹配
              document.querySelector('[role="button"][aria-label="重试"]'),  // role兜底
              ...Array.from(document.querySelectorAll('button')).filter(b =>
                b.textContent?.trim() === '重试' && b.offsetParent !== null  // 必须可见
              )
            ];

            const btn = candidates.find(b => b && !b.disabled);
            if (btn) {
              btn.click();
              return { clicked: true, method: 'observer-found' };
            }
            return null;
          };

          // 立即尝试一次
          const immediate = tryFind();
          if (immediate) {
            resolve({ ...immediate, attempts: 1 });
            return;
          }

          // MutationObserver监听DOM变化
          let attemptCount = 1;
          const observer = new MutationObserver(() => {
            attemptCount++;
            const result = tryFind();
            if (result) {
              observer.disconnect();
              resolve({ ...result, attempts: attemptCount });
            }
          });
          observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true
          });

          // 超时兜底
          setTimeout(() => {
            observer.disconnect();
            resolve({
              clicked: false,
              method: 'timeout-after-observer',
              attempts: attemptCount
            });
          }, ${timeoutMs});
        })
      `);

      debug('Observer-based click result: %o', result);
      return result;
    } catch (err) {
      debug('Observer-based click failed: %s', err instanceof Error ? err.message : 'unknown');
      return { clicked: false, method: 'error', attempts: 0 };
    }
  }

  /**
   * 查找中断的任务
   */
  private async findInterruptedTask(): Promise<string | null> {
    try {
      const taskName = await this.cdp.evaluate<string | null>(`
        (() => {
          const items = document.querySelectorAll('.index-module__task-item___zOpfg');
          for (const item of items) {
            const text = item.textContent || '';
            if (text.includes('中断')) {
              if (text.includes('PMCLI')) return 'PMCLI';
              if (text.includes('DEVCLI')) return 'DEVCLI';
              if (text.includes('WikiBot')) return 'WikiBot';
            }
          }
          return null;
        })()
      `);
      return taskName;
    } catch {
      return null;
    }
  }

  /**
   * 等待UI进入"可重试"状态
   * 三个就绪信号：中断文本出现、思考状态结束
   */
  private async waitForInterruptedRendered(timeoutMs = 5000): Promise<{ ready: boolean; hasRetryButton: boolean }> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const ready = await this.cdp.evaluate<{ ready: boolean; hasRetryButton: boolean }>(`
        (() => {
          // 三个就绪信号
          const hasInterruptText = document.body.textContent?.includes('手动终止输出')
            || document.body.textContent?.includes('已中断');
          const hasRetryButton = !!document.querySelector('button[aria-label*="重试"]');
          const stoppedThinking = !document.querySelector('[class*="thinking"]');

          return {
            ready: hasInterruptText && stoppedThinking,
            hasRetryButton
          };
        })()
      `);

      if (ready.ready) return ready;
      await this.delay(300);
    }

    return { ready: false, hasRetryButton: false };
  }

  /**
   * 切换到指定任务（点击任务项）
   */
  private async switchToTask(taskName: string): Promise<boolean> {
    try {
      debug('Switching to task %s', taskName);
      await this.cdp.evaluate<boolean>(`
        (() => {
          const items = document.querySelectorAll('.index-module__task-item___zOpfg');
          for (const item of items) {
            const text = item.textContent || '';
            if (text.includes('${taskName}')) {
              item.click();
              return true;
            }
          }
          return false;
        })()
      `);
      await this.delay(500);
      return true;
    } catch (err) {
      debug('Failed to reactivate task %s: %s', taskName, err instanceof Error ? err.message : 'unknown');
      return false;
    }
  }

  /**
   * 崩溃恢复策略
   * 1. 报告崩溃状态
   * 2. 请求人工介入（不自动刷新页面）
   */
  private async executeCrashedRecovery(): Promise<RecoveryResult[]> {
    debug('Executing crashed recovery strategy');
    const results: RecoveryResult[] = [];

    // 记录崩溃状态，请求人工介入
    debug('🚨 System crashed, reporting to group for manual intervention');
    results.push({
      success: false,
      action: { ...RECOVERY_ACTIONS.reportToGroup, id: 'crash-manual-intervention', description: '系统崩溃，需要人工介入' },
      attempts: 1,
      timestamp: Date.now(),
      duration: 0,
      error: 'System crashed, manual intervention required',
    });

    return results;
  }

  /**
   * 后台任务恢复策略
   * 1. 检查是否有保留/删除弹窗
   * 2. 自动点击保留
   */
  private async executeBackgroundRecovery(): Promise<RecoveryResult[]> {
    debug('Executing background recovery strategy');
    const results: RecoveryResult[] = [];

    // 检查删除弹窗
    const hasDeleteModal = await this.checkElementExists(
      '.icd-delete-files-command-card-v2'
    );
    if (hasDeleteModal) {
      results.push(await this.executeAction(RECOVERY_ACTIONS.clickRetainDelete));
    }

    // 检查覆盖弹窗
    const hasOverwriteModal = await this.checkElementExists(
      '.icd-overwrite-files-command-card-v2'
    );
    if (hasOverwriteModal) {
      results.push(await this.executeAction(RECOVERY_ACTIONS.clickRetainOverwrite));
    }

    return results;
  }

  /**
   * 中断任务恢复策略
   * 用于恢复被手动中断的任务
   */
  async executeInterruptedRecovery(taskName: string): Promise<RecoveryResult[]> {
    debug('Executing interrupted recovery strategy for task: %s', taskName);
    const results: RecoveryResult[] = [];

    // 步骤1: 点击对应任务槽位重新激活
    debug('Attempting to reactivate interrupted task: %s', taskName);
    // 这里可以添加切换到对应任务的逻辑

    // 步骤2: 尝试重新开始任务或报告状态
    results.push(await this.executeAction(RECOVERY_ACTIONS.reportToGroup));

    return results;
  }

  // ============ 动作执行 ============

  /**
   * 执行单个恢复动作（带完整权限检查）
   */
  async executeAction(action: RecoveryAction): Promise<RecoveryResult> {
    const startTime = Date.now();
    let result: RecoveryResult = {
      success: false,
      action,
      attempts: 0,
      timestamp: startTime,
      duration: 0,
    };

    try {
      // 1. 检查自动恢复是否启用
      if (!this.config.enableAutoRecovery && action.riskLevel !== 'low') {
        const reason = 'Auto recovery disabled for non-low risk actions';
        debug('🚫 Action %s blocked: %s', action.id, reason);
        this.logAudit(action, 'blocked', reason);
        result.error = reason;
        return result;
      }

      // 2. 白名单检查（仅click类型）
      if (action.type === 'click' && action.target) {
        const whitelistCheck = isButtonAllowed(action.target);
        if (!whitelistCheck.allowed) {
          debug('🚫 Action %s blocked: not in whitelist', action.id);
          this.logAudit(action, 'blocked', whitelistCheck.reason);
          result.error = whitelistCheck.reason;
          return result;
        }
        debug('✓ Action %s passed whitelist check (risk: %s)', action.id, whitelistCheck.entry?.riskLevel);
      }

      // 3. 速率限制检查
      const rateLimit = this.checkRateLimit(action);
      if (!rateLimit.allowed) {
        debug('🚫 Action %s blocked: rate limited (retry in %ds)', action.id, Math.ceil((rateLimit.resetTime - Date.now()) / 1000));
        this.logAudit(action, 'blocked', rateLimit.reason);
        result.error = rateLimit.reason;
        return result;
      }
      debug('✓ Action %s passed rate limit check', action.id);

      // 4. 高风险操作确认
      if (action.requiresConfirmation) {
        debug('⚠️ Action %s requires confirmation (high risk)', action.id);
        const confirmed = await this.waitForConfirmation(action);
        if (!confirmed) {
          const reason = 'High-risk action not confirmed within timeout';
          debug('🚫 Action %s blocked: no confirmation', action.id);
          this.logAudit(action, 'blocked', reason);
          result.error = reason;
          return result;
        }
        debug('✓ Action %s confirmed', action.id);
      }

      // 5. 执行动作
      for (let attempt = 1; attempt <= action.maxAttempts; attempt++) {
        result.attempts = attempt;
        debug('Executing action %s (attempt %d/%d)', action.id, attempt, action.maxAttempts);

        const success = await this.performAction(action);
        if (success) {
          result.success = true;
          recoveryRateLimiter.recordOperation(action.id);
          this.logAudit(action, 'success');
          break;
        }

        if (attempt < action.maxAttempts) {
          await this.delay(1000 * attempt); // 递增延迟
        }
      }

      if (!result.success) {
        result.error = `Action failed after ${result.attempts} attempts`;
        this.logAudit(action, 'failure', result.error);
      }
    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error);
      this.logAudit(action, 'failure', result.error);
    }

    result.duration = Date.now() - startTime;
    this.recoveryHistory.push(result);
    return result;
  }

  /**
   * 实际执行动作
   */
  private async performAction(action: RecoveryAction): Promise<boolean> {
    switch (action.type) {
      case 'click':
        return await this.performClick(action.target!);
      case 'report':
        return await this.performReport();
      default:
        debug('Unknown action type: %s', action.type);
        return false;
    }
  }

  /**
   * 执行点击操作
   */
  private async performClick(selector: string): Promise<boolean> {
    try {
      // 先检查元素是否存在
      const exists = await this.checkElementExists(selector);
      if (!exists) {
        debug('❌ Click failed: element not found [%s]', selector);
        return false;
      }

      debug('🖱️ Clicking element [%s]...', selector);

      // 使用CDP点击元素
      await this.cdp.evaluate<boolean>(`
        (function() {
          const el = document.querySelector('${selector}');
          if (!el) return false;
          el.click();
          return true;
        })()
      `);

      debug('✅ Clicked element [%s] successfully', selector);
      return true;
    } catch (error) {
      debug('❌ Click failed [%s]: %s', selector, error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  /**
   * 执行报告操作（预留接口）
   */
  private async performReport(): Promise<boolean> {
    // 报告操作由外部处理，这里只记录审计日志
    debug('Report action triggered');
    return true;
  }

  // ============ 权限检查 ============

  /**
   * 检查速率限制
   */
  private checkRateLimit(action: RecoveryAction): RateLimitResult {
    const whitelistEntry = isButtonAllowed(action.target || '');
    const maxClicks = whitelistEntry.entry?.maxClicksPerHour || 5;
    return recoveryRateLimiter.checkLimit(action.id, maxClicks, 3600000); // 1小时窗口
  }

  /**
   * 等待人工确认（高风险操作）
   */
  private async waitForConfirmation(action: RecoveryAction): Promise<boolean> {
    debug('Waiting for confirmation for high-risk action: %s', action.id);

    // 在实际实现中，这里可以：
    // 1. 发送确认请求到飞书群聊
    // 2. 等待用户回复
    // 3. 或者使用配置中的自动确认设置

    // 当前实现：自动拒绝高风险操作（安全优先）
    // 如需自动确认，可在配置中设置 enableAutoConfirm: true
    return false;
  }

  // ============ 审计日志 ============

  /**
   * 记录审计日志
   */
  private logAudit(
    action: RecoveryAction,
    result: 'success' | 'failure' | 'blocked' | 'timeout',
    reason?: string
  ): void {
    if (!this.config.enableAuditLog) return;

    const entry: AuditLogEntry = {
      timestamp: Date.now(),
      action: action.id,
      target: action.target,
      result,
      reason,
      riskLevel: action.riskLevel,
      operator: 'auto',
      sessionId: this.sessionId,
    };

    this.auditLog.push(entry);

    // 写入文件
    try {
      mkdirSync(path.dirname(this.config.auditLogPath), { recursive: true });
      const line = JSON.stringify(entry) + '\n';
      writeFileSync(this.config.auditLogPath, line, { flag: 'a' });
    } catch (error) {
      debug('Failed to write audit log: %s', error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * 获取审计日志
   */
  getAuditLog(): AuditLogEntry[] {
    return [...this.auditLog];
  }

  /**
   * 获取恢复历史
   */
  getRecoveryHistory(): RecoveryResult[] {
    return [...this.recoveryHistory];
  }

  // ============ 辅助方法 ============

  /**
   * 检查元素是否存在
   */
  private async checkElementExists(selector: string): Promise<boolean> {
    try {
      const value = await this.cdp.evaluate<boolean>(`!!document.querySelector('${selector}')`);
      return value === true;
    } catch {
      return false;
    }
  }

  /**
   * 延迟
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 生成会话ID
   */
  private generateSessionId(): string {
    return `recovery-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 重置执行器状态
   */
  reset(): void {
    this.recoveryHistory = [];
    this.auditLog = [];
    this.lastRecoveryTime = 0;
    this.isRecovering = false;
    this.sessionId = this.generateSessionId();
    this.recoveryPromise = null;
    this.circuitBreakerLevel = 0;
    this.consecutiveFailures = 0;
    this.editorRestartCount = 0;
  }

  // ============ 三级熔断策略 ============

  /**
   * 检查熔断状态
   */
  private checkCircuitBreaker(): { canProceed: boolean; reason?: string } {
    switch (this.circuitBreakerLevel) {
      case 3:
        return { canProceed: false, reason: 'Circuit breaker LEVEL 3: Daemon stopped, manual intervention required' };
      case 2:
        return { canProceed: false, reason: 'Circuit breaker LEVEL 2: Heartbeat paused, ops team notified' };
      case 1:
        // Level 1在Cooldown中处理
        return { canProceed: true };
      default:
        return { canProceed: true };
    }
  }

  /**
   * 更新熔断状态
   */
  private updateCircuitBreaker(success: boolean): void {
    if (success) {
      // 成功时重置失败计数和熔断
      this.consecutiveFailures = 0;
      if (this.circuitBreakerLevel > 0) {
        debug('Circuit breaker reset to LEVEL 0');
        this.circuitBreakerLevel = 0;
      }
      return;
    }

    // 失败时增加计数
    this.consecutiveFailures++;

    // Level 1: 3次失败，进入30秒冷却（由Cooldown机制处理）
    if (this.consecutiveFailures >= 3 && this.circuitBreakerLevel < 1) {
      this.circuitBreakerLevel = 1;
      debug('Circuit breaker elevated to LEVEL 1: 30s cooldown');
      this.reportToGroup('Level 1: 连续3次恢复失败，进入30秒冷却期');
    }

    // Level 2: 6次失败，暂停该任务的心跳检测
    if (this.consecutiveFailures >= 6 && this.circuitBreakerLevel < 2) {
      this.circuitBreakerLevel = 2;
      debug('🚨 Circuit breaker elevated to LEVEL 2: Heartbeat paused, notifying ops');
      this.reportToGroup('🚨 Level 2: 连续6次恢复失败，暂停DEVCLI心跳检测，请@运维人工介入');
    }

    // Level 3: 编辑器重启2次，完全停止daemon
    if (this.editorRestartCount >= 2 && this.circuitBreakerLevel < 3) {
      this.circuitBreakerLevel = 3;
      debug('🔴 Circuit breaker elevated to LEVEL 3: Daemon stopped');
      this.reportToGroup('🔴 Level 3: 编辑器重启2次，完全停止daemon，输出人工介入指引');
      this.outputManualInterventionGuide();
    }
  }

  /**
   * 记录编辑器重启
   */
  recordEditorRestart(): void {
    this.editorRestartCount++;
    debug('Editor restart recorded: #%d', this.editorRestartCount);
    this.updateCircuitBreaker(false);
  }

  /**
   * 输出人工介入指引
   */
  private outputManualInterventionGuide(): void {
    debug('========================================');
    debug('🔴 SYSTEM HALTED - Manual Intervention Required');
    debug('========================================');
    debug('Reason: Editor restarted %d times, recovery failed', this.editorRestartCount);
    debug('Action Required:');
    debug('  1. Check Trae IDE status');
    debug('  2. Manually resume DEVCLI task if interrupted');
    debug('  3. Restart mvp-runner daemon');
    debug('========================================');
  }

  // ============ Background 超时恢复 ============

  /**
   * Background 模式超时恢复
   * 1. 检查熔断和次数限制
   * 2. 点击"后台运行"按钮
   * 3. 动态等待"取消"按钮就绪
   * 4. 二次确认DOM是否活跃
   * 5. 点击"取消"按钮
   * 6. 更新计数和Cooldown
   */
  async executeBackgroundTimeout(ctx: import('./state-machine.js').BackgroundStateContext): Promise<RecoveryResult[]> {
    const taskId = this.getCurrentTaskId();
    const bgConfig = this.config.backgroundTimeoutRecovery || DEFAULT_BACKGROUND_TIMEOUT_CONFIG;
    const results: RecoveryResult[] = [];

    // 熔断检查
    if (ctx.triggerCount >= bgConfig.maxTriggerPerTask) {
      const msg = `任务 ${taskId} background 超时恢复已达 ${bgConfig.maxTriggerPerTask} 次上限`;
      debug('🚫 %s', msg);
      await this.notifyHuman(msg);
      return [{
        success: false,
        action: { ...RECOVERY_ACTIONS.reportToGroup, id: 'human-required' },
        attempts: 0,
        timestamp: Date.now(),
        duration: 0,
        error: 'Max trigger count reached',
      }];
    }

    // Cooldown 检查
    if (this.isInCooldown('background-timeout')) {
      return [{
        success: false,
        action: { ...RECOVERY_ACTIONS.reportToGroup, id: 'cooldown' },
        attempts: 0,
        timestamp: Date.now(),
        duration: 0,
        error: 'Recovery in cooldown',
      }];
    }

    const startTime = Date.now();

    try {
      // Step 1: 点击"后台运行"按钮
      debug('Step 1: Clicking "后台运行" button...');
      const bgClicked = await this.cdp.evaluate<boolean>(`
        (() => {
          const btns = Array.from(document.querySelectorAll('.icd-btn.icd-btn-tertiary'));
          const bgBtn = btns.find(b => b.textContent?.includes('后台运行'));
          if (bgBtn) { bgBtn.click(); return true; }
          return false;
        })()
      `);

      if (!bgClicked) {
        debug('❌ Background button not found');
        return [{
          success: false,
          action: { ...RECOVERY_ACTIONS.reportToGroup, id: 'bg-btn-not-found' },
          attempts: 1,
          timestamp: Date.now(),
          duration: 0,
          error: 'Background button not found',
        }];
      }
      debug('✅ Background button clicked');

      // Step 2: 动态等待"取消"按钮就绪
      debug('Step 2: Waiting for "取消" button to be ready...');
      const waitResult = bgConfig.dynamicWait.enabled
        ? await this.waitForButton(
            '取消',
            bgConfig.clickIntervals.maxWaitMs,
            bgConfig.dynamicWait.minWaitBeforePollMs,
            bgConfig.clickIntervals.pollIntervalMs
          )
        : { ready: true, actualWaitMs: bgConfig.clickIntervals.afterBackgroundClickMs };

      if (bgConfig.dynamicWait.enabled) {
        if (waitResult.ready) {
          debug('✅ "取消" button ready after %dms', waitResult.actualWaitMs);
        } else {
          debug('⚠️ "取消" button not ready after %dms, proceeding anyway', waitResult.actualWaitMs);
        }
      } else {
        await this.delay(bgConfig.clickIntervals.afterBackgroundClickMs);
        waitResult.actualWaitMs = bgConfig.clickIntervals.afterBackgroundClickMs;
      }

      // Step 3: 二次确认DOM是否活跃
      debug('Step 3: Checking DOM activity...');
      const currentSnapshot = await this.computeDomSnapshot();
      if (currentSnapshot !== ctx.lastDomSnapshot) {
        debug('✅ DOM activity detected, task self-recovered');
        return [{
          success: true,
          action: { ...RECOVERY_ACTIONS.reportToGroup, id: 'self-recovered' },
          attempts: 1,
          timestamp: Date.now(),
          duration: waitResult.actualWaitMs,
        }];
      }
      debug('⚠️ No DOM activity detected, proceeding to click cancel');

      // Step 4: 点击"取消"按钮
      debug('Step 4: Clicking "取消" button...');
      const cancelClicked = await this.cdp.evaluate<boolean>(`
        (() => {
          const btns = Array.from(document.querySelectorAll('button'));
          const cancelBtn = btns.find(b =>
            b.textContent?.trim() === '取消' &&
            b.offsetParent !== null
          );
          if (cancelBtn) { cancelBtn.click(); return true; }
          return false;
        })()
      `);

      if (!cancelClicked) {
        debug('❌ Cancel button not found');
        return [{
          success: false,
          action: { ...RECOVERY_ACTIONS.reportToGroup, id: 'cancel-btn-not-found' },
          attempts: 1,
          timestamp: Date.now(),
          duration: waitResult.actualWaitMs,
          error: 'Cancel button not found',
        }];
      }
      debug('✅ Cancel button clicked');

      // Step 5: 更新计数和Cooldown
      ctx.triggerCount += 1;
      this.setCooldown('background-timeout', bgConfig.cooldownMs);
      debug('✅ Background timeout recovery completed. Trigger count: %d/%d',
        ctx.triggerCount, bgConfig.maxTriggerPerTask);

      const duration = Date.now() - startTime;
      return [{
        success: true,
        action: { ...RECOVERY_ACTIONS.reportToGroup, id: 'bg-timeout-recovered' },
        attempts: 1,
        timestamp: Date.now(),
        duration,
      }];
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      debug('❌ Background timeout recovery error: %s', errorMsg);
      return [{
        success: false,
        action: { ...RECOVERY_ACTIONS.reportToGroup, id: 'bg-timeout-error' },
        attempts: 1,
        timestamp: Date.now(),
        duration: Date.now() - startTime,
        error: errorMsg,
      }];
    }
  }

  /**
   * 动态等待指定按钮就绪
   * 先等最小下限，然后轮询检测目标按钮可用性
   */
  private async waitForButton(
    buttonMatcher: string,
    maxWaitMs: number,
    minWaitMs: number = 5000,
    pollIntervalMs: number = 1000
  ): Promise<{ ready: boolean; actualWaitMs: number }> {
    const startTime = Date.now();

    // Step 1: 保守下限等待
    debug('Waiting minimum %dms before polling...', minWaitMs);
    await this.delay(minWaitMs);

    // Step 2: 轮询检测
    while (Date.now() - startTime < maxWaitMs) {
      const ready = await this.cdp.evaluate<boolean>(`
        (() => {
          const btns = Array.from(document.querySelectorAll('button'));
          const target = btns.find(b =>
            b.textContent?.trim() === '${buttonMatcher}' &&
            b.offsetParent !== null &&
            !b.disabled &&
            b.getBoundingClientRect().width > 0
          );
          return !!target;
        })()
      `);

      if (ready) {
        const actualWaitMs = Date.now() - startTime;
        debug('Button "%s" ready after %dms', buttonMatcher, actualWaitMs);
        return { ready: true, actualWaitMs };
      }

      await this.delay(pollIntervalMs);
    }

    debug('Button "%s" not ready after %dms', buttonMatcher, maxWaitMs);
    return { ready: false, actualWaitMs: maxWaitMs };
  }

  /**
   * 计算DOM快照
   */
  private async computeDomSnapshot(): Promise<string> {
    try {
      return await this.cdp.evaluate<string>(`
        (() => {
          const term = document.querySelector('.terminal, .chat-container, [class*="chat"]');
          if (!term) return '';
          const tail = term.textContent?.slice(-500) ?? '';
          // 简单的哈希计算
          let hash = 0;
          for (let i = 0; i < tail.length; i++) {
            const char = tail.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
          }
          return term.scrollHeight + '-' + tail.length + '-' + hash;
        })()
      `);
    } catch {
      return '';
    }
  }

  /**
   * 获取当前任务ID
   */
  private getCurrentTaskId(): string {
    // 从状态机或配置中获取当前任务ID
    return 'unknown';
  }

  /**
   * 通知人工介入
   */
  private async notifyHuman(message: string): Promise<void> {
    debug('[NOTIFY HUMAN] %s', message);
    this.reportToGroup(message);
  }

  /**
   * 检查是否在Cooldown中
   */
  private cooldownMap = new Map<string, number>();

  private isInCooldown(key: string): boolean {
    const until = this.cooldownMap.get(key);
    if (!until) return false;
    return Date.now() < until;
  }

  /**
   * 设置Cooldown
   */
  private setCooldown(key: string, ms: number): void {
    this.cooldownMap.set(key, Date.now() + ms);
    debug('Cooldown set for "%s" until %d', key, Date.now() + ms);
  }

  /**
   * 可疑任务恢复
   * 切换到任务并尝试恢复
   */
  async executeSuspiciousTaskRecovery(taskName: string): Promise<RecoveryResult[]> {
    debug('Executing suspicious task recovery for: %s', taskName);
    const results: RecoveryResult[] = [];

    try {
      // 第一步：切换到该任务
      const switched = await this.cdp.evaluate<boolean>(`
        (() => {
          const items = document.querySelectorAll('.index-module__task-item___zOpfg');
          for (const item of items) {
            if (item.textContent?.includes('${taskName}')) {
              item.click();
              return true;
            }
          }
          return false;
        })()
      `);

      if (!switched) {
        debug('❌ Failed to switch to task %s', taskName);
        return [{
          success: false,
          action: { ...RECOVERY_ACTIONS.reportToGroup, id: 'switch-failed' },
          attempts: 1,
          timestamp: Date.now(),
          duration: 0,
          error: `Failed to switch to task ${taskName}`,
        }];
      }

      debug('✅ Switched to task %s, waiting for UI...', taskName);
      await this.delay(1000);

      // 第二步：检查当前按钮状态
      const hasCancelBtn = await this.cdp.evaluate<boolean>(`
        (() => {
          const btns = Array.from(document.querySelectorAll('.icd-btn.icd-btn-tertiary'));
          return btns.some(b => b.textContent?.includes('取消'));
        })()
      `);

      if (hasCancelBtn) {
        // 有取消按钮，点击取消
        debug('Clicking cancel button for task %s', taskName);
        const cancelClicked = await this.cdp.evaluate<boolean>(`
          (() => {
            const btns = Array.from(document.querySelectorAll('.icd-btn.icd-btn-tertiary'));
            const cancelBtn = btns.find(b => b.textContent?.includes('取消'));
            if (cancelBtn) { cancelBtn.click(); return true; }
            return false;
          })()
        `);

        if (cancelClicked) {
          debug('✅ Cancel button clicked for task %s', taskName);
          results.push({
            success: true,
            action: { ...RECOVERY_ACTIONS.reportToGroup, id: 'cancel-clicked' },
            attempts: 1,
            timestamp: Date.now(),
            duration: 0,
          });
        } else {
          debug('❌ Cancel button not found for task %s', taskName);
          results.push({
            success: false,
            action: { ...RECOVERY_ACTIONS.reportToGroup, id: 'cancel-not-found' },
            attempts: 1,
            timestamp: Date.now(),
            duration: 0,
            error: 'Cancel button not found after switch',
          });
        }
      } else {
        // 没有取消按钮，任务可能已完成
        debug('✅ Task %s has no cancel button, likely completed or idle', taskName);
        results.push({
          success: true,
          action: { ...RECOVERY_ACTIONS.reportToGroup, id: 'task-completed' },
          attempts: 1,
          timestamp: Date.now(),
          duration: 0,
        });
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      debug('❌ Suspicious task recovery error: %s', errorMsg);
      results.push({
        success: false,
        action: { ...RECOVERY_ACTIONS.reportToGroup, id: 'recovery-error' },
        attempts: 1,
        timestamp: Date.now(),
        duration: 0,
        error: errorMsg,
      });
    }

    return results;
  }

  /**
   * 报告到群聊（预留接口）
   */
  private reportToGroup(message: string): void {
    debug('[GROUP REPORT] %s', message);
    // 实际实现中可以通过飞书API发送消息
  }
}
