# Heartbeat Scheme 实施方案

**版本**: v1.0
**日期**: 2026-04-29
**状态**: 待评审
**基于**: `docs/CODE_REVIEW_HEARTBEAT_SCHEME.md` 评审结论

---

## 一、实施目标

将当前约 **40%** 的实现度提升到 **100%**，分三个阶段补齐心跳检测架构的所有组件。

---

## 二、Phase 1：补齐关键缺陷（本周，约8小时）

### 2.1 任务清单

| # | 任务 | 工时 | 优先级 | 文件 | 说明 |
|---|------|------|--------|------|------|
| 1.1 | 缩短心跳周期到10秒 | 1h | 🔴 P0 | `cdp/client.ts` | 将30秒改为10秒，提升检测灵敏度 |
| 1.2 | 信号计数器持久化 | 2h | 🔴 P0 | `actions/wait-response.ts` | 重启后不丢失信号计数 |
| 1.3 | 恢复操作审计日志 | 2h | 🟡 P1 | `actions/recover.ts` + `utils/workspace-logger.ts` | 记录每次恢复操作详情 |
| 1.4 | 按钮白名单检查 | 2h | 🟡 P1 | `actions/recover.ts` | 只允许点击预定义按钮 |
| 1.5 | 速率限制器 | 1h | 🟡 P1 | `actions/recover.ts` | 防止频繁恢复操作 |

### 2.2 详细设计

#### 2.2.1 缩短心跳周期（任务1.1）

**当前代码**:
```typescript
// cdp/client.ts L~280
this.heartbeatTimer = setInterval(() => this.checkHeartbeat(), 30000);
```

**修改后**:
```typescript
// 从环境变量读取，默认10秒
const HEARTBEAT_INTERVAL = Number(process.env.HEARTBEAT_INTERVAL_MS) || 10000;
this.heartbeatTimer = setInterval(() => this.checkHeartbeat(), HEARTBEAT_INTERVAL);
```

**验收标准**:
- [ ] 心跳周期从30秒缩短到10秒
- [ ] 可通过环境变量 `HEARTBEAT_INTERVAL_MS` 动态调整
- [ ] 不影响CDP连接稳定性

#### 2.2.2 信号计数器持久化（任务1.2）

**设计**:
```typescript
// 新增文件: actions/signal-persist.ts
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const SIGNAL_STATE_FILE = path.resolve('./logs/signal-state.json');

interface SignalState {
  consecutiveSignals: Record<string, number>;
  lastSignal: string | null;
  lastUpdateTime: number;
}

export function loadSignalState(): SignalState {
  if (!existsSync(SIGNAL_STATE_FILE)) {
    return { consecutiveSignals: {}, lastSignal: null, lastUpdateTime: 0 };
  }
  try {
    return JSON.parse(readFileSync(SIGNAL_STATE_FILE, 'utf-8'));
  } catch {
    return { consecutiveSignals: {}, lastSignal: null, lastUpdateTime: 0 };
  }
}

export function saveSignalState(state: SignalState): void {
  mkdirSync(path.dirname(SIGNAL_STATE_FILE), { recursive: true });
  writeFileSync(SIGNAL_STATE_FILE, JSON.stringify(state, null, 2));
}
```

**在 wait-response.ts 中集成**:
```typescript
import { loadSignalState, saveSignalState } from './signal-persist.js';

// 初始化时加载状态
const signalState = loadSignalState();

// 检测完成后保存状态
function updateSignalState(signal: string): void {
  if (signal === signalState.lastSignal) {
    signalState.consecutiveSignals[signal] = (signalState.consecutiveSignals[signal] || 0) + 1;
  } else {
    signalState.consecutiveSignals = { [signal]: 1 };
  }
  signalState.lastSignal = signal;
  signalState.lastUpdateTime = Date.now();
  saveSignalState(signalState);
}
```

**验收标准**:
- [ ] 重启进程后信号计数不丢失
- [ ] 状态文件存储在 `mvp-runner/logs/signal-state.json`
- [ ] 状态文件大小不超过10KB

#### 2.2.3 恢复操作审计日志（任务1.3）

