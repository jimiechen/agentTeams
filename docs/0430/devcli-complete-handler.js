/**
 * DEVCLI 任务完整处理脚本
 * 功能：停止 → 检查 → 重试 → 多次状态检查
 * 使用：node devcli-complete-handler.js [任务类型] [检查间隔(秒)]
 * 示例：node devcli-complete-handler.js DEVCLI 300
 */

const { TraeCDP } = require('./core-scripts/trae-cdp');

/**
 * 主处理函数
 * @param {string} taskType - 任务类型（默认DEVCLI）
 * @param {number} finalCheckDelay - 最终检查延迟（秒，默认300秒=5分钟）
 */
async function handleDevcliComplete(taskType = 'DEVCLI', finalCheckDelay = 300) {
    console.log(`=== DEVCLI 完整处理流程（3次状态检查） ===\n`);
    console.log(`任务类型: ${taskType}`);
    console.log(`最终检查延迟: ${finalCheckDelay}秒\n`);

    const trae = new TraeCDP({ port: 9222 });
    const results = {
        startTime: new Date().toISOString(),
        checks: [],
        operations: []
    };

    try {
        // ==================== 初始化连接 ====================
        await trae.connect({ isCN: true });
        console.log('✅ 已连接到 Trae CN CDP\n');

        // ==================== 第1次状态检查（操作前）====================
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('【第1次状态检查 - 操作前】');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        
        const check1 = await checkTaskStatus(trae, taskType);
        results.checks.push({ step: 1, phase: 'before_operation', ...check1 });
        
        console.log(`任务状态: ${check1.status}`);
        console.log(`任务文本: ${check1.text}`);
        console.log(`是否卡住: ${check1.isStuck ? '是' : '否'}`);
        console.log(`"思考中": ${check1.hasThinking ? '是' : '否'}\n`);

        // 如果任务已完成，无需操作
        if (check1.status === 'completed') {
            console.log('✅ 任务已完成，无需操作\n');
            results.finalStatus = 'already_completed';
            return results;
        }

        // ==================== 步骤1：点击停止按钮 ====================
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('【步骤1：点击停止按钮】');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        
        const stopResult = await clickStopButton(trae);
        results.operations.push({ action: 'stop', ...stopResult });
        
        if (!stopResult.clicked) {
            console.log('❌ 未找到停止按钮\n');
            results.finalStatus = 'stop_button_not_found';
            return results;
        }
        
        console.log(`✅ 已点击停止按钮`);
        console.log(`按钮颜色: ${stopResult.backgroundColor}\n`);
        
        await sleep(2000);

        // ==================== 第2次状态检查（中断后）====================
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('【第2次状态检查 - 中断后】');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        
        const check2 = await checkTaskStatus(trae, taskType);
        results.checks.push({ step: 2, phase: 'after_interrupt', ...check2 });
        
        console.log(`任务状态: ${check2.status}`);
        console.log(`任务文本: ${check2.text}`);
        console.log(`是否中断: ${check2.status === 'interrupted' ? '✅ 是' : '❌ 否'}\n`);

        // 如果任务没有中断，可能不需要重试
        if (check2.status !== 'interrupted') {
            console.log(`ℹ️ 任务状态: ${check2.status}，无需重试\n`);
            results.finalStatus = 'no_retry_needed';
            return results;
        }

        // ==================== 步骤2：点击重试按钮 ====================
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('【步骤2：点击重试按钮】');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        
        const retryResult = await clickRetryButton(trae);
        results.operations.push({ action: 'retry', ...retryResult });
        
        if (!retryResult.clicked) {
            console.log('❌ 未找到重试按钮\n');
            results.finalStatus = 'retry_button_not_found';
            return results;
        }
        
        console.log(`✅ 已点击重试按钮`);
        console.log(`查找方式: ${retryResult.method}\n`);
        
        await sleep(3000);

        // ==================== 第3次状态检查（重试后立即）====================
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('【第3次状态检查 - 重试后立即】');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        
        const check3 = await checkTaskStatus(trae, taskType);
        results.checks.push({ step: 3, phase: 'after_retry', ...check3 });
        
        console.log(`任务状态: ${check3.status}`);
        console.log(`任务文本: ${check3.text}\n`);

        if (check3.status === 'in_progress') {
            console.log('✅ 任务已成功重新开始执行\n');
        } else {
            console.log(`ℹ️ 任务状态: ${check3.status}\n`);
        }

        // ==================== 最终状态检查（延迟后）====================
        if (finalCheckDelay > 0) {
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log(`【最终状态检查 - ${finalCheckDelay}秒后】`);
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
            console.log(`等待 ${finalCheckDelay} 秒...\n`);
            
            await sleep(finalCheckDelay * 1000);
            
            const check4 = await checkTaskStatus(trae, taskType);
            results.checks.push({ step: 4, phase: 'final_check', ...check4 });
            
            console.log(`任务状态: ${check4.status}`);
            console.log(`任务文本: ${check4.text}\n`);
            
            if (check4.status === 'completed') {
                console.log('✅ 任务最终已完成！\n');
                results.finalStatus = 'completed';
            } else if (check4.status === 'in_progress') {
                console.log('⏳ 任务仍在执行中\n');
                results.finalStatus = 'still_running';
            } else {
                console.log(`ℹ️ 任务状态: ${check4.status}\n`);
                results.finalStatus = check4.status;
            }
        }

        await trae.disconnect();
        
        results.endTime = new Date().toISOString();
        return results;

    } catch (error) {
        console.error('❌ 错误:', error.message);
        results.error = error.message;
        throw error;
    } finally {
        await trae.disconnect().catch(() => {});
    }
}

