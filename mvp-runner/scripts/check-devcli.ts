import { CDPClient } from '../src/cdp/client.js';

async function main() {
  const cdp = new CDPClient({ host: 'localhost', port: 9222 });
  await cdp.connect();

  // 点击 DEVCLI (idx=0)
  await cdp.evaluate("document.querySelectorAll('.index-module__task-item___zOpfg')[0].click()");
  await new Promise(r => setTimeout(r, 1500));

  const turns = await cdp.evaluate<number>("document.querySelectorAll('.chat-turn').length");
  console.log('DEVCLI Chat turns:', turns);

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
  console.log('DEVCLI Last AI:', lastAi);

  await cdp.disconnect();
}

main();
