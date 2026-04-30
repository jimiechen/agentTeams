/**
 * HeartbeatDetector - 心跳检测器核心类
 * 协调三层检测（Layer 1/2/3），管理信号缓冲区，决策健康状态
 */

import type { CDPClient } from '../cdp/client.js';
import type {
  HeartbeatConfig,
  DetectionResult,
  HeartbeatMode,
  Signal,
  BackgroundStateContext,
} from './types.js';
import { DEFAULT_HEARTBEAT_CONFIG, DEFAULT_BACKGROUND_TIMEOUT_CONFIG } from './types.js';
import { HealthStateMachine } from './state-machine.js';
import { Layer1Collector, type Layer1Payload } from './layer1.js';
import { RecoveryExecutor } from './recovery-executor.js';
import createDebug from 'debug';

const debug = createDebug('mvp:heartbeat:detector');

export class HeartbeatDetector {
  private config: HeartbeatConfig;
  private cdp: CDPClient;
  private stateMachine: HealthStateMachine;
  private layer1Collector: Layer1Collector;
  private recoveryExecutor: RecoveryExecutor;
  private signalBuffer: Signal[] = [];
  private layer1Timer: NodeJS.Timeout | null = null;
  private layer2Timer: NodeJS.Timeout | null = null;
  private layer3Timer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private onModeChange?: (from: HeartbeatMode, to: HeartbeatMode, context?: { interruptedTasks?: string[] }) => void;
  private lastLayer1Payload?: Layer1Payload;

  constructor(
    cdp: CDPClient,
    config?: Partial<HeartbeatConfig>,
    onModeChange?: (from: HeartbeatMode, to: HeartbeatMode) => void
  ) {
    this.cdp = cdp;
    this.config = { ...DEFAULT_HEARTBEAT_CONFIG, ...config };
    this.stateMachine = new HealthStateMachine();
    this.layer1Collector = new Layer1Collector();
    this.recoveryExecutor = new RecoveryExecutor(cdp, this.stateMachine);
    this.onModeChange = onModeChange;
  }

  /**
   * 启动三层检测定时器
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      debug('HeartbeatDetector already running');
      return;
    }

    this.isRunning = true;
    debug(
      'Starting HeartbeatDetector: L1=%dms, L2=%dms, L3=%dms',
      this.config.layer1Interval,
      this.config.layer2Interval,
      this.config.layer3Interval
    );

    // Layer 1: 快速检测（5秒）
    this.layer1Timer = setInterval(
      () => this.runLayer1(),
      this.config.layer1Interval
    );

    // Layer 2: 内容检测（15秒）
    this.layer2Timer = setInterval(
      () => this.runLayer2(),
      this.config.layer2Interval
    );

    // Layer 3: 深度检测（30秒）
    this.layer3Timer = setInterval(
      () => this.runLayer3(),
      this.config.layer3Interval
    );

    // 立即执行一次Layer 1检测
    await this.runLayer1();
  }

  /**
   * 停止所有检测定时器
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;

    this.isRunning = false;
    debug('Stopping HeartbeatDetector');

    if (this.layer1Timer) {
      clearInterval(this.layer1Timer);
      this.layer1Timer = null;
    }
    if (this.layer2Timer) {
      clearInterval(this.layer2Timer);
      this.layer2Timer = null;
    }
    if (this.layer3Timer) {
      clearInterval(this.layer3Timer);
      this.layer3Timer = null;
    }
  }

  /**
   * Layer 1: 快速检测
   */
  private async runLayer1(): Promise<void> {
    if (!this.isRunning) return;

    try {
      const { result, payload } = await this.layer1Collector.collect(this.cdp);
      await this.processResult(result, payload);

      if (result.cost > 5) {
        debug('Layer 1 cost warning: %dms', result.cost);
      }
    } catch (error) {
      debug('Layer 1 error: %s', error instanceof Error ? error.message : 'unknown');
    }
  }

