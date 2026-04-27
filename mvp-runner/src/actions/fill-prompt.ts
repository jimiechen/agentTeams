// src/actions/fill-prompt.ts - 填充 Prompt 到 Chat 输入框
// 正确方案：使用 CDP Input.insertText 触发 Lexical 原生事件

import createDebug from 'debug';
import { CDPClient } from '../cdp/client.js';
import { FillPromptError } from '../errors.js';

const debug = createDebug('mvp:action:fill');

const INPUT_SELECTOR = '.chat-input-v2-input-box-editable';

export async function fillPrompt(cdp: CDPClient, prompt: string): Promise<void> {
  debug(`Filling prompt (${prompt.length} chars)`);

  // 步骤1: 聚焦输入框
  await cdp.evaluate(`
    (function() {
      const el = document.querySelector('${INPUT_SELECTOR}');
      if (el) { el.focus(); el.click(); }
    })()
  `);
  await sleep(300);

  // 步骤2: 清空现有内容（可选）
  await cdp.evaluate(`
    (function() {
      const el = document.querySelector('${INPUT_SELECTOR}');
      if (el) { 
        el.innerHTML = '';
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    })()
  `);
  await sleep(200);

  // 步骤3: 使用 CDP Input.insertText 触发 Lexical 原生事件
  debug('Using Input.insertText...');
  await cdp.Input.insertText({ text: prompt });
  await sleep(1000);

  // 步骤4: 验证填充结果
  const result = await cdp.evaluate<{ success: boolean; text?: string }>(`
    (function() {
      const el = document.querySelector('${INPUT_SELECTOR}');
      if (!el) return { success: false };
      const text = el.innerText?.trim() || el.textContent?.trim() || '';
      return { success: text.length > 0, text };
    })()
  `);

  if (!result.success) {
    throw new FillPromptError('Prompt fill verification failed');
  }

  debug(`Prompt filled successfully: "${result.text}"`);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
