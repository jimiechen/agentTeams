// src/actions/wait-response.ts - 等待 AI 响应完成

import createDebug from 'debug';
import { CDPClient } from '../cdp/client.js';
import { resolve } from '../selectors/resolver.js';
import { ResponseTimeoutError } from '../errors.js';

const debug = createDebug('mvp:action:wait');

export interface WaitResponseOptions {
  timeoutMs?: number;    // 默认 60000
  stableMs?: number;     // 文本稳定判定时长，默认 1500
  pollMs?: number;       // 轮询间隔，默认 500
}

export async function waitResponse(cdp: CDPClient, opts?: WaitResponseOptions): Promise<string> {
  const timeoutMs = opts?.timeoutMs ?? 60000;
  const stableMs = opts?.stableMs ?? 1500;
  const pollMs = opts?.pollMs ?? 500;

  const selector = await resolve(cdp, 'chat.chat_turn');

  // 记录当前 chat-turn 数量
  const beforeCount: number = await cdp.evaluate(`
    document.querySelectorAll('${selector}').length
  `);
  debug(`Current chat-turn count: ${beforeCount}, waiting for new message...`);

  const startTime = Date.now();

  // 阶段 1：等待新消息出现
  while (Date.now() - startTime < timeoutMs) {
    const currentCount: number = await cdp.evaluate(`
      document.querySelectorAll('${selector}').length
    `);

    if (currentCount > beforeCount) {
      debug(`New message detected (turn count: ${beforeCount} → ${currentCount})`);
      break;
    }

    await sleep(pollMs);
  }

  // 检查是否超时（阶段 1）
  if (Date.now() - startTime >= timeoutMs) {
    throw new ResponseTimeoutError(timeoutMs);
  }

  // 阶段 2：等待文本稳定
  let stableCount = 0;
  let lastLength = -1;

  while (Date.now() - startTime < timeoutMs) {
    const text: string = await cdp.evaluate(`
      (function() {
        const turns = document.querySelectorAll('${selector}');
        const last = turns[turns.length - 1];
        return last ? last.innerText : '';
      })()
    `);

    if (text.length === lastLength) {
      stableCount++;
    } else {
      stableCount = 0;
      lastLength = text.length;
    }

    // 连续 stableMs/pollMs 次长度不变，判定完成
    if (stableCount >= Math.ceil(stableMs / pollMs)) {
      const elapsed = Date.now() - startTime;
      debug(`Response stable after ${elapsed}ms (${text.length} chars)`);
      return text;
    }

    await sleep(pollMs);
  }

  // 超时但已有部分响应，返回已有内容
  const partialText: string = await cdp.evaluate(`
    (function() {
      const turns = document.querySelectorAll('${selector}');
      const last = turns[turns.length - 1];
      return last ? last.innerText : '';
    })()
  `);

  if (partialText.length > 0) {
    debug(`Timeout but returning partial response (${partialText.length} chars)`);
    return partialText;
  }

  throw new ResponseTimeoutError(timeoutMs);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