**设计**:
```typescript
// 在 utils/workspace-logger.ts 中新增
interface RecoveryAuditLog {
  timestamp: string;
  workspaceId: string;
  taskId: string;
  action: 'click-stop' | 'send-esc' | 'dismiss-modal';
  targetSelector?: string;
  result: 'success' | 'failed' | 'skipped';
  reason: string;
  durationMs: number;
}

class RecoveryAuditLogger {
  private logPath: string;
  
  constructor(workspacePath: string) {
    const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
    this.logPath = path.join(workspacePath, 'logs', date, 'recovery-audit.jsonl');
    mkdirSync(path.dirname(this.logPath), { recursive: true });
  }
  
  log(entry: Omit<RecoveryAuditLog, 'timestamp'>): void {
    const line = JSON.stringify({ ...entry, timestamp: new Date().toISOString() }) + '\n';
    appendFileSync(this.logPath, line);
  }
}
```

**在 recover.ts 中集成**:
```typescript
import { RecoveryAuditLogger } from '../utils/workspace-logger.js';

export async function recoverFromStuck(
  cdp: CDPClient,
  options: RecoveryOptions = {}
): Promise<RecoveryResult> {
  const auditLogger = new RecoveryAuditLogger(options.workspacePath || './');
  const startTime = Date.now();
  
  // ... 执行恢复操作 ...
  
  auditLogger.log({
    workspaceId: options.workspaceId || 'unknown',
    taskId: options.taskId || 'unknown',
    action: 'click-stop',
    result: success ? 'success' : 'failed',
    reason: success ? '按钮点击成功' : errorMessage,
    durationMs: Date.now() - startTime
  });
}
```

**验收标准**:
- [ ] 每次恢复操作都记录审计日志
- [ ] 日志格式为JSONL，便于后续分析
- [ ] 日志存储在工作区 `logs/YYYYMMDD/recovery-audit.jsonl`
- [ ] 包含时间戳、工作区、任务ID、操作类型、结果、原因、耗时

#### 2.2.4 按钮白名单检查（任务1.4）

**设计**:
```typescript
// 新增文件: actions/button-whitelist.ts
export interface ButtonWhitelistEntry {
  selector: string;
  displayName: string;
  riskLevel: 'low' | 'medium' | 'high';
  maxClicksPerHour: number;
}

export const BUTTON_WHITELIST: ButtonWhitelistEntry[] = [
  { selector: 'button.stop-btn', displayName: '停止', riskLevel: 'medium', maxClicksPerHour: 5 },
  { selector: 'button.cancel-btn', displayName: '取消', riskLevel: 'medium', maxClicksPerHour: 5 },
  { selector: 'button.retain-btn', displayName: '保留', riskLevel: 'low', maxClicksPerHour: 20 },
  { selector: 'button.delete-btn', displayName: '删除', riskLevel: 'high', maxClicksPerHour: 2 },
];

export function isButtonAllowed(selector: string): {
  allowed: boolean;
  entry?: ButtonWhitelistEntry;
  reason?: string;
} {
  const entry = BUTTON_WHITELIST.find(b => selector.includes(b.selector) || b.selector.includes(selector));
  if (!entry) {
    return { allowed: false, reason: `按钮 "${selector}" 不在白名单中` };
  }
  return { allowed: true, entry };
}
```

**在 recover.ts 中集成**:
```typescript
import { isButtonAllowed } from './button-whitelist.js';

export async function clickStopButton(cdp: CDPClient, selector: string): Promise<boolean> {
  const check = isButtonAllowed(selector);
  if (!check.allowed) {
    console.warn(`[recover] 拒绝点击未授权按钮: ${check.reason}`);
    return false;
  }
  // ... 执行点击 ...
}
```

**验收标准**:
- [ ] 只允许点击白名单中的按钮
- [ ] 未授权按钮点击被拒绝并记录日志
- [ ] 白名单可配置（从YAML或环境变量读取）

#### 2.2.5 速率限制器（任务1.5）

**设计**:
```typescript
// 新增文件: utils/rate-limiter.ts
export class RateLimiter {
  private operations: Map<string, number[]> = new Map();
  
  checkLimit(operationType: string, maxOps: number, windowMs: number): {
    allowed: boolean;
    remaining: number;
    resetTime: number;
  } {
    const now = Date.now();
    const history = this.operations.get(operationType) || [];
    const windowStart = now - windowMs;
    const recentOps = history.filter(t => t > windowStart);
    
    this.operations.set(operationType, recentOps);
    
    if (recentOps.length >= maxOps) {
      const oldestOp = Math.min(...recentOps);
      return {
        allowed: false,
        remaining: 0,
        resetTime: oldestOp + windowMs
      };
    }
    
    return {
      allowed: true,
      remaining: maxOps - recentOps.length,
      resetTime: now + windowMs
    };
  }
  
  recordOperation(operationType: string): void {
    const history = this.operations.get(operationType) || [];
    history.push(Date.now());
    this.operations.set(operationType, history);
  }
}
```

