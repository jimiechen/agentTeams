/**
 * Health State Machine - 健康状态机
 * 5种状态 + 转换矩阵 + 恢复机制
 */

import type { HeartbeatMode } from './types.js';
import createDebug from 'debug';

const debug = createDebug('mvp:heartbeat:state');

export interface StateTransition {
  from: HeartbeatMode;
  to: HeartbeatMode;
  trigger: string;
  timestamp: number;
}

export interface BackgroundStateContext {
  enteredAt: number;
  lastActivityAt: number;
  lastDomSnapshot: string;
  triggerCount: number;
}

export class HealthStateMachine {
  private currentState: HeartbeatMode = 'normal';
  private transitionHistory: StateTransition[] = [];
  private readonly MAX_HISTORY = 50;

  // Cooldown机制：防止恢复死循环
  private lastRecoveryAttemptAt: number = 0;
  private readonly RECOVERY_COOLDOWN_MS = 30000; // 30秒冷却

  // Background模式状态上下文
  private backgroundContext: BackgroundStateContext | null = null;

  // 状态转换矩阵
  private static readonly TRANSITIONS: Record<HeartbeatMode, Record<string, HeartbeatMode>> = {
    normal: {
      'no-activity-5min': 'idle',
      'background-detected': 'background',
      'frozen-signal': 'frozen',
      'crash-signal': 'crashed',
    },
    idle: {
      'activity-resumed': 'normal',
      'frozen-signal': 'frozen',
    },
    background: {
      'foreground-detected': 'normal',
      'frozen-signal': 'frozen',
    },
    frozen: {
      'recovery-success': 'normal',
      'recovery-failed': 'crashed',
    },
    crashed: {
      'manual-restart': 'normal',
    },
  };

  /**
   * 执行状态转换
   */
  transition(trigger: string): {
    success: boolean;
    from: HeartbeatMode;
    to: HeartbeatMode;
  } {
    const from = this.currentState;
    const transitions = HealthStateMachine.TRANSITIONS[from];
    const to = transitions?.[trigger];

    if (!to) {
      debug('❌ Invalid transition: [%s] cannot handle trigger "%s"', from, trigger);
      return { success: false, from, to: from };
    }

    this.currentState = to;
    const transition: StateTransition = {
      from,
      to,
      trigger,
      timestamp: Date.now(),
    };
    this.transitionHistory.push(transition);

    if (this.transitionHistory.length > this.MAX_HISTORY) {
      this.transitionHistory = this.transitionHistory.slice(-this.MAX_HISTORY);
    }

    debug('🔄 State transition: [%s] --(%s)--> [%s]', from, trigger, to);
    return { success: true, from, to };
  }

  /**
   * 获取当前状态
   */
  getCurrentState(): HeartbeatMode {
    return this.currentState;
  }

  /**
   * 获取转换历史
   */
  getTransitionHistory(): StateTransition[] {
    return [...this.transitionHistory];
  }

  /**
   * 检查是否可以转换
   */
  canTransition(trigger: string): boolean {
    const transitions = HealthStateMachine.TRANSITIONS[this.currentState];
    return !!transitions?.[trigger];
  }

  /**
   * 获取当前状态允许的所有转换
   */
  getAvailableTransitions(): string[] {
    const transitions = HealthStateMachine.TRANSITIONS[this.currentState];
    return transitions ? Object.keys(transitions) : [];
  }

  /**
   * 重置状态机
   */
  reset(): void {
    this.currentState = 'normal';
    this.transitionHistory = [];
    this.backgroundContext = null;
  }

  /**
   * 进入background状态时初始化上下文
   */
  enterBackground(): BackgroundStateContext {
    this.backgroundContext = {
      enteredAt: Date.now(),
      lastActivityAt: Date.now(),
      lastDomSnapshot: '',
      triggerCount: 0,
    };
    debug('Background context initialized at %d', this.backgroundContext.enteredAt);
    return this.backgroundContext;
  }

  /**
   * 获取background状态上下文
   */
  getBackgroundContext(): BackgroundStateContext | null {
    return this.backgroundContext;
  }

  /**
   * 更新background状态上下文
   */
  updateBackgroundContext(updates: Partial<BackgroundStateContext>): void {
    if (!this.backgroundContext) return;
    this.backgroundContext = { ...this.backgroundContext, ...updates };
  }

  /**
   * 清除background状态上下文
   */
  clearBackgroundContext(): void {
    this.backgroundContext = null;
    debug('Background context cleared');
  }

  /**
   * 获取状态持续时间（毫秒）
   */
  getStateDuration(): number {
    const lastTransition = this.transitionHistory[this.transitionHistory.length - 1];
    if (!lastTransition) return Infinity;
    return Date.now() - lastTransition.timestamp;
  }

  /**
   * 检查是否应该触发恢复
   * Cooldown机制确保30秒内不会重复触发恢复
   */
  shouldTriggerRecovery(state: HeartbeatMode): boolean {
    if (state !== 'frozen' && state !== 'crashed') return false;

    const elapsed = Date.now() - this.lastRecoveryAttemptAt;
    if (elapsed < this.RECOVERY_COOLDOWN_MS) {
      debug('Recovery cooldown active, %dms remaining', this.RECOVERY_COOLDOWN_MS - elapsed);
      return false;
    }

    return true;
  }

  /**
   * 记录恢复尝试时间
   */
  recordRecoveryAttempt(): void {
    this.lastRecoveryAttemptAt = Date.now();
    debug('Recovery attempt recorded at %d', this.lastRecoveryAttemptAt);
  }

  /**
   * 获取Cooldown剩余时间
   */
  getCooldownRemaining(): number {
    const elapsed = Date.now() - this.lastRecoveryAttemptAt;
    return Math.max(0, this.RECOVERY_COOLDOWN_MS - elapsed);
  }
}
