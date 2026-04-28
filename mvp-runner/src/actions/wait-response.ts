// src/actions/wait-response.ts - 等待 AI 响应完成并解析内容
// 通过心跳检查侧边栏任务状态，任务完成后解析结果

import createDebug from 'debug';
import { CDPClient } from '../cdp/client.js';
import { ResponseTimeoutError } from '../errors.js';

const debug = createDebug('mvp:action:wait');

export interface WaitResponseOptions {
  timeoutMs?: number;    // 默认 120000
  pollMs?: number;       // 心跳间隔，默认 2000
  taskName?: string;     // 要检查的任务名称，默认 PMCLI
}

export interface TaskResult {
  text: string;          // 纯文本内容
  html: string;          // HTML内容
  hasCodeBlock: boolean;
  hasImage: boolean;
  hasFile: boolean;
  codeBlocks: Array<{ language: string; code: string }>;
  images: Array<{ src: string; alt: string }>;
  files: Array<{ name: string; url: string }>;
}

/**
 * 等待 AI 响应完成并解析内容
 * 通过心跳检查侧边栏任务状态，任务完成后才解析结果
 * 如果超时，会尝试终止会话并返回错误信息
 */
export async function waitResponse(cdp: CDPClient, opts?: WaitResponseOptions): Promise<string> {
  const timeoutMs = opts?.timeoutMs ?? 120000;
  const pollMs = opts?.pollMs ?? 2000;
  const taskName = opts?.taskName ?? 'PMCLI';

  const startTime = Date.now();
  debug(`Starting heartbeat check for task "${taskName}" (timeout=${timeoutMs}ms, poll=${pollMs}ms)`);

  let checkCount = 0;
  let lastStatus = '';

  // 心跳循环：定时检查任务状态
  while (Date.now() - startTime < timeoutMs) {
    checkCount++;
    
    const status = await checkTaskStatus(cdp, taskName);
    debug(`Heartbeat #${checkCount}: task="${taskName}", status=${status.status} (${status.reason})`);
    
    // 记录状态变化
    if (status.status !== lastStatus) {
      debug(`Status changed: ${lastStatus} -> ${status.status}`);
      lastStatus = status.status;
    }

    // 任务完成（completed 或 interrupted）
    if (status.status === 'completed' || status.status === 'interrupted') {
      const elapsed = Date.now() - startTime;
      debug(`Task ${status.status} after ${elapsed}ms (checked ${checkCount} times)`);
      break;
    }

    // 等待下一次心跳
    await sleep(pollMs);
  }

  // 检查是否超时
  if (Date.now() - startTime >= timeoutMs) {
    const elapsed = Date.now() - startTime;
    debug(`Heartbeat timeout after ${elapsed}ms, attempting to terminate session`);
    
    // 尝试终止会话
    const terminateResult = await terminateSession(cdp);
    
    if (terminateResult.success) {
      debug('Session terminated successfully');
      throw new Error(`[任务超时] 任务 "${taskName}" 在 ${Math.round(elapsed/1000)} 秒内未完成，已自动终止会话。请重新发送指令。`);
    } else {
      debug('Failed to terminate session: %s', terminateResult.reason);
      throw new Error(`[任务超时] 任务 "${taskName}" 在 ${Math.round(elapsed/1000)} 秒内未完成，终止会话失败: ${terminateResult.reason}。请手动检查。`);
    }
  }

  // 任务完成后，解析最终结果
  debug('Task completed, parsing result...');
  
  // 等待一小段时间确保内容已渲染
  await sleep(500);
  
  const result = await getLastAIResponse(cdp);
  
  if (result && result.length > 0) {
    debug(`Result parsed: ${result.length} chars`);
    return result;
  }

  // 如果解析失败，再等待一下重试
  await sleep(1000);
  const retryResult = await getLastAIResponse(cdp);
  
  if (retryResult && retryResult.length > 0) {
    debug(`Result parsed on retry: ${retryResult.length} chars`);
    return retryResult;
  }

  throw new ResponseTimeoutError(timeoutMs);
}

/**
 * 终止当前会话
 * 点击"停止生成"按钮（发送按钮在AI生成时会变成停止按钮）
 */
