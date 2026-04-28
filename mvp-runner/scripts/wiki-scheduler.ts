/**
 * Wiki Scheduler CLI
 * 用法: npx tsx scripts/wiki-scheduler.ts [distill|merge|all]
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

import {
  runScheduledDistill,
  runScheduledMerge,
  type SchedulerConfig,
} from '../src/skills/wiki-scheduler.js';

const config: SchedulerConfig = {
  workspaces: ['PMCLI', 'DEVCLI'],
  distillSchedule: '0 4 * * *',
  mergeSchedule: '0 3 * * 0',
  retryDelayMinutes: 15,
  maxRetries: 3,
  alertThreshold: 3,
  larkNotify: {
    enabled: true,
  },
};

async function main() {
  const mode = process.argv[2] ?? 'all';
  const today = new Date();
  const isSunday = today.getDay() === 0;

  console.log(`\n[wiki-scheduler] 启动 | 模式: ${mode} | 日期: ${today.toISOString()}`);

  if (mode === 'distill' || mode === 'all') {
    const result = await runScheduledDistill(config);
    console.log('\n=== 蒸馏结果 ===');
    result.tasks.forEach(t => {
      const icon = t.success ? '✅' : '❌';
      console.log(`${icon} ${t.workspace}: ${t.type} (重试${t.retries}次)${t.error ? ' - ' + t.error : ''}`);
    });
    if (result.alertSent) {
      console.log('⚠️ 已发送连续失败告警');
    }
  }

  if (mode === 'merge' || (mode === 'all' && isSunday)) {
    const result = await runScheduledMerge(config);
    console.log('\n=== 合并结果 ===');
    result.tasks.forEach(t => {
      const icon = t.success ? '✅' : '❌';
      console.log(`${icon} ${t.workspace}: ${t.type} (重试${t.retries}次)${t.error ? ' - ' + t.error : ''}`);
    });
  }

  console.log('\n=== [wiki-scheduler] 完成 ===\n');
}

main().catch((err) => {
  console.error('[wiki-scheduler] 致命错误:', err);
  process.exit(1);
});
