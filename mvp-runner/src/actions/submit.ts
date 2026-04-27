// src/actions/submit.ts - 点击发送按钮提交

import createDebug from 'debug';
import { CDPClient } from '../cdp/client.js';
import { resolve } from '../selectors/resolver.js';
import { SubmitError } from '../errors.js';

const debug = createDebug('mvp:action:submit');

export async function submit(cdp: CDPClient): Promise<void> {
  debug('Submitting prompt');

  const selector = await resolve(cdp, 'chat.send_button');

  // 检查按钮是否可用
  const state = await cdp.evaluate(`
    (function() {
      const btn = document.querySelector('${selector}');
      if (!btn) return { found: false };
      return {
        found: true,
        disabled: btn.disabled,
        className: btn.className
      };
    })()
  `);

  if (!state.found) {
    throw new SubmitError('Send button not found');
  }

  if (state.disabled) {
    throw new SubmitError('Send button is disabled');
  }

  // 点击发送按钮
  await cdp.evaluate(`
    document.querySelector('${selector}').click();
  `);

  debug('Submit clicked');
}
