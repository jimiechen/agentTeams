// 第一层：5信号单元测试
// 自动化测试探针对5个信号的识别精度

import { config } from 'dotenv';
config();

import { CDPClient } from '../src/cdp/client.js';
import { captureSnapshot } from '../src/actions/state-probe.js';

interface TestCase {
  name: string;
  inject: string;
  cleanup: string;
  expect: (snap: any) => boolean;
  description: string;
}

const testCases: TestCase[] = [
  {
    name: 'hasTerminalBtn',
    description: '终端后台运行按钮检测',
    inject: `
      const el = document.createElement('button');
      el.className = 'icd-btn icd-btn-tertiary';
      el.textContent = '后台运行';
      el.id = '__test_terminal_btn';
      document.body.appendChild(el);
    `,
    cleanup: `document.getElementById('__test_terminal_btn')?.remove();`,
    expect: (s: any) => s.hasTerminalBtn === true,
  },
  {
    name: 'hasDeleteCard',
    description: '删除文件弹窗检测',
    inject: `
      const el = document.createElement('button');
      el.className = 'icd-delete-files-command-card-v2-actions-delete';
      el.id = '__test_delete_card';
      document.body.appendChild(el);
    `,
    cleanup: `document.getElementById('__test_delete_card')?.remove();`,
    expect: (s: any) => s.hasDeleteCard === true,
  },
  {
    name: 'hasOverwriteCard',
    description: '覆盖文件弹窗检测',
    inject: `
      const el = document.createElement('button');
      el.className = 'icd-overwrite-files-command-card-v2-actions-overwrite';
      el.id = '__test_overwrite_card';
      document.body.appendChild(el);
    `,
    cleanup: `document.getElementById('__test_overwrite_card')?.remove();`,
    expect: (s: any) => s.hasOverwriteCard === true,
  },
];

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

async function runTests() {
  console.log('=== 第一层：5信号单元测试 ===\n');
  console.log('开始时间:', new Date().toLocaleString());
  console.log('');

  const cdp = new CDPClient('localhost', 9222);
  let passCount = 0;
  let failCount = 0;

  try {
    await cdp.connect();
    console.log('✅ 已连接到 CDP\n');

    // 先采集基线状态
    console.log('--- 基线状态采集 ---');
    const baseline = await captureSnapshot(cdp);
    console.log('基线状态:', {
      btnFunction: baseline.btnFunction,
      hasTerminalBtn: baseline.hasTerminalBtn,
      hasDeleteCard: baseline.hasDeleteCard,
      hasOverwriteCard: baseline.hasOverwriteCard,
    });
    console.log('');

    // 执行每个测试用例
    for (const testCase of testCases) {
      console.log(`\n=== 测试: ${testCase.name} ===`);
      console.log(`描述: ${testCase.description}`);
      
      try {
        // 注入信号
        console.log('  → 注入信号...');
        await cdp.evaluate(testCase.inject);
        await sleep(500);
        
        // 采集快照
        const snap = await captureSnapshot(cdp);
        const passed = testCase.expect(snap);
        
        if (passed) {
          console.log('  ✅ PASS - 信号识别正确');
          passCount++;
        } else {
          console.log('  ❌ FAIL - 信号识别错误');
          console.log('  实际值:', {
            hasTerminalBtn: snap.hasTerminalBtn,
            hasDeleteCard: snap.hasDeleteCard,
            hasOverwriteCard: snap.hasOverwriteCard,
          });
          failCount++;
        }
        
        // 清理
        console.log('  → 清理信号...');
        await cdp.evaluate(testCase.cleanup);
        await sleep(500);
        
        // 验证清理
        const snapAfter = await captureSnapshot(cdp);
        const cleaned = !testCase.expect(snapAfter);
        console.log(cleaned ? '  ✅ 清理成功' : '  ⚠️ 清理后信号仍存在');
        
      } catch (err) {
        console.log(`  ❌ ERROR: ${(err as Error).message}`);
        failCount++;
        
        // 出错时也尝试清理
        try {
          await cdp.evaluate(testCase.cleanup);
        } catch {}
      }
    }

    // 测试 btnFunction 三态
    console.log('\n=== 测试: btnFunction 三态切换 ===');
    console.log('描述: 按钮状态（send/stop/disabled）检测');
    
    const btnTests = [
      {
        name: 'disabled 态',
        action: `document.querySelector('.chat-input-v2-send-button').disabled = true;`,
        cleanup: `document.querySelector('.chat-input-v2-send-button').disabled = false;`,
        expect: (s: any) => s.btnFunction === 'disabled',
      },
    ];
    
    for (const btnTest of btnTests) {
      console.log(`\n  → 测试 ${btnTest.name}`);
      try {
        await cdp.evaluate(btnTest.action);
        await sleep(500);
        const snap = await captureSnapshot(cdp);
        
        if (btnTest.expect(snap)) {
          console.log('    ✅ PASS');
          passCount++;
        } else {
          console.log('    ❌ FAIL - 实际状态:', snap.btnFunction);
          failCount++;
        }
        
        await cdp.evaluate(btnTest.cleanup);
        await sleep(500);
      } catch (err) {
        console.log(`    ❌ ERROR: ${(err as Error).message}`);
        failCount++;
      }
    }

    // 测试报告
    console.log('\n' + '='.repeat(50));
    console.log('测试完成报告');
    console.log('='.repeat(50));
    console.log(`总测试数: ${passCount + failCount}`);
    console.log(`✅ 通过: ${passCount}`);
    console.log(`❌ 失败: ${failCount}`);
    console.log(`通过率: ${((passCount / (passCount + failCount)) * 100).toFixed(1)}%`);
    console.log('');
    console.log('结束时间:', new Date().toLocaleString());
    console.log('='.repeat(50));

  } catch (error) {
    console.error('\n❌ 测试套件失败:', (error as Error).message);
  } finally {
    await cdp.disconnect();
  }
}

runTests();
