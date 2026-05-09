/**
 * Step 2 双任务并发测试 - DOM 快照采集脚本
 * 在 PMCLI 任务即将完成时执行，验证任务隔离策略
 */

import { CDPClient } from '../src/cdp/client.js';
import { writeFileSync } from 'fs';

async function captureDomSnapshot() {
  const cdp = new CDPClient({ host: 'localhost', port: 9222 });
  await cdp.connect();

  const snapshot = await cdp.evaluate<{
    timestamp: string;
    globalChatTurnCount: number;
    selectedTaskText: string;
    selectedTaskChatTurnCount: number | string;
    splitViewStructure: {
      containerFound: boolean;
      viewCount: number;
      chatViewIndex: number;
      chatViewTurnCount: number;
    };
    allTaskItems: { text: string; isSelected: boolean; chatTurnCount: number }[];
  }>(`
    (() => {
      const sel = document.querySelector('[class*="task-item"][class*="selected"]');
      
      // 找到 split-view-container
      let container = sel;
      while (container && !container.classList.contains('split-view-container')) {
        container = container.parentElement;
      }
      
      let chatView = null;
      let chatViewIndex = -1;
      if (container) {
        const views = container.querySelectorAll(':scope > .split-view-view');
        views.forEach((view, idx) => {
          if (view.querySelectorAll('.chat-turn').length > 0) {
            chatView = view;
            chatViewIndex = idx;
          }
        });
      }
      
      // 所有任务项
      const allItems = Array.from(document.querySelectorAll('[class*="task-item"]'));
      
      return {
        timestamp: new Date().toISOString(),
        globalChatTurnCount: document.querySelectorAll('.chat-turn').length,
        selectedTaskText: sel?.textContent?.slice(0, 100) || 'not-found',
        selectedTaskChatTurnCount: sel ? sel.querySelectorAll('.chat-turn').length : 'sel-not-found',
        splitViewStructure: {
          containerFound: !!container,
          viewCount: container ? container.querySelectorAll(':scope > .split-view-view').length : 0,
          chatViewIndex,
          chatViewTurnCount: chatView ? chatView.querySelectorAll('.chat-turn').length : 0,
        },
        allTaskItems: allItems.map(item => ({
          text: item.textContent?.slice(0, 50) || '',
          isSelected: item.className.includes('selected'),
          chatTurnCount: item.querySelectorAll('.chat-turn').length,
        })),
      };
    })()
  `);

  const outputPath = process.argv[2] || './dom-snapshot.json';
  writeFileSync(outputPath, JSON.stringify(snapshot, null, 2));
  console.log('DOM snapshot saved to:', outputPath);
  console.log(JSON.stringify(snapshot, null, 2));

  await cdp.disconnect();
}

captureDomSnapshot().catch(console.error);
