import { CDPClient } from '../src/cdp/client.js';

async function main() {
  const cdp = new CDPClient({ host: 'localhost', port: 9222 });
  await cdp.connect();

  // 测试 for...of
  const result = await cdp.evaluate<string>(`
    (function() {
      try {
        const arr = [1, 2, 3];
        let sum = 0;
        for (const item of arr) {
          sum += item;
        }
        return 'sum: ' + sum;
      } catch (e) {
        return 'ERROR: ' + e.message;
      }
    })()
  `);

  console.log('Result:', result);

  await cdp.disconnect();
}

main();
