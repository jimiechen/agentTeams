// src/actions/state-probe.ts - 状态探针
// 采集任务级快照，直接查询每个任务的 DOM 节点，无需切换任务

import createDebug from 'debug';
import { CDPClient } from '../cdp/client.js';

const debug = createDebug('mvp:probe');

export interface TaskSnapshot {
  taskId: string;           // 任务标识
  taskName: string;         // 任务名称
  status: 'in_progress' | 'completed' | 'interrupted' | 'unknown';
  isActive: boolean;        // 是否是当前活动任务
  isSelected: boolean;      // 是否被选中
  // 直接从该任务的 DOM 容器里读取
  hasCancelBtn: boolean;
  hasBackgroundBtn: boolean;
  outputSnapshot: string;   // 输出区域内容快照（最后500字符）
  silentDurationMs: number; // 距上次输出变化的静默时长（由外部 tracker 维护）
}

export interface SystemSnapshot {
  // 信号1：按钮态（决定AI是否在生成）
  btnIcon: string;
  btnDisabled: boolean;
  btnFunction: 'send' | 'stop' | 'disabled' | 'unknown';

  // 信号2：最后一个chat-turn文本长度（决定是否流式停滞）
  lastTurnTextLen: number;
  lastTurnText: string;

  // 信号3：终端超时按钮（当前活动任务）
  hasTerminalBtn: boolean;
  terminalBtnText: string;

  // 信号4：删除文件弹窗（决定是否文件操作等待）
  hasDeleteCard: boolean;
  hasOverwriteCard: boolean;

  // 信号5：侧边栏任务状态（当前选中任务）
  taskStatus: 'completed' | 'interrupted' | 'running' | 'unknown';
  taskText: string;

  // 信号6：所有任务的独立快照（核心改动）
  allTasks: TaskSnapshot[];

  // 元数据
  timestamp: number;
}

/**
 * 采集系统状态快照
 * 核心改动：在单次 CDP 调用中采集所有任务的独立快照，无需切换任务
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
    allTasks: TaskSnapshot[];
    timestamp: number;
  }>(`
    (() => {
      // 信号1：按钮态（当前活动任务）
      const sendBtn = document.querySelector('.chat-input-v2-send-button');
      const icon = sendBtn?.querySelector('.codicon');
      const btnIcon = icon?.className || '';
      const btnDisabled = sendBtn?.disabled || false;

      // 信号2：最后一个chat-turn（当前活动任务）
      const turns = document.querySelectorAll('.chat-turn');
      const lastTurn = turns[turns.length - 1];
      const lastTurnText = lastTurn?.textContent || '';
      const lastTurnTextLen = lastTurnText.length;

      // 信号3：终端超时按钮（当前活动任务）
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

      // 信号5 & 6：侧边栏任务状态 + 所有任务独立快照
      const taskItems = document.querySelectorAll('.index-module__task-item___zOpfg');
      let taskStatus = 'unknown';
      let taskText = '';
      const allTasks = [];
      
      for (const item of taskItems) {
        const text = item.textContent || '';
        const isSelected = item.className.includes('selected') || 
                          item.classList.contains('selected');
        
        // 识别任务名称和状态
        let taskName = 'unknown';
        if (text.includes('PMCLI')) taskName = 'PMCLI';
        else if (text.includes('DEVCLI')) taskName = 'DEVCLI';
        else if (text.includes('WikiBot')) taskName = 'WikiBot';
        
        let status = 'unknown';
        if (text.includes('完成')) status = 'completed';
        else if (text.includes('中断')) status = 'interrupted';
        else if (text.includes('进行中')) status = 'in_progress';
        
        // 核心改动：尝试在 DOM 中查找该任务对应的按钮节点
        // 策略1：通过任务项的兄弟节点或父节点查找
        // 策略2：通过 data-task-id 关联
        let hasCancelBtn = false;
        let hasBackgroundBtn = false;
        let outputSnapshot = '';
        
        // 尝试查找与该任务相关的按钮（可能在同一容器内）
        const taskContainer = item.closest('[data-task-panel], [class*="task"], [class*="chat"]');
        if (taskContainer) {
          const cancelBtn = taskContainer.querySelector('button[aria-label*="取消"], .icd-btn.icd-btn-tertiary');
          const bgBtn = taskContainer.querySelector('button[aria-label*="后台"], .icd-btn.icd-btn-tertiary');
          
          if (cancelBtn) {
            const btnText = cancelBtn.textContent || '';
            hasCancelBtn = btnText.includes('取消');
          }
          if (bgBtn) {
            const btnText = bgBtn.textContent || '';
            hasBackgroundBtn = btnText.includes('后台');
          }
          
          // 获取输出区域快照
          const outputEl = taskContainer.querySelector('.chat-turn, .terminal, [class*="output"]');
          outputSnapshot = outputEl?.textContent?.slice(-500) || '';
        }
        
        // 如果容器内没找到，尝试全局查找（兜底）
        if (!hasCancelBtn && !hasBackgroundBtn && isSelected) {
          // 当前活动任务，使用全局按钮检测
          hasCancelBtn = terminalBtnText.includes('取消');
          hasBackgroundBtn = terminalBtnText.includes('后台');
        }
        
        allTasks.push({
          taskId: taskName,
          taskName,
          status,
          isActive: isSelected,
          isSelected,
          hasCancelBtn,
          hasBackgroundBtn,
          outputSnapshot,
          silentDurationMs: 0  // 由外部 tracker 维护
        });
        
        if (isSelected) {
          taskText = text.slice(0, 50);
          taskStatus = status;
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
        allTasks,
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

  return {
    btnIcon: result.btnIcon,
    btnDisabled: result.btnDisabled,
    btnFunction,
    lastTurnTextLen: result.lastTurnTextLen,
    lastTurnText: result.lastTurnText,
    hasTerminalBtn: result.hasTerminalBtn,
    terminalBtnText: result.terminalBtnText,
    hasDeleteCard: result.hasDeleteCard,
    hasOverwriteCard: result.hasOverwriteCard,
    taskStatus: result.taskStatus as SystemSnapshot['taskStatus'],
    taskText: result.taskText,
    allTasks: result.allTasks || [],
    timestamp: result.timestamp,
  };
}

/**
 * 检测模型是否停滞
 * 基于最近N个快照的lastTurnTextLen是否变化
 */
