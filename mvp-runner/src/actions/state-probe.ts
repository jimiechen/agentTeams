// src/actions/state-probe.ts - 状态探针
// 采集5个关键信号，用于诊断任务卡死原因

import createDebug from 'debug';
import { CDPClient } from '../cdp/client.js';

const debug = createDebug('mvp:probe');

export interface SystemSnapshot {
  // 信号1：按钮态（决定AI是否在生成）
  btnIcon: string;
  btnDisabled: boolean;
  btnFunction: 'send' | 'stop' | 'disabled' | 'unknown';

  // 信号2：最后一个chat-turn文本长度（决定是否流式停滞）
  lastTurnTextLen: number;
  lastTurnText: string;

  // 信号3：终端超时按钮（决定是否终端卡死）
  hasTerminalBtn: boolean;
  terminalBtnText: string;

  // 信号4：删除文件弹窗（决定是否文件操作等待）
  hasDeleteCard: boolean;
  hasOverwriteCard: boolean;

  // 信号5：侧边栏任务状态
  taskStatus: 'completed' | 'interrupted' | 'running' | 'unknown';
  taskText: string;

  // 元数据
  timestamp: number;
}

/**
 * 采集系统状态快照
 * 基于 docs/TabAI会话_1777346912451.md 的5信号采集方案
 */
export async function captureSnapshot(cdp: CDPClient): Promise<SystemSnapshot> {
  debug('Capturing system snapshot...');

  const result = await cdp.evaluate<{
    btnIcon: string;
    btnDisabled: boolean;
    lastTurnTextLen: number;
    lastTurnText: string;
    hasTerminalBtn: boolean;
    terminalBtnText: string;
    hasDeleteCard: boolean;
    hasOverwriteCard: boolean;
    taskStatus: string;
    taskText: string;
    timestamp: number;
  }>(`
    (() => {
      // 信号1：按钮态
      const sendBtn = document.querySelector('.chat-input-v2-send-button');
      const icon = sendBtn?.querySelector('.codicon');
      const btnIcon = icon?.className || '';
      const btnDisabled = sendBtn?.disabled || false;

      // 信号2：最后一个chat-turn
      const turns = document.querySelectorAll('.chat-turn');
      const lastTurn = turns[turns.length - 1];
      const lastTurnText = lastTurn?.textContent || '';
      const lastTurnTextLen = lastTurnText.length;

      // 信号3：终端超时按钮
      const terminalBtns = document.querySelectorAll('.icd-btn.icd-btn-tertiary');
      let hasTerminalBtn = false;
      let terminalBtnText = '';
      for (const btn of terminalBtns) {
        const text = btn.textContent || '';
        if (/后台运行|取消/.test(text)) {
          hasTerminalBtn = true;
          terminalBtnText = text;
          break;
        }
      }

      // 信号4：删除/覆盖文件弹窗
      const hasDeleteCard = !!document.querySelector('.icd-delete-files-command-card-v2-actions-delete');
      const hasOverwriteCard = !!document.querySelector('.icd-overwrite-files-command-card-v2-actions-overwrite');

      // 信号5：侧边栏任务状态
      const taskItems = document.querySelectorAll('.index-module__task-item___zOpfg');
      let taskStatus = 'unknown';
      let taskText = '';
      for (const item of taskItems) {
        const text = item.textContent || '';
        const isSelected = item.className.includes('selected') || 
                          item.classList.contains('selected');
        if (isSelected) {
          taskText = text.slice(0, 50);
          if (text.includes('完成')) taskStatus = 'completed';
          else if (text.includes('中断')) taskStatus = 'interrupted';
          else if (text.includes('进行中')) taskStatus = 'running';
          break;
        }
      }

      return {
        btnIcon,
        btnDisabled,
        lastTurnTextLen,
        lastTurnText: lastTurnText.slice(0, 100),
        hasTerminalBtn,
        terminalBtnText,
        hasDeleteCard,
        hasOverwriteCard,
        taskStatus,
        taskText,
        timestamp: Date.now(),
      };
    })()
  `);

  // 判断按钮功能
  let btnFunction: 'send' | 'stop' | 'disabled' | 'unknown' = 'unknown';
  if (result.btnDisabled) {
    btnFunction = 'disabled';
  } else if (result.btnIcon.match(/stop/i)) {
    btnFunction = 'stop';
  } else if (result.btnIcon.match(/ArrowUp/i)) {
    btnFunction = 'send';
  }

  const snapshot: SystemSnapshot = {
    btnIcon: result.btnIcon,
    btnDisabled: result.btnDisabled,
    btnFunction,
    lastTurnTextLen: result.lastTurnTextLen,
    lastTurnText: result.lastTurnText,
    hasTerminalBtn: result.hasTerminalBtn,
    terminalBtnText: result.terminalBtnText,
    hasDeleteCard: result.hasDeleteCard,
    hasOverwriteCard: result.hasOverwriteCard,
    taskStatus: result.taskStatus as any,
    taskText: result.taskText,
    timestamp: result.timestamp,
  };

  debug('Snapshot captured: %o', {
    btnFunction: snapshot.btnFunction,
    lastTurnTextLen: snapshot.lastTurnTextLen,
    hasTerminalBtn: snapshot.hasTerminalBtn,
    hasDeleteCard: snapshot.hasDeleteCard,
    taskStatus: snapshot.taskStatus,
  });

  return snapshot;
}

