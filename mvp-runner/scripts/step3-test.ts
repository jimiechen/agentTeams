import { CDPClient } from '../src/cdp/client.js';
import { GET_SCOPED_CHAT_ROOT_SCRIPT } from '../src/dom/task-scope.js';

const PMCLI_PROMPT = '写一份 300 字的 PRD 摘要，主题是任务隔离漏洞修复，包含背景、核心方案两段';

async function main() {
  const cdp = new CDPClient({ host: 'localhost', port: 9222 });
  await cdp.connect();

  console.log('[step3] Starting recovery path test...');

  // 1. 启动 PMCLI 长任务
  console.log('[step3] Sending PMCLI long task...');
  await cdp.evaluate(`document.querySelectorAll('.index-module__task-item___zOpfg')[0].click()`);
  await new Promise(r => setTimeout(r, 1500));

  await cdp.Input.insertText({ text: PMCLI_PROMPT });
  await new Promise(r => setTimeout(r, 1000));

  await cdp.evaluate(`
    (function() {
      const btn = document.querySelector('.chat-input-v2-send-button');
      if (btn) btn.click();
    })()
  `);
  console.log('[step3] PMCLI submitted');

  // 2. 等待任务开始运行（10秒）
  await new Promise(r => setTimeout(r, 10000));

  // 3. 人为制造 model stalled：点击停止按钮
  console.log('[step3] Triggering model stalled by clicking stop...');
  await cdp.evaluate(`
    (function() {
      const stopBtn = document.querySelector('.chat-input-v2-stop-button');
      if (stopBtn) {
        stopBtn.click();
        return 'STOP_CLICKED';
      }
      return 'NO_STOP_BUTTON';
    })()
  `);

  // 4. 等待 recovery 自动点击重试按钮
  console.log('[step3] Waiting for recovery...');
  await new Promise(r => setTimeout(r, 30000));

  // 5. 检查 recovery 是否触发
  const recoveryStatus = await cdp.evaluate<string>(`
    (function() {
      const retryBtn = document.querySelector('.retry-button, [class*="retry"]');
      return retryBtn ? 'RETRY_VISIBLE' : 'NO_RETRY';
    })()
  `);
  console.log('[step3] Recovery status:', recoveryStatus);

  // 6. 等待任务完成
  console.log('[step3] Waiting for PMCLI to complete...');
  const startTime = Date.now();
  const maxWait = 300000; // 5 分钟

  let completed = false;
  while (Date.now() - startTime < maxWait && !completed) {
    await new Promise(r => setTimeout(r, 5000));

    const status = await cdp.evaluate<string>(`
      (function() {
        const items = document.querySelectorAll('.index-module__task-item___zOpfg');
        if (items.length > 0) {
          const text = items[0].textContent || '';
          return text.includes('完成') ? 'completed' : 'running';
        }
        return 'unknown';
      })()
    `);

    if (status === 'completed') {
      completed = true;
      console.log('[step3] PMCLI completed');
    }
  }

  // 7. 获取 PMCLI 的最终内容
  const pmcliContent = await cdp.evaluate<string>(`
    (function() {
      try {
        ${GET_SCOPED_CHAT_ROOT_SCRIPT}
        if (chatRoot && chatRoot.__error) return chatRoot.__error;
        if (!chatRoot) return '__NO_CHAT_ROOT__';

        const turns = chatRoot.querySelectorAll('.chat-turn');
        if (turns.length === 0) return '__NO_TURNS__';

        let lastAiText = '';
        for (let i = turns.length - 1; i >= 0; i--) {
          const turn = turns[i];
          if (!turn.classList.contains('user')) {
            lastAiText = turn.textContent || '';
            break;
          }
        }

        return lastAiText.substring(0, 500);
      } catch (e) {
        return 'ERROR: ' + e.message;
      }
    })()
  `);

  console.log('[step3] PMCLI content (first 500 chars):', pmcliContent);

  // 8. 检查是否包含 PRD 关键词
  const hasBackground = pmcliContent.includes('背景');
  const hasSolution = pmcliContent.includes('核心方案');
  const isEmpty = pmcliContent.length < 50;

  console.log('[step3] Has background:', hasBackground);
  console.log('[step3] Has solution:', hasSolution);
  console.log('[step3] Is empty:', isEmpty);

  // 9. 判定结果
  let verdict = 'FAIL';
  if (hasBackground && hasSolution && !isEmpty) {
    verdict = 'PASS';
  }

  console.log('[step3] Verdict:', verdict);

  await cdp.disconnect();
}

main();
