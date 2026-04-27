#!/usr/bin/env node
// 飞书群聊消息监听脚本 - Node.js 版本

const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

const CHAT_ID = 'oc_9f741c1f2d5b1fc1e98a0b42c04283c5';
const BOT_NAME = 'PMCLI';
const POLL_INTERVAL = 5000; // 5秒

const processedIds = new Set();

function logInfo(msg) {
    console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);
}

function logHighlight(msg) {
    console.log('\n' + '='.repeat(50));
    console.log(`  🔔 收到 @${BOT_NAME} 消息!`);
    console.log('='.repeat(50));
    console.log(msg);
    console.log('='.repeat(50) + '\n');
}

function logError(msg) {
    console.error(`[${new Date().toLocaleTimeString()}] ❌ 错误: ${msg}`);
}

async function fetchMessages() {
    const command = `lark-cli im +chat-messages-list --chat-id ${CHAT_ID} --page-size 20`;
    const { stdout } = await execAsync(command, { encoding: 'utf8' });
    return JSON.parse(stdout);
}

async function checkMessages() {
    try {
        const result = await fetchMessages();

        // lark-cli 返回的数据在 result.data.messages 中
        const messages = result.data?.messages || [];

        if (messages.length === 0) {
            return;
        }

        // 调试：打印获取到的消息数量
        console.log(`[${new Date().toLocaleTimeString()}] 获取到 ${messages.length} 条消息`);

        for (const msg of messages) {
            const msgId = msg.message_id;

            if (processedIds.has(msgId)) {
                continue;
            }

            const content = msg.content || '';
            const sender = msg.sender?.name || '未知';
            const createTime = msg.create_time;

            // 检查是否包含 @botName
            if (content.includes(`@${BOT_NAME}`)) {
                const timeStr = createTime || new Date().toLocaleString();

                logHighlight(
                    `时间: ${timeStr}\n` +
                    `发送者: ${sender}\n` +
                    `内容: ${content}\n` +
                    `消息ID: ${msgId}`
                );

                // TODO: 这里可以添加处理逻辑，比如发送到 Trae AI
            }

            processedIds.add(msgId);
        }

        // 只保留最近 100 条
        if (processedIds.size > 100) {
            const idsArray = Array.from(processedIds);
            processedIds.clear();
            idsArray.slice(-100).forEach(id => processedIds.add(id));
        }
    } catch (error) {
        logError(error.message);
    }
}

function main() {
    console.log('========================================');
    console.log('     飞书群聊消息监听 (Node.js)');
    console.log('========================================');
    console.log(`群聊ID: ${CHAT_ID}`);
    console.log(`监控关键字: @${BOT_NAME}`);
    console.log(`轮询间隔: ${POLL_INTERVAL / 1000} 秒`);
    console.log('按 Ctrl+C 停止监听');
    console.log('========================================\n');

    // 立即执行一次
    checkMessages();

    // 定时轮询
    const intervalId = setInterval(checkMessages, POLL_INTERVAL);

    // 处理退出信号
    process.on('SIGINT', () => {
        console.log('\n\n👋 正在停止监听...');
        clearInterval(intervalId);
        process.exit(0);
    });

    process.on('SIGTERM', () => {
        console.log('\n\n👋 正在停止监听...');
        clearInterval(intervalId);
        process.exit(0);
    });
}

main();
