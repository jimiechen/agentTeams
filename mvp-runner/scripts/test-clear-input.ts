import { CDPClient } from '../src/cdp/client.js';

async function main() {
  const cdp = new CDPClient({ host: 'localhost', port: 9222 });
  await cdp.connect();

  console.log('=== Test Clear Input ===');

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

  // 2. 尝试清空方法1: innerHTML
  await cdp.evaluate(`
    (function() {
      const input = document.querySelector('.chat-input-v2-input-box-editable');
      if (input) {
        input.focus();
        input.innerHTML = '<p class="chat-input-v2__paragraph"><br></p>';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    })()
  `);
  await new Promise(r => setTimeout(r, 500));

  const afterClear1 = await cdp.evaluate<string>(`
    (function() {
      const input = document.querySelector('.chat-input-v2-input-box-editable');
      return input ? input.textContent : 'NO_INPUT';
    })()
  `);
  console.log('After clear (innerHTML):', afterClear1);

  // 3. 尝试清空方法2: textContent
  await cdp.evaluate(`
    (function() {
      const input = document.querySelector('.chat-input-v2-input-box-editable');
      if (input) {
        input.focus();
        input.textContent = '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    })()
  `);
  await new Promise(r => setTimeout(r, 500));

  const afterClear2 = await cdp.evaluate<string>(`
    (function() {
      const input = document.querySelector('.chat-input-v2-input-box-editable');
      return input ? input.textContent : 'NO_INPUT';
    })()
  `);
  console.log('After clear (textContent):', afterClear2);

  // 4. 尝试清空方法3: 选中全部删除
  await cdp.evaluate(`
    (function() {
      const input = document.querySelector('.chat-input-v2-input-box-editable');
      if (input) {
        input.focus();
        const range = document.createRange();
        range.selectNodeContents(input);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        document.execCommand('delete');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    })()
  `);
  await new Promise(r => setTimeout(r, 500));

  const afterClear3 = await cdp.evaluate<string>(`
    (function() {
      const input = document.querySelector('.chat-input-v2-input-box-editable');
      return input ? input.textContent : 'NO_INPUT';
    })()
  `);
  console.log('After clear (select all delete):', afterClear3);

  await cdp.disconnect();
}

main();
