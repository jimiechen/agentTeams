// 探索 Lexical Commands
import { CDPClient } from '../src/cdp/client.js';
import { loadConfig } from '../src/config.js';

async function main() {
  const cfg = loadConfig();
  const cdp = new CDPClient(cfg.cdp.host, cfg.cdp.port);
  await cdp.connect();

  console.log('=== 探索 Lexical Commands ===\n');

  const result = await cdp.evaluate(`
    (() => {
      // Lexical 通常在 window 上有命令定义
      const commands = Object.keys(window).filter(k => 
        k.toUpperCase().includes('INSERT') || 
        k.toUpperCase().includes('TEXT') ||
        k.includes('COMMAND')
      );
      
      // 检查是否有 $createTextNode 等
      const createFuncs = Object.keys(window).filter(k => 
        k.startsWith('$create') || k.startsWith('create')
      ).slice(0, 10);
      
      // 检查是否有 INSERT_TEXT_COMMAND
      const hasInsertTextCommand = typeof window.INSERT_TEXT_COMMAND !== 'undefined';
      
      return {
        commands: commands.slice(0, 10),
        createFuncs,
        hasInsertTextCommand,
        INSERT_TEXT_COMMAND: window.INSERT_TEXT_COMMAND
      };
    })()
  `);
  
  console.log('结果:', JSON.stringify(result, null, 2));

  await cdp.disconnect();
}

main().catch(console.error);
