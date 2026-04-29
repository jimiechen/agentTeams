// src/actions/wait-response.ts - 等待 AI 响应完成并解析内容
// 基于 v2026-04-28 方案，集成5信号采集和三类失败恢复

import createDebug from 'debug';
import { CDPClient } from '../cdp/client.js';
import { ResponseTimeoutError } from '../errors.js';
import { captureSnapshot, isModelStalled, isTaskCompleted, detectBlocking, SystemSnapshot } from './state-probe.js';
import { recoverTerminalHang, recoverDeleteModal, recoverOverwriteModal, recoverModelStalled } from './recover.js';
import { loadSignalState, updateSignalState, resetSignalState } from './signal-persist.js';
import type { WorkspaceLogger } from '../utils/workspace-logger.js';

const debug = createDebug('mvp:action:wait');

export interface WaitResponseOptions {
  timeoutMs?: number;       // 默认 300000 (5分钟)
  pollMs?: number;          // 心跳间隔，默认 2000
  taskName?: string;        // 要检查的任务名称，默认 PMCLI
  recoveryPolicy?: {
    terminalAction: 'background' | 'cancel';
    deleteAction: 'keep' | 'delete';
    overwriteAction: 'keep' | 'overwrite';
    maxModelRetries: number;
  };
  logger?: WorkspaceLogger; // 可选的logger，用于记录心跳
}

export interface TaskResult {
  text: string;
  html: string;
  hasCodeBlock: boolean;
  hasImage: boolean;
  hasFile: boolean;
  codeBlocks: Array<{ language: string; code: string }>;
  images: Array<{ src: string; alt: string }>;
  files: Array<{ name: string; url: string }>;
}

/**
 * 等待 AI 响应完成并解析内容
 * v2026-04-28: 集成5信号采集和三类失败恢复
 */