/**
 * 检测模型是否停滞
 * 基于滑动窗口内 textLen 的方差判定
 */
export function isModelStalled(
  snapshots: SystemSnapshot[],
  thresholdMs: number = 30000,
  minSamples: number = 5,
): boolean {
  if (snapshots.length < minSamples) return false;

  const now = Date.now();
  const windowStart = now - thresholdMs;

  // 获取滑动窗口内的样本
  const windowSamples = snapshots.filter(s => s.timestamp >= windowStart);
  if (windowSamples.length < minSamples) return false;

  // 检查按钮是否在停止态
  const lastSample = windowSamples[windowSamples.length - 1];
  if (lastSample.btnFunction !== 'stop') return false;

  // 检查 textLen 是否变化
  const textLens = windowSamples.map(s => s.lastTurnTextLen);
  const uniqueLens = new Set(textLens);

  // 如果文本长度无变化，判定为停滞
  if (uniqueLens.size === 1) {
    debug('Model stalled detected: textLen unchanged for %d ms', thresholdMs);
    return true;
  }

  return false;
}

/**
 * 检测任务是否完成
 */
export function isTaskCompleted(snapshots: SystemSnapshot[]): boolean {
  if (snapshots.length === 0) return false;

  const lastSample = snapshots[snapshots.length - 1];

  // 侧边栏显示完成
  if (lastSample.taskStatus === 'completed') {
    debug('Task completed detected from sidebar');
    return true;
  }

  // 侧边栏显示中断
  if (lastSample.taskStatus === 'interrupted') {
    debug('Task interrupted detected from sidebar');
    return true;
  }

  return false;
}

/**
 * 检测需要立即处理的阻塞
 */
export function detectBlocking(snapshots: SystemSnapshot[]): {
  type: 'delete_modal' | 'overwrite_modal' | 'terminal_hang' | 'none';
  details: string;
} {
  if (snapshots.length === 0) return { type: 'none', details: '' };

  const lastSample = snapshots[snapshots.length - 1];

  // 最高优先级：删除文件弹窗
  if (lastSample.hasDeleteCard) {
    return { type: 'delete_modal', details: 'Delete file modal detected' };
  }

  // 次高优先级：覆盖文件弹窗
  if (lastSample.hasOverwriteCard) {
    return { type: 'overwrite_modal', details: 'Overwrite file modal detected' };
  }

  // 第三优先级：终端超时按钮
  if (lastSample.hasTerminalBtn) {
    return { type: 'terminal_hang', details: `Terminal button: ${lastSample.terminalBtnText}` };
  }

  return { type: 'none', details: '' };
}
