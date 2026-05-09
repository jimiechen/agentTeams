import { CDPClient } from '../src/cdp/client.js';

async function main() {
  const cdp = new CDPClient({ host: 'localhost', port: 9222 });
  await cdp.connect();

  // 点击 PMCLI (idx=0)
  await cdp.evaluate("document.querySelectorAll('.index-module__task-item___zOpfg')[0].click()");
  await new Promise(r => setTimeout(r, 1500));

  // 检查 View 1 的 DOM 结构
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
      const view = views[1]; // View 1

      let output = 'View 1 structure:\\n';
      output += 'Tag: ' + view.tagName + '\\n';
      output += 'Class: ' + view.className + '\\n';
      output += 'Children: ' + view.children.length + '\\n';

      for (let i = 0; i < view.children.length; i++) {
        const child = view.children[i];
        output += '  Child ' + i + ': ' + child.tagName + ' class=' + child.className + '\\n';

        for (let j = 0; j < child.children.length; j++) {
          const grandchild = child.children[j];
          output += '    Grandchild ' + j + ': ' + grandchild.tagName + ' class=' + grandchild.className + '\\n';

          for (let k = 0; k < grandchild.children.length; k++) {
            const greatgrandchild = grandchild.children[k];
            output += '      GreatGrandchild ' + k + ': ' + greatgrandchild.tagName + ' class=' + greatgrandchild.className + '\\n';
          }
        }
      }

      return output;
    })()
  `);

  console.log(structure);

  await cdp.disconnect();
}

main();
