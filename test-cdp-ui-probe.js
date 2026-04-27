/**
 * CDP UI 探测测试脚本
 * 
 * 用法：
 *   1. 启动 Trae IDE 并开启远程调试端口：
 *      Windows: "D:\Program Files\Trae\Trae.exe" --remote-debugging-port=9222
 *      macOS: /Applications/Trae.app/Contents/MacOS/Trae --remote-debugging-port=9222
 *   
 *   2. 运行测试：
 *      node test-cdp-ui-probe.js [--port 9222]
 * 
 * 功能：
 *   - 自动连接 Trae IDE 的 CDP 调试端口
 *   - 扫描 workbench 页面 DOM，提取所有可交互元素特征
 *   - 多策略匹配关键 UI 元素（Chat 输入框、发送按钮、状态指示器等）
 *   - 输出匹配结果、置信度、降级策略
 *   - 保存探测结果到本地缓存
 */

const CDP = require('chrome-remote-interface');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ========== 配置 ==========
const DEFAULT_PORT = 9222;
const PROBE_TIMEOUT = 15000;
const CACHE_DIR = path.join(os.homedir(), '.trae-agent-team');

// ========== 解析命令行参数 ==========
function parseArgs() {
  const args = process.argv.slice(2);
  let port = DEFAULT_PORT;
  let saveCache = true;
  let verbose = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port' && args[i + 1]) {
      port = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--no-cache') {
      saveCache = false;
    } else if (args[i] === '--verbose' || args[i] === '-v') {
      verbose = true;
    }
  }

  return { port, saveCache, verbose };
}

