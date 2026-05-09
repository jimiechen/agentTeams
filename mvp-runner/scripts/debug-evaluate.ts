import { CDPClient } from '../src/cdp/client.js';

async function main() {
  const cdp = new CDPClient({ host: 'localhost', port: 9222 });
  await cdp.connect();

  // 测试简单的 evaluate
  const result1 = await cdp.evaluate<string>(`
    (function() {
      return 'hello';
    })()
  `);
  console.log('Simple evaluate:', result1);

  // 测试 for...of
  const result2 = await cdp.evaluate<string>(`
    (function() {
      const arr = [1, 2, 3];
      let sum = 0;
      for (const item of arr) {
        sum += item;
      }
      return 'sum: ' + sum;
    })()
  `);
  console.log('For...of evaluate:', result2);

  // 测试 querySelectorAll
  const result3 = await cdp.evaluate<string>(`
    (function() {
      const items = document.querySelectorAll('.index-module__task-item___zOpfg');
      return 'items: ' + items.length;
    })()
  `);
  console.log('querySelectorAll evaluate:', result3);

  await cdp.disconnect();
}

main();
