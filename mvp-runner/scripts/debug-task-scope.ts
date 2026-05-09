import { CDPClient } from '../src/cdp/client.js';
import { GET_SCOPED_CHAT_ROOT_SCRIPT } from '../src/dom/task-scope.js';

async function main() {
  const cdp = new CDPClient({ host: 'localhost', port: 9222 });
  await cdp.connect();

  // 点击 PMCLI (idx=0)
  await cdp.evaluate("document.querySelectorAll('.index-module__task-item___zOpfg')[0].click()");
  await new Promise(r => setTimeout(r, 1500));

  // 测试 GET_SCOPED_CHAT_ROOT_SCRIPT
  const script = GET_SCOPED_CHAT_ROOT_SCRIPT.replace('return { __root: true, element: chatRoot };', '');
  console.log('Script length:', script.length);
  console.log('Script preview:', script.substring(0, 200));

  const result = await cdp.evaluate<string>(`
    (function() {
      try {
        ${script}
        if (chatRoot && chatRoot.__error) return 'ERROR: ' + chatRoot.__error;
        if (!chatRoot) return 'NO_CHAT_ROOT';
        
        const root = chatRoot.element || chatRoot;
        const turns = root.querySelectorAll('.chat-turn');
        return 'FOUND: ' + turns.length + ' chat-turns';
      } catch (e) {
        return 'ERROR: ' + e.message;
      }
    })()
  `);

  console.log('Result:', result);

  await cdp.disconnect();
}

main();
