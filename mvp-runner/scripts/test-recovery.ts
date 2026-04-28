// 测试恢复功能
import { config } from 'dotenv';
config();

import { CDPClient } from '../src/cdp/client.js';
import { captureSnapshot } from '../src/actions/state-probe.js';
import { recoverTerminalHang, recoverModelStalled } from '../src/actions/recover.js';

async function testRecovery() {
  console.log('=== 恢复功能测试 ===\n');

  const cdp = new CDPClient('localhost', 9222);

  try {
    await cdp.connect();
    console.log('✅ 已连接到 CDP\n');

    // 采集当前状态
    console.log('--- 当前系统状态 ---');
    const snap = await captureSnapshot(cdp);
    console.log('按钮功能:', snap.btnFunction);
    console.log('终端按钮:', snap.hasTerminalBtn ? '有' : '无', snap.terminalBtnText);
    console.log('任务状态:', snap.taskStatus);

    // 测试1: 如果检测到终端按钮，尝试恢复
    if (snap.hasTerminalBtn) {
      console.log('\n--- 测试终端恢复 ---');
      console.log('尝试点击"后台运行"...');
      const result = await recoverTerminalHang(cdp, 'background');
      console.log('恢复结果:', result);
    }

    // 测试2: 如果检测到停止按钮，尝试恢复
    if (snap.btnFunction === 'stop') {
      console.log('\n--- 测试模型停滞恢复 ---');
      console.log('尝试点击停止按钮...');
      const result = await recoverModelStalled(cdp);
      console.log('恢复结果:', result);
    }

    // 再次采集状态
    console.log('\n--- 恢复后状态 ---');
    const snap2 = await captureSnapshot(cdp);
    console.log('按钮功能:', snap2.btnFunction);
    console.log('终端按钮:', snap2.hasTerminalBtn ? '有' : '无');
    console.log('任务状态:', snap2.taskStatus);

    console.log('\n✅ 测试完成');

  } catch (error) {
    console.error('❌ 测试失败:', (error as Error).message);
  } finally {
    await cdp.disconnect();
  }
}

testRecovery();