export async function waitResponse(cdp: CDPClient, opts?: WaitResponseOptions): Promise<string> {
  const timeoutMs = opts?.timeoutMs ?? 300000;  // 5分钟
  const pollMs = opts?.pollMs ?? 2000;
  const taskName = opts?.taskName ?? 'PMCLI';
  const policy = opts?.recoveryPolicy ?? {
    terminalAction: 'background',
    deleteAction: 'keep',
    overwriteAction: 'keep',
    maxModelRetries: 1,
  };

  const startTime = Date.now();
  debug(`Starting heartbeat check for task "${taskName}" (timeout=${timeoutMs}ms, poll=${pollMs}ms)`);

  const snapshots: SystemSnapshot[] = [];
  let checkCount = 0;
  let modelRetryCount = 0;

  // 加载持久化的信号状态
  let signalState = loadSignalState();
  debug('Loaded signal state: %o', signalState);

  // 心跳循环
  while (Date.now() - startTime < timeoutMs) {
    checkCount++;

    // 采集5信号快照
    const snap = await captureSnapshot(cdp);
    snapshots.push(snap);

    // 保留最近100个快照（防止内存无限增长）
    if (snapshots.length > 100) {
      snapshots.shift();
    }

    debug(`Heartbeat #${checkCount}: btn=${snap.btnFunction}, task=${snap.taskStatus}, terminal=${snap.hasTerminalBtn}, delete=${snap.hasDeleteCard}`);

    // 记录心跳到文件日志
    opts?.logger?.logHeartbeat(checkCount, {
      btnFunction: snap.btnFunction,
      taskStatus: snap.taskStatus,
      hasTerminalBtn: snap.hasTerminalBtn,
      hasDeleteCard: snap.hasDeleteCard,
      lastTurnTextLen: snap.lastTurnTextLen,
    });

    // ========== 优先级1: 检测阻塞性弹窗（最高优先级）==========
    const blocking = detectBlocking(snapshots);

    // 更新信号状态（用于持久化）
    if (blocking.type !== 'none') {
      signalState = updateSignalState(signalState, blocking.type);
      debug('Signal state updated: %s (consecutive=%d)', blocking.type, signalState.consecutiveSignals[blocking.type]);
    }

    if (blocking.type === 'delete_modal') {
      debug('Delete modal detected, recovering...');
      opts?.logger?.warn('Delete modal detected, recovering...', { action: policy.deleteAction });
      const result = await recoverDeleteModal(cdp, policy.deleteAction, {
        taskId: taskName,
        logger: opts?.logger,
      });
      debug('Delete modal recovery: %o', result);
      opts?.logger?.info('Delete modal recovery result', { success: result.success, action: result.action });
      if (result.success) {
        continue;  // 恢复后继续心跳
      }
    } else if (blocking.type === 'overwrite_modal') {
      debug('Overwrite modal detected, recovering...');
      opts?.logger?.warn('Overwrite modal detected, recovering...', { action: policy.overwriteAction });
      const result = await recoverOverwriteModal(cdp, policy.overwriteAction, {
        taskId: taskName,
        logger: opts?.logger,
      });
      debug('Overwrite modal recovery: %o', result);
      opts?.logger?.info('Overwrite modal recovery result', { success: result.success, action: result.action });
      if (result.success) {
        continue;
      }
    } else if (blocking.type === 'terminal_hang') {
      // 终端超时按钮出现超过5秒才处理
      const terminalFirstSeen = findFirstTerminalBtnTime(snapshots);
      if (terminalFirstSeen && Date.now() - terminalFirstSeen > 5000) {
        debug('Terminal hang detected (>5s), recovering...');
        opts?.logger?.warn('Terminal hang detected (>5s), recovering...', { action: policy.terminalAction });
        const result = await recoverTerminalHang(cdp, policy.terminalAction, {
          taskId: taskName,
          logger: opts?.logger,
        });
        debug('Terminal hang recovery: %o', result);
        opts?.logger?.info('Terminal hang recovery result', { success: result.success, action: result.action });
        if (result.success) {
          continue;
        }
      }
    }

    // ========== 优先级2: 检测任务完成 ==========
    if (isTaskCompleted(snapshots)) {
      const elapsed = Date.now() - startTime;
      debug(`Task completed after ${elapsed}ms (checked ${checkCount} times)`);
      opts?.logger?.info('Task completed', {
        elapsedMs: elapsed,
        heartbeatCount: checkCount,
        taskName,
      });
      break;
    }

    // ========== 优先级3: 检测模型停滞并恢复 ==========
    if (isModelStalled(snapshots, 30000)) {
      if (modelRetryCount < policy.maxModelRetries) {
        modelRetryCount++;
        debug(`Model stalled detected, retry ${modelRetryCount}/${policy.maxModelRetries}...`);
        opts?.logger?.warn('Model stalled detected, retrying...', { retryCount: modelRetryCount, maxRetries: policy.maxModelRetries });
        const result = await recoverModelStalled(cdp, {
          taskId: taskName,
          logger: opts?.logger,
        });
        debug('Model stalled recovery: %o', result);
        opts?.logger?.info('Model stalled recovery result', { success: result.success, action: result.action });
        if (result.success) {
          // 清空快照窗口，重新检测
          snapshots.length = 0;
          continue;
        }
      } else {
        debug('Max model retries reached');
        opts?.logger?.error('Max model retries reached', { retryCount: modelRetryCount, taskName });
        throw new Error(`[模型停滞] 任务 "${taskName}" 模型无响应超过30秒，已达最大重试次数(${policy.maxModelRetries})，请检查网络或稍后重试。`);
      }
    }

    // 等待下一次心跳
    await sleep(pollMs);
  }

  // 检查是否超时
  if (Date.now() - startTime >= timeoutMs) {
    const elapsed = Date.now() - startTime;
    debug(`Timeout after ${elapsed}ms`);
    opts?.logger?.error('Task timeout', {
      elapsedMs: elapsed,
      timeoutMs,
      heartbeatCount: checkCount,
      taskName,
    });
    throw new Error(`[任务超时] 任务 "${taskName}" 在 ${Math.round(elapsed / 1000)} 秒内未完成，已超时。请检查任务状态或稍后重试。`);
  }

  // 任务正常完成，重置信号状态
  resetSignalState();
  debug('Task completed normally, signal state reset');

  // 任务完成后，解析最终结果
  debug('Task completed, parsing result...');
  await sleep(500);  // 等待内容渲染

  const result = await getLastAIResponse(cdp);
  if (result && result.length > 0) {
    debug(`Result parsed: ${result.length} chars`);
    return result;
  }

  // 重试一次
  await sleep(1000);
  const retryResult = await getLastAIResponse(cdp);
  if (retryResult && retryResult.length > 0) {
    debug(`Result parsed on retry: ${retryResult.length} chars`);
    return retryResult;
  }

  throw new ResponseTimeoutError(timeoutMs);
}

