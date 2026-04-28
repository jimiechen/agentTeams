/**
 * 测试 wiki-distill 功能（Dry Run模式）
 * 用法: npx tsx scripts/test-wiki-distill.ts [workspace]
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

import { execute as wikiDistill } from '../src/skills/wiki-distill.js';

async function main() {
  const workspaceName = process.argv[2] || 'PMCLI';
  const workspacePath = path.resolve(ROOT, 'workspaces', workspaceName);

  console.log(`\n=== 测试 wiki-distill (Dry Run) ===`);
  console.log(`工作区: ${workspaceName}`);
  console.log(`路径: ${workspacePath}\n`);

  try {
    const result = await wikiDistill({
      params: {
        workspacePath,
        dryRun: true,
      },
      env: {},
    });

    console.log('\n--- 结果 ---');
    console.log(`成功: ${result.success}`);
    console.log(`原始字符: ${result.rawChars}`);
    console.log(`蒸馏字符: ${result.distilledChars}`);
    console.log(`文件数: ${result.fileCount}`);
    if (result.error) {
      console.log(`错误: ${result.error}`);
    }

  } catch (err) {
    console.error('\n❌ 测试失败:', (err as Error).message);
    console.error((err as Error).stack);
    process.exit(1);
  }
}

main().catch(console.error);
