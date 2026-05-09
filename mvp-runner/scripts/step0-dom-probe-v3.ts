// Step 0 v3: 验证 split-view-container 关联策略
// 确认 task-item 和 chat-turn 是否在同一 split-view-container 内

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { CDPClient } from '../src/cdp/client.js';
import { loadConfig } from '../src/config.js';

const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-');
const REPORT_DIR = path.resolve(process.cwd(), '../../comms/research');
const REPORT_FILE = path.join(REPORT_DIR, `${TIMESTAMP}-dom-empirical-validation-v3.md`);

async function runProbes() {
  const cfg = loadConfig();
  const cdp = new CDPClient({ host: cfg.cdp?.host, port: cfg.cdp?.port });
  await cdp.connect();

  const results: Record<string, any> = {};

  // 探测 H: 找到 selected task-item 所在的 split-view-container，然后看它内部有多少 chat-turn
  results.taskItemScopedChatTurns = await cdp.evaluate(`
    (() => {
      const sel = document.querySelector('[class*="task-item"][class*="selected"]');
      if (!sel) return { error: 'no selected task-item' };
      
      // 向上找到 split-view-container
      let container = sel;
      while (container && !container.className?.includes('split-view-container')) {
        container = container.parentElement;
      }
      
      if (!container) return { error: 'no split-view-container found' };
      
      const chatTurns = container.querySelectorAll('.chat-turn');
      const taskItems = container.querySelectorAll('[class*="task-item"]');
      
      return {
        containerClass: container.className?.slice(0, 100),
        chatTurnCount: chatTurns.length,
        taskItemCount: taskItems.length,
        selectedTaskItemIndex: Array.from(taskItems).findIndex(t => t.className.includes('selected')),
      };
    })()
  `);

  // 探测 I: 找到所有 split-view-container，看每个内部的 chat-turn 和 task-item
  results.allContainers = await cdp.evaluate(`
    (() => {
      const containers = document.querySelectorAll('.split-view-container');
      return Array.from(containers).map((c, i) => ({
        index: i,
        chatTurnCount: c.querySelectorAll('.chat-turn').length,
        taskItemCount: c.querySelectorAll('[class*="task-item"]').length,
        hasSelectedTask: !!c.querySelector('[class*="task-item"][class*="selected"]'),
        className: c.className?.slice(0, 100),
      }));
    })()
  `);

  // 探测 J: 在 selected task-item 的兄弟 split-view-view 中查找 chat
  results.siblingChat = await cdp.evaluate(`
    (() => {
      const sel = document.querySelector('[class*="task-item"][class*="selected"]');
      if (!sel) return { error: 'no selected' };
      
      // 向上找到 split-view-container
      let container = sel;
      while (container && !container.className?.includes('split-view-container')) {
        container = container.parentElement;
      }
      
      if (!container) return { error: 'no container' };
      
      // 找到所有 split-view-view 子元素
      const views = container.querySelectorAll(':scope > .split-view-view');
      
      return Array.from(views).map((v, i) => ({
        index: i,
        hasChat: v.querySelectorAll('.chat-turn').length > 0,
        chatTurnCount: v.querySelectorAll('.chat-turn').length,
        hasTaskItem: v.querySelectorAll('[class*="task-item"]').length > 0,
        taskItemCount: v.querySelectorAll('[class*="task-item"]').length,
        className: v.className?.slice(0, 100),
      }));
    })()
  `);

  // 探测 K: 从 chat-turn 向上找到 split-view-container，再看它内部是否有 selected task-item
  results.chatTurnToSelected = await cdp.evaluate(`
    (() => {
      const turn = document.querySelector('.chat-turn');
      if (!turn) return { error: 'no chat-turn' };
      
      // 向上找到 split-view-container
      let container = turn;
      while (container && !container.className?.includes('split-view-container')) {
        container = container.parentElement;
      }
      
      if (!container) return { error: 'no split-view-container' };
      
      const hasSelected = !!container.querySelector('[class*="task-item"][class*="selected"]');
      const selectedTaskItem = container.querySelector('[class*="task-item"][class*="selected"]');
      
      return {
        hasSelected,
        selectedText: selectedTaskItem?.textContent?.slice(0, 50) || 'none',
      };
    })()
  `);

  await cdp.disconnect();
  return results;
}

function generateReport(results: Record<string, any>): string {
  const taskScoped = results.taskItemScopedChatTurns;
  const allContainers = results.allContainers;
  const siblingChat = results.siblingChat;
  const chatTurnToSelected = results.chatTurnToSelected;

  // 判断策略是否可行
  const strategy3Feasible = 
    taskScoped?.chatTurnCount > 0 && 
    taskScoped?.taskItemCount > 0 &&
    chatTurnToSelected?.hasSelected === true;

  let report = `# DOM 结构实测报告 v3 - split-view-container 关联验证\n\n`;
  report += `**生成时间**: ${new Date().toISOString()}\n\n`;
  report += `**策略 3 可行性**: ${strategy3Feasible ? '✅ 可行' : '❌ 不可行'}\n\n`;
  report += `---\n\n`;

  for (const [key, value] of Object.entries(results)) {
    report += `## ${key}\n\n`;
    report += `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\`\n\n`;
  }

  report += `## 通过判断\n\n`;
  report += `✅ selected task-item 所在容器内有 chat-turn: ${taskScoped?.chatTurnCount > 0 ? '通过' : '未通过'} (数量: ${taskScoped?.chatTurnCount})\n`;
  report += `✅ selected task-item 所在容器内有 task-item: ${taskScoped?.taskItemCount > 0 ? '通过' : '未通过'} (数量: ${taskScoped?.taskItemCount})\n`;
  report += `✅ chat-turn 所在容器包含 selected task-item: ${chatTurnToSelected?.hasSelected === true ? '通过' : '未通过'}\n`;

  if (!strategy3Feasible) {
    report += `\n## ⚠️ 策略 3 需要调整\n\n`;
    report += `基于 split-view-container 的作用域策略需要重新评估。\n`;
  } else {
    report += `\n## 修复策略确认\n\n`;
    report += `采用 **split-view-container 向上查找策略**：\n`;
    report += `1. 找到 selected task-item\n`;
    report += `2. 向上遍历到 split-view-container\n`;
    report += `3. 在该容器内查找 chat-turn（而非全局 document）\n`;
    report += `4. 这样可确保只获取当前任务相关的 chat-turn\n`;
  }

  return report;
}

async function main() {
  try {
    mkdirSync(REPORT_DIR, { recursive: true });
    console.log('开始执行 v3 DOM 探测...');

    const results = await runProbes();
    const report = generateReport(results);

    writeFileSync(REPORT_FILE, report, 'utf-8');
    console.log(`报告已保存: ${REPORT_FILE}`);

    const strategy3Feasible = 
      results.taskItemScopedChatTurns?.chatTurnCount > 0 && 
      results.taskItemScopedChatTurns?.taskItemCount > 0 &&
      results.chatTurnToSelected?.hasSelected === true;

    if (strategy3Feasible) {
      console.log('✅ 策略 3 可行：可以通过 split-view-container 限定作用域');
    } else {
      console.log('❌ 策略 3 需要调整');
    }
  } catch (err) {
    console.error('探测失败:', err);
    process.exit(1);
  }
}

main();
