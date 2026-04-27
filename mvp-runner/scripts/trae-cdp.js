// ============================================================================
// Trae CDP 操控模块
// 封装所有与 Trae 的 CDP 交互操作
// ============================================================================

const CDP = require('chrome-remote-interface');
const fs = require('fs');
const path = require('path');

class TraeCDP {
  constructor(options = {}) {
    this.host = options.host || 'localhost';
    this.port = options.port || 9222;
    this.client = null;
    this.target = null;
  }

  // ---------- 连接管理 ----------
  async connect(options = {}) {
    const isCN = options.isCN || process.env.TRAECN_MODE === '1';
    const targets = await CDP.List({ host: this.host, port: this.port });
    
    // 国内版和国际版的 URL 可能有差异
    const mainTarget = targets.find(t => {
      if (t.type !== 'page') return false;
      // 国际版
      if (t.url?.includes('workbench/workbench.html')) return true;
      // 国内版 - 可能有不同的路径
      if (t.url?.includes('workbench') || t.url?.includes('Trae')) return true;
      return false;
    });

    if (!mainTarget) {
      throw new Error('No main workbench target found. Is Trae fully loaded?');
    }

    this.target = mainTarget;
    this.isCN = isCN;
    this.client = await CDP({ target: mainTarget.webSocketDebuggerUrl });
    
    const { Runtime, DOM } = this.client;
    await Promise.all([Runtime.enable(), DOM.enable()]);
    
    return this.client;
  }

  async disconnect() {
    if (this.client) {
      await this.client.close();
      this.client = null;
    }
  }

  // ---------- DOM 查询 ----------
  async querySelector(selector) {
    const { Runtime } = this.client;
    const expr = `document.querySelector('${selector}') !== null`;
    const result = await Runtime.evaluate({ expression: expr, returnByValue: true });
    return result.result.value;
  }

  async querySelectorAll(selector) {
    const { Runtime } = this.client;
    const expr = `document.querySelectorAll('${selector}').length`;
    const result = await Runtime.evaluate({ expression: expr, returnByValue: true });
    return result.result.value;
  }

  // ---------- 元素信息 ----------
  async getElementInfo(selector) {
    const { Runtime } = this.client;
    const expr = `(() => {
      const el = document.querySelector('${selector}');
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return {
        tagName: el.tagName,
        id: el.id,
        className: el.className,
        placeholder: el.placeholder || '',
        value: el.value || '',
        textContent: el.textContent?.slice(0, 100) || '',
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        visible: rect.width > 0 && rect.height > 0,
        disabled: el.disabled || false
      };
    })()`;
    const result = await Runtime.evaluate({ expression: expr, returnByValue: true });
    return result.result.value;
  }

  // ---------- 文本注入 ----------
  async injectText(selector, text) {
    const { Runtime } = this.client;
    
    // 方法 1: 直接设置 innerText (适用于 contenteditable)
    const expr1 = `(() => {
      const el = document.querySelector('${selector}');
      if (!el) return { success: false, reason: 'element not found' };
      
      el.focus();
      
      // 尝试 innerText (contenteditable)
      if (el.isContentEditable) {
        el.innerText = '${text}';
        el.dispatchEvent(new InputEvent('input', { bubbles: true }));
        return { success: true, method: 'innerText', value: el.innerText };
      }
      
      // 尝试 value (input/textarea)
      if (el.value !== undefined) {
        el.value = '${text}';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return { success: true, method: 'value', value: el.value };
      }
      
      return { success: false, reason: 'unknown element type' };
    })()`;
    
    const result = await Runtime.evaluate({ expression: expr1, returnByValue: true });
    return result.result.value;
  }

  // ---------- 点击元素 ----------
  async clickElement(selector) {
    const { Runtime } = this.client;
    const expr = `(() => {
      const el = document.querySelector('${selector}');
      if (!el) return { success: false, reason: 'element not found' };
      el.click();
      return { success: true };
    })()`;
    const result = await Runtime.evaluate({ expression: expr, returnByValue: true });
    return result.result.value;
  }

