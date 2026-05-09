import { CDPClient } from '../src/cdp/client.js';

async function main() {
  const cdp = new CDPClient({ host: 'localhost', port: 9222 });
  await cdp.connect();

  // 测试简单的 for...of
  const result = await cdp.evaluate<string>(`
    (function() {
      return 'test';
    })()
  `);

  console.log('Simple result:', result);

  // 测试 for...of with error handling
  const result2 = await cdp.evaluate<string>(`
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

  console.log('For...of result:', result2);

  await cdp.disconnect();
}

main();
