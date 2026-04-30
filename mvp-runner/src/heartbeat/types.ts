/**
 * Heartbeat 类型定义
 * 三层心跳检测架构的核心类型
 */

export type HeartbeatMode =
  | 'normal'
  | 'idle'
  | 'background'
  | 'frozen'
  | 'crashed';

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

export interface Signal {
  type: SignalType;
  source: 'layer1' | 'layer2' | 'layer3';
  value: any;
  timestamp: number;
  weight: number;
}

export interface DetectionResult {
  mode: HeartbeatMode;
  confidence: number;
  signals: Signal[];
  timestamp: number;
  layer: 1 | 2 | 3;
  cost: number;
}

export interface BackgroundTimeoutRecoveryConfig {
  enabled: boolean;
  silentTimeoutMs: number;
  domSampleIntervalMs: number;
  clickIntervals: {
    afterBackgroundClickMs: number;
    afterCancelClickMs: number;
    minWaitMs: number;
    maxWaitMs: number;
    pollIntervalMs: number;
  };
  dynamicWait: {
    enabled: boolean;
    minWaitBeforePollMs: number;
  };
  maxTriggerPerTask: number;
  cooldownMs: number;
  feishuNotify: boolean;
}

export interface HeartbeatConfig {
  layer1Interval: number;
  layer2Interval: number;
  layer3Interval: number;
  maxRetries: number;
  retryDelay: number;
  signalBufferSize: number;
  confidenceThreshold: number;
  backgroundTimeoutRecovery?: Partial<BackgroundTimeoutRecoveryConfig>;
}

export const DEFAULT_BACKGROUND_TIMEOUT_CONFIG: BackgroundTimeoutRecoveryConfig = {
  enabled: true,
  silentTimeoutMs: 300000, // 5分钟
  domSampleIntervalMs: 10000, // 10秒
  clickIntervals: {
    afterBackgroundClickMs: 30000, // 30秒
    afterCancelClickMs: 10000, // 10秒
    minWaitMs: 5000, // 5秒
    maxWaitMs: 120000, // 120秒
    pollIntervalMs: 1000, // 1秒
  },
  dynamicWait: {
    enabled: true,
    minWaitBeforePollMs: 5000, // 5秒
  },
  maxTriggerPerTask: 2,
  cooldownMs: 60000, // 60秒
  feishuNotify: true,
};

export const DEFAULT_HEARTBEAT_CONFIG: HeartbeatConfig = {
  layer1Interval: 5000,
  layer2Interval: 15000,
  layer3Interval: 30000,
  maxRetries: 3,
  retryDelay: 1000,
  signalBufferSize: 100,
  confidenceThreshold: 0.7,
};
