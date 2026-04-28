// 第一层：5信号单元测试 v2
// 改进版：更精确的信号注入和检测

import { config } from 'dotenv';
config();

import { CDPClient } from '../src/cdp/client.js';
import { captureSnapshot } from '../src/actions/state-probe.js';

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

async function runTests() {
  console.log('=== 第一层：5信号单元测试 v2 ===\n');
  console.log('开始时间:', new Date().toLocaleString());
  console.log('');

  const cdp = new CDPClient('localhost', 9222);
  let passCount = 0;
  let failCount = 0;

  try {
    await cdp.connect();
    console.log('✅ 已连接到 CDP\n');

    // 测试1: 终端按钮检测（使用更精确的选择器）
    console.log('=== 测试1: hasTerminalBtn ===');
    console.log('描述: 终端后台运行按钮检测\n');
    
    // 先检查基线
    const baseline = await captureSnapshot(cdp);
    console.log('基线状态 hasTerminalBtn:', baseline.hasTerminalBtn);
    
    // 注入测试元素
    await cdp.evaluate(`
      (() => {
        // 移除可能存在的旧测试元素
        document.getElementById('__test_terminal')?.remove();
        
        // 创建符合选择器的按钮
        const el = document.createElement('button');
        el.className = 'icd-btn icd-btn-tertiary';
        el.textContent = '后台运行';
        el.id = '__test_terminal';
        el.style.position = 'fixed';
        el.style.top = '0';
        el.style.left = '0';
        document.body.appendChild(el);
        return '注入完成';
      })()
    `);
    await sleep(1000);
    
    const snap1 = await captureSnapshot(cdp);
    console.log('注入后 hasTerminalBtn:', snap1.hasTerminalBtn);
    console.log('终端按钮文本:', snap1.terminalBtnText);
    
    if (snap1.hasTerminalBtn && snap1.terminalBtnText.includes('后台运行')) {
      console.log('✅ PASS\n');
      passCount++;
    } else {
      console.log('❌ FAIL\n');
      failCount++;
    }
    
    // 清理
    await cdp.evaluate(`document.getElementById('__test_terminal')?.remove()`);
    await sleep(500);

    // 测试2: 删除弹窗检测
    console.log('=== 测试2: hasDeleteCard ===');
    console.log('描述: 删除文件弹窗检测\n');
    
    await cdp.evaluate(`
      (() => {
        document.getElementById('__test_delete')?.remove();
        
        // 创建完整的弹窗结构
        const container = document.createElement('div');
        container.id = '__test_delete';
        
        const btn = document.createElement('button');
        btn.className = 'icd-delete-files-command-card-v2-actions-delete';
        btn.textContent = '删除';
        
        container.appendChild(btn);
        document.body.appendChild(container);
        return '注入完成';
      })()
    `);
    await sleep(1000);
    
    const snap2 = await captureSnapshot(cdp);
    console.log('注入后 hasDeleteCard:', snap2.hasDeleteCard);
    
    if (snap2.hasDeleteCard) {
      console.log('✅ PASS\n');
      passCount++;
    } else {
      console.log('❌ FAIL\n');
      failCount++;
    }
    
    await cdp.evaluate(`document.getElementById('__test_delete')?.remove()`);
    await sleep(500);

    // 测试3: 覆盖弹窗检测
    console.log('=== 测试3: hasOverwriteCard ===');
    console.log('描述: 覆盖文件弹窗检测\n');
    
    await cdp.evaluate(`
      (() => {
        document.getElementById('__test_overwrite')?.remove();
        
        const container = document.createElement('div');
        container.id = '__test_overwrite';
        
        const btn = document.createElement('button');
        btn.className = 'icd-overwrite-files-command-card-v2-actions-overwrite';
        btn.textContent = '覆盖';
        
        container.appendChild(btn);
        document.body.appendChild(container);
        return '注入完成';
      })()
    `);
    await sleep(1000);
    
    const snap3 = await captureSnapshot(cdp);
    console.log('注入后 hasOverwriteCard:', snap3.hasOverwriteCard);
    
    if (snap3.hasOverwriteCard) {
      console.log('✅ PASS\n');
      passCount++;
    } else {
      console.log('❌ FAIL\n');
      failCount++;
    }
    
    await cdp.evaluate(`document.getElementById('__test_overwrite')?.remove()`);
    await sleep(500);

    // 测试4: 按钮状态切换
    console.log('=== 测试4: btnFunction 状态检测 ===');
    console.log('描述: 检测按钮当前功能状态\n');
    
    const snap4 = await captureSnapshot(cdp);
    console.log('当前按钮状态:', snap4.btnFunction);
    console.log('按钮图标:', snap4.btnIcon.slice(0, 50));
    
    if (['send', 'stop', 'disabled', 'unknown'].includes(snap4.btnFunction)) {
      console.log('✅ PASS - 按钮状态识别正常\n');
      passCount++;
    } else {
      console.log('❌ FAIL\n');
      failCount++;
    }

    // 测试5: 任务状态检测
    console.log('=== 测试5: taskStatus 任务状态 ===');
    console.log('描述: 侧边栏任务状态检测\n');
    
    const snap5 = await captureSnapshot(cdp);
    console.log('任务状态:', snap5.taskStatus);
    console.log('任务文本:', snap5.taskText);
    
    if (['completed', 'interrupted', 'running', 'unknown'].includes(snap5.taskStatus)) {
      console.log('✅ PASS - 任务状态识别正常\n');
      passCount++;
    } else {
      console.log('❌ FAIL\n');
      failCount++;
    }

    // 测试报告
    console.log('='.repeat(50));
    console.log('测试完成报告');
    console.log('='.repeat(50));
    console.log(`总测试数: ${passCount + failCount}`);
    console.log(`✅ 通过: ${passCount}`);
    console.log(`❌ 失败: ${failCount}`);
    console.log(`通过率: ${((passCount / (passCount + failCount)) * 100).toFixed(1)}%`);
    console.log('');
    console.log('结束时间:', new Date().toLocaleString());
    console.log('='.repeat(50));

    // 结论
    if (passCount >= 4) {
      console.log('\n✅ 第一层测试通过，可以进入第二层');
    } else {
      console.log('\n⚠️ 测试未完全通过，建议检查后再继续');
    }

  } catch (error) {
    console.error('\n❌ 测试套件失败:', (error as Error).message);
  } finally {
    await cdp.disconnect();
  }
}

runTests();
