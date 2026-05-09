import { CDPClient } from '../src/cdp/client.js';
import { writeFileSync } from 'fs';

const PMCLI_PROMPT = '写一份 500 字的 PRD 摘要，主题是任务隔离漏洞修复，需要包含背景、核心方案、验收标准三段，每段不少于 150 字';
const DEVCLI_PROMPT = '现在几点';

async function step2Test() {
  const cdp = new CDPClient({ host: 'localhost', port: 9222 });
  await cdp.connect();

  const outDir = 'comms/reports/regression-2026-05-09/step2';

  // 1. 先发送长 prompt 到 PMCLI
  console.log('[step2] Sending PMCLI long task...');
  await cdp.evaluate(`document.querySelectorAll('.index-module__task-item___zOpfg')[1].click()`);
  await new Promise(r => setTimeout(r, 1000));

  // 填入 prompt
  await cdp.evaluate(`
    (function() {
      const input = document.querySelector('.chat-input-v2-textarea');
      if (input) {
        input.focus();
        input.textContent = '${PMCLI_PROMPT.replace(/'/g, "\\'")}';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    })()
  `);
  await new Promise(r => setTimeout(r, 500));

  // 提交
  await cdp.evaluate(`
    (function() {
      const btn = document.querySelector('.chat-input-v2-send-button');
      if (btn) btn.click();
    })()
  `);
  console.log('[step2] PMCLI submitted');

  // 等待 3 秒让 PMCLI 进入 thinking
  await new Promise(r => setTimeout(r, 3000));

  // 2. 立即发送短 prompt 到 DEVCLI
  console.log('[step2] Sending DEVCLI distractor...');
  await cdp.evaluate(`document.querySelectorAll('.index-module__task-item___zOpfg')[0].click()`);
  await new Promise(r => setTimeout(r, 1000));

  await cdp.evaluate(`
    (function() {
      const input = document.querySelector('.chat-input-v2-textarea');
      if (input) {
        input.focus();
        input.textContent = '${DEVCLI_PROMPT}';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    })()
  `);
  await new Promise(r => setTimeout(r, 500));

  await cdp.evaluate(`
    (function() {
      const btn = document.querySelector('.chat-input-v2-send-button');
      if (btn) btn.click();
    })()
  `);
  console.log('[step2] DEVCLI submitted');

  // 3. 等待两个任务完成（最多 5 分钟）
  console.log('[step2] Waiting for tasks to complete...');
  const startTime = Date.now();
  const maxWait = 300000; // 5 分钟

  let pmcliDone = false;
  let devcliDone = false;

  while (Date.now() - startTime < maxWait && (!pmcliDone || !devcliDone)) {
    await new Promise(r => setTimeout(r, 5000));

    // 检查 PMCLI 状态
    if (!pmcliDone) {
      const pmcliStatus = await cdp.evaluate<string>(`
        (function() {
          const items = document.querySelectorAll('.index-module__task-item___zOpfg');
          if (items.length > 1) {
            const text = items[1].textContent || '';
            return text.includes('完成') ? 'completed' : 'running';
          }
          return 'unknown';
        })()
      `);
      if (pmcliStatus === 'completed') {
        pmcliDone = true;
        console.log('[step2] PMCLI completed');
      }
    }

    // 检查 DEVCLI 状态
    if (!devcliDone) {
      const devcliStatus = await cdp.evaluate<string>(`
        (function() {
          const items = document.querySelectorAll('.index-module__task-item___zOpfg');
          if (items.length > 0) {
            const text = items[0].textContent || '';
            return text.includes('完成') ? 'completed' : 'running';
          }
          return 'unknown';
        })()
      `);
      if (devcliStatus === 'completed') {
        devcliDone = true;
        console.log('[step2] DEVCLI completed');
      }
    }
  }

  // 4. 获取 PMCLI 的最终内容
  await cdp.evaluate(`document.querySelectorAll('.index-module__task-item___zOpfg')[1].click()`);
  await new Promise(r => setTimeout(r, 1500));

  const pmcliContent = await cdp.evaluate<string>(`
    (function() {
      const t = document.querySelectorAll('.chat-turn');
      for (let i = t.length - 1; i >= 0; i--) {
        if (!t[i].classList.contains('user')) {
          return t[i].textContent.slice(0, 1000);
        }
      }
      return 'none';
    })()
  `);

  // 5. 获取 DEVCLI 的最终内容
  await cdp.evaluate(`document.querySelectorAll('.index-module__task-item___zOpfg')[0].click()`);
  await new Promise(r => setTimeout(r, 1500));

  const devcliContent = await cdp.evaluate<string>(`
    (function() {
      const t = document.querySelectorAll('.chat-turn');
      for (let i = t.length - 1; i >= 0; i--) {
        if (!t[i].classList.contains('user')) {
          return t[i].textContent.slice(0, 1000);
        }
      }
      return 'none';
    })()
  `);

  // 保存结果
  const result = {
    timestamp: new Date().toISOString(),
    pmcliContent: pmcliContent || 'empty',
    devcliContent: devcliContent || 'empty',
    pmcliDone,
    devcliDone,
  };

  writeFileSync(`${outDir}/step2-result.json`, JSON.stringify(result, null, 2));

  console.log('\n=== PMCLI Content (last 200 chars) ===');
  console.log((pmcliContent || '').slice(-200));
  console.log('\n=== DEVCLI Content (last 200 chars) ===');
  console.log((devcliContent || '').slice(-200));

  // 判断结果
  const hasPrdKeywords = /PRD|摘要|背景|核心方案|验收标准|任务隔离/.test(pmcliContent || '');
  const hasTimeKeywords = /现在几点|时间|日期/.test(pmcliContent || '');

  console.log('\n=== Verdict ===');
  if (hasPrdKeywords && !hasTimeKeywords) {
    console.log('PASS: PMCLI content contains PRD keywords, no time keywords');
  } else if (hasTimeKeywords) {
    console.log('FAIL: PMCLI content contains time keywords - cross-task leakage!');
  } else {
    console.log('UNCLEAR: PMCLI content does not contain expected keywords');
  }

  await cdp.disconnect();
}

step2Test().catch(console.error);
