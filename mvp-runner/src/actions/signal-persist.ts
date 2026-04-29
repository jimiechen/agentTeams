/**
 * Signal Persistence - 信号计数器持久化
 * 存储到 mvp-runner/logs/signal-state.json
 * 重启后恢复信号计数，避免误报
 */

import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
} from 'node:fs';
import path from 'node:path';

const SIGNAL_STATE_FILE = path.resolve('./logs/signal-state.json');
const MAX_FILE_SIZE = 10 * 1024; // 10KB

export interface SignalState {
  consecutiveSignals: Record<string, number>;
  lastSignal: string | null;
  lastUpdateTime: number;
}

function ensureDir(): void {
  mkdirSync(path.dirname(SIGNAL_STATE_FILE), { recursive: true });
}

export function loadSignalState(): SignalState {
  if (!existsSync(SIGNAL_STATE_FILE)) {
    return { consecutiveSignals: {}, lastSignal: null, lastUpdateTime: 0 };
  }
  try {
    const content = readFileSync(SIGNAL_STATE_FILE, 'utf-8');
    return JSON.parse(content);
  } catch {
    return { consecutiveSignals: {}, lastSignal: null, lastUpdateTime: 0 };
  }
}

export function saveSignalState(state: SignalState): void {
  ensureDir();
  const content = JSON.stringify(state, null, 2);
  if (content.length > MAX_FILE_SIZE) {
    // 如果超出大小限制，清空旧数据只保留最近一条
    const trimmed: SignalState = {
      consecutiveSignals: state.lastSignal
        ? { [state.lastSignal]: state.consecutiveSignals[state.lastSignal] || 1 }
        : {},
      lastSignal: state.lastSignal,
      lastUpdateTime: state.lastUpdateTime,
    };
    writeFileSync(SIGNAL_STATE_FILE, JSON.stringify(trimmed, null, 2));
    return;
  }
  writeFileSync(SIGNAL_STATE_FILE, content);
}

export function updateSignalState(
  currentState: SignalState,
  signal: string
): SignalState {
  if (signal === currentState.lastSignal) {
    currentState.consecutiveSignals[signal] =
      (currentState.consecutiveSignals[signal] || 0) + 1;
  } else {
    // 信号变化时，重置计数
    currentState.consecutiveSignals = { [signal]: 1 };
  }
  currentState.lastSignal = signal;
  currentState.lastUpdateTime = Date.now();
  saveSignalState(currentState);
  return currentState;
}

export function resetSignalState(): void {
  saveSignalState({
    consecutiveSignals: {},
    lastSignal: null,
    lastUpdateTime: 0,
  });
}