**在 recover.ts 中集成**:
```typescript
import { RateLimiter } from '../utils/rate-limiter.js';

const recoveryRateLimiter = new RateLimiter();

export async function recoverFromStuck(cdp: CDPClient): Promise<RecoveryResult> {
  const limitCheck = recoveryRateLimiter.checkLimit('recovery', 5, 3600000); // 每小时最多5次
  if (!limitCheck.allowed) {
    return { success: false, action: 'none', reason: `恢复操作速率限制，${Math.ceil((limitCheck.resetTime - Date.now()) / 1000)}秒后重试` };
  }
  
  // ... 执行恢复 ...
  
  recoveryRateLimiter.recordOperation('recovery');
}
```

**验收标准**:
- [ ] 每小时最多5次恢复操作
- [ ] 超出限制时返回明确错误信息
- [ ] 限制器在进程重启后重置（Phase 2可持久化）

---

## 三、Phase 2：核心架构升级（2周，约26小时）

### 3.1 任务清单

| # | 任务 | 工时 | 优先级 | 文件 | 说明 |
|---|------|------|--------|------|------|
| 2.1 | HeartbeatDetector 核心类 | 8h | 🔴 P0 | `heartbeat/detector.ts` | 统一协调三层检测 |
| 2.2 | Layer 1 快速检测（5秒） | 4h | 🔴 P0 | `heartbeat/layer1.ts` | 轻量级DOM状态采集 |
| 2.3 | 健康状态机 | 6h | 🟡 P1 | `heartbeat/state-machine.ts` | 6状态 + 转换矩阵 |
| 2.4 | RecoveryExecutor 完整版 | 8h | 🟡 P1 | `heartbeat/recovery-executor.ts` | 完整权限边界 |

### 3.2 详细设计

#### 3.2.1 HeartbeatDetector 核心类（任务2.1）

**接口设计**:
```typescript
// 新增文件: heartbeat/detector.ts
export interface HeartbeatConfig {
  layer1Interval: number;   // 默认5000ms
  layer2Interval: number;   // 默认15000ms
  layer3Interval: number;   // 默认30000ms
  maxRetries: number;       // 默认3
  retryDelay: number;       // 默认1000ms
}

export interface DetectionResult {
  mode: HeartbeatMode;
  confidence: number;       // 0-1
  signals: Signal[];
  timestamp: number;
  layer: 1 | 2 | 3;
}

export type HeartbeatMode = 
  | 'normal' 
  | 'idle' 
  | 'background' 
  | 'frozen' 
  | 'crashed';

export interface Signal {
  type: SignalType;
  source: 'layer1' | 'layer2' | 'layer3';
  value: any;
  timestamp: number;
  weight: number;
}

export type SignalType =
  | 'thread_responsive'
  | 'thread_blocked'
  | 'dom_changed'
  | 'network_active'
  | 'user_interaction'
  | 'memory_pressure'
  | 'visibility_hidden'
  | 'process_frozen'
  | 'render_stopped';

export class HeartbeatDetector {
  private config: HeartbeatConfig;
  private currentMode: HeartbeatMode = 'normal';
  private signalBuffer: Signal[] = [];
  private layer1Timer: NodeJS.Timeout | null = null;
  private layer2Timer: NodeJS.Timeout | null = null;
  private layer3Timer: NodeJS.Timeout | null = null;
  private cdp: CDPClient;

  constructor(cdp: CDPClient, config?: Partial<HeartbeatConfig>) {
    this.cdp = cdp;
    this.config = {
      layer1Interval: 5000,
      layer2Interval: 15000,
      layer3Interval: 30000,
      maxRetries: 3,
      retryDelay: 1000,
      ...config
    };
  }

  async start(): Promise<void> {
    // 启动三层定时器
    this.layer1Timer = setInterval(() => this.runLayer1(), this.config.layer1Interval);
    this.layer2Timer = setInterval(() => this.runLayer2(), this.config.layer2Interval);
    this.layer3Timer = setInterval(() => this.runLayer3(), this.config.layer3Interval);
  }

  async stop(): Promise<void> {
    if (this.layer1Timer) clearInterval(this.layer1Timer);
    if (this.layer2Timer) clearInterval(this.layer2Timer);
    if (this.layer3Timer) clearInterval(this.layer3Timer);
  }

  private async runLayer1(): Promise<void> {
    const result = await this.fastCheck();
    this.processResult(result);
  }

  private async runLayer2(): Promise<void> {
    if (this.currentMode !== 'normal') {
      const result = await this.contentCheck();
      this.processResult(result);
    }
  }

  private async runLayer3(): Promise<void> {
    if (this.currentMode === 'frozen' || this.currentMode === 'crashed') {
      const result = await this.deepCheck();
      this.processResult(result);
    }
  }

  async fastCheck(): Promise<DetectionResult> {
    // Layer 1: 轻量级检查
    const startTime = Date.now();
    // ... 实现 ...
    return {
      mode: 'normal',
      confidence: 1.0,
      signals: [],
      timestamp: Date.now(),
      layer: 1
    };
  }

  async contentCheck(): Promise<DetectionResult> {
    // Layer 2: 内容检查
    return {
      mode: 'normal',
      confidence: 1.0,
      signals: [],
      timestamp: Date.now(),
      layer: 2
    };
  }

  async deepCheck(): Promise<DetectionResult> {
    // Layer 3: 深度检查
    return {
      mode: 'normal',
      confidence: 1.0,
      signals: [],
      timestamp: Date.now(),
      layer: 3
    };
  }

  private processResult(result: DetectionResult): void {
    this.signalBuffer.push(...result.signals);
    // 保持缓冲区大小限制
    if (this.signalBuffer.length > 100) {
      this.signalBuffer = this.signalBuffer.slice(-100);
    }
    
    // 更新当前模式
    if (result.confidence > 0.7) {
      this.currentMode = result.mode;
    }
  }

  getCurrentMode(): HeartbeatMode {
    return this.currentMode;
  }

  getSignalBuffer(): Signal[] {
    return [...this.signalBuffer];
  }
}
```

