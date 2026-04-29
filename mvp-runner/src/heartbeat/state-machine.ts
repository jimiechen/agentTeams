/**
 * Health State Machine - 健康状态机
 * 5种状态 + 转换矩阵 + 恢复机制
 */

import type { HeartbeatMode } from './types.js';

export interface StateTransition {
  from: HeartbeatMode;
  to: HeartbeatMode;
  trigger: string;
  timestamp: number;
}

export class HealthStateMachine {
  private currentState: HeartbeatMode = 'normal';
  private transitionHistory: StateTransition[] = [];
  private readonly MAX_HISTORY = 50;

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
  }

  /**
   * 获取状态持续时间（毫秒）
   */
  getStateDuration(): number {
    const lastTransition = this.transitionHistory[this.transitionHistory.length - 1];
    if (!lastTransition) return Infinity;
    return Date.now() - lastTransition.timestamp;
  }
}
