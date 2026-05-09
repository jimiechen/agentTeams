import { CDPClient } from '../src/cdp/client.js';

async function main() {
  const cdp = new CDPClient({ host: 'localhost', port: 9222 });
  await cdp.connect();

  console.log('=== Check Task Status v2 ===');

  const result = await cdp.evaluate<string>(`
    (function() {
      try {
        const items = document.querySelectorAll('.index-module__task-item___zOpfg');
        let result = '';
        for (let i = 0; i < items.length; i++) {
          result += 'Task ' + i + ': ' + (items[i].textContent || '').substring(0, 100) + '\n';
        }
        return result || 'NO_ITEMS';
      } catch (e) {
        return 'ERROR: ' + e.message;
      }
    })()
  `);

  console.log('Result:', result);

  await cdp.disconnect();
}

main();