**验收标准**:
- [ ] 支持启动/停止三层定时器
- [ ] Layer 1 每5秒执行，Layer 2 每15秒执行，Layer 3 每30秒执行
- [ ] 信号缓冲区限制100条，超出时丢弃最旧的
- [ ] 置信度>0.7时才更新当前模式
- [ ] 提供 getCurrentMode() 和 getSignalBuffer() 查询接口

#### 3.2.2 Layer 1 快速检测（任务2.2）

**设计**:
```typescript
// 新增文件: heartbeat/layer1.ts
export interface Layer1Payload {
  timestamp: number;
  taskStatus: string | null;
  hasBackgroundBtn: boolean;
  hasCancelBtn: boolean;
  hasRetainDeleteBtns: boolean;
  activeTaskId: string | null;
}

export type Layer1Mode = 
  | 'normal'
  | 'task-interrupted'
  | 'terminal-hang'
  | 'modal-blocking'
  | 'task-completed';

export class Layer1Collector {
  async collect(cdp: CDPClient): Promise<{
    payload: Layer1Payload;
    mode: Layer1Mode;
    cost: number;
  }> {
    const startTime = Date.now();
    
    const payload: Layer1Payload = {
      timestamp: startTime,
      taskStatus: await this.getTaskStatus(cdp),
      hasBackgroundBtn: await this.hasElement(cdp, 'button:has-text("后台运行")'),
      hasCancelBtn: await this.hasElement(cdp, 'button:has-text("取消")'),
      hasRetainDeleteBtns: await this.hasRetainDeleteButtons(cdp),
      activeTaskId: await this.getActiveTaskId(cdp)
    };
    
    return {
      payload,
      mode: this.determineMode(payload),
      cost: Date.now() - startTime
    };
  }

  private determineMode(payload: Layer1Payload): Layer1Mode {
    if (payload.taskStatus?.includes('中断')) return 'task-interrupted';
    if (payload.hasRetainDeleteBtns) return 'modal-blocking';
    if (payload.hasBackgroundBtn) return 'terminal-hang';
    if (payload.taskStatus === '完成') return 'task-completed';
    return 'normal';
  }

  private async getTaskStatus(cdp: CDPClient): Promise<string | null> {
    // 通过CDP执行DOM查询
    const result = await cdp.send('Runtime.evaluate', {
      expression: `
        (() => {
          const items = document.querySelectorAll('.index-module__task-item___zOpfg');
          for (const item of items) {
            if (item.classList.contains('index-module__task-item--active___xyz')) {
              const statusEl = item.querySelector('.task-status-text');
              return statusEl?.textContent?.trim() || null;
            }
          }
          return null;
        })()
      `
    });
    return result.result?.value || null;
  }

  private async hasElement(cdp: CDPClient, selector: string): Promise<boolean> {
    const result = await cdp.send('Runtime.evaluate', {
      expression: `document.querySelector('${selector}') !== null`
    });
    return result.result?.value || false;
  }

  private async hasRetainDeleteButtons(cdp: CDPClient): Promise<boolean> {
    const hasRetain = await this.hasElement(cdp, 'button:has-text("保留")');
    const hasDelete = await this.hasElement(cdp, 'button:has-text("删除")');
    return hasRetain && hasDelete;
  }

  private async getActiveTaskId(cdp: CDPClient): Promise<string | null> {
    const result = await cdp.send('Runtime.evaluate', {
      expression: `
        (() => {
          const activeItem = document.querySelector('.index-module__task-item--active___xyz');
          if (!activeItem) return null;
          return activeItem.getAttribute('data-task-id') || 
                 activeItem.querySelector('[data-id]')?.getAttribute('data-id') || null;
        })()
      `
    });
    return result.result?.value || null;
  }
}
```

