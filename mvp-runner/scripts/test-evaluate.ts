import { CDPClient } from '../src/cdp/client.js';

async function main() {
  const cdp = new CDPClient({ host: 'localhost', port: 9222 });
  await cdp.connect();

  console.log('=== Test Evaluate ===');

  const result1 = await cdp.evaluate<string>(`
    (function() {
      return 'hello';
    })()
  `);
  console.log('Simple result:', result1);

  const result2 = await cdp.evaluate<string>(`
    (function() {
      try {
        const items = document.querySelectorAll('.index-module__task-item___zOpfg');
        return 'items: ' + items.length;
      } catch (e) {
        return 'ERROR: ' + e.message;
      }
    })()
  `);
  console.log('Query result:', result2);

  await cdp.disconnect();
}

main();