// ========== 关键元素识别策略 ==========
const ELEMENT_STRATEGIES = {
  chatInput: {
    name: 'Chat 输入框',
    strategies: [
      {
        name: 'P0-testid',
        test: (el) => el.dataTestId && /chat.?input/i.test(el.dataTestId),
        confidence: 0.99
      },
      {
        name: 'P1-role-textbox',
        test: (el) => el.role === 'textbox' && el.contentEditable === 'true',
        confidence: 0.95
      },
      {
        name: 'P2-placeholder',
        test: (el) => {
          const keywords = ['发送消息', 'send message', 'ask', 'type', '输入', '描述', 'message'];
          return el.contentEditable === 'true' && keywords.some(kw =>
            (el.placeholder || '').toLowerCase().includes(kw)
          );
        },
        confidence: 0.85
      },
      {
        name: 'P3-aria-label',
        test: (el) => {
          const keywords = ['chat', 'message', 'input', 'prompt'];
          return keywords.some(kw => (el.ariaLabel || '').toLowerCase().includes(kw));
        },
        confidence: 0.80
      },
      {
        name: 'P4-chat-container',
        test: (el) => {
          return el.contentEditable === 'true' && el.classChain.some(classes =>
            classes.some(c => /chat/i.test(c))
          );
        },
        confidence: 0.70
      },
      {
        name: 'P5-largest-editable',
        test: (el, allElements) => {
          if (el.contentEditable !== 'true' || el.hidden) return false;
          const editables = allElements
            .filter(e => e.contentEditable === 'true' && !e.hidden)
            .sort((a, b) => (b.rect.width * b.rect.height) - (a.rect.width * a.rect.height));
          return editables.length > 0 && editables[0] === el;
        },
        confidence: 0.50
      }
    ]
  },

  sendButton: {
    name: '发送按钮',
    strategies: [
      {
        name: 'P0-testid',
        test: (el) => el.dataTestId && /send/i.test(el.dataTestId),
        confidence: 0.99
      },
      {
        name: 'P1-aria-label',
        test: (el) => {
          const keywords = ['发送', 'send', 'submit'];
          return el.tagName === 'BUTTON' && keywords.some(kw =>
            (el.ariaLabel || '').toLowerCase().includes(kw)
          );
        },
        confidence: 0.90
      },
      {
        name: 'P2-button-in-chat',
        test: (el) => {
          return el.tagName === 'BUTTON' && !el.disabled &&
            el.classChain.some(classes => classes.some(c => /chat/i.test(c)));
        },
        confidence: 0.70
      },
      {
        name: 'P3-svg-icon-button',
        test: (el) => {
          return (el.tagName === 'BUTTON' || el.role === 'button') &&
            !el.disabled && el.rect.width < 60 && el.rect.height < 60;
        },
        confidence: 0.40
      }
    ]
  },

  statusIndicator: {
    name: 'AI 状态指示器',
    strategies: [
      {
        name: 'P0-testid',
        test: (el) => el.dataTestId && /loading|thinking|processing/i.test(el.dataTestId),
        confidence: 0.99
      },
      {
        name: 'P1-animating-element',
        test: (el) => {
          return el.classChain.some(classes =>
            classes.some(c => /loading|spinner|thinking|animating|pulse/i.test(c))
          );
        },
        confidence: 0.75
      },
      {
        name: 'P2-stop-button-visible',
        test: (el) => {
          return (el.tagName === 'BUTTON' || el.role === 'button') &&
            el.classChain.some(classes =>
              classes.some(c => /stop|cancel/i.test(c))
            );
        },
        confidence: 0.70
      }
    ]
  },

  chatList: {
    name: 'Chat 会话列表',
    strategies: [
      {
        name: 'P0-testid',
        test: (el) => el.dataTestId && /chat.?list|conversation.?list|session.?list/i.test(el.dataTestId),
        confidence: 0.99
      },
      {
        name: 'P1-sidebar-list',
        test: (el) => {
          return el.classChain.some(classes =>
            classes.some(c => /(chat|conversation|session)/i.test(c) && /list|sidebar|panel/i.test(c))
          );
        },
        confidence: 0.75
      },
      {
        name: 'P2-scrollable-sidebar',
        test: (el) => {
          return el.rect.height > 200 && el.rect.width < 400 &&
            el.classChain.some(classes => classes.some(c => /sidebar|panel/i.test(c)));
        },
        confidence: 0.50
      }
    ]
  },

  newChatButton: {
    name: '新建对话按钮',
    strategies: [
      {
        name: 'P0-testid',
        test: (el) => el.dataTestId && /new.?chat|new.?conversation/i.test(el.dataTestId),
        confidence: 0.99
      },
      {
        name: 'P1-aria-label',
        test: (el) => {
          const keywords = ['新建', 'new', '新对话', 'new chat'];
          return (el.tagName === 'BUTTON' || el.role === 'button') &&
            keywords.some(kw => (el.ariaLabel || '').toLowerCase().includes(kw));
        },
        confidence: 0.85
      },
      {
        name: 'P2-plus-button',
        test: (el) => {
          return (el.tagName === 'BUTTON' || el.role === 'button') &&
            (el.textContent || '').trim() === '+' &&
            el.classChain.some(classes => classes.some(c => /chat/i.test(c)));
        },
        confidence: 0.65
      }
    ]
  },

  confirmDialog: {
    name: '确认弹窗',
    strategies: [
      {
        name: 'P0-testid',
        test: (el) => el.dataTestId && /confirm|dialog|popover|modal/i.test(el.dataTestId),
        confidence: 0.99
      },
      {
        name: 'P1-confirm-class',
        test: (el) => {
          return el.classChain.some(classes =>
            classes.some(c => /confirm|dialog|popover|modal|overlay/i.test(c))
          );
        },
        confidence: 0.80
      },
      {
        name: 'P2-fixed-overlay',
        test: (el) => {
          const style = el.inlineStyle || '';
          return /position:\s*fixed/i.test(style) && el.rect.width > 200;
        },
        confidence: 0.50
      }
    ]
  }
};

// ========== DOM 探测脚本（注入到浏览器执行） ==========
const PROBE_SCRIPT = `
(() => {
  const elements = document.querySelectorAll(
    'input, textarea, [contenteditable], button, [role="button"], ' +
    '[role="textbox"], [aria-label], [data-testid], a, select, [role="dialog"], [role="listbox"]'
  );

  const fingerprints = [];

  for (const el of elements) {
    const rect = el.getBoundingClientRect();
    const computedStyle = window.getComputedStyle(el);

    // 获取类链（向上 3 级）
    const classChain = [];
    let current = el;
    for (let i = 0; i < 3 && current; i++) {
      if (current.className && typeof current.className === 'string') {
        const classes = current.className.split(/\\s+/).filter(c => c && !c.startsWith('__')).slice(0, 8);
        if (classes.length > 0) classChain.push(classes);
      }
      current = current.parentElement;
    }

    fingerprints.push({
      tagName: el.tagName,
      type: el.type || '',
      role: el.getAttribute('role') || '',
      dataTestId: el.getAttribute('data-testid') || '',
      ariaLabel: el.getAttribute('aria-label') || '',
      placeholder: el.placeholder || '',
      textContent: (el.textContent || '').trim().slice(0, 150),
      value: el.value || '',
      contentEditable: el.contentEditable || '',
      tabIndex: el.tabIndex,
      disabled: el.disabled || false,
      hidden: el.hidden || computedStyle.display === 'none' || computedStyle.visibility === 'hidden' || computedStyle.opacity === '0',
      rect: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      },
      classChain: classChain,
      inlineStyle: el.getAttribute('style') || ''
    });
  }

  // 获取 Trae 版本信息
  const versionEl = document.querySelector('[class*="titlebar"] [class*="version"], [class*="about"] span');
  const titleText = document.title || '';

  return JSON.stringify({
    fingerprints,
    meta: {
      title: titleText,
      url: window.location.href,
      viewport: { width: window.innerWidth, height: window.innerHeight }
    }
  });
})();
`;

