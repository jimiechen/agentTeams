#!/usr/bin/env tsx
/**
 * 脚本：parse-task-content
 * 功能：从 CDP 获取并解析 Trae AI 的最新响应内容
 * 参考: trae-cdp.js, test-cn-cdp-results.js
 */

import CDP from 'chrome-remote-interface';

const HOST = process.env.CDP_HOST || 'localhost';
const PORT = Number(process.env.CDP_PORT) || 9222;

interface ParseResult {
  text: string;
  html: string;
  hasCodeBlock: boolean;
  hasImage: boolean;
  hasFile: boolean;
  codeBlocks: Array<{ language: string; code: string }>;
  images: Array<{ src: string; alt: string }>;
  files: Array<{ name: string; url: string }>;
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

/**
 * 获取最后一次 AI 响应内容
 * 参考 test-cn-cdp-results.js
 */
async function getLastAIResponse(client: CDP.Client): Promise<ParseResult | null> {
  const { Runtime } = client;
  
  // 参考 trae-cdp.js: 使用 .chat-turn 选择器和 classList.contains('user') 判断
  const result = await Runtime.evaluate({
    expression: `
      (function() {
        const turns = document.querySelectorAll('.chat-turn');
        if (turns.length === 0) return null;
        
        console.log('Total turns:', turns.length);
        
        // 从后往前找，找到最后一个 AI 消息（不包含 user class）
        let lastAiTurn = null;
        let aiIndex = -1;
        
        for (let i = turns.length - 1; i >= 0; i--) {
          const turn = turns[i];
          const isUser = turn.classList.contains('user');
          console.log('Turn', i, 'isUser:', isUser, 'text:', turn.innerText?.slice(0, 30));
          
          if (!isUser) {
            lastAiTurn = turn;
            aiIndex = i;
            break;
          }
        }
        
        if (!lastAiTurn) {
          console.log('No AI turn found');
          return null;
        }
        
        console.log('Found AI turn at index:', aiIndex);
        
        // 获取并清理文本
        let text = lastAiTurn.innerText || '';
        text = text.replace(/复制图片/g, '').trim();
        
        // 检测内容类型
        const html = lastAiTurn.innerHTML || '';
        const hasCode = html.includes('<code') || html.includes('</code>');
        const hasImage = html.includes('<img') || text.includes('复制图片');
        
        // 解析代码块
        const codeBlocks = [];
        if (hasCode) {
          lastAiTurn.querySelectorAll('pre code').forEach(code => {
            const lang = code.className.match(/language-(\\w+)/)?.[1] || 'text';
            codeBlocks.push({ language: lang, code: code.innerText });
          });
        }
        
        // 解析图片（排除头像、图标等小图片）
        const images = Array.from(lastAiTurn.querySelectorAll('img'))
          .filter(img => {
            // 排除头像区域的图片
            if (img.closest('.icd-avatar') || img.closest('.avatar')) return false;
            // 排除很小的图标（通常是头像/装饰图标）
            const width = img.naturalWidth || img.width || 0;
            const height = img.naturalHeight || img.height || 0;
            if (width > 0 && width < 50 && height > 0 && height < 50) return false;
            // 排除 base64 编码的 SVG 小图标
            if (img.src && img.src.includes('data:image/svg')) return false;
            return true;
          })
          .map(img => ({
            src: img.src || '',
            alt: img.alt || '图片'
          }));
        
        // 解析文件链接
        const files = Array.from(lastAiTurn.querySelectorAll('a[href]'))
          .filter(a => {
            const href = a.href || '';
            return href.includes('download') || a.className.includes('file');
          })
          .map(a => ({
            name: a.innerText || '文件',
            url: a.href
          }));
        
        return {
          text: text,
          html: html.slice(0, 500) + (html.length > 500 ? '...' : ''),
          hasCodeBlock: codeBlocks.length > 0,
          hasImage: images.length > 0 || hasImage,
          hasFile: files.length > 0,
          codeBlocks: codeBlocks,
          images: images,
          files: files,
          aiIndex: aiIndex,
          totalTurns: turns.length
        };
      })()
    `,
    returnByValue: true
  });
  
  return result.result.value;
}

function formatOutput(data: ParseResult): string {
  const lines: string[] = [];
  
  lines.push('═'.repeat(60));
  lines.push('📄 最后一次 AI 会话结果');
  lines.push('═'.repeat(60));
  lines.push(`AI 消息索引: ${(data as any).aiIndex} / ${(data as any).totalTurns}`);
  lines.push('');
  
  lines.push(`📝 文本内容 (${data.text.length} 字符):`);
  lines.push('-'.repeat(40));
  lines.push(data.text.slice(0, 1000));
  if (data.text.length > 1000) lines.push('... (truncated)');
  
  if (data.hasCodeBlock && data.codeBlocks.length > 0) {
    lines.push(`\n💻 代码块 (${data.codeBlocks.length} 个):`);
    lines.push('-'.repeat(40));
    data.codeBlocks.forEach((block, i) => {
      lines.push(`\n[${i + 1}] ${block.language}:`);
      lines.push('\``\`' + block.language);
      lines.push(block.code.slice(0, 300));
      if (block.code.length > 300) lines.push('...');
      lines.push('\``\`');
    });
  }
  
  if (data.hasImage && data.images.length > 0) {
    lines.push(`\n🖼️ 图片 (${data.images.length} 张):`);
    lines.push('-'.repeat(40));
    data.images.forEach((img, i) => {
      lines.push(`[${i + 1}] ${img.alt}: ${img.src.slice(0, 60)}...`);
    });
  }
  
  if (data.hasFile && data.files.length > 0) {
    lines.push(`\n📎 附件 (${data.files.length} 个):`);
    lines.push('-'.repeat(40));
    data.files.forEach((file, i) => {
      lines.push(`[${i + 1}] ${file.name}: ${file.url.slice(0, 60)}...`);
    });
  }
  
  lines.push('\n' + '═'.repeat(60));
  
  return lines.join('\n');
}

async function main() {
  console.log('🔌 Connecting to CDP...');
  const client = await connectCDP();
  
  try {
    console.log('🔍 Getting last AI response...\n');
    const result = await getLastAIResponse(client);
    
    if (!result) {
      console.log('❌ No AI response found');
      return;
    }
    
    console.log(formatOutput(result));
    
    // JSON output
    console.log('\n📦 JSON Output:');
    console.log(JSON.stringify(result, null, 2));
    
  } finally {
    await client.close();
  }
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
