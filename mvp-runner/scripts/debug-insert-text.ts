// 调试 Input.insertText
import { CDPClient } from '../src/cdp/client.js';
import { loadConfig } from '../src/config.js';

async function main() {
  const cfg = loadConfig();
  const cdp = new CDPClient(cfg.cdp.host, cfg.cdp.port);
  await cdp.connect();

  console.log('=== 调试 Input.insertText ===\n');

  const INPUT_SELECTOR = '.chat-input-v2-input-box-editable';

  // 检查 Input 是否可用
  console.log('1. 检查 CDP Input:', typeof cdp.Input, cdp.Input ? 'available' : 'not available');

  // 聚焦
  console.log('2. 聚焦输入框');
  await cdp.evaluate(`
    const el = document.querySelector('${INPUT_SELECTOR}');
    if (el) { el.focus(); el.click(); }
  `);
  await new Promise(r => setTimeout(r, 300));

  // 使用 insertText
  console.log('3. 使用 Input.insertText');
  try {
    await cdp.Input.insertText({ text: '几点了' });
    console.log('insertText 调用成功');
  } catch (err) {
    console.log('insertText 调用失败:', (err as Error).message);
  }

  await new Promise(r => setTimeout(r, 1000));

  // 验证
  console.log('4. 验证结果');
  const result = await cdp.evaluate(`
    const el = document.querySelector('${INPUT_SELECTOR}');
    return {
      found: !!el,
      innerText: el?.innerText?.slice(0, 50),
      textContent: el?.textContent?.slice(0, 50),
      isContentEditable: el?.isContentEditable
    };
  `);
  console.log('结果:', result);

  await cdp.disconnect();
}

main().catch(console.error);
