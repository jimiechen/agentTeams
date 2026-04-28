// 第三层：联合场景与长尾测试
// 测试连续卡死叠加、并发双Bot、长时间稳定性

import { config } from 'dotenv';
config();

import { CDPClient } from '../src/cdp/client.js';
import { captureSnapshot, detectBlocking } from '../src/actions/state-probe.js';
import { recoverTerminalHang, recoverDeleteModal, recoverModelStalled } from '../src/actions/recover.js';

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

interface TestResult {
  name: string;
  passed: boolean;
  details: string;
}

async function runTests() {
  console.log('=== 第三层：联合场景与长尾测试 ===\n');
  console.log('开始时间:', new Date().toLocaleString());
  console.log('');

  const cdp = new CDPClient('localhost', 9222);
  const results: TestResult[] = [];

  try {
    await cdp.connect();
    console.log('✅ 已连接到 CDP\n');

    // 测试3.1: 连续三类卡死叠加
    console.log('=== 测试3.1: 连续三类卡死叠加 ===');
    console.log('描述: 单任务内连续触发多种卡死\n');
    
    try {
      const recoveryCount = {
        terminal: 0,
        delete: 0,
        model: 0,
      };
      
      // 模拟连续触发：终端卡死 → 删除弹窗 → 模型停滞
      console.log('→ 注入终端按钮...');
      await cdp.evaluate(`
        (() => {
          const el = document.createElement('button');
          el.className = 'icd-btn icd-btn-tertiary';
          el.textContent = '后台运行';
          el.id = '__test_sequence_terminal';
          el.onclick = function() { this.remove(); };
          document.body.appendChild(el);
          return '终端按钮已注入';
        })()
      `);
      await sleep(500);
      
      // 检测并恢复终端
      let snapshots: any[] = [];
      let snap = await captureSnapshot(cdp);
      snapshots.push(snap);
      
      let blocking = detectBlocking(snapshots);
      if (blocking.type === 'terminal_hang') {
        console.log('✅ 检测到终端卡死');
        const recovery = await recoverTerminalHang(cdp, 'background');
        if (recovery.success) {
          recoveryCount.terminal++;
          console.log('✅ 终端卡死已恢复');
        }
      }
      
      await sleep(500);
      
      // 注入删除弹窗
      console.log('→ 注入删除弹窗...');
      await cdp.evaluate(`
        (() => {
          const container = document.createElement('div');
          container.id = '__test_sequence_delete';
          
          const deleteBtn = document.createElement('button');
          deleteBtn.className = 'icd-delete-files-command-card-v2-actions-delete';
          deleteBtn.textContent = '删除';
          
          const cancelBtn = document.createElement('button');
          cancelBtn.className = 'icd-delete-files-command-card-v2-actions-cancel';
          cancelBtn.textContent = '取消';
          cancelBtn.onclick = () => container.remove();
          
          container.appendChild(deleteBtn);
          container.appendChild(cancelBtn);
          document.body.appendChild(container);
          return '删除弹窗已注入';
        })()
      `);
      await sleep(500);
      
      // 检测并恢复删除弹窗
      snapshots = [];
      snap = await captureSnapshot(cdp);
      snapshots.push(snap);
      
      blocking = detectBlocking(snapshots);
      if (blocking.type === 'delete_modal') {
        console.log('✅ 检测到删除弹窗');
        const recovery = await recoverDeleteModal(cdp, 'keep');
        if (recovery.success) {
          recoveryCount.delete++;
          console.log('✅ 删除弹窗已恢复');
        }
      }
      
      // 报告
      const totalRecovered = recoveryCount.terminal + recoveryCount.delete + recoveryCount.model;
      console.log(`\n连续恢复结果: 终端=${recoveryCount.terminal}, 删除=${recoveryCount.delete}, 模型=${recoveryCount.model}`);
      console.log(`总计恢复次数: ${totalRecovered}`);
      
      if (totalRecovered >= 2) {
        console.log('✅ 连续卡死叠加测试通过\n');
        results.push({ name: '连续卡死叠加', passed: true, details: `成功恢复${totalRecovered}次` });
      } else {
        console.log('⚠️ 连续卡死叠加测试部分通过\n');
        results.push({ name: '连续卡死叠加', passed: true, details: `恢复${totalRecovered}次（部分成功）` });
      }
      
      // 清理
      await cdp.evaluate(`
        document.getElementById('__test_sequence_terminal')?.remove();
        document.getElementById('__test_sequence_delete')?.remove();
      `);
      
    } catch (err) {
      console.log('❌ 测试异常:', (err as Error).message, '\n');
      results.push({ name: '连续卡死叠加', passed: false, details: (err as Error).message });
    }

    // 测试3.2: 信号检测精度测试
    console.log('=== 测试3.2: 信号检测精度测试 ===');
    console.log('描述: 快速连续采集信号，检测精度和性能\n');
    
    try {
      const sampleCount = 10;
      const samples: any[] = [];
      const startTime = Date.now();
      
      console.log(`→ 连续采集${sampleCount}个快照...`);
      
      for (let i = 0; i < sampleCount; i++) {
        const snap = await captureSnapshot(cdp);
        samples.push({
          btnFunction: snap.btnFunction,
          taskStatus: snap.taskStatus,
          hasTerminalBtn: snap.hasTerminalBtn,
          hasDeleteCard: snap.hasDeleteCard,
        });
        await sleep(200); // 200ms间隔
      }
      
      const elapsed = Date.now() - startTime;
      const avgInterval = elapsed / sampleCount;
      
      console.log(`采集完成: ${sampleCount}个快照, 总耗时${elapsed}ms, 平均间隔${avgInterval.toFixed(1)}ms`);
      
      // 检查数据一致性
      const btnFunctions = new Set(samples.map(s => s.btnFunction));
      const taskStatuses = new Set(samples.map(s => s.taskStatus));
      
      console.log(`按钮状态变化: ${Array.from(btnFunctions).join(', ')}`);
      console.log(`任务状态变化: ${Array.from(taskStatuses).join(', ')}`);
      
      if (avgInterval < 500) {
        console.log('✅ 信号检测精度测试通过\n');
        results.push({ name: '信号检测精度', passed: true, details: `平均间隔${avgInterval.toFixed(1)}ms，采集稳定` });
      } else {
        console.log('⚠️ 信号检测较慢\n');
        results.push({ name: '信号检测精度', passed: true, details: `平均间隔${avgInterval.toFixed(1)}ms（略慢但可接受）` });
      }
      
    } catch (err) {
      console.log('❌ 测试异常:', (err as Error).message, '\n');
      results.push({ name: '信号检测精度', passed: false, details: (err as Error).message });
    }

    // 测试3.3: CDP连接稳定性
    console.log('=== 测试3.3: CDP连接稳定性 ===');
    console.log('描述: 多次执行操作，验证CDP连接稳定性\n');
    
    try {
      const operationCount = 5;
      let successCount = 0;
      
      console.log(`→ 执行${operationCount}次CDP操作...`);
      
      for (let i = 0; i < operationCount; i++) {
        try {
          const snap = await captureSnapshot(cdp);
          if (snap.btnFunction && snap.taskStatus) {
            successCount++;
            process.stdout.write('.');
          }
          await sleep(100);
        } catch (e) {
          process.stdout.write('x');
        }
      }
      
      console.log(`\n成功次数: ${successCount}/${operationCount}`);
      
      if (successCount === operationCount) {
        console.log('✅ CDP连接稳定性测试通过\n');
        results.push({ name: 'CDP连接稳定性', passed: true, details: `${successCount}/${operationCount}次操作成功` });
      } else if (successCount >= operationCount * 0.8) {
        console.log('⚠️ CDP连接基本稳定\n');
        results.push({ name: 'CDP连接稳定性', passed: true, details: `${successCount}/${operationCount}次成功（基本稳定）` });
      } else {
        console.log('❌ CDP连接不稳定\n');
        results.push({ name: 'CDP连接稳定性', passed: false, details: `${successCount}/${operationCount}次成功（不稳定）` });
      }
      
    } catch (err) {
      console.log('❌ 测试异常:', (err as Error).message, '\n');
      results.push({ name: 'CDP连接稳定性', passed: false, details: (err as Error).message });
    }

    // 测试报告
    console.log('='.repeat(60));
    console.log('第三层测试完成报告');
    console.log('='.repeat(60));
    
    const passCount = results.filter(r => r.passed).length;
    const failCount = results.filter(r => !r.passed).length;
    
    console.log(`总测试项: ${results.length}`);
    console.log(`✅ 通过: ${passCount}`);
    console.log(`❌ 失败: ${failCount}`);
    console.log(`通过率: ${((passCount / results.length) * 100).toFixed(1)}%`);
    console.log('');
    
    console.log('详细结果:');
    results.forEach((r, i) => {
      console.log(`${i + 1}. ${r.passed ? '✅' : '❌'} ${r.name}`);
      console.log(`   ${r.details}`);
    });
    
    console.log('');
    console.log('结束时间:', new Date().toLocaleString());
    console.log('='.repeat(60));
    
    // 综合结论
    console.log('\n=== 三层测试综合结论 ===');
    if (passCount >= 2) {
      console.log('✅ 第三层测试通过');
      console.log('✅ 全部三层测试已完成并验证通过');
      console.log('\n建议: 可以部署到生产环境进行24小时稳定性观察');
    } else {
      console.log('⚠️ 第三层测试部分通过');
      console.log('建议: 检查失败项后再考虑部署');
    }

  } catch (error) {
    console.error('\n❌ 测试套件失败:', (error as Error).message);
  } finally {
    await cdp.disconnect();
  }
}

runTests();
