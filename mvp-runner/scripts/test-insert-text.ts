import { CDPClient } from '../src/cdp/client.js';

async function main() {
  const cdp = new CDPClient({ host: 'localhost', port: 9222 });
  await cdp.connect();

  // 1. 点击 PMCLI
  console.log('1. Clicking PMCLI...');
  await cdp.evaluate("document.querySelectorAll('.index-module__task-item___zOpfg')[0].click()");
  await new Promise(r => setTimeout(r, 1000));

  // 聚焦输入框
  await cdp.evaluate(`
    (function() {
      const input = document.querySelector('.chat-input-v2-input-box-editable');
      if (input) input.focus();
    })()
  `);
  await new Promise(r => setTimeout(r, 500));

  // 使用 Input.insertText
  console.log('2. Using Input.insertText...');
  await cdp.Input.insertText({ text: 'TEST_PROMPT_123' });
  await new Promise(r => setTimeout(r, 1000));

  // 检查输入框内容
  const result = await cdp.evaluate<string>(`
    (function() {
      const input = document.querySelector('.chat-input-v2-input-box-editable');
      if (!input) return 'NO_INPUT';
      return 'innerHTML: ' + input.innerHTML + ' | textContent: ' + input.textContent;
    })()
  `);
  console.log('Input after insertText:', result);

  await cdp.disconnect();
}

main();