**验收标准**:
- [ ] 单次采集成本<5ms
- [ ] 正确检测5种模式（normal/task-interrupted/terminal-hang/modal-blocking/task-completed）
- [ ] 采集失败时返回空payload，模式为normal

#### 3.2.3 健康状态机（任务2.3）

**设计**:
```typescript
// 新增文件: heartbeat/state-machine.ts
export type HealthState = 
  | 'normal'      // 正常
  | 'idle'        // 空闲
  | 'background'  // 后台运行
  | 'frozen'      // 冻结
  | 'crashed';    // 崩溃

export interface StateTransition {
  from: HealthState;
  to: HealthState;
  trigger: string;
  action?: string;
}

export class HealthStateMachine {
  private currentState: HealthState = 'normal';
  private transitionHistory: StateTransition[] = [];
  private readonly MAX_HISTORY = 50;

  // 状态转换矩阵
  private static readonly TRANSITIONS: Record<HealthState, Record<string, HealthState>> = {
    normal: {
      'no-activity-5min': 'idle',
      'background-detected': 'background',
      'frozen-signal': 'frozen',
      'crash-signal': 'crashed'
    },
    idle: {
      'activity-resumed': 'normal',
      'frozen-signal': 'frozen'
    },
    background: {
      'foreground-detected': 'normal',
      'frozen-signal': 'frozen'
    },
    frozen: {
      'recovery-success': 'normal',
      'recovery-failed': 'crashed'
    },
    crashed: {
      'manual-restart': 'normal'
    }
  };

  transition(trigger: string): {
    success: boolean;
    from: HealthState;
    to: HealthState;
    action?: string;
  } {
    const from = this.currentState;
    const transitions = HealthStateMachine.TRANSITIONS[from];
    const to = transitions?.[trigger];

    if (!to) {
      return { success: false, from, to: from };
    }

    this.currentState = to;
    const transition: StateTransition = { from, to, trigger };
    this.transitionHistory.push(transition);
    
    if (this.transitionHistory.length > this.MAX_HISTORY) {
      this.transitionHistory = this.transitionHistory.slice(-this.MAX_HISTORY);
    }

    return { success: true, from, to };
  }

  getCurrentState(): HealthState {
    return this.currentState;
  }

  getTransitionHistory(): StateTransition[] {
    return [...this.transitionHistory];
  }

  canTransition(trigger: string): boolean {
    const transitions = HealthStateMachine.TRANSITIONS[this.currentState];
    return !!transitions?.[trigger];
  }
}
```

**验收标准**:
- [ ] 支持5种健康状态
- [ ] 状态转换遵循预定义矩阵
- [ ] 非法转换被拒绝
- [ ] 转换历史限制50条

#### 3.2.4 RecoveryExecutor 完整版（任务2.4）

