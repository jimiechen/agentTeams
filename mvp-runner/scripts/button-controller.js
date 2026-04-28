// 按钮控制器 - 发送消息或终止生成
const { TraeCDP } = require('./core-scripts/trae-cdp');

class ButtonController {
    constructor() {
        this.trae = new TraeCDP({ port: 9222 });
    }

    async connect() {
        await this.trae.connect({ isCN: true });
    }

    async disconnect() {
        await this.trae.disconnect();
    }

    // 获取发送/停止按钮状态
    async getButtonStatus() {
        return await this.trae.evaluate(`(() => {
            const btn = document.querySelector('.chat-input-v2-send-button');
            if (!btn) return { found: false };
            
            const icon = btn.querySelector('.codicon');
            const iconClass = icon ? icon.className : '';
            
            // 判断当前功能
            let function_ = 'unknown';
            if (iconClass.includes('ArrowUp')) function_ = 'send';
            else if (iconClass.includes('stop') || iconClass.includes('Stop')) function_ = 'stop';
            else if (btn.disabled) function_ = 'disabled';
            
            return {
                found: true,
                className: btn.className,
                disabled: btn.disabled,
                iconClass: iconClass,
                function: function_,
                visible: btn.offsetParent !== null
            };
        })()`);
    }

    // 点击按钮（发送或停止）
    async clickButton() {
        const status = await this.getButtonStatus();
        
        if (!status.found) {
            throw new Error('按钮未找到');
        }
        
        if (status.disabled) {
            console.log('按钮处于disabled状态，无法点击');
            return { success: false, reason: 'disabled' };
        }
        
        const action = status.function === 'stop' ? '终止生成' : '发送消息';
        console.log(`执行: ${action}`);
        
        await this.trae.evaluate(`(() => {
            const btn = document.querySelector('.chat-input-v2-send-button');
            if (btn) {
                btn.click();
                return true;
            }
            return false;
        })()`);
        
        return { success: true, action: status.function };
    }

    // 发送消息
    async sendMessage(text) {
        const status = await this.getButtonStatus();
        
        if (status.function === 'stop') {
            console.log('AI正在生成，先停止当前生成...');
            await this.clickButton();
            await new Promise(r => setTimeout(r, 500));
        }
        
        // 使用核心模块发送消息
        await this.trae.submitMessage(text);
        return { success: true };
    }

    // 终止生成
    async stopGeneration() {
        const status = await this.getButtonStatus();
        
        if (status.function !== 'stop') {
            console.log('当前没有正在进行的生成');
            return { success: false, reason: 'not_generating' };
        }
        
        return await this.clickButton();
    }
}

// 导出
module.exports = { ButtonController };

// 测试
if (require.main === module) {
    async function test() {
        const controller = new ButtonController();
        await controller.connect();

        console.log('=== 按钮控制器测试 ===\n');

        // 检查状态
        const status = await controller.getButtonStatus();
        console.log('按钮状态:', JSON.stringify(status, null, 2));

        // 根据状态执行操作
        if (status.function === 'stop') {
            console.log('\n检测到AI正在生成，执行终止...');
            await controller.stopGeneration();
        } else if (status.function === 'send') {
            console.log('\n可以发送消息');
        }

        await controller.disconnect();
    }

    test().catch(console.error);
}
