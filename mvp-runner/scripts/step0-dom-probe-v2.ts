// Step 0 v2: 深入探测 DOM 结构
// 因为 chat-turn 不在 task-item 内，需要找到正确的关联方式

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { CDPClient } from '../src/cdp/client.js';
import { loadConfig } from '../src/config.js';

const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-');
const REPORT_DIR = path.resolve(process.cwd(), '../../comms/research');
const REPORT_FILE = path.join(REPORT_DIR, `${TIMESTAMP}-dom-empirical-validation-v2.md`);

async function runDeepProbes() {
  const cfg = loadConfig();
  const cdp = new CDPClient({ host: cfg.cdp?.host, port: cfg.cdp?.port });
  await cdp.connect();

  const results: Record<string, any> = {};

  // 探测 A: chat-turn 实际在哪里
  results.chatTurnLocation = await cdp.evaluate(`
    (() => {
      const turn = document.querySelector('.chat-turn');
      if (!turn) return { error: 'no chat-turn found' };
      
      // 向上遍历找到前10层父元素
      const parents = [];
      let node = turn;
      for (let i = 0; i < 10 && node; i++) {
        parents.push({
          tag: node.tagName,
          class: node.className?.slice(0, 100),
          id: node.id,
        });
        node = node.parentElement;
      }
      return parents;
    })()
  `);

  // 探测 B: 找到所有 task-item，看它们的结构
  results.taskItems = await cdp.evaluate(`
    (() => {
      const items = document.querySelectorAll('[class*="task-item"]');
      return Array.from(items).map((item, i) => ({
        index: i,
        className: item.className?.slice(0, 100),
        isSelected: item.className.includes('selected'),
        childCount: item.children.length,
        firstChildClass: item.children[0]?.className?.slice(0, 50),
      }));
    })()
  `);

  // 探测 C: 是否有 data-task-id 或其他关联属性
  results.taskAttributes = await cdp.evaluate(`
    (() => {
      const items = document.querySelectorAll('[class*="task-item"]');
      return Array.from(items).map(item => ({
        dataset: Object.keys(item.dataset || {}),
        attributes: Array.from(item.attributes || []).map(a => a.name).filter(n => n.includes('task') || n.includes('id') || n.includes('data')),
      }));
    })()
  `);

  // 探测 D: 找到 chat-turn 的最近 task-panel 或 task 容器
  results.chatTurnTaskContainer = await cdp.evaluate(`
    (() => {
      const turn = document.querySelector('.chat-turn');
      if (!turn) return { error: 'no chat-turn' };
      
      let node = turn;
      let depth = 0;
      const path = [];
      
      while (node && depth < 30) {
        const className = node.className || '';
        path.push({
          tag: node.tagName,
          class: className.slice(0, 100),
          hasTask: className.includes('task'),
          hasChat: className.includes('chat'),
        });
        
        if (className.includes('task') && className.includes('panel')) {
          return { found: true, depth, path };
        }
        
        node = node.parentElement;
        depth++;
      }
      
      return { found: false, depth, path };
    })()
  `);

  // 探测 E: 当前选中的 task-item 的完整 outerHTML
  results.selectedTaskHTML = await cdp.evaluate(`
    (() => {
      const sel = document.querySelector('[class*="task-item"][class*="selected"]');
      return sel ? sel.outerHTML?.slice(0, 2000) : 'not-found';
    })()
  `);

  // 探测 F: 是否有 iframe 或 shadow DOM
  results.domStructure = await cdp.evaluate(`
    (() => {
      return {
        hasIframe: !!document.querySelector('iframe'),
        iframeCount: document.querySelectorAll('iframe').length,
        bodyChildCount: document.body.children.length,
        bodyFirstChildClass: document.body.children[0]?.className?.slice(0, 100),
      };
    })()
  `);

  // 探测 G: 从 selected task-item 向上找，看能否找到包含 chat-turn 的容器
  results.selectedUpward = await cdp.evaluate(`
    (() => {
      const sel = document.querySelector('[class*="task-item"][class*="selected"]');
      if (!sel) return { error: 'no selected' };
      
      let node = sel;
      let depth = 0;
      const path = [];
      
      while (node && depth < 30) {
        const className = node.className || '';
        path.push({
          tag: node.tagName,
          class: className.slice(0, 100),
          hasChat: className.includes('chat'),
          childChatTurns: node.querySelectorAll('.chat-turn').length,
        });
        
        if (node.querySelectorAll('.chat-turn').length > 0) {
          return { found: true, depth, path };
        }
        
        node = node.parentElement;
        depth++;
      }
      
      return { found: false, depth, path };
    })()
  `);

  await cdp.disconnect();
  return results;
}

function generateReport(results: Record<string, any>): string {
  let report = `# DOM 结构深入探测报告 v2\n\n`;
  report += `**生成时间**: ${new Date().toISOString()}\n\n`;
  report += `---\n\n`;

  for (const [key, value] of Object.entries(results)) {
    report += `## ${key}\n\n`;
    report += `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\`\n\n`;
  }

  // 分析结论
  report += `## 分析结论\n\n`;
  
  const chatTurnInSelected = results.selectedUpward?.found;
  const chatTurnDepth = results.selectedUpward?.depth;
  
  if (chatTurnInSelected) {
    report += `✅ chat-turn 可以通过 selected task-item 向上查找找到，深度: ${chatTurnDepth}\n`;
    report += `建议：使用向上查找策略定位 chat 容器\n`;
  } else {
    report += `❌ chat-turn 和 task-item 不在同一个 DOM 分支中\n`;
    report += `需要寻找其他关联方式（如 data-task-id、iframe 等）\n`;
  }

  return report;
}

async function main() {
  try {
    mkdirSync(REPORT_DIR, { recursive: true });
    console.log('开始执行深入 DOM 探测...');

    const results = await runDeepProbes();
    const report = generateReport(results);

    writeFileSync(REPORT_FILE, report, 'utf-8');
    console.log(`报告已保存: ${REPORT_FILE}`);
    console.log('探测完成');
  } catch (err) {
    console.error('探测失败:', err);
    process.exit(1);
  }
}

main();
