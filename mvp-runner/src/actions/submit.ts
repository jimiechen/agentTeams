// src/actions/submit.ts - 提交 Prompt（使用 Enter 键）
// 正确方案：使用 CDP Input.dispatchKeyEvent 触发 Lexical 原生提交

import createDebug from 'debug';
import { CDPClient } from '../cdp/client.js';
import { SubmitError } from '../errors.js';

const debug = createDebug('mvp:action:submit');

const INPUT_SELECTOR = '.chat-input-v2-input-box-editable';

export async function submit(cdp: CDPClient): Promise<void> {
  debug('Submitting prompt via Enter key');

  // 聚焦输入框
  await cdp.evaluate(`
    (function() {
      const el = document.querySelector('${INPUT_SELECTOR}');
      if (el) el.focus();
    })()
  `);
  await sleep(300);

  // 使用 CDP Input.dispatchKeyEvent 发送 Enter 键
  // 这会触发 Lexical 的原生提交行为
  debug('Dispatching Enter key...');
  
  await cdp.Input.dispatchKeyEvent({
    type: 'keyDown',
    key: 'Enter',
    code: 'Enter',
    windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 13,
  });
  
  await sleep(100);
  
  await cdp.Input.dispatchKeyEvent({
    type: 'keyUp',
    key: 'Enter',
    code: 'Enter',
    windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 13,
  });

  await sleep(500);

  debug('Submit completed');
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
