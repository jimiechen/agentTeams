// 测试新版 fill-prompt（技术经理方案）
import { CDPClient } from '../src/cdp/client.js';
import { loadConfig } from '../src/config.js';
import { fillPrompt } from '../src/actions/fill-prompt.js';

async function main() {
  const cfg = loadConfig();
  const cdp = new CDPClient(cfg.cdp.host, cfg.cdp.port);
  await cdp.connect();

  console.log('=== 测试新版 fill-prompt ===\n');

  try {
    await fillPrompt(cdp, '几点了');
    console.log('✅ fill-prompt 成功');
  } catch (err) {
    console.log('❌ fill-prompt 失败:', (err as Error).message);
  }

  // 验证结果
  const verify = await cdp.evaluate(`
    const el = document.querySelector('.chat-input-v2-input-box-editable');
    return {
      innerText: el?.innerText?.slice(0, 50),
      textContent: el?.textContent?.slice(0, 50)
    };
  `);
  console.log('验证结果:', verify);

  await cdp.disconnect();
}

main().catch(console.error);
