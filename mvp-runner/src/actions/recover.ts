// src/actions/recover.ts - 恢复动作
// 三类失败的恢复函数

import createDebug from 'debug';
import { CDPClient } from '../cdp/client.js';
import type { WorkspaceLogger } from '../utils/workspace-logger.js';
import { isButtonAllowed, requiresConfirmation } from './button-whitelist.js';
import { recoveryRateLimiter } from '../utils/rate-limiter.js';

const debug = createDebug('mvp:recover');

export interface RecoveryResult {
  success: boolean;
  action: string;
  reason?: string;
}

export interface RecoveryOptions {
  taskId?: string;
  logger?: WorkspaceLogger;
}

/**
 * 恢复终端卡死
 * 点击"后台运行"或"取消"按钮
 */
export async function recoverTerminalHang(
  cdp: CDPClient,
  policy: 'background' | 'cancel' = 'background',
  options?: RecoveryOptions,
): Promise<RecoveryResult> {
  debug('Recovering terminal hang with policy: %s', policy);
  const startTime = Date.now();

  // 1. 按钮白名单检查
  const selector = '.icd-btn.icd-btn-tertiary';
  const whitelistCheck = isButtonAllowed(selector);
  if (!whitelistCheck.allowed) {
    debug('Button not in whitelist: %s', whitelistCheck.reason);
    options?.logger?.logRecoveryAudit({
      taskId: options?.taskId || 'unknown',
      action: 'click-stop',
      result: 'skipped',
      reason: whitelistCheck.reason || '不在白名单',
      durationMs: 0,
    });
    return { success: false, action: policy, reason: whitelistCheck.reason };
  }

  // 2. 速率限制检查
  const rateCheck = recoveryRateLimiter.checkLimit('recovery', 5, 3600000);
  if (!rateCheck.allowed) {
    debug('Rate limit exceeded: %s', rateCheck.reason);
    options?.logger?.logRecoveryAudit({
      taskId: options?.taskId || 'unknown',
      action: 'click-stop',
      result: 'skipped',
      reason: rateCheck.reason || '速率限制',
      durationMs: 0,
    });
    return { success: false, action: policy, reason: rateCheck.reason };
  }

  const selectorText = policy === 'background' ? '后台运行' : '取消';

  const result = await cdp.evaluate<{
    success: boolean;
    action: string;
    reason?: string;
  }>(`
    (() => {
      const buttons = document.querySelectorAll('.icd-btn.icd-btn-tertiary');
      const btn = Array.from(buttons).find(b => 
        b.textContent?.includes('${selectorText}')
      );
      
      if (!btn) {
        return { success: false, action: '${policy}', reason: 'button-not-found' };
      }
      
      if (btn.offsetParent === null) {
        return { success: false, action: '${policy}', reason: 'button-not-visible' };
      }
      
      try {
        btn.click();
        return { success: true, action: '${policy}' };
      } catch (err) {
        return { success: false, action: '${policy}', reason: err.message };
      }
    })()
  `);

  // 等待1秒验证信号消失
  if (result.success) {
    await new Promise(r => setTimeout(r, 1000));
    const verified = await cdp.evaluate<boolean>(`
      (() => {
        const buttons = document.querySelectorAll('.icd-btn.icd-btn-tertiary');
        return !Array.from(buttons).some(b => 
          /后台运行|取消/.test(b.textContent || '')
        );
      })()
    `);
    
    if (!verified) {
      debug('Terminal hang recovery not verified');
      result.success = false;
      result.reason = 'not-verified';
    }
  }

  // 记录审计日志
  options?.logger?.logRecoveryAudit({
    taskId: options?.taskId || 'unknown',
    action: policy === 'background' ? 'click-stop' : 'send-esc',
    result: result.success ? 'success' : 'failed',
    reason: result.reason || '执行成功',
    durationMs: Date.now() - startTime,
  });

  // 记录速率限制操作
  if (result.success) {
    recoveryRateLimiter.recordOperation('recovery');
  }

  debug('Terminal hang recovery result: %o', result);
  return result;
}

