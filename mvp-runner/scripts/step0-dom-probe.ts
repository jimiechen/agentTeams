// Step 0: DOM 结构实测
// 执行 6 个探测脚本验证任务隔离策略可行性

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { CDPClient } from '../src/cdp/client.js';
import { loadConfig } from '../src/config.js';

const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-');
const REPORT_DIR = path.resolve(process.cwd(), '../../comms/research');
const REPORT_FILE = path.join(REPORT_DIR, `${TIMESTAMP}-dom-empirical-validation.md`);

interface ProbeResult {
  name: string;
  result: any;
  passed: boolean;
  expected?: string;
}

async function runProbes(): Promise<ProbeResult[]> {
  const cfg = loadConfig();
  const cdp = new CDPClient({ host: cfg.cdp?.host, port: cfg.cdp?.port });
  await cdp.connect();

  const results: ProbeResult[] = [];

  // 探测 1：全局 chat-turn 数量基线
  const probe1 = await cdp.evaluate<number>(`
    document.querySelectorAll('.chat-turn').length
  `);
  results.push({
    name: '探测1：全局 chat-turn 数量',
    result: probe1,
    passed: typeof probe1 === 'number' && probe1 > 0,
  });

  // 探测 2：selected 任务节点是否唯一
  const probe2 = await cdp.evaluate<number>(`
    document.querySelectorAll('[class*="task-item"][class*="selected"]').length
  `);
  results.push({
    name: '探测2：selected 任务节点唯一性',
    result: probe2,
    passed: probe2 === 1,
    expected: '1',
  });

  // 探测 3：selected 内部的 chat-turn 数
  const probe3 = await cdp.evaluate<number | string>(`
    (() => {
      const sel = document.querySelector('[class*="task-item"][class*="selected"]');
      return sel ? sel.querySelectorAll('.chat-turn').length : 'sel-not-found';
    })()
  `);
  results.push({
    name: '探测3：selected 内部 chat-turn 数',
    result: probe3,
    passed: typeof probe3 === 'number' && probe3 > 0 && probe3 < probe1,
  });

  // 探测 4：selected 的 outerHTML 前 500 字符
  const probe4 = await cdp.evaluate<string>(`
    (() => {
      const sel = document.querySelector('[class*="task-item"][class*="selected"]');
      return sel?.outerHTML?.slice(0, 500) || 'sel-not-found';
    })()
  `);
  results.push({
    name: '探测4：selected outerHTML 前500字符',
    result: probe4,
    passed: probe4 !== 'sel-not-found',
  });

  // 探测 5：找到承载 chat-turn 的最近父容器类名
  const probe5 = await cdp.evaluate<string>(`
    (() => {
      const turn = document.querySelector('.chat-turn');
      return turn?.parentElement?.className || 'no-parent';
    })()
  `);
  results.push({
    name: '探测5：chat-turn 父容器类名',
    result: probe5,
    passed: probe5 !== 'no-parent',
  });

  // 探测 6：从 chat-turn 向上找到 selected 任务的距离
  const probe6 = await cdp.evaluate<{ found: boolean; depth: number }>(`
    (() => {
      const turn = document.querySelector('.chat-turn');
      if (!turn) return { found: false, depth: -1 };
      let node = turn, depth = 0;
      while (node && !node.matches?.('[class*="task-item"][class*="selected"]')) {
        node = node.parentElement;
        depth++;
        if (depth > 20) break;
      }
      return { found: !!node, depth };
    })()
  `);
  results.push({
    name: '探测6：chat-turn 到 selected 的距离',
    result: probe6,
    passed: probe6.found === true && probe6.depth > 0 && probe6.depth <= 20,
  });

  await cdp.disconnect();
  return results;
}

function generateReport(results: ProbeResult[]): string {
  const allPassed = results.every(r => r.passed);

  let report = `# DOM 结构实测报告\n\n`;
  report += `**生成时间**: ${new Date().toISOString()}\n\n`;
  report += `**总体结果**: ${allPassed ? '✅ 全部通过' : '❌ 存在未通过项'}\n\n`;
  report += `---\n\n`;

  for (const r of results) {
    report += `## ${r.name}\n\n`;
    report += `- **结果**: \`\`\`json\n${JSON.stringify(r.result, null, 2)}\n\`\`\`\n`;
    report += `- **通过**: ${r.passed ? '✅' : '❌'}\n`;
    if (r.expected) {
      report += `- **预期**: ${r.expected}\n`;
    }
    report += `\n`;
  }

  // 通过判断
  report += `## 通过判断\n\n`;
  const probe2 = results.find(r => r.name.includes('探测2'));
  const probe3 = results.find(r => r.name.includes('探测3'));
  const probe1 = results.find(r => r.name.includes('探测1'));
  const probe6 = results.find(r => r.name.includes('探测6'));

  report += `✅ 探测 2 = 1（selected 节点唯一）: ${probe2?.result === 1 ? '通过' : '未通过'}\n`;
  report += `✅ 探测 3 是数字且 < 探测 1（限定作用域减少匹配）: ${typeof probe3?.result === 'number' && probe3.result < (probe1?.result || Infinity) ? '通过' : '未通过'}\n`;
  report += `✅ 探测 6 的 found = true（chat-turn 是 selected 的后代）: ${probe6?.result?.found === true ? '通过' : '未通过'}\n`;

  if (!allPassed) {
    report += `\n## ⚠️ 警告\n\n`;
    report += `有探测未通过，需要创建告警报告并停止修复。\n`;
  }

  return report;
}

async function main() {
  try {
    mkdirSync(REPORT_DIR, { recursive: true });
    console.log('开始执行 DOM 探测...');

    const results = await runProbes();
    const report = generateReport(results);

    writeFileSync(REPORT_FILE, report, 'utf-8');
    console.log(`报告已保存: ${REPORT_FILE}`);

    const allPassed = results.every(r => r.passed);
    if (!allPassed) {
      const alertFile = path.join(REPORT_DIR, '../alerts', `${TIMESTAMP}-strategy3-broken.md`);
      mkdirSync(path.dirname(alertFile), { recursive: true });
      writeFileSync(alertFile, `# 策略 3 告警\n\n探测未通过，需要回到调研环节研究备选方案。\n`, 'utf-8');
      console.log(`告警已创建: ${alertFile}`);
      process.exit(1);
    }

    console.log('✅ 所有探测通过，可以继续修复');
  } catch (err) {
    console.error('探测失败:', err);
    process.exit(1);
  }
}

main();
