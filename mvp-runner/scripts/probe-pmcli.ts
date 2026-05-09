import { CDPClient } from '../src/cdp/client.js';

async function probe() {
  const cdp = new CDPClient({ host: 'localhost', port: 9222 });
  await cdp.connect();

  // 切换到 PMCLI (idx=0)
  await cdp.evaluate(`
    (function() {
      const items = document.querySelectorAll('.index-module__task-item___zOpfg');
      if (items.length > 0) items[0].click();
    })()
  `);
  await new Promise(r => setTimeout(r, 1500));

  // 检查当前选中任务
  const selectedTask = await cdp.evaluate<string>(`
    (function() {
      const sel = document.querySelector('[class*="task-item"][class*="selected"]');
      return sel ? sel.textContent.slice(0, 50) : 'none';
    })()
  `);
  console.log('Selected task:', selectedTask);

  // 检查 chat-turn 数量
  const chatTurns = await cdp.evaluate<number>(`
    (function() {
      return document.querySelectorAll('.chat-turn').length;
    })()
  `);
  console.log('Global chat-turns:', chatTurns);

  // 检查发送按钮
  const btnInfo = await cdp.evaluate<string>(`
    (function() {
      const btn = document.querySelector('.chat-input-v2-send-button');
      if (!btn) return 'no button';
      const icon = btn.querySelector('.codicon');
      return (icon ? icon.className : 'no icon');
    })()
  `);
  console.log('Button icon:', btnInfo);

  // 获取最后一个 AI turn 的内容
  const lastAiTurn = await cdp.evaluate<string>(`
    (function() {
      const turns = document.querySelectorAll('.chat-turn');
      for (let i = turns.length - 1; i >= 0; i--) {
        if (!turns[i].classList.contains('user')) {
          return turns[i].textContent.slice(0, 200);
        }
      }
      return 'no ai turn';
    })()
  `);
  console.log('Last AI turn:', lastAiTurn);

  await cdp.disconnect();
}

probe().catch(console.error);