**设计**:
```typescript
// 新增文件: heartbeat/recovery-executor.ts
export interface RecoveryAction {
  type: 'click' | 'send-key' | 'dismiss-modal' | 'restart-task';
  target?: string;
  workspaceId: string;
  taskId: string;
}

export interface PermissionCheckResult {
  allowed: boolean;
  reason: string;
  requiresConfirmation: boolean;
  remainingQuota: number;
}

export class RecoveryExecutor {
  private permissionChecker: PermissionChecker;
  private rateLimiter: RateLimiter;
  private auditLogger: RecoveryAuditLogger;
  private confirmationHandler: ConfirmationHandler;

  constructor(workspacePath: string) {
    this.permissionChecker = new PermissionChecker();
    this.rateLimiter = new RateLimiter();
    this.auditLogger = new RecoveryAuditLogger(workspacePath);
    this.confirmationHandler = new ConfirmationHandler();
  }

  async execute(action: RecoveryAction, executor: () => Promise<void>): Promise<{
    success: boolean;
    reason: string;
  }> {
    // 1. 权限检查
    const permResult = this.permissionChecker.checkPermission(action.type);
    if (!permResult.allowed) {
      this.auditLogger.log({ ...action, result: 'skipped', reason: permResult.reason, durationMs: 0 });
      return { success: false, reason: permResult.reason };
    }

    // 2. 速率限制
    const rateResult = this.rateLimiter.checkLimit(action.type, 5, 3600000);
    if (!rateResult.allowed) {
      return { success: false, reason: '速率限制' };
    }

    // 3. 人工确认（高风险操作）
    if (permResult.requiresConfirmation) {
      const confirmed = await this.confirmationHandler.requestConfirmation(action);
      if (!confirmed) {
        return { success: false, reason: '用户未确认' };
      }
    }

    // 4. 执行操作
    const startTime = Date.now();
    try {
      await executor();
      this.rateLimiter.recordOperation(action.type);
      this.auditLogger.log({ ...action, result: 'success', reason: '执行成功', durationMs: Date.now() - startTime });
      return { success: true, reason: '执行成功' };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : '未知错误';
      this.auditLogger.log({ ...action, result: 'failed', reason: errMsg, durationMs: Date.now() - startTime });
      return { success: false, reason: errMsg };
    }
  }
}
```

**验收标准**:
- [ ] 权限检查拒绝未授权操作
- [ ] 速率限制防止频繁操作
- [ ] 高风险操作需要人工确认
- [ ] 所有操作记录审计日志

---

## 四、Phase 3：完整方案落地（1个月，约56小时）

### 4.1 任务清单

| # | 任务 | 工时 | 优先级 | 文件 | 说明 |
|---|------|------|--------|------|------|
| 3.1 | Layer 2 内容检测 | 8h | 🟢 P2 | `heartbeat/layer2.ts` | CDP脚本执行+内容状态 |
| 3.2 | Layer 3 深度检测 | 12h | 🟢 P2 | `heartbeat/layer3.ts` | 内存/渲染管线分析 |
| 3.3 | 飞书分级通知 | 6h | 🟢 P2 | `heartbeat/notifier.ts` | info/recovery/critical |
| 3.4 | 配置系统 | 8h | 🟢 P2 | `config/heartbeat.yaml` | YAML+环境变量+运行时API |
| 3.5 | 健康仪表盘 | 10h | 🟢 P2 | `dashboard/` | Web界面展示健康状态 |
| 3.6 | 完整测试套件 | 12h | 🟢 P2 | `tests/heartbeat/` | 单元/E2E/长期运行测试 |

### 4.2 关键设计要点

#### 4.2.1 Layer 2 内容检测
- 检测DOM变化率（对比上一次采集的DOM哈希）
- 检测网络活动（CDP Network 域）
- 检测用户交互痕迹（鼠标/键盘事件监听）

#### 4.2.2 Layer 3 深度检测
- 内存使用分析（CDP Heap 快照）
- 渲染管线检查（FPS、卡顿帧数）
- 进程状态检查（CPU占用、是否无响应）

#### 4.2.3 飞书分级通知
```typescript
interface NotificationLevel {
  info: { color: 'blue'; mention: false };      // 普通信息
  recovery: { color: 'orange'; mention: true };  // 恢复通知
  critical: { color: 'red'; mention: true };     // 严重告警
}
```

#### 4.2.4 配置系统
```yaml
# config/heartbeat.yaml
heartbeat:
  layer1:
    interval: 5000
    timeout: 1000
    maxRetries: 3
  layer2:
    interval: 15000
    timeout: 5000
  layer3:
    interval: 30000
    timeout: 15000
  recovery:
    maxAttemptsPerHour: 5
    cooldownMs: 1000
    confirmationTimeout: 30000
```