// ==================== 辅助函数 ====================

/**
 * 检查任务状态
 */
async function checkTaskStatus(trae, taskType) {
    return await trae.evaluate(`((taskType) => {
        // 查找任务
        const items = document.querySelectorAll('.index-module__task-item___zOpfg');
        for (const item of items) {
            const text = item.textContent || '';
            if (text.includes(taskType)) {
                let status = 'unknown';
                if (text.includes('完成')) status = 'completed';
                else if (text.includes('进行中')) status = 'in_progress';
                else if (text.includes('中断')) status = 'interrupted';
                else if (text.includes('等待')) status = 'waiting';
                
                // 检查是否有"思考中"
                const hasThinking = document.body.textContent.includes('思考中') ||
                                   document.body.textContent.includes('Thinking');
                
                // 检查是否卡住（有后台运行/取消按钮）
                let hasBackgroundBtn = false;
                let hasCancelBtn = false;
                document.querySelectorAll('button').forEach(btn => {
                    const btnText = btn.textContent || '';
                    if (btnText.includes('后台')) hasBackgroundBtn = true;
                    if (btnText.includes('取消')) hasCancelBtn = true;
                });
                const isStuck = hasBackgroundBtn && hasCancelBtn;
                
                return {
                    found: true,
                    status,
                    text: text.slice(0, 100),
                    hasThinking,
                    isStuck,
                    timestamp: new Date().toISOString()
                };
            }
        }
        return { found: false, status: 'not_found' };
    })('${taskType}')`);
}

/**
 * 点击停止按钮（发送按钮在生成时会变成停止按钮）
 */
async function clickStopButton(trae) {
    return await trae.evaluate(`(() => {
        const result = { found: false, clicked: false };
        
        // 查找发送/停止按钮（绿色圆形按钮）
        const sendButton = document.querySelector('.chat-input-v2-send-button');
        
        if (sendButton) {
            result.found = true;
            result.backgroundColor = window.getComputedStyle(sendButton).backgroundColor;
            result.className = sendButton.className;
            
            sendButton.click();
            result.clicked = true;
        }
        
        return result;
    })()`);
}

/**
 * 点击重试按钮（查找上一次会话的重试按钮）
 */