  /**
   * Layer 2: 内容检测
   * 仅在非normal状态时执行
   */
  private async runLayer2(): Promise<void> {
    if (!this.isRunning) return;
    if (this.stateMachine.getCurrentState() === 'normal') return;

    try {
      const result = await this.contentCheck();
      await this.processResult(result);
    } catch (error) {
      debug('Layer 2 error: %s', error instanceof Error ? error.message : 'unknown');
    }
  }

  /**
   * Layer 3: 深度检测
   * 仅在frozen或crashed状态时执行
   */
  private async runLayer3(): Promise<void> {
    if (!this.isRunning) return;
    const state = this.stateMachine.getCurrentState();
    if (state !== 'frozen' && state !== 'crashed') return;

    try {
      const result = await this.deepCheck();
      await this.processResult(result);
    } catch (error) {
      debug('Layer 3 error: %s', error instanceof Error ? error.message : 'unknown');
    }
  }

  /**
   * 处理检测结果
   */
  private async processResult(result: DetectionResult, payload?: Layer1Payload): Promise<void> {
    // 保存最后一次 Layer 1 payload
    if (payload) {
      this.lastLayer1Payload = payload;
    }

    // 添加到信号缓冲区
    this.signalBuffer.push(...result.signals);

    // 限制缓冲区大小
    if (this.signalBuffer.length > this.config.signalBufferSize) {
      this.signalBuffer = this.signalBuffer.slice(-this.config.signalBufferSize);
    }

    // 置信度足够高时更新状态
    if (result.confidence >= this.config.confidenceThreshold) {
      const previousState = this.stateMachine.getCurrentState();
      const trigger = this.modeToTrigger(result.mode);

      if (this.stateMachine.canTransition(trigger)) {
        const transition = this.stateMachine.transition(trigger);
        if (transition.success && transition.to !== previousState) {
          debug(
            'State changed: %s -> %s (confidence=%d, layer=%d)',
            previousState,
            transition.to,
            result.confidence,
            result.layer
          );

          // 构建上下文信息
          const context: { interruptedTasks?: string[] } = {};
          if (payload?.tasks) {
            const interruptedTasks = payload.tasks
              .filter(t => t.status === 'interrupted')
              .map(t => t.name);
            if (interruptedTasks.length > 0) {
              context.interruptedTasks = interruptedTasks;
            }
          }

          this.onModeChange?.(previousState, transition.to, context);

          // 处理状态转换后的逻辑
          await this.handleStateTransition(previousState, transition.to, payload);
        }
      }
    }
  }

  /**
   * 处理状态转换后的逻辑
   */
  private async handleStateTransition(
    from: HeartbeatMode,
    to: HeartbeatMode,
    payload?: Layer1Payload
  ): Promise<void> {
    // 进入background状态时初始化上下文
    if (to === 'background') {
      this.stateMachine.enterBackground();
      debug('Entered background state, starting timeout monitoring');
    }

    // 离开background状态时清除上下文
    if (from === 'background' && to !== 'background') {
      this.stateMachine.clearBackgroundContext();
      debug('Left background state, cleared timeout monitoring');
    }

    // 如果进入异常状态，触发自动恢复
    if (to === 'frozen' || to === 'crashed') {
      debug('Abnormal state detected, triggering recovery');
      await this.recoveryExecutor.executeRecovery(to);
    }

    // 如果在background状态，检查是否超时
    if (to === 'background' || from === 'background') {
      await this.checkBackgroundTimeout();
    }

    // 检查非活动的in_progress任务
    if (payload?.tasks) {
      await this.checkInactiveTasks(payload.tasks);
    }
  }

  /**
   * 检查非活动的in_progress任务
   * 当发现非活动任务长时间in_progress时，尝试切换到该任务检查状态
   */
  private inactiveTaskTimers = new Map<string, number>();