---

## 五、测试用例

### 5.1 Phase 1 测试用例

#### TC1.1: 心跳周期缩短
```typescript
describe('Heartbeat Interval', () => {
  it('应支持10秒心跳周期', async () => {
    process.env.HEARTBEAT_INTERVAL_MS = '10000';
    const client = new CDPClient({ host: 'localhost', port: 9222 });
    await client.connect();
    
    let heartbeatCount = 0;
    const startTime = Date.now();
    
    // 监听25秒，应触发2次心跳
    await new Promise(resolve => setTimeout(resolve, 25000));
    
    // 验证心跳次数在2-3次之间（允许误差）
    expect(heartbeatCount).toBeGreaterThanOrEqual(2);
    expect(heartbeatCount).toBeLessThanOrEqual(3);
  });
});
```

#### TC1.2: 信号计数器持久化
```typescript
describe('Signal Persistence', () => {
  it('重启后应恢复信号计数', () => {
    // 模拟保存状态
    saveSignalState({
      consecutiveSignals: { 'terminal-hang': 2 },
      lastSignal: 'terminal-hang',
      lastUpdateTime: Date.now()
    });
    
    // 模拟重启后加载
    const state = loadSignalState();
    expect(state.consecutiveSignals['terminal-hang']).toBe(2);
    expect(state.lastSignal).toBe('terminal-hang');
  });
});
```

#### TC1.3: 恢复操作审计日志
```typescript
describe('Recovery Audit Log', () => {
  it('应记录每次恢复操作', async () => {
    const logger = new RecoveryAuditLogger('./test-workspace');
    logger.log({
      workspaceId: 'test-ws',
      taskId: 'test-task',
      action: 'click-stop',
      result: 'success',
      reason: '执行成功',
      durationMs: 100
    });
    
    // 验证日志文件存在
    const logPath = './test-workspace/logs/*/recovery-audit.jsonl';
    expect(existsSync(logPath)).toBe(true);
  });
});
```

#### TC1.4: 按钮白名单
```typescript
describe('Button Whitelist', () => {
  it('应拒绝未授权按钮', () => {
    const result = isButtonAllowed('button.unknown-btn');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('不在白名单中');
  });
  
  it('应允许白名单按钮', () => {
    const result = isButtonAllowed('button.stop-btn');
    expect(result.allowed).toBe(true);
    expect(result.entry?.displayName).toBe('停止');
  });
});
```

#### TC1.5: 速率限制
```typescript
describe('Rate Limiter', () => {
  it('应限制每小时操作次数', () => {
    const limiter = new RateLimiter();
    
    // 执行5次操作（达到上限）
    for (let i = 0; i < 5; i++) {
      limiter.recordOperation('recovery');
    }
    
    // 第6次应被拒绝
    const check = limiter.checkLimit('recovery', 5, 3600000);
    expect(check.allowed).toBe(false);
  });
});
```

### 5.2 Phase 2 测试用例

#### TC2.1: HeartbeatDetector 启动/停止
```typescript
describe('HeartbeatDetector', () => {
  it('应正确启动和停止三层定时器', async () => {
    const detector = new HeartbeatDetector(mockCDP);
    await detector.start();
    
    // 等待6秒，Layer 1应至少执行1次
    await new Promise(resolve => setTimeout(resolve, 6000));
    
    await detector.stop();
    expect(detector.getCurrentMode()).toBe('normal');
  });
});
```

#### TC2.2: Layer 1 模式检测
```typescript
describe('Layer1Collector', () => {
  it('应检测 terminal-hang 模式', async () => {
    const collector = new Layer1Collector();
    const result = await collector.collect(mockCDPWithBackgroundBtn);
    expect(result.mode).toBe('terminal-hang');
    expect(result.cost).toBeLessThan(5);
  });
});
```

#### TC2.3: 健康状态机
```typescript
describe('HealthStateMachine', () => {
  it('应正确转换状态', () => {
    const sm = new HealthStateMachine();
    expect(sm.getCurrentState()).toBe('normal');
    
    sm.transition('frozen-signal');
    expect(sm.getCurrentState()).toBe('frozen');
    
    sm.transition('recovery-success');
    expect(sm.getCurrentState()).toBe('normal');
  });
  
  it('应拒绝非法转换', () => {
    const sm = new HealthStateMachine();
    const result = sm.transition('invalid-trigger');
    expect(result.success).toBe(false);
    expect(sm.getCurrentState()).toBe('normal');
  });
});
```