async function clickRetryButton(trae) {
    return await trae.evaluate(`(() => {
        const result = { found: false, clicked: false };
        
        // 方法1: 通过 aria-label 查找
        let retryButton = document.querySelector('button[aria-label="重试"]');
        if (retryButton) {
            result.found = true;
            result.method = 'aria-label';
            result.buttonInfo = {
                ariaLabel: retryButton.getAttribute('aria-label'),
                className: retryButton.className
            };
            retryButton.click();
            result.clicked = true;
            return result;
        }
        
        // 方法2: 通过文本内容查找
        const allButtons = document.querySelectorAll('button');
        for (const btn of allButtons) {
            const text = btn.textContent?.trim() || '';
            const ariaLabel = btn.getAttribute('aria-label') || '';
            
            if (text === '重试' || ariaLabel === '重试') {
                result.found = true;
                result.method = 'text-content';
                result.buttonInfo = {
                    text: text,
                    ariaLabel: ariaLabel,
                    className: btn.className
                };
                btn.click();
                result.clicked = true;
                return result;
            }
        }
        
        // 方法3: 在"手动终止输出"消息旁查找
        const chatTurns = document.querySelectorAll('.chat-turn');
        for (let i = chatTurns.length - 1; i >= 0; i--) {
            const turn = chatTurns[i];
            const text = turn.textContent || '';
            
            if (text.includes('手动终止输出') || text.includes('手动停止')) {
                // 在该消息内或附近查找重试按钮
                retryButton = turn.querySelector('button[aria-label="重试"]');
                
                if (!retryButton) {
                    const buttons = turn.querySelectorAll('button');
                    for (const btn of buttons) {
                        if (btn.getAttribute('aria-label') === '重试' || 
                            btn.textContent?.trim() === '重试') {
                            retryButton = btn;
                            break;
                        }
                    }
                }
                
                if (retryButton) {
                    result.found = true;
                    result.method = 'previous-message';
                    result.buttonInfo = {
                        ariaLabel: retryButton.getAttribute('aria-label'),
                        className: retryButton.className
                    };
                    retryButton.click();
                    result.clicked = true;
                    return result;
                }
                
                break;
            }
        }
        
        return result;
    })()`);
}

/**
 * 等待函数
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ==================== 主函数入口 ====================

async function main() {
    const taskType = process.argv[2] || 'DEVCLI';
    const finalCheckDelay = parseInt(process.argv[3]) || 300; // 默认5分钟
    
    console.log('DEVCLI 完整处理（3次状态检查）\n');

    try {
        const results = await handleDevcliComplete(taskType, finalCheckDelay);
        
        // 输出总结报告
        console.log('\n');
        console.log('╔════════════════════════════════════════════════════════╗');
        console.log('║                  执行结果总结报告                       ║');
        console.log('╚════════════════════════════════════════════════════════╝');
        console.log();
        
        console.log('【状态检查记录】');
        results.checks.forEach(check => {
            console.log(`  第${check.step}次 (${check.phase}):`);
            console.log(`    - 状态: ${check.status}`);
            console.log(`    - 时间: ${check.timestamp || new Date().toLocaleTimeString()}`);
        });
        
        console.log();
        console.log('【操作记录】');
        results.operations.forEach(op => {
            console.log(`  - ${op.action}: ${op.clicked ? '✅ 成功' : '❌ 失败'}`);
        });
        
        console.log();
        console.log(`【最终状态】: ${results.finalStatus || 'unknown'}`);
        console.log(`【开始时间】: ${results.startTime}`);
        console.log(`【结束时间】: ${results.endTime || new Date().toISOString()}`);
        
        if (results.error) {
            console.log(`【错误信息】: ${results.error}`);
        }
        
        console.log();
        
    } catch (error) {
        console.error('\n❌ 执行失败:', error.message);
        process.exit(1);
    }
}

// 导出函数供其他脚本使用
module.exports = { 
    handleDevcliComplete, 
    checkTaskStatus, 
    clickStopButton, 
    clickRetryButton 
};

// 如果是直接运行
if (require.main === module) {
    main();
}
