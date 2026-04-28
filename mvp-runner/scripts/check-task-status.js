// 检查任务完成状态
const { TraeCDP } = require('./core-scripts/trae-cdp');

async function checkTaskStatus() {
    console.log('=== 检查任务完成状态 ===\n');

    const trae = new TraeCDP({ port: 9222 });

    try {
        await trae.connect({ isCN: true });
        console.log('✅ 已连接到 Trae CN CDP\n');

        // 1. 获取任务列表及状态
        console.log('--- 任务列表及状态 ---');
        const tasks = await trae.evaluate(`(() => {
            const items = document.querySelectorAll('.index-module__task-item___zOpfg');
            return Array.from(items).map((el, i) => {
                const text = el.textContent?.trim() || '';
                
                // 识别任务类型
                let taskType = 'unknown';
                if (text.includes('PMCLI')) taskType = 'PMCLI';
                else if (text.includes('DEVCLI')) taskType = 'DEVCLI';
                
                // 检查状态图标或文本
                const statusIcon = el.querySelector('.index-module__task-status-icon___OQCSs');
                const statusEl = el.querySelector('[class*="status"]');
                
                // 从文本中识别状态
                let status = 'unknown';
                if (text.includes('完成')) status = 'completed';
                else if (text.includes('进行中')) status = 'in_progress';
                else if (text.includes('中断')) status = 'interrupted';
                
                // 检查是否有完成图标（svg中的特定class）
                const hasCompleteIcon = el.querySelector('.index-module__task-status__complete___ThOzg') !== null;
                const hasLoadingIcon = el.querySelector('.index-module__task-status__loading') !== null;
                
                return {
                    index: i,
                    taskType,
                    text: text.slice(0, 50),
                    isSelected: el.className.includes('selected'),
                    status,
                    hasCompleteIcon,
                    hasLoadingIcon,
                    statusClass: statusEl?.className?.slice(0, 50)
                };
            });
        })()`);

        console.log('任务状态:\n');
        tasks.forEach(t => {
            console.log(`[${t.index}] ${t.taskType}`);
            console.log(`  文本: ${t.text}`);
            console.log(`  状态: ${t.status}`);
            console.log(`  完成图标: ${t.hasCompleteIcon ? '✅' : '❌'}`);
            console.log(`  加载图标: ${t.hasLoadingIcon ? '⏳' : '❌'}`);
            console.log(`  当前选中: ${t.isSelected ? '是' : '否'}`);
            console.log('');
        });

        // 2. 获取当前任务的最后消息状态
        console.log('--- 当前任务的最后消息 ---');
        const lastMessages = await trae.evaluate(`(() => {
            const turns = document.querySelectorAll('.chat-turn');
            const lastFew = Array.from(turns).slice(-3);
            
            return lastFew.map((el, i) => ({
                index: i,
                isUser: el.classList.contains('user'),
                isAssistant: el.classList.contains('assistant'),
                hasTaskClass: el.className.includes('task'),
                text: el.textContent?.slice(0, 100),
                // 检查是否有"思考中"或加载状态
                isThinking: el.textContent?.includes('思考') || el.textContent?.includes('Thinking'),
                isComplete: el.textContent?.includes('完成') || el.textContent?.includes('完成')
            }));
        })()`);

        console.log('最近消息:');
        lastMessages.forEach(m => {
            const type = m.isUser ? '用户' : m.isAssistant ? 'AI' : '未知';
            const status = m.isThinking ? '(思考中)' : '';
            console.log(`  [${type}]${status}: ${m.text?.slice(0, 60)}`);
        });

        // 3. 判断任务是否完成的方法
        console.log('\n--- 任务完成判断方法 ---');
        console.log('方法1: 通过任务选项卡文本');
        console.log('  - 包含"完成" → 已完成');
        console.log('  - 包含"进行中" → 进行中');
        console.log('  - 包含"中断" → 已中断');
        console.log('');
        console.log('方法2: 通过完成图标');
        console.log('  - 有 .task-status__complete 图标 → 已完成');
        console.log('');
        console.log('方法3: 通过最后AI消息');
        console.log('  - AI消息包含"完成"/"done" → 已完成');
        console.log('  - AI消息显示"思考中" → 进行中');

        await trae.disconnect();
        console.log('\n✅ 检查完成');

    } catch (error) {
        console.error('❌ 错误:', error.message);
    }
}

checkTaskStatus();