  private async checkInactiveTasks(tasks: Array<{ name: string; status: string; isActive: boolean }>): Promise<void> {
    const inactiveInProgress = tasks.filter(t => t.status === 'in_progress' && !t.isActive);
    
    for (const task of inactiveInProgress) {
      const firstSeen = this.inactiveTaskTimers.get(task.name);
      const now = Date.now();
      
      if (!firstSeen) {
        // 首次发现该非活动in_progress任务，记录时间
        this.inactiveTaskTimers.set(task.name, now);
        debug('⏳ Inactive in-progress task detected: %s, starting monitoring', task.name);
      } else if (now - firstSeen > 300000) { // 5分钟超时
        // 超过5分钟仍然是非活动in_progress，尝试切换到该任务检查
        debug('🚨 Inactive task %s in_progress for >5min, attempting to switch and check', task.name);
        await this.switchToTaskAndCheck(task.name);
        // 重置计时器，避免频繁切换
        this.inactiveTaskTimers.set(task.name, now);
      }
    }
    
    // 清理不再符合条件的任务
    for (const [name, _] of this.inactiveTaskTimers) {
      const stillExists = tasks.find(t => t.name === name && t.status === 'in_progress' && !t.isActive);
      if (!stillExists) {
        this.inactiveTaskTimers.delete(name);
        debug('✅ Inactive task %s no longer in_progress, cleared timer', name);
      }
    }
  }