/**
 * 查找终端按钮首次出现的时间
 */
function findFirstTerminalBtnTime(snapshots: SystemSnapshot[]): number | null {
  for (const snap of snapshots) {
    if (snap.hasTerminalBtn) {
      return snap.timestamp;
    }
  }
  return null;
}

/**
 * 获取最后一次 AI 响应内容
 */
async function getLastAIResponse(cdp: CDPClient): Promise<string> {
  const result = await cdp.evaluate(`
    (function() {
      const turns = document.querySelectorAll('.chat-turn');
      if (turns.length === 0) return '';
      
      for (let i = turns.length - 1; i >= 0; i--) {
        const turn = turns[i];
        if (!turn.classList.contains('user')) {
          let text = turn.innerText || '';
          text = text.replace(/复制图片/g, '').trim();
          return text;
        }
      }
      
      return '';
    })()
  `);
  
  return result || '';
}

/**
 * 获取详细的任务结果
 */
export async function getDetailedResult(cdp: CDPClient): Promise<TaskResult> {
  const result: TaskResult = {
    text: '',
    html: '',
    hasCodeBlock: false,
    hasImage: false,
    hasFile: false,
    codeBlocks: [],
    images: [],
    files: []
  };

  try {
    const data = await cdp.evaluate(`
      (function() {
        const turns = document.querySelectorAll('.chat-turn');
        if (turns.length === 0) return null;
        
        let lastAiTurn = null;
        for (let i = turns.length - 1; i >= 0; i--) {
          if (!turns[i].classList.contains('user')) {
            lastAiTurn = turns[i];
            break;
          }
        }
        
        if (!lastAiTurn) return null;
        
        return {
          text: lastAiTurn.innerText || '',
          html: lastAiTurn.innerHTML || '',
          hasCode: lastAiTurn.innerHTML?.includes('<code') || false,
        };
      })()
    `);
    
    if (data) {
      result.text = data.text?.replace(/复制图片/g, '').trim() || '';
      result.html = data.html || '';
      result.hasCodeBlock = data.hasCode || false;
      
      if (result.hasCodeBlock) {
        const detailData = await cdp.evaluate(`
          (function() {
            const turns = document.querySelectorAll('.chat-turn');
            let lastAiTurn = null;
            for (let i = turns.length - 1; i >= 0; i--) {
              if (!turns[i].classList.contains('user')) {
                lastAiTurn = turns[i];
                break;
              }
            }
            if (!lastAiTurn) return { codeBlocks: [], images: [] };
            
            return {
              codeBlocks: Array.from(lastAiTurn.querySelectorAll('pre code')).map(code => ({
                language: (code.className.match(/language-(\\w+)/)?.[1] || 'text'),
                code: code.innerText
              })),
              images: Array.from(lastAiTurn.querySelectorAll('img'))
                .filter(img => {
                  if (img.closest('.icd-avatar') || img.closest('.avatar')) return false;
                  const width = img.naturalWidth || img.width || 0;
                  const height = img.naturalHeight || img.height || 0;
                  if (width > 0 && width < 50 && height > 0 && height < 50) return false;
                  if (img.src && img.src.includes('data:image/svg')) return false;
                  return true;
                })
                .map(img => ({
                  src: img.src || '',
                  alt: img.alt || '图片'
                }))
            };
          })()
        `);
        result.codeBlocks = detailData?.codeBlocks || [];
        result.images = detailData?.images || [];
        result.hasImage = result.images.length > 0;
      }
    }
  } catch (err) {
    debug('Parse error: %s', (err as Error).message);
  }

  return result;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