async function terminateSession(cdp: CDPClient): Promise<{ success: boolean; reason: string }> {
  debug('Attempting to terminate session...');
  
  const result = await cdp.evaluate<{
    success: boolean;
    reason: string;
    buttonFound: string;
    iconClass: string;
  }>(`
    (function() {
      // 1. 首先尝试发送按钮（它在AI生成时会变成停止按钮）
      const sendButton = document.querySelector('.chat-input-v2-send-button');
      if (sendButton) {
        // 检查当前图标
        const icon = sendButton.querySelector('span');
        const iconClass = icon ? icon.className : '';
        
        // 如果是停止图标（stop-circle），点击终止
        if (iconClass.includes('stop') || iconClass.includes('Stop')) {
          try {
            sendButton.click();
            return {
              success: true,
              reason: '停止按钮已点击',
              buttonFound: '.chat-input-v2-send-button (stop mode)',
              iconClass: iconClass
            };
          } catch (err) {
            return {
              success: false,
              reason: '点击停止按钮失败: ' + err.message,
              buttonFound: '.chat-input-v2-send-button',
              iconClass: iconClass
            };
          }
        }
      }
      
      // 2. 尝试其他停止按钮选择器
      const stopButtonSelectors = [
        'button[title="停止生成"]',
        'button[aria-label="停止生成"]',
        'button i.codicon-debug-stop',
        '[class*="stop"] button',
        'button[class*="stop"]',
        '[data-action="stop"]',
        // 终止会话按钮
        'button[title="终止会话"]',
        'button[aria-label="终止会话"]',
        '[class*="terminate"] button',
        'button[class*="terminate"]',
        '[data-action="terminate"]',
        // 通用停止按钮
        '.chat-toolbar button',
        '.action-bar button',
        '[class*="toolbar"] button'
      ];
      
      for (const selector of stopButtonSelectors) {
        const btn = document.querySelector(selector);
        if (btn) {
          try {
            btn.click();
            return {
              success: true,
              reason: '按钮已点击',
              buttonFound: selector,
              iconClass: ''
            };
          } catch (err) {
            return {
              success: false,
              reason: '点击按钮失败: ' + err.message,
              buttonFound: selector,
              iconClass: ''
            };
          }
        }
      }
      
      // 未找到任何停止按钮
      const sendBtnIcon = sendButton ? (sendButton.querySelector('span')?.className || 'no-icon') : 'no-button';
      return {
        success: false,
        reason: '未找到停止按钮（发送按钮当前不是停止模式）',
        buttonFound: '',
        iconClass: sendBtnIcon
      };
    })()
  `);
  
  if (result) {
    debug('Terminate result: success=%s, reason=%s, button=%s, icon=%s', 
      result.success, result.reason, result.buttonFound, result.iconClass);
    return { success: result.success, reason: result.reason };
  }
  
  return { success: false, reason: 'CDP执行失败' };
}

/**
 * 检查指定任务的状态
 * 通过侧边栏任务列表的文本和图标判断
 */
async function checkTaskStatus(cdp: CDPClient, taskName: string): Promise<{
  status: 'unknown' | 'in_progress' | 'completed' | 'interrupted';
  text: string;
  reason: string;
}> {
  const result = await cdp.evaluate<{
    status: 'unknown' | 'in_progress' | 'completed' | 'interrupted';
    text: string;
    reason: string;
  }>(`
    (function() {
      // 获取所有任务项
      const items = document.querySelectorAll('.index-module__task-item___zOpfg');
      
      // 查找指定名称的任务
      let targetTask = null;
      for (const item of items) {
        const text = item.textContent || '';
        if (text.includes('` + taskName + `')) {
          targetTask = item;
          break;
        }
      }
      
      if (!targetTask) {
        return { 
          status: 'unknown', 
          text: '', 
          reason: 'task-not-found' 
        };
      }
      
      const text = targetTask.textContent || '';
      
      // 方法1: 通过文本内容判断状态
      let status = 'unknown';
      if (text.includes('完成')) {
        status = 'completed';
      } else if (text.includes('进行中')) {
        status = 'in_progress';
      } else if (text.includes('中断')) {
        status = 'interrupted';
      }
      
      // 方法2: 通过完成图标验证（如果文本判断为完成）
      if (status === 'completed') {
        const hasCompleteIcon = targetTask.querySelector('.index-module__task-status__complete___ThOzg') !== null;
        if (!hasCompleteIcon) {
          // 文本说完成但没有图标，可能是误判
          status = 'in_progress';
        }
      }
      
      // 构建 reason 字符串（避免模板字符串嵌套问题）
      let reasonStr = 'cannot-determine-status';
      if (status !== 'unknown') {
        reasonStr = 'detected-by-text';
        if (status === 'completed') {
          reasonStr = reasonStr + '-and-icon';
        }
      }
      
      return {
        status: status,
        text: text.slice(0, 100),
        reason: reasonStr
      };
    })()
  `);
  
  return result || { status: 'unknown', text: '', reason: 'eval-failed' };
}

/**
 * 获取最后一次 AI 响应内容
 */
async function getLastAIResponse(cdp: CDPClient): Promise<string> {
  const result = await cdp.evaluate(`
    (function() {
      const turns = document.querySelectorAll('.chat-turn');
      if (turns.length === 0) return '';
      
      // 从后往前找，找到最后一个 AI 消息（不包含 user class）
      for (let i = turns.length - 1; i >= 0; i--) {
        const turn = turns[i];
        const isUserMsg = turn.classList.contains('user');
        
        if (!isUserMsg) {
          let text = turn.innerText || '';
          // 移除菜单文本
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
 * 获取详细的任务结果（包含代码块、图片等）
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
