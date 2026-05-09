import { CDPClient } from '../src/cdp/client.js';
import { writeFileSync } from 'fs';

async function dumpDom() {
  const cdp = new CDPClient({ host: 'localhost', port: 9222 });
  await cdp.connect();

  // 获取 PMCLI 的 DOM 结构
  await cdp.evaluate("document.querySelectorAll('.index-module__task-item___zOpfg')[1].click()");
  await new Promise(r => setTimeout(r, 1500));

  const domSnapshot = await cdp.evaluate<string>(`
    (function() {
      const result = {
        url: window.location.href,
        chatTurns: document.querySelectorAll('.chat-turn').length,
        selectedTask: '',
        splitViewStructure: [],
        lastUserPrompt: '',
        lastAiResponse: ''
      };

      // 获取选中的任务
      const selected = document.querySelector('[class*="task-item"][class*="selected"]');
      if (selected) result.selectedTask = selected.textContent?.slice(0, 100) || '';

      // 获取 split-view 结构
      const splitViews = document.querySelectorAll('.split-view-view');
      for (let i = 0; i < splitViews.length; i++) {
        result.splitViewStructure.push({
          index: i,
          hasChatTurns: splitViews[i].querySelectorAll('.chat-turn').length,
          textPreview: splitViews[i].textContent?.slice(0, 200) || ''
        });
      }

      // 获取最后一个 user prompt
      const turns = document.querySelectorAll('.chat-turn');
      for (let i = turns.length - 1; i >= 0; i--) {
        if (turns[i].classList.contains('user')) {
          result.lastUserPrompt = turns[i].textContent?.slice(0, 500) || '';
          break;
        }
      }

      // 获取最后一个 AI response
      for (let i = turns.length - 1; i >= 0; i--) {
        if (!turns[i].classList.contains('user')) {
          result.lastAiResponse = turns[i].textContent?.slice(0, 500) || '';
          break;
        }
      }

      return JSON.stringify(result, null, 2);
    })()
  `);

  writeFileSync('comms/reports/regression-2026-05-09/step2/dom-snapshot-before-complete.json', domSnapshot);
  console.log('DOM snapshot saved');
  console.log(domSnapshot);

  await cdp.disconnect();
}

dumpDom().catch(console.error);
