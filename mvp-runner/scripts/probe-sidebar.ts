import { CDPClient } from '../src/cdp/client.js';

async function probe() {
  const cdp = new CDPClient({ host: 'localhost', port: 9222 });
  await cdp.connect();

  const result = await cdp.evaluate<string>(`
    (() => {
      const items = document.querySelectorAll('.index-module__task-item___zOpfg');
      return Array.from(items).map((item, idx) => {
        const text = item.textContent || '';
        const isSelected = item.className.includes('selected');
        return 'idx=' + idx + ' selected=' + isSelected + ' text="' + text.slice(0, 100) + '"';
      }).join('\\n');
    })()
  `);

  console.log('Sidebar task items:');
  console.log(result);

  await cdp.disconnect();
}

probe().catch(console.error);
