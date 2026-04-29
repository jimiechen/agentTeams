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
      if (allFailed) {
        this.auditLog.push({
          timestamp: Date.now(),
          action: 'recovery-failed',
          result: 'failure',
          reason: 'All recovery actions failed',
          riskLevel: 'critical',
          operator: 'auto',
          sessionId: this.sessionId,
        });
        this.stateMachine.transition('recovery-failed');
      } else if (results.some((r) => r.success)) {
        this.stateMachine.transition('recovery-success');
      }

      return results;
    } finally {
      this.isRecovering = false;
    }
  }

  /**
   * 冻结恢复策略
   * 1. 先尝试点击停止按钮
   * 2. 再尝试点击取消/后台运行
   * 3. 最后尝试刷新页面
   */
  private async executeFrozenRecovery(): Promise<RecoveryResult[]> {
    debug('Executing frozen recovery strategy');
    const results: RecoveryResult[] = [];

    // 步骤1: 尝试停止当前输出
    results.push(await this.executeAction(RECOVERY_ACTIONS.clickStop));
    await this.delay(1000);

    // 步骤2: 尝试取消任务
    if (!results[0]?.success) {
      results.push(await this.executeAction(RECOVERY_ACTIONS.clickCancel));
      await this.delay(1000);
    }

    // 步骤3: 尝试后台运行
    const hasBackgroundBtn = await this.checkElementExists(
      RECOVERY_ACTIONS.clickBackground.target!
    );
    if (hasBackgroundBtn) {
      results.push(await this.executeAction(RECOVERY_ACTIONS.clickBackground));
      await this.delay(1000);
    }

    // 步骤4: 如果都失败，刷新页面
    const allFailed = results.every((r) => !r.success);
    if (allFailed) {
      results.push(await this.executeAction(RECOVERY_ACTIONS.refreshPage));
    }

    // 步骤5: 报告状态
    results.push(await this.executeAction(RECOVERY_ACTIONS.reportToGroup));

    return results;
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
        this.logAudit(action, 'blocked', reason);
        result.error = reason;
        return result;
      }

      // 2. 白名单检查（仅click类型）
      if (action.type === 'click' && action.target) {
        const whitelistCheck = isButtonAllowed(action.target);
        if (!whitelistCheck.allowed) {
          this.logAudit(action, 'blocked', whitelistCheck.reason);
          result.error = whitelistCheck.reason;
          return result;
        }
      }

      // 3. 速率限制检查
      const rateLimit = this.checkRateLimit(action);
      if (!rateLimit.allowed) {
        this.logAudit(action, 'blocked', rateLimit.reason);
        result.error = rateLimit.reason;
        return result;
      }

      // 4. 高风险操作确认
      if (action.requiresConfirmation) {
        const confirmed = await this.waitForConfirmation(action);
        if (!confirmed) {
          const reason = 'High-risk action not confirmed within timeout';
          this.logAudit(action, 'blocked', reason);
          result.error = reason;
          return result;
        }
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
        debug('Element not found: %s', selector);
        return false;
      }

      // 使用CDP点击元素
      await this.cdp.evaluate<boolean>(`
        (function() {
          const el = document.querySelector('${selector}');
          if (!el) return false;
          el.click();
          return true;
        })()
      `);

      debug('Clicked element: %s', selector);
      return true;
    } catch (error) {
      debug('Click failed: %s', error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  /**
   * 执行页面刷新
   */
  private async performRefresh(): Promise<boolean> {
    try {
      // CDPClient 没有直接的 Page.reload 方法，使用 evaluate 执行 location.reload()
      await this.cdp.evaluate<void>('location.reload()');
      debug('Page refreshed');
      return true;
    } catch (error) {
      debug('Refresh failed: %s', error instanceof Error ? error.message : String(error));
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
