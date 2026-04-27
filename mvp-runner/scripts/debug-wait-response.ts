// 调试 wait-response - 检查 AI 响应解析
import { CDPClient } from '../src/cdp/client.js';
import { loadConfig } from '../src/config.js';

async function main() {
  const cfg = loadConfig();
  const cdp = new CDPClient(cfg.cdp.host, cfg.cdp.port);
  await cdp.connect();

  console.log('=== 调试 wait-response ===\n');

  // 1. 检查 chat-turn 数量
  const count = await cdp.evaluate(`
    document.querySelectorAll('.chat-turn').length
  `);
  console.log('1. chat-turn 数量:', count);

  // 2. 检查每个 turn 的 class
  const turnsInfo = await cdp.evaluate(`
    (() => {
      const turns = document.querySelectorAll('.chat-turn');
      return Array.from(turns).map((t, i) => ({
        index: i,
        hasUserClass: t.classList.contains('user'),
        className: t.className?.slice(0, 50),
        textPreview: t.innerText?.slice(0, 50)
      }));
    })()
  `);
  console.log('2. turns 信息:', turnsInfo);

  // 3. 获取最后一个 AI 消息（参考 wait-response 逻辑）
  const lastAi = await cdp.evaluate(`
    (() => {
      const turns = document.querySelectorAll('.chat-turn');
      if (turns.length === 0) return { error: 'no turns' };
      
      for (let i = turns.length - 1; i >= 0; i--) {
        const turn = turns[i];
        const isUserMsg = turn.classList.contains('user');
        
        if (!isUserMsg) {
          return {
            index: i,
            innerText: turn.innerText?.slice(0, 100),
            textContent: turn.textContent?.slice(0, 100),
            hasUserClass: isUserMsg
          };
        }
      }
      return { error: 'no AI turn found' };
    })()
  `);
  console.log('3. 最后 AI 消息:', lastAi);

  // 4. 检查 assistant-chat-turn-content
  const contentCheck = await cdp.evaluate(`
    (() => {
      const contents = document.querySelectorAll('.assistant-chat-turn-content');
      return {
        count: contents.length,
        texts: Array.from(contents).map(c => c.innerText?.slice(0, 50))
      };
    })()
  `);
  console.log('4. assistant-chat-turn-content:', contentCheck);

  await cdp.disconnect();
}

main().catch(console.error);
