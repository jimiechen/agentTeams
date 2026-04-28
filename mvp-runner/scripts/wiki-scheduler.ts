/**
 * Wiki Scheduler - 统一调度入口
 * 用法: npx tsx scripts/wiki-scheduler.ts [distill|merge|all]
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

import { execute as distill } from '../src/skills/wiki-distill.js';
import { execute as merge }   from '../src/skills/wiki-merge.js';
import { invalidateCache }    from '../src/skills/wiki-inject.js';

const WORKSPACES = [
  path.resolve(ROOT, 'workspaces/PMCLI'),
  path.resolve(ROOT, 'workspaces/DEVCLI'),
];

async function runDistill(): Promise<void> {
  console.log('\n=== [wiki-scheduler] 开始每日蒸馏 ===\n');
  for (const ws of WORKSPACES) {
    const wsName = path.basename(ws);
    console.log(`\n-- 工作区: ${wsName}`);
    const result = await distill({
      params: { workspacePath: ws },
      env: {},
    });
    console.log(
      result.success
        ? `✅ 蒸馏完成 | 压缩比: ${result.compressionRatio}:1 | 质量: ${result.quality} | 文件: ${result.fileCount}条`
        : `❌ 蒸馏失败: ${result.error}`
    );
    if (result.success) {
      invalidateCache(ws);
    }
  }
}

async function runMerge(): Promise<void> {
  console.log('\n=== [wiki-scheduler] 开始每周合并 ===\n');
  for (const ws of WORKSPACES) {
    const wsName = path.basename(ws);
    console.log(`\n-- 工作区: ${wsName}`);
    const result = await merge({
      params: { workspacePath: ws },
      env: {},
    });
    console.log(
      result.success
        ? `✅ 合并完成 | 条目数: ${result.itemsCount} | ${result.previousCoreChars}字 → ${result.newCoreChars}字`
        : `❌ 合并失败: ${result.error}`
    );
    if (result.success) {
      invalidateCache(ws);
    }
  }
}

async function main(): Promise<void> {
  const mode = process.argv[2] ?? 'all';
  const today = new Date();
  const isSunday = today.getDay() === 0;

  console.log(`\n[wiki-scheduler] 启动 | 模式: ${mode} | 日期: ${today.toISOString()}`);

  if (mode === 'distill' || mode === 'all') {
    await runDistill();
  }

  if (mode === 'merge' || (mode === 'all' && isSunday)) {
    await runMerge();
  }

  console.log('\n=== [wiki-scheduler] 完成 ===\n');
}

main().catch((err) => {
  console.error('[wiki-scheduler] 致命错误:', err);
  process.exit(1);
});
