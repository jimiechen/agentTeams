import { CDPClient } from '../src/cdp/client.js';

async function main() {
  const cdp = new CDPClient({ host: 'localhost', port: 9222 });
  await cdp.connect();

  // 点击 PMCLI (idx=0)
  await cdp.evaluate("document.querySelectorAll('.index-module__task-item___zOpfg')[0].click()");
  await new Promise(r => setTimeout(r, 1500));

  // 找到 chat-turn 的位置
  const location = await cdp.evaluate<string>(`
    (function() {
      const activeTask = document.querySelector('[class*="task-item"][class*="selected"]');
      if (!activeTask) return 'NO_ACTIVE_TASK';

      let container = activeTask;
      while (container && !container.classList.contains('split-view-container')) {
        container = container.parentElement;
        if (!container) return 'NO_CONTAINER';
      }

      const views = container.querySelectorAll(':scope > .split-view-view');
      const view = views[1]; // View 1

      // 找到所有 chat-turn
      const turns = view.querySelectorAll('.chat-turn');
      let output = 'Found ' + turns.length + ' chat-turns\\n';

      for (let i = 0; i < Math.min(turns.length, 2); i++) {
        const turn = turns[i];
        let path = '';
        let el = turn;
        while (el && el !== view) {
          path = el.tagName + '.' + el.className.split(' ')[0] + ' > ' + path;
          el = el.parentElement;
        }
        output += 'Turn ' + i + ' path: ' + path + '\\n';
      }

      return output;
    })()
  `);

  console.log(location);

  await cdp.disconnect();
}

main();