### 5.3 Phase 3 测试用例

#### TC3.1: 端到端检测流程
```typescript
describe('E2E Heartbeat', () => {
  it('应完成完整的三层检测流程', async () => {
    const detector = new HeartbeatDetector(realCDP);
    await detector.start();
    
    // 模拟任务卡住
    await simulateTaskHang();
    
    // 等待 Layer 1 检测（5秒）
    await new Promise(resolve => setTimeout(resolve, 6000));
    expect(detector.getCurrentMode()).toBe('frozen');
    
    // 等待恢复
    await simulateRecovery();
    await new Promise(resolve => setTimeout(resolve, 6000));
    expect(detector.getCurrentMode()).toBe('normal');
    
    await detector.stop();
  });
});
```

---

## 六、验收标准

### 6.1 Phase 1 验收标准

| # | 验收项 | 验收方法 | 通过标准 |
|---|--------|----------|----------|
| 1 | 心跳周期缩短 | 运行系统，观察日志时间戳 | 心跳间隔≤10秒 |
| 2 | 信号持久化 | 重启进程，检查信号计数 | 计数不丢失 |
| 3 | 审计日志 | 触发恢复操作，检查日志文件 | JSONL格式，字段完整 |
| 4 | 按钮白名单 | 尝试点击未授权按钮 | 操作被拒绝，记录日志 |
| 5 | 速率限制 | 快速触发6次恢复 | 第6次被拒绝，提示等待时间 |

### 6.2 Phase 2 验收标准

| # | 验收项 | 验收方法 | 通过标准 |
|---|--------|----------|----------|
| 1 | HeartbeatDetector | 启动系统，运行10分钟 | 三层定时器正常执行，无内存泄漏 |
| 2 | Layer 1检测 | 模拟各种中断场景 | 5种模式检测准确率>90% |
| 3 | 状态机 | 触发状态转换 | 转换符合矩阵定义，历史记录完整 |
| 4 | RecoveryExecutor | 执行恢复操作 | 权限/速率/审计全部生效 |

### 6.3 Phase 3 验收标准

| # | 验收项 | 验收方法 | 通过标准 |
|---|--------|----------|----------|
| 1 | 完整三层检测 | 7x24小时运行 | 无崩溃，检测准确率>95% |
| 2 | 飞书通知 | 触发各级告警 | 消息格式正确，分级准确 |
| 3 | 配置系统 | 动态修改参数 | 无需重启生效 |
| 4 | 测试覆盖率 | 运行测试套件 | 覆盖率>80% |

---

## 七、实施路线图

```
Week 1 (Phase 1)
├── Day 1-2: 心跳周期缩短 + 信号持久化
├── Day 3-4: 审计日志 + 按钮白名单
└── Day 5: 速率限制 + Phase 1验收

Week 2-3 (Phase 2)
├── Week 2 Day 1-2: HeartbeatDetector核心类
├── Week 2 Day 3-4: Layer 1快速检测
├── Week 2 Day 5: 健康状态机
├── Week 3 Day 1-3: RecoveryExecutor完整版
└── Week 3 Day 4-5: Phase 2验收

Week 4-8 (Phase 3)
├── Week 4: Layer 2内容检测
├── Week 5: Layer 3深度检测
├── Week 6: 飞书分级通知 + 配置系统
├── Week 7: 健康仪表盘
└── Week 8: 完整测试套件 + Phase 3验收
```

---

## 八、风险评估与应对

| 风险 | 等级 | 影响 | 应对措施 |
|------|------|------|----------|
| 三层架构引入性能问题 | 🟡 中 | CPU占用增加 | Layer 1控制成本<5ms，必要时降级为单层 |
| 状态机转换逻辑复杂 | 🟡 中 | 难以维护 | 充分单元测试，转换矩阵可视化 |
| CDP连接不稳定 | 🟡 中 | 检测失效 | 增加CDP重连机制，超时降级 |
| 误报导致频繁恢复 | 🔴 高 | 用户体验差 | 提高连续信号阈值，增加人工确认 |
| 长期运行内存泄漏 | 🟡 中 | 系统崩溃 | 定期重启，监控内存使用 |

---

**编制**: AI Assistant
**日期**: 2026-04-29
**状态**: 待架构师评审确认
