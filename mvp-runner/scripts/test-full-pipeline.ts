#!/usr/bin/env tsx
/**
 * 脚本：test-full-pipeline
 * 功能：测试完整流程 - 发送消息给 AI 并解析响应内容
 * 用法：npx tsx scripts/test-full-pipeline.ts "你的消息" [--slot=0]
 */

import { spawn } from 'child_process';

async function runScript(script: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const cmd = `npx tsx ${script} ${args.map(a => `"${a}"`).join(' ')}`;
    console.log(`\n▶️ Running: ${cmd}\n`);
    
    const child = spawn('npx', ['tsx', script, ...args], {
      cwd: process.cwd(),
      shell: true
    });
    
    let output = '';
    let error = '';
    
    child.stdout.on('data', (data) => {
      output += data.toString();
      process.stdout.write(data);
    });
    
    child.stderr.on('data', (data) => {
      error += data.toString();
      process.stderr.write(data);
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        resolve(output);
      } else {
        reject(new Error(`Script exited with code ${code}: ${error}`));
      }
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0].startsWith('--')) {
    console.log('Usage: npx tsx scripts/test-full-pipeline.ts "your message" [--slot=0]');
    process.exit(1);
  }
  
  const message = args[0];
  const slotArg = args.find(a => a.startsWith('--slot='));
  const slot = slotArg || '--slot=0';
  
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║           测试完整流程：发送 → 接收 → 解析                  ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  
  try {
    // 步骤 1: 发送消息给 AI
    console.log('\n📤 步骤 1: 发送消息给 AI');
    console.log('─'.repeat(60));
    await runScript('scripts/send-to-ai.ts', [message, slot]);
    
    // 等待 AI 生成响应
    console.log('\n⏳ 等待 AI 生成响应 (5秒)...');
    await new Promise(r => setTimeout(r, 5000));
    
    // 步骤 2: 解析任务结果内容
    console.log('\n📥 步骤 2: 解析任务结果内容');
    console.log('─'.repeat(60));
    await runScript('scripts/parse-task-content.ts', []);
    
    console.log('\n✅ 完整流程测试完成！');
    
  } catch (err) {
    console.error('\n❌ 测试失败:', (err as Error).message);
    process.exit(1);
  }
}

main();
