/**
 * 测试 wiki-inject 功能
 * 用法: npx tsx scripts/test-wiki-inject.ts [workspace]
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

import { injectWikiContext, invalidateCache } from '../src/skills/wiki-inject.js';

async function main() {
  const workspaceName = process.argv[2] || 'PMCLI';
  const workspacePath = path.resolve(ROOT, 'workspaces', workspaceName);

  console.log(`\n=== 测试 wiki-inject ===`);
  console.log(`工作区: ${workspaceName}`);
  console.log(`路径: ${workspacePath}\n`);

  // 先清除缓存
  invalidateCache(workspacePath);
  console.log('✅ 缓存已清除\n');

  // 测试注入
  const testPrompt = '请分析当前的代码结构，找出潜在的性能瓶颈。';
  console.log('原始Prompt:');
  console.log(testPrompt);
  console.log('\n--- 开始注入 ---\n');

  try {
    const enriched = await injectWikiContext(workspacePath, testPrompt);

    console.log('注入后的Prompt:');
    console.log('='.repeat(60));
    console.log(enriched);
    console.log('='.repeat(60));

    console.log('\n✅ 注入成功!');
    console.log(`原始长度: ${testPrompt.length} 字符`);
    console.log(`注入后长度: ${enriched.length} 字符`);
    console.log(`增加: ${enriched.length - testPrompt.length} 字符`);

  } catch (err) {
    console.error('\n❌ 注入失败:', (err as Error).message);
    process.exit(1);
  }
}

main().catch(console.error);
