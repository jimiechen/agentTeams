import { CDPClient } from '../src/cdp/client.js';

async function main() {
  const cdp = new CDPClient({ host: 'localhost', port: 9222 });
  await cdp.connect();

  // 点击 PMCLI (idx=0)
  await cdp.evaluate("document.querySelectorAll('.index-module__task-item___zOpfg')[0].click()");
  await new Promise(r => setTimeout(r, 1500));

  // 简单测试
  const result = await cdp.evaluate<string>(`
    (function() {
      return 'test';
    })()
  `);

  console.log('Result:', result);

  await cdp.disconnect();
}

main();
