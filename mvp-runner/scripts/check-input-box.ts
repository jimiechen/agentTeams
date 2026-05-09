import { CDPClient } from '../src/cdp/client.js';

async function main() {
  const cdp = new CDPClient({ host: 'localhost', port: 9222 });
  await cdp.connect();

  // 检查当前输入框内容
  const result = await cdp.evaluate<string>(`
    (function() {
      const input = document.querySelector('.chat-input-v2-input-box-editable');
      if (!input) return 'NO_INPUT';
      return 'Input content: ' + (input.textContent || input.innerText || 'empty');
    })()
  `);

  console.log(result);

  await cdp.disconnect();
}

main();
