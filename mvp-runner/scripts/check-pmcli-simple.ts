import { CDPClient } from '../src/cdp/client.js';

async function main() {
  const cdp = new CDPClient({ host: 'localhost', port: 9222 });
  await cdp.connect();

  // 点击 PMCLI
  await cdp.evaluate("document.querySelectorAll('.index-module__task-item___zOpfg')[1].click()");
  await new Promise(r => setTimeout(r, 1500));

  // 获取 chat-turn 数量
  const turns = await cdp.evaluate<number>("document.querySelectorAll('.chat-turn').length");
  console.log('Chat turns:', turns);

  // 获取最后一个 AI turn
  const lastAi = await cdp.evaluate<string>(`
    (function(){
      const t = document.querySelectorAll('.chat-turn');
      for (let i = t.length - 1; i >= 0; i--) {
        if (!t[i].classList.contains('user')) {
          return t[i].textContent.slice(0, 500);
        }
      }
      return 'none';
    })()
  `);
  console.log('Last AI turn:', lastAi);

  await cdp.disconnect();
}

main();