// ========== 元素匹配引擎 ==========
function matchElements(fingerprints) {
  const results = {};

  for (const [elementKey, elementDef] of Object.entries(ELEMENT_STRATEGIES)) {
    let bestMatch = null;

    for (const strategy of elementDef.strategies) {
      for (const fp of fingerprints) {
        if (fp.hidden) continue;

        try {
          if (strategy.test(fp, fingerprints)) {
            if (!bestMatch || strategy.confidence > bestMatch.confidence) {
              bestMatch = {
                elementKey,
                elementName: elementDef.name,
                strategy: strategy.name,
                confidence: strategy.confidence,
                selector: buildSelector(fp, strategy),
                element: {
                  tagName: fp.tagName,
                  dataTestId: fp.dataTestId,
                  ariaLabel: fp.ariaLabel,
                  placeholder: fp.placeholder,
                  role: fp.role,
                  rect: fp.rect,
                  classChain: fp.classChain
                }
              };
            }
          }
        } catch (err) {
          // 策略测试出错，跳过
        }
      }

      // 找到高置信度匹配就停止
      if (bestMatch && bestMatch.confidence >= 0.90) break;
    }

    results[elementKey] = bestMatch;
  }

  return results;
}

// ========== 选择器生成 ==========
function buildSelector(fp, strategy) {
  // P0: data-testid 最优先
  if (fp.dataTestId) {
    return `[data-testid="${fp.dataTestId}"]`;
  }

  // P1: role + 属性
  if (fp.role) {
    let sel = `[role="${fp.role}"]`;
    if (fp.contentEditable === 'true') sel += '[contenteditable="true"]';
    return sel;
  }

  // P2: placeholder
  if (fp.placeholder) {
    return `[placeholder="${fp.placeholder}"]`;
  }

  // P3: aria-label
  if (fp.ariaLabel) {
    return `[aria-label="${fp.ariaLabel}"]`;
  }

  // P4: class chain
  if (fp.classChain.length > 0 && fp.classChain[0].length > 0) {
    const classes = fp.classChain[0].slice(0, 3).map(c => `.${c}`).join('');
    return `${fp.tagName.toLowerCase()}${classes}`;
  }

  // P5: tag + position
  return `${fp.tagName.toLowerCase()}[style*="position"]`;
}