/**
 * 恢复删除文件弹窗
 * 点击"保留"或"删除"按钮
 */
export async function recoverDeleteModal(
  cdp: CDPClient,
  policy: 'keep' | 'delete' = 'keep',
  options?: RecoveryOptions,
): Promise<RecoveryResult> {
  debug('Recovering delete modal with policy: %s', policy);
  const startTime = Date.now();

  const selector = policy === 'delete'
    ? '.icd-delete-files-command-card-v2-actions-delete'
    : '.icd-delete-files-command-card-v2-actions-cancel';

  const result = await cdp.evaluate<{
    success: boolean;
    action: string;
    reason?: string;
  }>(`
    (() => {
      const btn = document.querySelector('${selector}');
      
      if (!btn) {
        return { success: false, action: '${policy}', reason: 'modal-not-found' };
      }
      
      try {
        btn.click();
        return { success: true, action: '${policy}' };
      } catch (err) {
        return { success: false, action: '${policy}', reason: err.message };
      }
    })()
  `);

  // 等待1秒验证弹窗消失
  if (result.success) {
    await new Promise(r => setTimeout(r, 1000));
    const verified = await cdp.evaluate<boolean>(`
      !document.querySelector('.icd-delete-files-command-card-v2-actions-delete')
    `);
    
    if (!verified) {
      debug('Delete modal recovery not verified');
      result.success = false;
      result.reason = 'not-verified';
    }
  }

  // 记录审计日志
  options?.logger?.logRecoveryAudit({
    taskId: options?.taskId || 'unknown',
    action: policy === 'delete' ? 'click-delete' : 'click-retain',
    result: result.success ? 'success' : 'failed',
    reason: result.reason || '执行成功',
    durationMs: Date.now() - startTime,
  });

  debug('Delete modal recovery result: %o', result);
  return result;
}

/**
 * 恢复覆盖文件弹窗
 * 点击"保留"或"覆盖"按钮
 */
export async function recoverOverwriteModal(
  cdp: CDPClient,
  policy: 'keep' | 'overwrite' = 'keep',
  options?: RecoveryOptions,
): Promise<RecoveryResult> {
  debug('Recovering overwrite modal with policy: %s', policy);
  const startTime = Date.now();

  const selector = policy === 'overwrite'
    ? '.icd-overwrite-files-command-card-v2-actions-overwrite'
    : '.icd-overwrite-files-command-card-v2-actions-cancel';

  const result = await cdp.evaluate<{
    success: boolean;
    action: string;
    reason?: string;
  }>(`
    (() => {
      const btn = document.querySelector('${selector}');
      
      if (!btn) {
        return { success: false, action: '${policy}', reason: 'modal-not-found' };
      }
      
      try {
        btn.click();
        return { success: true, action: '${policy}' };
      } catch (err) {
        return { success: false, action: '${policy}', reason: err.message };
      }
    })()
  `);

  // 等待1秒验证弹窗消失
  if (result.success) {
    await new Promise(r => setTimeout(r, 1000));
    const verified = await cdp.evaluate<boolean>(`
      !document.querySelector('.icd-overwrite-files-command-card-v2-actions-overwrite')
    `);
    
    if (!verified) {
      debug('Overwrite modal recovery not verified');
      result.success = false;
      result.reason = 'not-verified';
    }
  }

  // 记录审计日志
  options?.logger?.logRecoveryAudit({
    taskId: options?.taskId || 'unknown',
    action: policy === 'overwrite' ? 'click-delete' : 'click-retain',
    result: result.success ? 'success' : 'failed',
    reason: result.reason || '执行成功',
    durationMs: Date.now() - startTime,
  });

  debug('Overwrite modal recovery result: %o', result);
  return result;
}

