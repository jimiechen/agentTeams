/**
 * Heartbeat Module - 心跳检测模块入口
 * 导出所有心跳检测相关的类和类型
 */

export { HeartbeatDetector } from './detector.js';
export { HealthStateMachine } from './state-machine.js';
export { Layer1Collector } from './layer1.js';
export {
  RecoveryExecutor,
  RECOVERY_ACTIONS,
  DEFAULT_RECOVERY_CONFIG,
} from './recovery-executor.js';
export type {
  RecoveryAction,
  RecoveryResult,
  AuditLogEntry,
  RecoveryConfig,
} from './recovery-executor.js';
export type {
  HeartbeatMode,
  SignalType,
  Signal,
  DetectionResult,
  HeartbeatConfig,
} from './types.js';
export { DEFAULT_HEARTBEAT_CONFIG } from './types.js';
export type { StateTransition } from './state-machine.js';
