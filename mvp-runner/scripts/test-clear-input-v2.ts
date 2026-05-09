import { CDPClient } from '../src/cdp/client.js';

async function main() {
  const cdp = new CDPClient({ host: 'localhost', port: 9222 });
  await cdp.connect();

  console.log('=== Test Clear Input v2 ===');

  // 1. 填入内容
  await cdp.evaluate(`
    (function() {
      const input = document.querySelector('.chat-input-v2-input-box-editable');
      if (input) {
        input.focus();
        input.innerHTML = '<p class="chat-input-v2__paragraph">TEST_CONTENT</p>';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    })()
  `);
  await new Promise(r => setTimeout(r, 500));

  const beforeClear = await cdp.evaluate<string>(`
    (function() {
      const input = document.querySelector('.chat-input-v2-input-box-editable');
      return input ? input.textContent : 'NO_INPUT';
    })()
  `);
  console.log('Before clear:', beforeClear);

  // 2. 使用 CDP Input.dispatchKeyEvent 发送 Ctrl+A 和 Delete
  await cdp.evaluate(`
    (function() {
      const input = document.querySelector('.chat-input-v2-input-box-editable');
      if (input) input.focus();
    })()
  `);
  await new Promise(r => setTimeout(r, 500));

  // 发送 Ctrl+A
  await cdp.Input.dispatchKeyEvent({ type: 'keyDown', key: 'a', code: 'KeyA', modifiers: 2 });
  await cdp.Input.dispatchKeyEvent({ type: 'keyUp', key: 'a', code: 'KeyA', modifiers: 2 });
  await new Promise(r => setTimeout(r, 500));

  // 发送 Delete
  await cdp.Input.dispatchKeyEvent({ type: 'keyDown', key: 'Delete', code: 'Delete' });
  await cdp.Input.dispatchKeyEvent({ type: 'keyUp', key: 'Delete', code: 'Delete' });
  await new Promise(r => setTimeout(r, 500));

  const afterClear = await cdp.evaluate<string>(`
    (function() {
      const input = document.querySelector('.chat-input-v2-input-box-editable');
      return input ? input.textContent : 'NO_INPUT';
    })()
  `);
  console.log('After clear (Ctrl+A + Delete):', afterClear);

  await cdp.disconnect();
}

main();
