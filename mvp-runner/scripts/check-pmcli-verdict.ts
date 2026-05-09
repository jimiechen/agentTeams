import { CDPClient } from '../src/cdp/client.js';
import { GET_SCOPED_CHAT_ROOT_SCRIPT } from '../src/dom/task-scope.js';

async function main() {
  const cdp = new CDPClient({ host: 'localhost', port: 9222 });
  await cdp.connect();

  console.log('=== Check PMCLI Verdict ===');

  // 点击 PMCLI
  await cdp.evaluate("document.querySelectorAll('.index-module__task-item___zOpfg')[0].click()");
  await new Promise(r => setTimeout(r, 1500));

  const result = await cdp.evaluate<string>(`
    (function() {
      try {
        ${GET_SCOPED_CHAT_ROOT_SCRIPT}
        if (chatRoot && chatRoot.__error) return 'ERROR: ' + chatRoot.__error;
        if (!chatRoot) return 'NO_CHAT_ROOT';

        const turns = chatRoot.querySelectorAll('.chat-turn');
        if (turns.length === 0) return 'NO_TURNS';

        // 找到最后一个 AI 回复
        let lastAiText = '';
        for (let i = turns.length - 1; i >= 0; i--) {
          const turn = turns[i];
          if (!turn.classList.contains('user')) {
            lastAiText = turn.textContent || '';
            break;
          }
        }

        if (!lastAiText) return 'NO_AI_TURN';

        // 检查是否包含 PRD 关键词
        const hasBackground = lastAiText.includes('背景');
        const hasSolution = lastAiText.includes('核心方案');
        const hasAcceptance = lastAiText.includes('验收标准');
        const hasTimeKeyword = lastAiText.includes('现在几点') || lastAiText.includes('时间');

        return JSON.stringify({
          hasBackground,
          hasSolution,
          hasAcceptance,
          hasTimeKeyword,
          length: lastAiText.length,
          preview: lastAiText.substring(0, 200)
        });
      } catch (e) {
        return 'ERROR: ' + e.message;
      }
    })()
  `);

  console.log('Result:', result);

  await cdp.disconnect();
}

main();