export function isModelStalled(snapshots: SystemSnapshot[], thresholdMs: number): boolean {
  if (snapshots.length < 3) return false;

  const now = Date.now();
  const recent = snapshots.filter(s => now - s.timestamp < thresholdMs);
  if (recent.length < 3) return false;

  // 检查最近N个快照的lastTurnTextLen是否完全相同
  const firstLen = recent[0].lastTurnTextLen;
  const allSame = recent.every(s => s.lastTurnTextLen === firstLen);

  // 同时检查按钮状态是否一直是stop（表示AI在生成但内容没变化）
  const allStopping = recent.every(s => s.btnFunction === 'stop');

  return allSame && allStopping;
}

/**
 * 检测任务是否完成
 * 基于taskStatus和按钮状态
 */
export function isTaskCompleted(snapshots: SystemSnapshot[]): boolean {
  if (snapshots.length === 0) return false;
  const latest = snapshots[snapshots.length - 1];
  return latest.taskStatus === 'completed' || latest.btnFunction === 'send';
}

/**
 * 检测阻塞性弹窗
 */
export function detectBlocking(snapshots: SystemSnapshot[]): {
  type: 'delete_modal' | 'overwrite_modal' | 'terminal_hang' | 'none';
  duration: number;
} {
  if (snapshots.length < 2) return { type: 'none', duration: 0 };

  const latest = snapshots[snapshots.length - 1];

  // 删除/覆盖弹窗检测
  if (latest.hasDeleteCard) {
    return { type: 'delete_modal', duration: 0 };
  }
  if (latest.hasOverwriteCard) {
    return { type: 'overwrite_modal', duration: 0 };
  }

  // 终端挂起检测（后台运行/取消按钮持续存在）
  if (latest.hasTerminalBtn) {
    const firstSeen = findFirstTerminalBtnTime(snapshots);
    if (firstSeen) {
      const duration = Date.now() - firstSeen;
      return { type: 'terminal_hang', duration };
    }
  }

  return { type: 'none', duration: 0 };
}

/**
 * 查找终端按钮首次出现的时间
 */
export function findFirstTerminalBtnTime(snapshots: SystemSnapshot[]): number | null {
  for (let i = snapshots.length - 1; i >= 0; i--) {
    if (!snapshots[i].hasTerminalBtn) {
      return snapshots[i + 1]?.timestamp || null;
    }
  }
  return snapshots[0]?.timestamp || null;
}

/**
 * 检测是否有任务处于可疑状态
 * 基于任务级快照判断
 */
export function detectSuspiciousTasks(
  snapshots: SystemSnapshot[],
  suspiciousThresholdMs: number = 300000
): Array<{
  taskName: string;
  status: string;
  hasCancelBtn: boolean;
  hasBackgroundBtn: boolean;
  silentMs: number;
}> {
  if (snapshots.length === 0) return [];

  const latest = snapshots[snapshots.length - 1];
  const suspicious: ReturnType<typeof detectSuspiciousTasks> = [];

  for (const task of latest.allTasks) {
    // 关键判断：in_progress 但长时间没有取消按钮
    if (task.status === 'in_progress' && !task.hasCancelBtn && !task.hasBackgroundBtn) {
      suspicious.push({
        taskName: task.taskName,
        status: task.status,
        hasCancelBtn: task.hasCancelBtn,
        hasBackgroundBtn: task.hasBackgroundBtn,
        silentMs: task.silentDurationMs,
      });
    }
  }

  return suspicious;
}
