// 详细调试 Lexical fill 过程
import { CDPClient } from '../src/cdp/client.js';
import { loadConfig } from '../src/config.js';

async function main() {
  const cfg = loadConfig();
  const cdp = new CDPClient(cfg.cdp.host, cfg.cdp.port);
  await cdp.connect();

  console.log('=== 调试 Lexical Fill ===\n');

  const prompt = '几点了';

  // 步骤1: 检查 editor 实例
  console.log('1. 检查 editor 实例');
  const step1 = await cdp.evaluate(`
    (() => {
      const root = document.querySelector('.chat-input-v2-input-box-editable');
      if (!root) return { error: 'not found' };
      
      const editor = root.__lexicalEditor;
      return {
        hasEditor: !!editor,
        editorType: typeof editor,
        editorKeys: editor ? Object.keys(editor).slice(0, 10) : null
      };
    })()
  `);
  console.log('结果:', step1);

  // 步骤2: 尝试获取 editor 的方法
  console.log('\n2. 检查 editor 方法');
  const step2 = await cdp.evaluate(`
    (() => {
      const root = document.querySelector('.chat-input-v2-input-box-editable');
      const editor = root?.__lexicalEditor;
      if (!editor) return { error: 'no editor' };
      
      return {
        hasUpdate: typeof editor.update === 'function',
        hasGetRoot: typeof editor.getRoot === 'function',
        hasGetRootElement: typeof editor.getRootElement === 'function',
        hasCreateTextNode: typeof editor.createTextNode === 'function',
        hasSetEditorState: typeof editor.setEditorState === 'function',
        hasParseEditorState: typeof editor.parseEditorState === 'function',
        hasGetEditorState: typeof editor.getEditorState === 'function'
      };
    })()
  `);
  console.log('结果:', step2);

  // 步骤3: 尝试简单更新
  console.log('\n3. 尝试简单更新');
  const step3 = await cdp.evaluate(`
    (() => {
      try {
        const root = document.querySelector('.chat-input-v2-input-box-editable');
        const editor = root?.__lexicalEditor;
        if (!editor) return { error: 'no editor' };
        
        let updateResult = null;
        let updateError = null;
        
        try {
          editor.update(() => {
            try {
              const rootElement = editor.getRoot();
              const textNode = editor.createTextNode('测试');
              rootElement.append(textNode);
              updateResult = 'success';
            } catch (e) {
              updateError = e.message;
            }
          });
        } catch (e) {
          updateError = e.message;
        }
        
        // 等待一下
        setTimeout(() => {}, 100);
        
        return {
          updateResult,
          updateError,
          textAfter: root.innerText?.slice(0, 30)
        };
      } catch (e) {
        return { error: e.message };
      }
    })()
  `);
  console.log('结果:', step3);

  await cdp.disconnect();
}

main().catch(console.error);
