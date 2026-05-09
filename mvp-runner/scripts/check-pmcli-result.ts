import { CDPClient } from '../src/cdp/client.js';
import { writeFileSync } from 'fs';

async function check() {
  const cdp = new CDPClient({ host: 'localhost', port: 9222 });
  await cdp.connect();

  // 切换到 PMCLI (idx=1)
  await cdp.evaluate(`
    (function() {
      const items = document.querySelectorAll('.index-module__task-item___zOpfg');
      if (items.length > 1) items[1].click();
    })()
  `);
  await new Promise(r => setTimeout(r, 1500));

  // 获取 PMCLI 的所有 chat-turn 内容
  const result = await cdp.evaluate<string>(`
    (function() {
      const turns = document.querySelectorAll('.chat-turn');
      let output = 'total turns: ' + turns.length + '\n\n';
      for (let i = 0; i < turns.length; i++) {
        const isUser = turns[i].classList.contains('user');
        const text = turns[i].textContent?.slice(0, 300) || 'empty';
        output += '--- Turn ' + i + (isUser ? ' [USER]' : ' [AI]') + ' ---\n';
        output += text + '\n\n';
      }
      return output;
    })()
  `);

  console.log(result || 'no result');
  writeFileSync('comms/reports/regression-2026-05-09/step2/pmcli-content.txt', result || 'no result');

  await cdp.disconnect();
}

check().catch(console.error);
