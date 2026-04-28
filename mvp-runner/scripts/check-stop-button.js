// 检查停止/终止按钮（在AI生成时显示）
const { TraeCDP } = require('./core-scripts/trae-cdp');

async function checkStopButton() {
    console.log('=== 检查停止/终止按钮 ===\n');

    const trae = new TraeCDP({ port: 9222 });

    try {
        await trae.connect({ isCN: true });
        console.log('✅ 已连接到 Trae CN CDP\n');

        // 1. 先切换到DEVCLI任务
        console.log('--- 切换到DEVCLI任务 ---');
        await trae.evaluate(`(() => {
            const items = document.querySelectorAll('.index-module__task-item___zOpfg');
            items.forEach((el, i) => {
                if (el.textContent.includes('DEVCLI')) {
                    el.click();
                }
            });
        })()`);
        await new Promise(r => setTimeout(r, 1000));
        console.log('✅ 已切换\n');

        // 2. 检查发送按钮位置的元素
        console.log('--- 检查发送按钮位置 ---');
        const sendButtonInfo = await trae.evaluate(`(() => {
            const btn = document.querySelector('.chat-input-v2-send-button');
            if (!btn) return { found: false };
            
            // 获取父元素中的所有按钮
            const parent = btn.parentElement;
            const siblingButtons = parent ? Array.from(parent.querySelectorAll('button')).map((b, i) => ({
                index: i,
                tagName: b.tagName,
                id: b.id,
                className: b.className,
                text: b.textContent?.slice(0, 30),
                title: b.getAttribute('title'),
                disabled: b.disabled,
                visible: b.offsetParent !== null
            })) : [];
            
            return {
                found: true,
                sendButton: {
                    tagName: btn.tagName,
                    id: btn.id,
                    className: btn.className,
                    disabled: btn.disabled,
                    visible: btn.offsetParent !== null
                },
                siblingButtons,
                parentHTML: parent?.innerHTML?.slice(0, 500)
            };
        })()`);
        
        console.log('发送按钮位置信息:');
        console.log(JSON.stringify(sendButtonInfo, null, 2));

        // 3. 查找所有可能的停止按钮（在chat输入区域）
        console.log('\n--- Chat输入区域所有按钮 ---');
        const chatAreaButtons = await trae.evaluate(`(() => {
            const chatArea = document.querySelector('.chat-input-v2-container');
            if (!chatArea) return { found: false };
            
            const buttons = chatArea.querySelectorAll('button, [role="button"]');
            return Array.from(buttons).map((btn, i) => ({
                index: i,
                tagName: btn.tagName,
                id: btn.id,
                className: btn.className?.slice(0, 50),
                text: btn.textContent?.slice(0, 30),
                title: btn.getAttribute('title'),
                ariaLabel: btn.getAttribute('aria-label'),
                disabled: btn.disabled,
                visible: btn.offsetParent !== null,
                innerHTML: btn.innerHTML?.slice(0, 100)
            }));
        })()`);
        
        console.log('Chat区域按钮:');
        console.log(JSON.stringify(chatAreaButtons, null, 2));

        // 4. 检查是否有停止/终止类名的元素
        console.log('\n--- 查找停止相关元素 ---');
        const stopElements = await trae.evaluate(`(() => {
            const results = [];
            
            // 检查所有元素
            document.querySelectorAll('*').forEach((el, i) => {
                if (i > 300) return;
                
                const className = (el.className || '').toLowerCase();
                if (className.includes('stop') || className.includes('terminate') || 
                    className.includes('cancel') || className.includes('abort')) {
                    
                    results.push({
                        tagName: el.tagName,
                        className: el.className?.slice(0, 50),
                        text: el.textContent?.slice(0, 20),
                        parentClass: el.parentElement?.className?.slice(0, 40)
                    });
                }
            });
            
            return results;
        })()`);
        
        console.log('停止相关元素:');
        stopElements.forEach((el, i) => {
            console.log(`[${i}] ${el.tagName}: ${el.className}`);
            console.log(`    text: ${el.text}`);
            console.log(`    parent: ${el.parentClass}`);
        });

        // 5. 获取发送按钮容器的完整HTML
        console.log('\n--- 发送按钮容器HTML ---');
        const containerHTML = await trae.evaluate(`(() => {
            const btn = document.querySelector('.chat-input-v2-send-button');
            if (!btn) return 'not found';
            
            const container = btn.parentElement;
            return container ? container.outerHTML : 'no parent';
        })()`);
        
        console.log(containerHTML);

        await trae.disconnect();
        console.log('\n✅ 检查完成');

    } catch (error) {
        console.error('❌ 错误:', error.message);
    }
}

checkStopButton();
