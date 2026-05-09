import { CDPClient } from '../src/cdp/client.js';

async function main() {
  const cdp = new CDPClient({ host: 'localhost', port: 9222 });
  await cdp.connect();

  console.log('=== Check Task Status ===');

  const items = await cdp.evaluate<string>(`
    (function() {
      const items = document.querySelectorAll('.index-module__task-item___zOpfg');
      let result = '';
      for (let i = 0; i < items.length; i++) {
        result += 'Task ' + i + ': ' + (items[i].textContent || '').substring(0, 100) + '\n';
      }
      return result;
    })()
  `);

  console.log(items);

  await cdp.disconnect();
}

main();
