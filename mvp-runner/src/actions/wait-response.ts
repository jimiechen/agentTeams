// src/actions/wait-response.ts - 等待 AI 响应完成并解析内容
// 参考: trae-cdp.js, test-cn-cdp-results.js

import createDebug from 'debug';
import { CDPClient } from '../cdp/client.js';
import { ResponseTimeoutError } from '../errors.js';

const debug = createDebug('mvp:action:wait');

export interface WaitResponseOptions {
  timeoutMs?: number;    // 默认 60000
  stableMs?: number;     // 文本稳定判定时长，默认 1500
  pollMs?: number;       // 轮询间隔，默认 500
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
 * 等待 AI 响应并解析内容
 * 参考 test-cn-cdp-results.js 的实现
 */
export async function waitResponse(cdp: CDPClient, opts?: WaitResponseOptions): Promise<string> {
  const timeoutMs = opts?.timeoutMs ?? 60000;
  const stableMs = opts?.stableMs ?? 1500;
  const pollMs = opts?.pollMs ?? 500;

  // 记录当前消息数量 - 使用 .chat-turn 选择器（参考 trae-cdp.js）
  const beforeCount: number = await cdp.evaluate(`
    document.querySelectorAll('.chat-turn').length
  `);
  debug(`Current chat-turn count: ${beforeCount}, waiting for new message...`);

  const startTime = Date.now();

  // 阶段 1：等待新消息出现
  while (Date.now() - startTime < timeoutMs) {
    const currentCount: number = await cdp.evaluate(`
      document.querySelectorAll('.chat-turn').length
    `);

    if (currentCount > beforeCount) {
      debug(`New message detected (count: ${beforeCount} → ${currentCount})`);
      break;
    }

    await sleep(pollMs);
  }

  // 检查是否超时（阶段 1）
  if (Date.now() - startTime >= timeoutMs) {
    throw new ResponseTimeoutError(timeoutMs);
  }

  // 阶段 2：等待内容稳定并解析
  let stableCount = 0;
  let lastText = '';

  while (Date.now() - startTime < timeoutMs) {
    const result = await getLastAIResponse(cdp);
    
    // 跳过空内容
    if (!result || result.length < 2) {
      await sleep(pollMs);
      continue;
    }
    
    // 检测文本是否稳定
    if (result === lastText) {
      stableCount++;
    } else {
      stableCount = 0;
      lastText = result;
    }

    // 连续 stableMs/pollMs 次文本不变，判定完成
    if (stableCount >= Math.ceil(stableMs / pollMs)) {
      const elapsed = Date.now() - startTime;
      debug(`Response stable after ${elapsed}ms (${result.length} chars)`);
      return result;
    }

    await sleep(pollMs);
  }

  // 超时但已有部分响应
  if (lastText.length > 0) {
    debug(`Timeout but returning partial response (${lastText.length} chars)`);
    return lastText;
  }

  throw new ResponseTimeoutError(timeoutMs);
}

/**
 * 获取最后一次 AI 响应内容
 * 参考 test-cn-cdp-results.js 的实现方式
 * 修复：正确处理图片响应和空内容
 */
async function getLastAIResponse(cdp: CDPClient): Promise<string> {
  const result = await cdp.evaluate(`
    (function() {
      const turns = document.querySelectorAll('.chat-turn');
      if (turns.length === 0) return '';
      
      // 从后往前找，找到最后一个 AI 消息（不包含 user class）
      for (let i = turns.length - 1; i >= 0; i--) {
        const turn = turns[i];
        
        // 参考 trae-cdp.js: 使用 classList.contains('user') 判断
        const isUserMsg = turn.classList.contains('user');
        
        if (!isUserMsg) {
          // 获取原始文本
          let text = turn.innerText || '';
          
          // 检查是否是真正的图片内容（不是菜单）
          const hasImageContent = turn.querySelector('img') !== null && 
                                  !turn.querySelector('img').closest('.icd-avatar') &&
                                  !turn.querySelector('img').closest('.avatar');
          
          // 如果包含实际图片内容，保留提示
          if (hasImageContent && text.includes('复制图片')) {
            return '[包含图片内容，请在 Trae 中查看]';
          }
          
          // 否则清理菜单文本
          text = text.replace(/复制图片/g, '').trim();
          
          // 如果清理后为空，但有图片元素，说明是图片
          if (!text && turn.querySelector('img')) {
            return '[包含图片内容，请在 Trae 中查看]';
          }
          
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
 * 参考 test-cn-cdp-results.js
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
        
        // 找到最后一个 AI 消息
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
          hasTask: lastAiTurn.innerText?.includes('待办') || lastAiTurn.innerText?.includes('任务') || false
        };
      })()
    `);
    
    if (data) {
      result.text = data.text?.replace(/复制图片/g, '').trim() || '';
      result.html = data.html || '';
      result.hasCodeBlock = data.hasCode || false;
      
      // 解析代码块
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
