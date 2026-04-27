#!/usr/bin/env tsx
/**
 * 脚本：send-to-ai
 * 功能：通过 CDP 向 Trae AI 发送消息
 * 用法：npx tsx scripts/send-to-ai.ts "你的消息内容" [--slot=0]
 */

import CDP from 'chrome-remote-interface';

const HOST = process.env.CDP_HOST || 'localhost';
const PORT = Number(process.env.CDP_PORT) || 9222;

interface SendOptions {
  message: string;
  slot?: number;
  timeout?: number;
}

async function connectCDP(): Promise<CDP.Client> {
  const targets = await CDP.List({ host: HOST, port: PORT });
  const target = targets.find(t => t.type === 'page' && (t.title?.includes('Trae') || t.title?.includes('SOLO')));
  
  if (!target) {
    throw new Error(`No Trae target found at ${HOST}:${PORT}`);
  }
  
  console.log(`✅ Connected to: ${target.title}`);
  return await CDP({ host: HOST, port: PORT, target });
}

async function switchTaskSlot(client: CDP.Client, slotIndex: number): Promise<void> {
  const { Runtime } = client;
  
  console.log(`🔀 Switching to slot #${slotIndex}...`);
  
  // 点击任务列表项
  const clickExpr = `
    (function() {
      const items = document.querySelectorAll('.index-module__task-item___zOpfg, [class*="task-item"]');
      const target = items[${slotIndex}];
      if (target) {
        target.click();
        return true;
      }
      return false;
    })()
  `;
  
  const result = await Runtime.evaluate({ expression: clickExpr, returnByValue: true });
  if (!result.result.value) {
    throw new Error(`Failed to find task slot #${slotIndex}`);
  }
  
  // 等待切换完成
  await new Promise(r => setTimeout(r, 1000));
  console.log(`✅ Switched to slot #${slotIndex}`);
}

async function fillPrompt(client: CDP.Client, message: string): Promise<void> {
  const { Runtime } = client;
  
  console.log(`📝 Filling prompt: "${message.slice(0, 50)}${message.length > 50 ? '...' : ''}"`);
  
  // 找到输入框并填充
  const fillExpr = `
    (function() {
      const input = document.querySelector('.chat-input-v2-input-box-editable, [contenteditable="true"]');
      if (!input) return false;
      
      // 设置内容
      input.innerText = ${JSON.stringify(message)};
      input.textContent = ${JSON.stringify(message)};
      
      // 触发输入事件
      const events = ['input', 'change', 'keyup', 'keydown'];
      events.forEach(type => {
        const evt = new Event(type, { bubbles: true });
        input.dispatchEvent(evt);
      });
      
      return true;
    })()
  `;
  
  const result = await Runtime.evaluate({ expression: fillExpr, returnByValue: true });
  if (!result.result.value) {
    throw new Error('Failed to find chat input');
  }
  
  console.log('✅ Prompt filled');
}

async function submitMessage(client: CDP.Client): Promise<void> {
  const { Runtime } = client;
  
  console.log('📤 Submitting message...');
  
  // 点击发送按钮
  const submitExpr = `
    (function() {
      const btn = document.querySelector('.chat-input-v2-send-button, button[aria-label*="发送"], button[type="submit"]');
      if (btn) {
        btn.click();
        return true;
      }
      // 尝试回车
      const input = document.querySelector('.chat-input-v2-input-box-editable, [contenteditable="true"]');
      if (input) {
        const evt = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
        input.dispatchEvent(evt);
        return true;
      }
      return false;
    })()
  `;
  
  const result = await Runtime.evaluate({ expression: submitExpr, returnByValue: true });
  if (!result.result.value) {
    throw new Error('Failed to submit message');
  }
  
  console.log('✅ Message submitted');
}

async function waitForResponse(client: CDP.Client, timeoutMs: number = 60000): Promise<string> {
  const { Runtime } = client;
  
  console.log('⏳ Waiting for AI response...');
  
  const startTime = Date.now();
  const checkInterval = 500;
  let lastTurnCount = 0;
  
  // 获取当前 turn 数量
  const getCountExpr = `
    document.querySelectorAll('[class*="chat-turn"]').length
  `;
  const countResult = await Runtime.evaluate({ expression: getCountExpr, returnByValue: true });
  lastTurnCount = countResult.result.value || 0;
  console.log(`Current turn count: ${lastTurnCount}`);
  
  // 等待新消息出现
  while (Date.now() - startTime < timeoutMs) {
    await new Promise(r => setTimeout(r, checkInterval));
    
    const newCountResult = await Runtime.evaluate({ expression: getCountExpr, returnByValue: true });
    const newCount = newCountResult.result.value || 0;
    
    if (newCount > lastTurnCount) {
      console.log(`✅ New message detected (${lastTurnCount} → ${newCount})`);
      
      // 等待内容稳定
      let stableCount = 0;
      let lastText = '';
      
      while (stableCount < 3 && Date.now() - startTime < timeoutMs) {
        await new Promise(r => setTimeout(r, 500));
        
        const getTextExpr = `
          (function() {
            const turns = document.querySelectorAll('[class*="chat-turn"]');
            const last = turns[turns.length - 1];
            return last ? last.innerText : '';
          })()
        `;
        const textResult = await Runtime.evaluate({ expression: getTextExpr, returnByValue: true });
        const currentText = textResult.result.value || '';
        
        if (currentText === lastText && currentText.length > 0) {
          stableCount++;
        } else {
          stableCount = 0;
          lastText = currentText;
        }
      }
      
      return lastText;
    }
  }
  
  throw new Error('Timeout waiting for AI response');
}

async function sendToAI(options: SendOptions): Promise<string> {
  const client = await connectCDP();
  
  try {
    // 1. 切换任务 slot
    if (options.slot !== undefined) {
      await switchTaskSlot(client, options.slot);
    }
    
    // 2. 填充消息
    await fillPrompt(client, options.message);
    
    // 3. 提交
    await submitMessage(client);
    
    // 4. 等待响应
    const response = await waitForResponse(client, options.timeout || 60000);
    
    return response;
    
  } finally {
    await client.close();
  }
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0].startsWith('--')) {
    console.log('Usage: npx tsx scripts/send-to-ai.ts "your message" [--slot=0] [--timeout=60000]');
    process.exit(1);
  }
  
  const message = args[0];
  const slotArg = args.find(a => a.startsWith('--slot='));
  const slot = slotArg ? Number(slotArg.split('=')[1]) : 0;
  const timeoutArg = args.find(a => a.startsWith('--timeout='));
  const timeout = timeoutArg ? Number(timeoutArg.split('=')[1]) : 60000;
  
  console.log('═'.repeat(60));
  console.log('🚀 Send to AI');
  console.log('═'.repeat(60));
  console.log(`Message: ${message.slice(0, 50)}${message.length > 50 ? '...' : ''}`);
  console.log(`Slot: ${slot}`);
  console.log(`Timeout: ${timeout}ms`);
  console.log('');
  
  try {
    const response = await sendToAI({ message, slot, timeout });
    
    console.log('\n' + '═'.repeat(60));
    console.log('📥 AI Response');
    console.log('═'.repeat(60));
    console.log(response);
    console.log('\n' + '═'.repeat(60));
    
  } catch (err) {
    console.error('\n❌ Error:', (err as Error).message);
    process.exit(1);
  }
}

main();
