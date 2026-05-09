import { CDPClient } from '../src/cdp/client.js';

async function main() {
  const cdp = new CDPClient({ host: 'localhost', port: 9222 });
  await cdp.connect();

  // 点击 PMCLI
  await cdp.evaluate("document.querySelectorAll('.index-module__task-item___zOpfg')[1].click()");
  await new Promise(r => setTimeout(r, 1500));

  // 获取所有 chat-turns
  const turns = await cdp.evaluate<string>(`
    (function(){
      const t = document.querySelectorAll('.chat-turn');
      let output = 'Total turns: ' + t.length + '\\n\\n';
      for (let i = 0; i < t.length; i++) {
        const isUser = t[i].classList.contains('user');
        const text = t[i].textContent?.slice(0, 200) || 'empty';
        output += '--- Turn ' + i + (isUser ? ' [USER]' : ' [AI]') + ' ---\\n';
        output += text + '\\n\\n';
      }
      return output;
    })()
  `);

  console.log(turns || 'no result');

  await cdp.disconnect();
}

main();
