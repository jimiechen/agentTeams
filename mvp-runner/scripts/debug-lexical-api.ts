// 探索 Lexical Editor 正确 API
import { CDPClient } from '../src/cdp/client.js';
import { loadConfig } from '../src/config.js';

async function main() {
  const cfg = loadConfig();
  const cdp = new CDPClient(cfg.cdp.host, cfg.cdp.port);
  await cdp.connect();

  console.log('=== 探索 Lexical API ===\n');

  // 获取所有方法
  const result = await cdp.evaluate(`
    (() => {
      const root = document.querySelector('.chat-input-v2-input-box-editable');
      const editor = root?.__lexicalEditor;
      if (!editor) return { error: 'no editor' };
      
      const allKeys = Object.keys(editor);
      const methods = allKeys.filter(k => typeof editor[k] === 'function');
      const getters = allKeys.filter(k => {
        const desc = Object.getOwnPropertyDescriptor(editor, k);
        return desc && (desc.get || desc.set);
      });
      
      // 检查 prototype
      const proto = Object.getPrototypeOf(editor);
      const protoMethods = proto ? Object.getOwnPropertyNames(proto).filter(k => typeof editor[k] === 'function') : [];
      
      return {
        totalKeys: allKeys.length,
        methods: methods.slice(0, 30),
        getters: getters.slice(0, 10),
        protoMethods: protoMethods.slice(0, 20),
        hasRoot: editor._rootElement !== undefined
      };
    })()
  `);
  
  console.log('可用方法:', JSON.stringify(result, null, 2));

  await cdp.disconnect();
}

main().catch(console.error);
