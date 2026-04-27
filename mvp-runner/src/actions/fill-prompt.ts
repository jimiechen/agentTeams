// src/actions/fill-prompt.ts - 填充 Prompt 到 Chat 输入框

import createDebug from 'debug';
import { CDPClient } from '../cdp/client.js';
import { resolve } from '../selectors/resolver.js';
import { FillPromptError } from '../errors.js';

const debug = createDebug('mvp:action:fill');

export async function fillPrompt(cdp: CDPClient, prompt: string): Promise<void> {
  debug(`Filling prompt (${prompt.length} chars)`);

  const selector = await resolve(cdp, 'chat.input');

  // 聚焦输入框
  const coords = await cdp.evaluate(`
    (function() {
      const input = document.querySelector('${selector}');
      if (!input) return null;
      input.focus();
      const rect = input.getBoundingClientRect();
      return JSON.stringify({
        x: Math.round(rect.left + rect.width / 2),
        y: Math.round(rect.top + rect.height / 2)
      });
    })()
  `);

  if (!coords) {
    throw new FillPromptError('Chat input not found');
  }

  const { x, y } = JSON.parse(coords);

  // 点击聚焦
  await cdp.Input.dispatchMouseEvent({
    type: 'mousePressed', x, y, button: 'left', clickCount: 1,
  });
  await cdp.Input.dispatchMouseEvent({
    type: 'mouseReleased', x, y, button: 'left', clickCount: 1,
  });
  await sleep(500);

  // 填充文本（Day 0 验证：innerText + InputEvent）
  const escapedPrompt = JSON.stringify(prompt);
  await cdp.evaluate(`
    (function() {
      const input = document.querySelector('${selector}');
      if (!input) return false;
      input.innerText = ${escapedPrompt};
      input.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        inputType: 'insertText',
        data: ${escapedPrompt}
      }));
      return true;
    })()
  `);

  await sleep(500);

  // 验证文本已填入
  const actualText = await cdp.evaluate(`
    document.querySelector('${selector}')?.innerText || ''
  `);

  if (actualText !== prompt) {
    debug(`Prompt mismatch: expected "${prompt.substring(0, 30)}...", got "${actualText.substring(0, 30)}..."`);
    throw new FillPromptError(`Text mismatch after fill (expected ${prompt.length} chars, got ${actualText.length})`);
  }

  debug(`Prompt filled successfully (${prompt.length} chars)`);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