// ========== 选择器验证 ==========
async function validateSelectors(client, selectors) {
  const { Runtime } = client;
  const validated = {};

  for (const [key, info] of Object.entries(selectors)) {
    if (!info) {
      validated[key] = null;
      continue;
    }

    try {
      // 转义选择器中的特殊字符
      const escapedSelector = info.selector.replace(/"/g, '\\"');
      const { result } = await Runtime.evaluate({
        expression: `document.querySelector('${escapedSelector}') !== null`,
        returnByValue: true
      });

      validated[key] = {
        ...info,
        valid: result.value === true,
        stale: result.value !== true
      };
    } catch (err) {
      validated[key] = { ...info, valid: false, stale: true, error: err.message };
    }
  }

  return validated;
}

// ========== 缓存管理 ==========
function loadCache(port) {
  const cachePath = path.join(CACHE_DIR, `ui-fingerprint-${port}.json`);
  try {
    if (fs.existsSync(cachePath)) {
      return JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
    }
  } catch {}
  return null;
}

function saveCache(port, data) {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
  const cachePath = path.join(CACHE_DIR, `ui-fingerprint-${port}.json`);
  fs.writeFileSync(cachePath, JSON.stringify(data, null, 2));
}

// ========== 格式化输出 ==========
function formatResults(selectors, fingerprints, duration) {
  const lines = [];
  lines.push('');
  lines.push('═'.repeat(70));
  lines.push('  CDP UI 探测结果');
  lines.push('═'.repeat(70));
  lines.push(`  探测耗时: ${duration}ms`);
  lines.push(`  扫描元素: ${fingerprints.length} 个`);
  lines.push('');

  // 统计
  const matched = Object.values(selectors).filter(s => s && s.valid).length;
  const total = Object.keys(selectors).length;
  const failed = Object.values(selectors).filter(s => !s).length;
  const stale = Object.values(selectors).filter(s => s && s.stale).length;

  lines.push('─'.repeat(70));
  lines.push(`  匹配结果: ${matched}/${total} 成功, ${failed} 未找到, ${stale} 已失效`);
  lines.push('─'.repeat(70));
  lines.push('');

  for (const [key, info] of Object.entries(selectors)) {
    const elementDef = ELEMENT_STRATEGIES[key];
    lines.push(`  【${elementDef.name}】`);

    if (!info) {
      lines.push(`    状态: ❌ 未找到`);
      lines.push(`    建议: 检查 Trae IDE 是否已启动并打开工作区`);
      lines.push('');
      continue;
    }

    const statusIcon = info.valid ? '✅' : '⚠️';
    const staleTag = info.stale ? ' (已失效)' : '';
    lines.push(`    状态: ${statusIcon} ${info.strategy}${staleTag}`);
    lines.push(`    置信度: ${(info.confidence * 100).toFixed(0)}%`);
    lines.push(`    选择器: ${info.selector}`);

    if (info.element) {
      const e = info.element;
      if (e.dataTestId) lines.push(`    data-testid: ${e.dataTestId}`);
      if (e.ariaLabel) lines.push(`    aria-label: ${e.ariaLabel}`);
      if (e.placeholder) lines.push(`    placeholder: ${e.placeholder}`);
      if (e.role) lines.push(`    role: ${e.role}`);
      lines.push(`    位置: (${e.rect.x}, ${e.rect.y}) ${e.rect.width}x${e.rect.height}`);
    }

    lines.push('');
  }

  // 生成配置片段
  lines.push('─'.repeat(70));
  lines.push('  📋 可直接复制到 team.yaml 的选择器覆盖配置:');
  lines.push('─'.repeat(70));
  lines.push('');
  lines.push('  ui_recognizer:');
  lines.push('    overrides:');

  for (const [key, info] of Object.entries(selectors)) {
    if (info && info.valid) {
      const yamlKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      lines.push(`      ${yamlKey}: "${info.selector.replace(/"/g, '\\"')}"`);
    }
  }

  lines.push('');
  lines.push('═'.repeat(70));

  return lines.join('\n');
}

// ========== 主流程 ==========
async function main() {
  const { port, saveCache, verbose } = parseArgs();

  console.log('');
  console.log('🔍 CDP UI 探测测试');
  console.log(`   目标端口: ${port}`);
  console.log('');

  let client;

  try {
    // Step 1: 连接 CDP
    console.log(`📡 正在连接 CDP (localhost:${port})...`);
    client = await CDP({ port });
    console.log('   ✅ CDP 连接成功');

    // Step 2: 获取所有 Target，找到 workbench 页面
    const { Target } = client;
    await Target.setDiscoverTargets({ discover: true });

    // 等待 Target 列表
    await new Promise(resolve => setTimeout(resolve, 1000));

    const { targetInfos } = await Target.getTargets();
    const workbenchTargets = targetInfos.filter(t =>
      t.type === 'page' &&
      (t.url.includes('workbench') || t.url.includes('electron') || t.url === 'about:blank')
    );

    if (workbenchTargets.length === 0) {
      console.log('');
      console.log('⚠️  未找到 workbench 页面，尝试使用第一个 page target...');
      console.log(`   可用 targets: ${targetInfos.map(t => t.url.slice(0, 60)).join('\n   ')}`);
    }

    // 选择目标
    const target = workbenchTargets[0] || targetInfos.find(t => t.type === 'page');
    if (!target) {
      throw new Error('没有找到可用的 page target');
    }

    console.log(`   📄 目标页面: ${target.url.slice(0, 80)}`);

    // Step 3: 连接到目标页面
    await CDP.close(client);
    client = await CDP({ port, target });

    const { Runtime, DOM } = client;
    await Runtime.enable();
    await DOM.enable();

    // Step 4: 执行 DOM 探测
    console.log('   🔎 正在扫描 DOM 元素...');
    const startTime = Date.now();

    const { result } = await Runtime.evaluate({
      expression: PROBE_SCRIPT,
      returnByValue: true,
      awaitPromise: false
    });

    const probeData = JSON.parse(result.value);
    const fingerprints = probeData.fingerprints;
    const meta = probeData.meta;

    console.log(`   📊 扫描到 ${fingerprints.length} 个可交互元素 (${Date.now() - startTime}ms)`);

    if (verbose) {
      console.log('');
      console.log('   页面信息:', JSON.stringify(meta, null, 2));
      console.log('');
      console.log('   元素列表 (前 20 个):');
      fingerprints.slice(0, 20).forEach((fp, i) => {
        console.log(`   [${i}] ${fp.tagName} role=${fp.role} testid=${fp.dataTestId || '-'} ` +
          `aria=${fp.ariaLabel || '-'} ce=${fp.contentEditable} ` +
          `pos=(${fp.rect.x},${fp.rect.y}) size=${fp.rect.width}x${fp.rect.height}`);
      });
      if (fingerprints.length > 20) {
        console.log(`   ... 还有 ${fingerprints.length - 20} 个元素`);
      }
      console.log('');
    }

    // Step 5: 多策略匹配
    console.log('   🎯 正在匹配关键 UI 元素...');
    const selectors = matchElements(fingerprints);

    // Step 6: 验证选择器
    console.log('   ✅ 正在验证选择器...');
    const validated = await validateSelectors(client, selectors);

    const duration = Date.now() - startTime;

    // Step 7: 输出结果
    console.log(formatResults(validated, fingerprints, duration));

    // Step 8: 保存缓存
    if (saveCache) {
      const cacheData = {
        port,
        probedAt: new Date().toISOString(),
        probeDuration: duration,
        meta,
        elementCount: fingerprints.length,
        selectors: validated
      };
      saveCache(port, cacheData);
      const cachePath = path.join(CACHE_DIR, `ui-fingerprint-${port}.json`);
      console.log(`💾 探测结果已保存到: ${cachePath}`);
    }

    // Step 9: 生成匹配进度报告
    console.log('');
    console.log('─'.repeat(70));
    console.log('  📈 UI 匹配进度报告');
    console.log('─'.repeat(70));

    const progressItems = Object.entries(ELEMENT_STRATEGIES).map(([key, def]) => {
      const result = validated[key];
      let status, detail;
      if (!result) {
        status = '❌ 未匹配';
        detail = '所有策略均失败';
      } else if (result.valid) {
        status = '✅ 已匹配';
        detail = `${result.strategy} (${(result.confidence * 100).toFixed(0)}%)`;
      } else {
        status = '⚠️ 已失效';
        detail = `${result.strategy} - 选择器无法定位元素`;
      }
      return { name: def.name, status, detail };
    });

    const maxNameLen = Math.max(...progressItems.map(i => i.name.length));
    for (const item of progressItems) {
      const namePad = item.name.padEnd(maxNameLen + 2);
      console.log(`  ${namePad} ${item.status}  ${item.detail}`);
    }

    const successRate = (matched / total * 100).toFixed(0);
    console.log('');
    console.log(`  总体匹配率: ${successRate}%`);
    console.log('');

    if (parseInt(successRate) >= 80) {
      console.log('  🎉 UI 匹配良好，系统可以正常工作');
    } else if (parseInt(successRate) >= 50) {
      console.log('  ⚠️  部分元素未匹配，建议手动配置选择器覆盖');
    } else {
      console.log('  ❌ UI 匹配率过低，请确认 Trae IDE 版本是否受支持');
    }

  } catch (err) {
    console.error('');
    console.error('❌ 探测失败:', err.message);
    console.error('');
    console.error('排查建议:');
    console.error('  1. 确认 Trae IDE 已启动');
    console.error('  2. 确认使用了 --remote-debugging-port 参数');
    console.error(`     例: Trae.exe --remote-debugging-port=${port}`);
    console.error('  3. 确认端口没有被其他程序占用');
    console.error('  4. 尝试指定不同端口: node test-cdp-ui-probe.js --port 9223');
    process.exit(1);
  } finally {
    if (client) {
      try { await CDP.close(client); } catch {}
    }
  }
}

main();
