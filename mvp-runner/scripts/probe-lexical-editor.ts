// Probe 脚本 - 检查是否能获取 Lexical Editor 实例
import { CDPClient } from '../src/cdp/client.js';
import { loadConfig } from '../src/config.js';

async function main() {
  const cfg = loadConfig();
  const cdp = new CDPClient(cfg.cdp.host, cfg.cdp.port);
  await cdp.connect();

  console.log('=== 探测 Lexical Editor 实例 ===\n');

  const INPUT_SELECTOR = '.chat-input-v2-input-box-editable';

  // 尝试多种方式获取 editor
  const result = await cdp.evaluate(`
    (() => {
      const root = document.querySelector('${INPUT_SELECTOR}');
      if (!root) return { error: 'chat input not found' };

      // 方式1: 向上遍历查找 __lexicalEditor
      let editor = null;
      let node = root;
      let path = [];
      
      while (node && !editor) {
        path.push(node.tagName + (node.className ? '.' + node.className.slice(0, 30) : ''));
        editor = node.__lexicalEditor || node._lexicalEditor;
        if (editor) break;
        node = node.parentElement;
      }

      // 方式2: 全局查找
      const globalEditor = window.__LEXICAL_EDITOR__ || window.lexicalEditor;
      
      // 方式3: 查找所有 key 包含 lexical/editor 的 window 属性
      const windowKeys = Object.keys(window).filter(k => 
        k.toLowerCase().includes('lexical') || k.toLowerCase().includes('editor')
      ).slice(0, 10);

      return {
        found: !!editor,
        foundInPath: path.slice(0, 5),
        globalFound: !!globalEditor,
        windowKeys: windowKeys,
        rootHasEditor: !!root.__lexicalEditor,
        rootKeys: Object.keys(root).filter(k => k.includes('lexical') || k.includes('editor')).slice(0, 5)
      };
    })()
  `);

  console.log('探测结果:', JSON.stringify(result, null, 2));

  await cdp.disconnect();
}

main().catch(console.error);
