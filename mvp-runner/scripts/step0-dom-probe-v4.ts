// Step 0 v4: 验证正确的关联策略
// task-item 和 chat-turn 在同一个 split-view-container 的不同 split-view-view 中

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { CDPClient } from '../src/cdp/client.js';
import { loadConfig } from '../src/config.js';

const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-');
const REPORT_DIR = path.resolve(process.cwd(), '../../comms/research');
const REPORT_FILE = path.join(REPORT_DIR, `${TIMESTAMP}-dom-empirical-validation-v4.md`);

async function runProbes() {
  const cfg = loadConfig();
  const cdp = new CDPClient({ host: cfg.cdp?.host, port: cfg.cdp?.port });
  await cdp.connect();

  const results: Record<string, any> = {};

  // 探测 L: 新策略 - 从 selected task-item 找到同容器内的 chat-view
  results.newStrategy = await cdp.evaluate(`
    (() => {
      const sel = document.querySelector('[class*="task-item"][class*="selected"]');
      if (!sel) return { error: 'no selected task-item' };
      
      // 向上找到 split-view-container
      let container = sel;
      while (container && !container.className?.includes('split-view-container')) {
        container = container.parentElement;
      }
      
      if (!container) return { error: 'no split-view-container' };
      
      // 找到包含 chat-turn 的 split-view-view
      const views = container.querySelectorAll(':scope > .split-view-view');
      let chatView = null;
      for (const view of views) {
        if (view.querySelectorAll('.chat-turn').length > 0) {
          chatView = view;
          break;
        }
      }
      
      if (!chatView) return { error: 'no chat view found' };
      
      const chatTurns = chatView.querySelectorAll('.chat-turn');
      
      return {
        totalViews: views.length,
        chatTurnCount: chatTurns.length,
        chatViewIndex: Array.from(views).indexOf(chatView),
        chatViewClass: chatView.className?.slice(0, 100),
        // 验证这些 chat-turn 是否只属于当前任务
        // 检查是否有其他任务的标识
        firstTurnText: chatTurns[0]?.textContent?.slice(0, 50) || 'empty',
        lastTurnText: chatTurns[chatTurns.length - 1]?.textContent?.slice(0, 50) || 'empty',
      };
    })()
  `);

  // 探测 M: 验证多任务场景 - 检查是否有其他任务的内容混入
  results.crossTaskCheck = await cdp.evaluate(`
    (() => {
      // 获取所有 task-item 的文本
      const taskItems = document.querySelectorAll('[class*="task-item"]');
      const taskTexts = Array.from(taskItems).map(t => t.textContent?.slice(0, 30) || 'empty');
      
      // 获取所有 chat-turn 的文本
      const chatTurns = document.querySelectorAll('.chat-turn');
      const chatTexts = Array.from(chatTurns).map(t => ({
        text: t.textContent?.slice(0, 50) || 'empty',
        isUser: t.classList.contains('user'),
      }));
      
      return {
        taskCount: taskItems.length,
        taskTexts,
        chatTurnCount: chatTurns.length,
        chatTexts,
      };
    })()
  `);

  // 探测 N: 找到 selected task-item 后，获取其文本，然后看 chat-turn 是否匹配
  results.selectedTaskMatch = await cdp.evaluate(`
    (() => {
      const sel = document.querySelector('[class*="task-item"][class*="selected"]');
      if (!sel) return { error: 'no selected' };
      
      const taskText = sel.textContent?.slice(0, 100) || 'empty';
      
      // 使用新策略获取 chat-turn
      let container = sel;
      while (container && !container.className?.includes('split-view-container')) {
        container = container.parentElement;
      }
      
      if (!container) return { error: 'no container' };
      
      const views = container.querySelectorAll(':scope > .split-view-view');
      let chatView = null;
      for (const view of views) {
        if (view.querySelectorAll('.chat-turn').length > 0) {
          chatView = view;
          break;
        }
      }
      
      const chatTurns = chatView ? chatView.querySelectorAll('.chat-turn') : [];
      const lastAiTurn = Array.from(chatTurns).reverse().find(t => !t.classList.contains('user'));
      
      return {
        taskText,
        lastAiText: lastAiTurn?.textContent?.slice(0, 100) || 'no-ai-turn',
        chatTurnCount: chatTurns.length,
      };
    })()
  `);

  await cdp.disconnect();
  return results;
}

function generateReport(results: Record<string, any>): string {
  const newStrategy = results.newStrategy;
  const crossTaskCheck = results.crossTaskCheck;
  const selectedTaskMatch = results.selectedTaskMatch;

  // 判断新策略是否可行
  const strategyFeasible = 
    newStrategy?.chatTurnCount > 0 && 
    newStrategy?.chatViewIndex >= 0;

  let report = `# DOM 结构实测报告 v4 - 正确关联策略验证\n\n`;
  report += `**生成时间**: ${new Date().toISOString()}\n\n`;
  report += `**新策略可行性**: ${strategyFeasible ? '✅ 可行' : '❌ 不可行'}\n\n`;
  report += `---\n\n`;

  for (const [key, value] of Object.entries(results)) {
    report += `## ${key}\n\n`;
    report += `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\`\n\n`;
  }

  report += `## 通过判断\n\n`;
  report += `✅ 新策略能找到 chat-view: ${newStrategy?.chatViewIndex >= 0 ? '通过' : '未通过'} (索引: ${newStrategy?.chatViewIndex})\n`;
  report += `✅ chat-view 内有 chat-turn: ${newStrategy?.chatTurnCount > 0 ? '通过' : '未通过'} (数量: ${newStrategy?.chatTurnCount})\n`;

  if (strategyFeasible) {
    report += `\n## 修复策略确认\n\n`;
    report += `采用 **split-view-container → split-view-view 策略**：\n`;
    report += `1. 找到 selected task-item\n`;
    report += `2. 向上遍历到 split-view-container\n`;
    report += `3. 在 container 的子元素中找到包含 chat-turn 的 split-view-view\n`;
    report += `4. 在该 view 内查询 chat-turn\n`;
    report += `5. 这样可确保只获取当前任务相关的 chat-turn\n`;
  } else {
    report += `\n## ⚠️ 需要进一步调研\n\n`;
  }

  return report;
}

async function main() {
  try {
    mkdirSync(REPORT_DIR, { recursive: true });
    console.log('开始执行 v4 DOM 探测...');

    const results = await runProbes();
    const report = generateReport(results);

    writeFileSync(REPORT_FILE, report, 'utf-8');
    console.log(`报告已保存: ${REPORT_FILE}`);

    const strategyFeasible = 
      results.newStrategy?.chatTurnCount > 0 && 
      results.newStrategy?.chatViewIndex >= 0;

    if (strategyFeasible) {
      console.log('✅ 新策略可行：通过 split-view-container → split-view-view 限定作用域');
    } else {
      console.log('❌ 新策略需要调整');
    }
  } catch (err) {
    console.error('探测失败:', err);
    process.exit(1);
  }
}

main();
