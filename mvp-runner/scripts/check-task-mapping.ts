import { CDPClient } from '../src/cdp/client.js';

async function main() {
  const cdp = new CDPClient({ host: 'localhost', port: 9222 });
  await cdp.connect();

  // 获取所有任务项
  const tasks = await cdp.evaluate<string>(`
    (function() {
      const items = document.querySelectorAll('.index-module__task-item___zOpfg');
      let output = '';
      for (let i = 0; i < items.length; i++) {
        const text = items[i].textContent || '';
        const isSelected = items[i].className.includes('selected');
        output += 'idx=' + i + ' selected=' + isSelected + ' text="' + text.slice(0, 50) + '"\\n';
      }
      return output;
    })()
  `);

  console.log('Current task mapping:');
  console.log(tasks || 'no result');

  await cdp.disconnect();
}

main();
