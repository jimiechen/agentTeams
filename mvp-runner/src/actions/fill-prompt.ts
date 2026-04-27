// src/actions/fill-prompt.ts - 填充 Prompt 到 Chat 输入框
// 技术经理方案：直接调用 Lexical Editor API（成功率 >95%）
// 备选方案：触发 beforeinput 事件（成功率 ~70%）

import createDebug from 'debug';
import { CDPClient } from '../cdp/client.js';
import { FillPromptError } from '../errors.js';

const debug = createDebug('mvp:action:fill');

const INPUT_SELECTOR = '.chat-input-v2-input-box-editable';

export async function fillPrompt(cdp: CDPClient, prompt: string): Promise<void> {
  debug(`Filling prompt (${prompt.length} chars)`);

  // 方案1: 直接调用 Lexical Editor API（首选，成功率 >95%）
  try {
    const result = await fillViaLexicalAPI(cdp, prompt);
    if (result) {
      debug(`Filled successfully via Lexical API: "${result.slice(0, 50)}..."`);
      return;
    }
  } catch (err) {
    debug(`Lexical API failed: ${(err as Error).message}, trying beforeinput`);
  }

  // 方案2: 触发 beforeinput 事件（兜底，成功率 ~70%）
  try {
    const result = await fillViaBeforeInput(cdp, prompt);
    if (result) {
      debug(`Filled successfully via beforeinput: "${result.slice(0, 50)}..."`);
      return;
    }
  } catch (err) {
    debug(`beforeinput failed: ${(err as Error).message}`);
  }

  // 方案3: 直接操作 DOM 作为最后兜底
  try {
    const result = await fillViaDOM(cdp, prompt);
    if (result) {
      debug(`Filled successfully via DOM: "${result.slice(0, 50)}..."`);
      return;
    }
  } catch (err) {
    debug(`DOM fill failed: ${(err as Error).message}`);
  }

  throw new FillPromptError('All fill methods failed');
}

/** 方案1: 直接调用 Lexical Editor API */
async function fillViaLexicalAPI(cdp: CDPClient, prompt: string): Promise<string | null> {
  const escapedPrompt = JSON.stringify(prompt);
  
  const result = await cdp.evaluate<{ success: boolean; text?: string; error?: string }>(`
    (() => {
      try {
        const root = document.querySelector('${INPUT_SELECTOR}');
        if (!root) return { success: false, error: 'chat input not found' };

        // 获取 Lexical Editor 实例
        let editor = root.__lexicalEditor;
        if (!editor) {
          // 向上遍历查找
          let node = root;
          while (node && !editor) {
            editor = node.__lexicalEditor || node._lexicalEditor;
            if (editor) break;
            node = node.parentElement;
          }
        }

        if (!editor) {
          return { success: false, error: 'Lexical editor not found' };
        }

        // 方案1a: 使用 dispatchCommand 插入文本
        try {
          const rootElement = editor.getRootElement();
          rootElement.focus();
          
          // 尝试使用 Range 和 Selection API
          const selection = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(rootElement);
          range.collapse(false);
          selection.removeAllRanges();
          selection.addRange(range);
          
          // 插入文本
          document.execCommand('insertText', false, ${escapedPrompt}.slice(1, -1));
          
          const actualText = root.innerText?.trim() || '';
          if (actualText.length > 0) {
            return { success: true, text: actualText };
          }
        } catch (e) {
          // 继续尝试其他方法
        }

        // 方案1b: 使用 update + setEditorState
        try {
          editor.update(() => {
            // 获取当前状态
            const editorState = editor.getEditorState();
            const rootNode = editorState._nodeMap?.get('root');
            
            if (rootNode && rootNode.children) {
              // 清空子节点
              rootNode.children = [];
            }
          });
          
          // 等待更新
          await new Promise(r => setTimeout(r, 100));
          
          // 再次尝试通过 DOM 写入
          root.innerHTML = '<p>' + ${escapedPrompt}.slice(1, -1) + '</p>';
          
          // 触发事件让 Lexical 感知
          root.dispatchEvent(new InputEvent('input', { bubbles: true }));
          
          const actualText = root.innerText?.trim() || '';
          return { success: actualText.length > 0, text: actualText };
        } catch (e) {
          return { success: false, error: 'update failed: ' + e.message };
        }
      } catch (e) {
        return { success: false, error: (e as Error).message };
      }
    })()
  `);

  if (!result.success) {
    throw new Error(result.error || 'Lexical API returned false');
  }

  return result.text || null;
}

/** 方案2: 触发 beforeinput 事件 */
async function fillViaBeforeInput(cdp: CDPClient, prompt: string): Promise<string | null> {
  const escapedPrompt = JSON.stringify(prompt);
  
  const result = await cdp.evaluate<{ success: boolean; text?: string; error?: string }>(`
    (() => {
      try {
        const el = document.querySelector('${INPUT_SELECTOR}');
        if (!el) return { success: false, error: 'chat input not found' };

        // 聚焦元素
        el.focus();
        el.click();

        // 触发 beforeinput 事件（这是 Lexical 监听的关键事件）
        const event = new InputEvent('beforeinput', {
          bubbles: true,
          cancelable: true,
          inputType: 'insertText',
          data: ${escapedPrompt}.slice(1, -1),
        });

        const accepted = el.dispatchEvent(event);
        
        // 再触发 input 事件作为补充
        el.dispatchEvent(new InputEvent('input', { 
          bubbles: true,
          inputType: 'insertText',
          data: ${escapedPrompt}.slice(1, -1)
        }));

        // 验证
        const actualText = el.innerText?.trim() || el.textContent?.trim() || '';
        
        return { 
          success: actualText.length > 0, 
          text: actualText,
          accepted: accepted
        };
      } catch (e) {
        return { success: false, error: (e as Error).message };
      }
    })()
  `);

  if (!result.success) {
    throw new Error(result.error || 'beforeinput returned false');
  }

  return result.text || null;
}

/** 方案3: 直接操作 DOM */
async function fillViaDOM(cdp: CDPClient, prompt: string): Promise<string | null> {
  const escapedPrompt = JSON.stringify(prompt);
  
  const result = await cdp.evaluate<{ success: boolean; text?: string; error?: string }>(`
    (() => {
      try {
        const el = document.querySelector('${INPUT_SELECTOR}');
        if (!el) return { success: false, error: 'chat input not found' };

        el.focus();
        
        // 清空并设置内容
        el.innerHTML = '<p>' + ${escapedPrompt}.slice(1, -1) + '</p>';
        
        // 触发多个事件
        el.dispatchEvent(new InputEvent('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        
        const actualText = el.innerText?.trim() || '';
        return { success: actualText.length > 0, text: actualText };
      } catch (e) {
        return { success: false, error: (e as Error).message };
      }
    })()
  `);

  if (!result.success) {
    throw new Error(result.error || 'DOM fill returned false');
  }

  return result.text || null;
}