  // ---------- 键盘事件 ----------
  async pressKey(key, options = {}) {
    const { Input } = this.client;
    
    const keyMap = {
      'Enter': { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 },
      'Ctrl': { key: 'Control', code: 'ControlLeft', windowsVirtualKeyCode: 17 },
      'Shift': { key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16 },
      'Tab': { key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 }
    };

    const keyInfo = keyMap[key] || { key, code: key };
    
    await Input.dispatchKeyEvent({
      type: 'keyDown',
      ...keyInfo
    });
    
    if (options.delay) {
      await new Promise(r => setTimeout(r, options.delay));
    }
    
    await Input.dispatchKeyEvent({
      type: 'keyUp',
      ...keyInfo
    });
    
    return { success: true };
  }

  // ---------- 提交消息 ----------
  async submitMessage(text) {
    // 国内版使用具体的选择器
    const inputSelector = '.chat-input-v2-input-box-editable';
    const sendButtonSelector = '.chat-input-v2-send-button';
    
    // 1. 注入文本
    const injectResult = await this.injectText(inputSelector, text);
    if (!injectResult.success) {
      throw new Error(`Failed to inject text: ${injectResult.reason}`);
    }
    
    // 等待按钮启用
    await new Promise(r => setTimeout(r, 1000));
    
    // 2. 点击发送按钮（国内版 Enter 不生效）
    const clickResult = await this.clickElement(sendButtonSelector);
    if (!clickResult.success) {
      // 备用：尝试 Enter 键
      await this.pressKey('Enter');
    }
    
    return { success: true, text: injectResult.value };
  }

  // ---------- 任务列表操作 ----------
  async getTaskList() {
    const { Runtime } = this.client;
    // 国内版和国际版使用相同的选择器
    const expr = `(() => {
      const items = document.querySelectorAll('.index-module__task-item___zOpfg');
      return Array.from(items).map((item, i) => ({
        index: i,
        text: item.textContent?.slice(0, 50) || '',
        className: item.className?.slice(0, 50) || '',
        selected: item.className.includes('selected')
      }));
    })()`;
    const result = await Runtime.evaluate({ expression: expr, returnByValue: true });
    return result.result.value || [];
  }

  async switchToTask(index) {
    const { Runtime } = this.client;
    const expr = `(() => {
      const items = document.querySelectorAll('.index-module__task-item___zOpfg');
      if (items[${index}]) {
        items[${index}].click();
        return { success: true, text: items[${index}].textContent?.slice(0, 30) };
      }
      return { success: false, reason: 'index out of range' };
    })()`;
    const result = await Runtime.evaluate({ expression: expr, returnByValue: true });
    return result.result.value;
  }

  // ---------- 等待响应 ----------
  async waitForResponse(timeout = 30000) {
    const { Runtime } = this.client;
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      // 国内版使用 .chat-turn 选择器
      const expr = `(() => {
        const turns = document.querySelectorAll('.chat-turn');
        const lastTurn = turns[turns.length - 1];
        const aiTurns = Array.from(turns).filter(t => !t.classList.contains('user'));
        const lastAiTurn = aiTurns[aiTurns.length - 1];
        return {
          count: turns.length,
          aiCount: aiTurns.length,
          lastText: lastTurn?.textContent?.slice(0, 200) || '',
          lastAiText: lastAiTurn?.textContent?.slice(0, 500) || '',
          hasResponse: lastAiTurn?.textContent?.length > 20
        };
      })()`;
      
      const result = await Runtime.evaluate({ expression: expr, returnByValue: true });
      const data = result.result.value;
      
      if (data.hasResponse) {
        return { 
          success: true, 
          messages: data.count, 
          aiMessages: data.aiCount,
          text: data.lastAiText 
        };
      }
      
      await new Promise(r => setTimeout(r, 2000));
    }
    
    return { success: false, reason: 'timeout' };
  }

  // ---------- 截图 ----------
  async screenshot(outputPath) {
    const { Page } = this.client;
    await Page.enable();
    const { data } = await Page.captureScreenshot();
    fs.writeFileSync(outputPath, Buffer.from(data, 'base64'));
    return outputPath;
  }

  // ---------- 获取页面标题 ----------
  async getTitle() {
    const { Runtime } = this.client;
    const result = await Runtime.evaluate({ expression: 'document.title', returnByValue: true });
    return result.result.value;
  }

  // ---------- 执行自定义 JS ----------
  async evaluate(expression) {
    const { Runtime } = this.client;
    const result = await Runtime.evaluate({ expression, returnByValue: true });
    return result.result.value;
  }
}

module.exports = { TraeCDP };
