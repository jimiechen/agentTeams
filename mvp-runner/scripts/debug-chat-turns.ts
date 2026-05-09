import { CDPClient } from '../src/cdp/client.js';

async function main() {
  const cdp = new CDPClient({ host: 'localhost', port: 9222 });
  await cdp.connect();

  // 点击 PMCLI (idx=0)
  await cdp.evaluate("document.querySelectorAll('.index-module__task-item___zOpfg')[0].click()");
  await new Promise(r => setTimeout(r, 1500));

  // 检查 chat-turns
  const result = await cdp.evaluate<string>(`
    (function() {
      const activeTask = document.querySelector('[class*="task-item"][class*="selected"]');
      if (!activeTask) return 'NO_ACTIVE_TASK';

      let container = activeTask;
      while (container && !container.classList.contains('split-view-container')) {
        container = container.parentElement;
        if (!container) return 'NO_CONTAINER';
      }

      const views = container.querySelectorAll(':scope > .split-view-view');
      let chatRoot = null;
      
      // 首先尝试直接子元素
      for (const view of views) {
        const directChatTurns = view.querySelectorAll(':scope > * > .chat-turn, :scope > .chat-turn');
        if (directChatTurns.length > 0) {
          chatRoot = view;
          break;
        }
      }
      
      // 如果直接子元素没找到，递归查找嵌套的 split-view-view
      if (!chatRoot) {
        for (const view of views) {
          const nestedViews = view.querySelectorAll('.split-view-view');
          for (const nestedView of nestedViews) {
            const turns = nestedView.querySelectorAll('.chat-turn');
            if (turns.length > 0) {
              chatRoot = nestedView;
              break;
            }
          }
          if (chatRoot) break;
        }
      }

      if (!chatRoot) return 'NO_CHAT_ROOT';
      
      const turns = chatRoot.querySelectorAll('.chat-turn');
      let output = 'Found ' + turns.length + ' chat-turns\\n';
      
      for (let i = 0; i < turns.length; i++) {
        const isUser = turns[i].classList.contains('user');
        const text = turns[i].textContent?.slice(0, 100) || 'empty';
        output += 'Turn ' + i + (isUser ? ' [USER]' : ' [AI]') + ': ' + text + '\\n';
      }
      
      return output;
    })()
  `);

  console.log(result);

  await cdp.disconnect();
}

main();
