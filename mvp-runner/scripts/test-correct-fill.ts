// 测试正确的 fill-prompt + submit 方案
import { CDPClient } from '../src/cdp/client.js';
import { loadConfig } from '../src/config.js';
import { fillPrompt } from '../src/actions/fill-prompt.js';
import { submit } from '../src/actions/submit.js';

async function main() {
  const cfg = loadConfig();
  const cdp = new CDPClient(cfg.cdp.host, cfg.cdp.port);
  await cdp.connect();

  console.log('=== 测试正确的 fill + submit 方案 ===\n');

  try {
    // 测试 fill
    console.log('1. 测试 fillPrompt...');
    await fillPrompt(cdp, '几点了');
    console.log('✅ fillPrompt 成功');

    // 等待一下
    await new Promise(r => setTimeout(r, 1000));

    // 测试 submit
    console.log('2. 测试 submit...');
    await submit(cdp);
    console.log('✅ submit 成功');

    console.log('\n✅ 全部测试通过！');
  } catch (err) {
    console.log('❌ 测试失败:', (err as Error).message);
  }

  await cdp.disconnect();
}

main().catch(console.error);
