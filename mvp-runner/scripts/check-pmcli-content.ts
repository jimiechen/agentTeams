import { CDPClient } from '../src/cdp/client.js';
import { GET_SCOPED_CHAT_ROOT_SCRIPT } from '../src/dom/task-scope.js';

async function main() {
  const cdp = new CDPClient({ host: 'localhost', port: 9222 });
  await cdp.connect();

  console.log('=== Check PMCLI Content ===');

  // 点击 PMCLI
  await cdp.evaluate("document.querySelectorAll('.index-module__task-item___zOpfg')[0].click()");
  await new Promise(r => setTimeout(r, 1500));

  const result = await cdp.evaluate<string>(`
    (function() {
      try {
        ${GET_SCOPED_CHAT_ROOT_SCRIPT}
        if (chatRoot && chatRoot.__error) return 'ERROR: ' + chatRoot.__error;
        if (!chatRoot) return 'NO_CHAT_ROOT';

        const turns = chatRoot.querySelectorAll('.chat-turn');
        if (turns.length === 0) return 'NO_TURNS';

        let result = '';
        for (let i = 0; i < turns.length; i++) {
          const turn = turns[i];
          const isUser = turn.classList.contains('user');
          const text = (turn.textContent || '').substring(0, 200);
          result += (isUser ? 'USER: ' : 'AI: ') + text + '\\n\\n';
        }
        return result || 'EMPTY';
      } catch (e) {
        return 'ERROR: ' + e.message;
      }
    })()
  `);

  console.log('Result:', result);

  await cdp.disconnect();
}

main();
