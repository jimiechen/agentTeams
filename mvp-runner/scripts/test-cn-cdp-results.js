// 测试国内版 Trae CDP 任务结果获取
const { TraeCDP } = require('./core-scripts/trae-cdp');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testCDPResults() {
  console.log('=== 测试国内版 Trae CDP 任务结果获取 ===\n');

  const trae = new TraeCDP({ port: 9222 });

  try {
    // 连接（国内版模式）
    await trae.connect({ isCN: true });
    console.log('✅ 已连接到 Trae CN CDP\n');

    // 1. 获取任务列表
    console.log('--- 获取任务列表 ---');
    const tasks = await trae.getTaskList();
    console.log(`找到 ${tasks.length} 个任务:\n`);
    tasks.forEach(task => {
      const marker = task.selected ? '▶️' : '  ';
      console.log(`${marker} [${task.index}] ${task.text}`);
    });
    console.log('');

    // 2. 获取聊天消息
    console.log('--- 获取聊天消息 ---');
    const messages = await trae.evaluate(`(() => {
      const turns = document.querySelectorAll('.chat-turn');
      return Array.from(turns).map((turn, i) => ({
        index: i,
        isUser: turn.classList.contains('user'),
        text: turn.innerText?.slice(0, 300) || '',
        hasCode: turn.innerHTML?.includes('<code') || turn.innerHTML?.includes('\`\`\`'),
        hasTask: turn.innerText?.includes('待办') || turn.innerText?.includes('任务')
      }));
    })()`);

    console.log(`共有 ${messages.length} 条消息:\n`);
    messages.forEach((msg, i) => {
      const type = msg.isUser ? '👤 用户' : '🤖 AI';
      const markers = [];
      if (msg.hasCode) markers.push('📄代码');
      if (msg.hasTask) markers.push('📋任务');
      const markerStr = markers.length > 0 ? ` [${markers.join(',')}]` : '';
      
      console.log(`${type} 消息 ${i + 1}${markerStr}:`);
      console.log(msg.text.substring(0, 150));
      console.log('---');
    });
    console.log('');

    // 3. 获取当前活跃任务的详细信息
    const aiMessages = messages.filter(m => !m.isUser);
    if (aiMessages.length > 0) {
      const latestAi = aiMessages[aiMessages.length - 1];
      console.log('--- 最新 AI 响应详情 ---');
      console.log(latestAi.text.substring(0, 500));
      console.log('');
    }

    // 4. 获取任务执行状态（待办列表）
    console.log('--- 获取任务执行状态 ---');
    const taskStatus = await trae.evaluate(`(() => {
      // 查找待办/任务列表
      const taskElements = document.querySelectorAll('[class*="task"], [class*="todo"]');
      const tasks = [];
      taskElements.forEach(el => {
        const text = el.textContent?.slice(0, 100);
        if (text && text.includes('待办') || text.includes('任务')) {
          tasks.push({
            text: text,
            completed: el.className?.includes('completed') || el.className?.includes('done'),
            className: el.className?.slice(0, 50)
          });
        }
      });
      return tasks;
    })()`);

    if (taskStatus.length > 0) {
      console.log('找到任务状态:');
      taskStatus.forEach((task, i) => {
        const status = task.completed ? '✅' : '⏳';
        console.log(`  ${status} ${task.text}`);
      });
    } else {
      console.log('未找到明确的任务状态元素');
    }
    console.log('');

    // 5. 获取输入框和发送按钮状态
    console.log('--- 输入控件状态 ---');
    const inputInfo = await trae.getElementInfo('.chat-input-v2-input-box-editable');
    const buttonInfo = await trae.getElementInfo('.chat-input-v2-send-button');

    console.log('输入框:', inputInfo ? `✅ 找到 (${inputInfo.className?.slice(0, 30)})` : '❌ 未找到');
    console.log('发送按钮:', buttonInfo ? `✅ 找到 (disabled: ${buttonInfo.disabled})` : '❌ 未找到');
    console.log('');

    await trae.disconnect();
    console.log('✅ 测试完成');

  } catch (error) {
    console.error('❌ 错误:', error.message);
    process.exit(1);
  }
}

testCDPResults();