  /**
   * 切换到指定任务并检查其状态
   */
  private async switchToTaskAndCheck(taskName: string): Promise<void> {
    try {
      // 点击任务项切换到该任务
      const switched = await this.cdp.evaluate<boolean>(`
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
      
      if (switched) {
        debug('✅ Switched to task %s to check status', taskName);
        // 等待UI更新
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // 检查该任务是否有取消按钮（说明确实在运行）
        const hasCancelBtn = await this.cdp.evaluate<boolean>(`
          (() => {
            const btns = Array.from(document.querySelectorAll('.icd-btn.icd-btn-tertiary'));
            return btns.some(b => b.textContent?.includes('取消'));
          })()
        `);
        
        if (hasCancelBtn) {
          debug('⚠️ Task %s has cancel button, may be stuck', taskName);
          // 任务有取消按钮，说明确实在运行但可能卡住了
          // 可以在这里触发恢复逻辑
        } else {
          debug('✅ Task %s no cancel button, likely completed or idle', taskName);
        }
      } else {
        debug('❌ Failed to switch to task %s', taskName);
      }
    } catch (error) {
      debug('Error switching to task %s: %s', taskName, error instanceof Error ? error.message : 'unknown');
    }
  }

  /**
   * 检查background模式是否超时
   */
  private async checkBackgroundTimeout(): Promise<void> {
    const bgConfig = this.config.backgroundTimeoutRecovery || DEFAULT_BACKGROUND_TIMEOUT_CONFIG;
    if (!bgConfig.enabled) return;

    const ctx = this.stateMachine.getBackgroundContext();
    if (!ctx) return;

    try {
      // 采样当前DOM快照
      const snapshot = await this.computeDomSnapshot();

      // 对比快照，变化则重置计时器
      if (snapshot !== ctx.lastDomSnapshot) {
        this.stateMachine.updateBackgroundContext({
          lastActivityAt: Date.now(),
          lastDomSnapshot: snapshot,
        });
        debug('Background activity detected, reset timeout timer');
        return;
      }

      // 检查是否超时
      const silentDuration = Date.now() - ctx.lastActivityAt;
      const timeoutMs = bgConfig.silentTimeoutMs || 300000;

      if (silentDuration > timeoutMs) {
        debug('Background timeout detected after %dms, triggering recovery', silentDuration);
        await this.recoveryExecutor.executeBackgroundTimeout(ctx);
      }
    } catch (error) {
      debug('Background timeout check error: %s', error instanceof Error ? error.message : 'unknown');
    }
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
   * Layer 2: 内容检测
   */
  private async contentCheck(): Promise<DetectionResult> {
    const startTime = Date.now();

    // 检查网络活动
    const networkActive = await this.checkNetworkActivity();

    // 检查用户交互
    const userInteraction = await this.checkUserInteraction();

    const mode: HeartbeatMode = networkActive || userInteraction ? 'normal' : 'frozen';

    return {
      mode,
      confidence: 0.6,
      signals: [
        {
          type: networkActive ? 'network_active' : 'render_stopped',
          source: 'layer2',
          value: { networkActive, userInteraction },
          timestamp: startTime,
          weight: 0.6,
        },
      ],
      timestamp: startTime,
      layer: 2,
      cost: Date.now() - startTime,
    };
  }

  /**
   * Layer 3: 深度检测
   */
  private async deepCheck(): Promise<DetectionResult> {
    const startTime = Date.now();

    // 检查页面响应性
    const responsive = await this.checkPageResponsive();

    const mode: HeartbeatMode = responsive ? 'frozen' : 'crashed';

    return {
      mode,
      confidence: responsive ? 0.8 : 0.9,
      signals: [
        {
          type: responsive ? 'process_frozen' : 'render_stopped',
          source: 'layer3',
          value: { responsive },
          timestamp: startTime,
          weight: 0.9,
        },
      ],
      timestamp: startTime,
      layer: 3,
      cost: Date.now() - startTime,
    };
  }

  /**
   * 检查网络活动
   */
  private async checkNetworkActivity(): Promise<boolean> {
    try {
      // 通过CDP检查最近的网络请求
      // 简化实现：检查页面是否有加载状态
      const value = await this.cdp.evaluate<boolean>(`
        (() => {
          const loaders = document.querySelectorAll('.loading, .spinner, [class*="loading"]');
          return loaders.length > 0;
        })()
      `);
      return value || false;
    } catch {
      return false;
    }
  }

  /**
   * 检查用户交互
   */
  private async checkUserInteraction(): Promise<boolean> {
    try {
      // 检查是否有最近的输入焦点
      const value = await this.cdp.evaluate<boolean>(`
        (() => {
          const activeElement = document.activeElement;
          return activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA');
        })()
      `);
      return value || false;
    } catch {
      return false;
    }
  }

  /**
   * 检查页面响应性
   */
  private async checkPageResponsive(): Promise<boolean> {
    try {
      // 执行一个简单的JS表达式测试响应性
      const startTime = Date.now();
      await this.cdp.evaluate<number>('1+1');
      return Date.now() - startTime < 3000; // 3秒内响应视为frozen，否则crashed
    } catch {
      return false;
    }
  }

  /**
   * 将检测模式转换为状态机触发器
   */
  private modeToTrigger(mode: HeartbeatMode): string {
    switch (mode) {
      case 'normal':
        return 'activity-resumed';
      case 'idle':
        return 'no-activity-5min';
      case 'background':
        return 'background-detected';
      case 'frozen':
        return 'frozen-signal';
      case 'crashed':
        return 'crash-signal';
      default:
        return 'frozen-signal';
    }
  }

  /**
   * 获取当前健康状态
   */
  getCurrentState(): HeartbeatMode {
    return this.stateMachine.getCurrentState();
  }

  /**
   * 获取信号缓冲区
   */
  getSignalBuffer(): Signal[] {
    return [...this.signalBuffer];
  }

  /**
   * 获取状态转换历史
   */
  getTransitionHistory() {
    return this.stateMachine.getTransitionHistory();
  }

  /**
   * 获取恢复执行器（用于外部访问审计日志等）
   */
  getRecoveryExecutor(): RecoveryExecutor {
    return this.recoveryExecutor;
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    currentState: HeartbeatMode;
    signalCount: number;
    transitionCount: number;
    isRunning: boolean;
  } {
    return {
      currentState: this.stateMachine.getCurrentState(),
      signalCount: this.signalBuffer.length,
      transitionCount: this.stateMachine.getTransitionHistory().length,
      isRunning: this.isRunning,
    };
  }
}
