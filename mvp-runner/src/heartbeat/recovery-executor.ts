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
import type { HeartbeatMode } from './types.js';
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

export interface RecoveryConfig {
  enableAuditLog: boolean;
  auditLogPath: string;
  maxAuditLogSize: number;
  defaultConfirmationTimeout: number;
  enableAutoRecovery: boolean;
  maxRecoveryAttempts: number;
  recoveryCooldownMs: number;
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
  refreshPage: {
    id: 'refresh-page',
    type: 'refresh',
    description: '刷新页面，重置UI状态',
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
   * 执行恢复策略
   * 根据当前状态选择合适的恢复动作
   */
  async executeRecovery(fromState: HeartbeatMode): Promise<RecoveryResult[]> {
    if (this.isRecovering) {
      debug('Recovery already in progress, skipping');
      return [];
    }

    // 检查冷却时间
    const cooldownRemaining = this.config.recoveryCooldownMs - (Date.now() - this.lastRecoveryTime);
    if (cooldownRemaining > 0) {
      debug('Recovery cooldown active, wait %dms', cooldownRemaining);
      return [];
    }

    this.isRecovering = true;
    this.lastRecoveryTime = Date.now();

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
        
        // 如果连续失败超过限制，转为 crashed 状态
        if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
          debug('🚨 Max consecutive failures reached, transitioning to crashed');
          this.stateMachine.transition('recovery-failed');
        }
      } else if (anySuccess) {
        this.consecutiveFailures = 0; // 重置失败计数
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

      // 步骤3: 等待任务切换完成（UI渲染重试按钮）
      await this.delay(2000);

      // 步骤4: 使用三路查找点击重试按钮
      debug('Step 2: Attempting to click retry button (3-way lookup)...');
      const retryResult = await this.clickRetryButton();

      if (retryResult.clicked) {
        debug('✅ Retry button clicked successfully via method: %s', retryResult.method);
        results.push({
          success: true,
          action: { ...RECOVERY_ACTIONS.reportToGroup, id: 'click-retry', description: `点击重试按钮 (${retryResult.method})` },
          attempts: 1,
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
        debug('❌ Retry button not found via any method: %s', retryResult.method);
      }
    }

    // 步骤6: 兜底策略 - 刷新页面
    debug('All recovery attempts failed, refreshing page as last resort');
    results.push(await this.executeAction(RECOVERY_ACTIONS.refreshPage));
    await this.delay(2000);

    // 步骤7: 报告状态
    results.push(await this.executeAction(RECOVERY_ACTIONS.reportToGroup));

    return results;
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
   * 1. 刷新页面
   * 2. 报告崩溃状态
   */
  private async executeCrashedRecovery(): Promise<RecoveryResult[]> {
    debug('Executing crashed recovery strategy');
    const results: RecoveryResult[] = [];

    results.push(await this.executeAction(RECOVERY_ACTIONS.refreshPage));
    await this.delay(2000);

    results.push(await this.executeAction(RECOVERY_ACTIONS.reportToGroup));

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
      case 'refresh':
        return await this.performRefresh();
      case 'report':
        return await this.performReport();
      default:
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
   * 执行页面刷新
   */
  private async performRefresh(): Promise<boolean> {
    try {
      debug('🔄 Refreshing page...');
      // CDPClient 没有直接的 Page.reload 方法，使用 evaluate 执行 location.reload()
      await this.cdp.evaluate<void>('location.reload()');
      debug('✅ Page refreshed successfully');
      return true;
    } catch (error) {
      debug('❌ Page refresh failed: %s', error instanceof Error ? error.message : String(error));
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
  }
}
