// 测试5信号采集功能
import { config } from 'dotenv';
config();

import { CDPClient } from '../src/cdp/client.js';
import { captureSnapshot, isModelStalled, isTaskCompleted, detectBlocking } from '../src/actions/state-probe.js';

const TEST_DURATION = 30000; // 测试30秒
const POLL_INTERVAL = 2000;  // 每2秒采集一次

async function testStateProbe() {
  console.log('=== 5信号采集测试 ===\n');

  const cdp = new CDPClient('localhost', 9222);
  const snapshots: any[] = [];

  try {
    await cdp.connect();
    console.log('✅ 已连接到 CDP\n');

    const startTime = Date.now();
    let checkCount = 0;

    while (Date.now() - startTime < TEST_DURATION) {
      checkCount++;
      console.log(`\n--- 采集 #${checkCount} ---`);

      const snap = await captureSnapshot(cdp);
      snapshots.push(snap);

      // 显示采集的信号
      console.log('按钮状态:', {
        function: snap.btnFunction,
        icon: snap.btnIcon.slice(0, 50),
        disabled: snap.btnDisabled,
      });

      console.log('最后消息:', {
        length: snap.lastTurnTextLen,
        preview: snap.lastTurnText.slice(0, 50) + '...',
      });

      console.log('终端按钮:', {
        hasButton: snap.hasTerminalBtn,
        text: snap.terminalBtnText,
      });

      console.log('弹窗状态:', {
        deleteCard: snap.hasDeleteCard,
        overwriteCard: snap.hasOverwriteCard,
      });

      console.log('任务状态:', {
        status: snap.taskStatus,
        text: snap.taskText,
      });

      // 检测阻塞
      const blocking = detectBlocking(snapshots);
      if (blocking.type !== 'none') {
        console.log('⚠️ 检测到阻塞:', blocking);
      }

      // 检测任务完成
      if (isTaskCompleted(snapshots)) {
        console.log('✅ 任务已完成');
        break;
      }

      // 检测模型停滞（需要至少5个样本）
      if (snapshots.length >= 5) {
        const stalled = isModelStalled(snapshots, 5000); // 5秒测试阈值
        if (stalled) {
          console.log('⚠️ 检测到模型停滞');
        }
      }

      await new Promise(r => setTimeout(r, POLL_INTERVAL));
    }

    console.log('\n=== 测试完成 ===');
    console.log(`共采集 ${snapshots.length} 个快照`);

  } catch (error) {
    console.error('❌ 测试失败:', (error as Error).message);
  } finally {
    await cdp.disconnect();
  }
}

testStateProbe();
