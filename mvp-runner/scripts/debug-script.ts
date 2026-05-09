import { CDPClient } from '../src/cdp/client.js';

async function main() {
  const cdp = new CDPClient({ host: 'localhost', port: 9222 });
  await cdp.connect();

  // 点击 PMCLI (idx=0)
  await cdp.evaluate("document.querySelectorAll('.index-module__task-item___zOpfg')[0].click()");
  await new Promise(r => setTimeout(r, 1500));

  // 直接测试脚本逻辑
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
      for (let i = 0; i < views.length; i++) {
        const view = views[i];
        const directChatTurns = view.querySelectorAll(':scope > * > .chat-turn, :scope > .chat-turn');
        if (directChatTurns.length > 0) {
          chatRoot = view;
          break;
        }
      }
      
      // 如果直接子元素没找到，递归查找嵌套的 split-view-view
      if (!chatRoot) {
        for (let i = 0; i < views.length; i++) {
          const view = views[i];
          const nestedViews = view.querySelectorAll('.split-view-view');
          for (let j = 0; j < nestedViews.length; j++) {
            const nestedView = nestedViews[j];
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
      return 'FOUND: ' + turns.length + ' chat-turns in ' + chatRoot.tagName + '.' + chatRoot.className;
    })()
  `);

  console.log('Result:', result);

  await cdp.disconnect();
}

main();
