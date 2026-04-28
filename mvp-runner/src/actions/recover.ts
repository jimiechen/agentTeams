// src/actions/recover.ts - 恢复动作
// 三类失败的恢复函数

import createDebug from 'debug';
import { CDPClient } from '../cdp/client.js';

const debug = createDebug('mvp:recover');

export interface RecoveryResult {
  success: boolean;
  action: string;
  reason?: string;
}

/**
 * 恢复终端卡死
 * 点击"后台运行"或"取消"按钮
 */
export async function recoverTerminalHang(
  cdp: CDPClient,
  policy: 'background' | 'cancel' = 'background',
): Promise<RecoveryResult> {
  debug('Recovering terminal hang with policy: %s', policy);

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
      return { success: false, action: policy, reason: 'not-verified' };
    }
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
): Promise<RecoveryResult> {
  debug('Recovering delete modal with policy: %s', policy);

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
      return { success: false, action: policy, reason: 'not-verified' };
    }
  }

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
): Promise<RecoveryResult> {
  debug('Recovering overwrite modal with policy: %s', policy);

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
      return { success: false, action: policy, reason: 'not-verified' };
    }
  }

  debug('Overwrite modal recovery result: %o', result);
  return result;
}

/**
 * 恢复模型停滞
 * 点击停止按钮
 */
export async function recoverModelStalled(cdp: CDPClient): Promise<RecoveryResult> {
  debug('Recovering model stalled');

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
    return { success: false, action: 'stop', reason: 'button-not-found' };
  }

  if (!status.isStop) {
    return { success: false, action: 'stop', reason: 'not-in-stop-state' };
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
      return { success: false, action: 'stop', reason: 'not-verified' };
    }
  }

  debug('Model stalled recovery result: %o', result);
  return result;
}

/**
 * 紧急回退：刷新页面
 * 极端情况下使用
 */
export async function emergencyReload(cdp: CDPClient): Promise<void> {
  debug('EMERGENCY: Reloading page');
  await cdp.send('Page.reload');
}

/**
 * 模拟 Ctrl+C
 * 给终端发送中断信号
 */
export async function sendCtrlC(cdp: CDPClient): Promise<void> {
  debug('Sending Ctrl+C to terminal');
  
  // 先找到终端textarea并focus
  await cdp.evaluate(`
    (() => {
      const textarea = document.querySelector('.terminal textarea, [class*="terminal"] textarea');
      if (textarea) textarea.focus();
    })()
  `);
  
  // 发送 Ctrl+C
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    modifiers: 2, // Ctrl
    key: 'c',
    code: 'KeyC',
  });
  
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    modifiers: 2,
    key: 'c',
    code: 'KeyC',
  });
}
