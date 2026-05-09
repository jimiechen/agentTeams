import { CDPClient } from '../src/cdp/client.js';

async function main() {
  const cdp = new CDPClient({ host: 'localhost', port: 9222 });
  await cdp.connect();

  // 点击 PMCLI (idx=0)
  await cdp.evaluate("document.querySelectorAll('.index-module__task-item___zOpfg')[0].click()");
  await new Promise(r => setTimeout(r, 1500));

  // 检查 DOM 结构
  const structure = await cdp.evaluate<string>(`
    (function() {
      const activeTask = document.querySelector('[class*="task-item"][class*="selected"]');
      if (!activeTask) return 'NO_ACTIVE_TASK';

      let container = activeTask;
      while (container && !container.classList.contains('split-view-container')) {
        container = container.parentElement;
        if (!container) return 'NO_CONTAINER';
      }

      const views = container.querySelectorAll(':scope > .split-view-view');
      let output = 'Container found, views: ' + views.length + '\\n';

      for (let i = 0; i < views.length; i++) {
        const view = views[i];
        const directTurns = view.querySelectorAll(':scope > * > .chat-turn, :scope > .chat-turn');
        const allTurns = view.querySelectorAll('.chat-turn');
        output += 'View ' + i + ': directTurns=' + directTurns.length + ', allTurns=' + allTurns.length + '\\n';
      }

      return output;
    })()
  `);

  console.log('DOM Structure:');
  console.log(structure);

  await cdp.disconnect();
}

main();
