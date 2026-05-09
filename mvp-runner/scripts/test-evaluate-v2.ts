import { CDPClient } from '../src/cdp/client.js';

async function main() {
  const cdp = new CDPClient({ host: 'localhost', port: 9222 });
  await cdp.connect();

  console.log('=== Test Evaluate v2 ===');

  // 直接调用 Runtime.evaluate
  const { result } = await cdp.Runtime.evaluate({
    expression: `
      (function() {
        try {
          const items = document.querySelectorAll('.index-module__task-item___zOpfg');
          let result = '';
          for (let i = 0; i < items.length; i++) {
            const text = (items[i].textContent || '').substring(0, 100);
            result += 'Task ' + i + ': ' + text + '\n';
          }
          return result || 'NO_ITEMS';
        } catch (e) {
          return 'ERROR: ' + e.message;
        }
      })()
    `,
    returnByValue: true
  });

  console.log('Result:', result);
  console.log('Result value:', result.value);
  console.log('Result type:', result.type);

  await cdp.disconnect();
}

main();