/**
 * 恢复模型停滞
 * 点击停止按钮
 */
export async function recoverModelStalled(
  cdp: CDPClient,
  options?: RecoveryOptions,
): Promise<RecoveryResult> {
  debug('Recovering model stalled');
  const startTime = Date.now();

  // 先检查按钮状态
  const status = await cdp.evaluate<{
    isStop: boolean;
    found: boolean;
  }>(`
    (() => {
      const btn = document.querySelector('.chat-input-v2-send-button');
      const icon = btn?.querySelector('.codicon');
      return {
        isStop: (icon?.className || '').match(/stop/i) ? true : false,
        found: !!btn,
      };
    })()
  `);

  if (!status.found) {
    const result = { success: false, action: 'stop', reason: 'button-not-found' };
    options?.logger?.logRecoveryAudit({
      taskId: options?.taskId || 'unknown',
      action: 'click-stop',
      result: 'failed',
      reason: result.reason,
      durationMs: Date.now() - startTime,
    });
    return result;
  }

  if (!status.isStop) {
    const result = { success: false, action: 'stop', reason: 'not-in-stop-state' };
    options?.logger?.logRecoveryAudit({
      taskId: options?.taskId || 'unknown',
      action: 'click-stop',
      result: 'skipped',
      reason: result.reason,
      durationMs: Date.now() - startTime,
    });
    return result;
  }

  // 点击停止按钮
  const result = await cdp.evaluate<{
    success: boolean;
    action: string;
    reason?: string;
  }>(`
    (() => {
      const btn = document.querySelector('.chat-input-v2-send-button');
      if (!btn) {
        return { success: false, action: 'stop', reason: 'button-disappeared' };
      }
      
      try {
        btn.click();
        return { success: true, action: 'stop' };
      } catch (err) {
        return { success: false, action: 'stop', reason: err.message };
      }
    })()
  `);

  // 等待1秒验证按钮变为发送态
  if (result.success) {
    await new Promise(r => setTimeout(r, 1000));
    const verified = await cdp.evaluate<boolean>(`
      (() => {
        const btn = document.querySelector('.chat-input-v2-send-button');
        const icon = btn?.querySelector('.codicon');
        return (icon?.className || '').match(/ArrowUp/i) ? true : false;
      })()
    `);
    
    if (!verified) {
      debug('Model stalled recovery not verified');
      result.success = false;
      result.reason = 'not-verified';
    }
  }

  // 记录审计日志
  options?.logger?.logRecoveryAudit({
    taskId: options?.taskId || 'unknown',
    action: 'click-stop',
    result: result.success ? 'success' : 'failed',
    reason: result.reason || '执行成功',
    durationMs: Date.now() - startTime,
  });

  debug('Model stalled recovery result: %o', result);
  return result;
}

/**
 * 紧急回退：刷新页面
 * 极端情况下使用
 */
export async function emergencyReload(cdp: CDPClient): Promise<void> {
  debug('EMERGENCY: Reloading page');
  await cdp.evaluate<void>('location.reload()');
}

/**
 * 模拟 Ctrl+C
 * 给终端发送中断信号
 */
export async function sendCtrlC(cdp: CDPClient): Promise<void> {
  debug('Sending Ctrl+C to terminal');

  // 先找到终端textarea并focus
  await cdp.evaluate<void>(`
    (() => {
      const textarea = document.querySelector('.terminal textarea, [class*="terminal"] textarea');
      if (textarea) textarea.focus();
    })()
  `);

  // 发送 Ctrl+C
  await cdp.Input.dispatchKeyEvent({
    type: 'keyDown',
    modifiers: 2, // Ctrl
    key: 'c',
    code: 'KeyC',
  });

  await cdp.Input.dispatchKeyEvent({
    type: 'keyUp',
    modifiers: 2,
    key: 'c',
    code: 'KeyC',
  });
}
