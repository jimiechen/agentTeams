const { TraeCDP } = require('./trae-cdp');

const log = {
  info: (m) => console.log(`\x1b[32m[INFO]\x1b[0m  ${m}`),
  step: (m) => console.log(`\n\x1b[36m▶ ${m}\x1b[0m`),
  success: (m) => console.log(`\x1b[32m✓ ${m}\x1b[0m`),
  error: (m) => console.error(`\x1b[31m✗ ${m}\x1b[0m`),
  result: (m) => console.log(`\x1b[33m📋 ${m}\x1b[0m`),
};

async function switchToTask(trae, taskIndex) {
  const switchExpr = `(() => {
    const items = document.querySelectorAll('.index-module__task-item___zOpfg');
    if (items[${taskIndex}]) {
      items[${taskIndex}].click();
      return { 
        success: true, 
        text: items[${taskIndex}].textContent?.slice(0, 30)
      };
    }
    return { success: false };
  })()`;

  return await trae.evaluate(switchExpr);
}

// 发送消息（使用send button）
async function sendMessage(trae, message) {
  const expr = `(() => {
    try {
      // 1. 找到chat输入框
      const input = document.querySelector('.chat-input-v2-input-box-editable');
      const sendBtn = document.querySelector('.chat-input-v2-send-button');
      
      if (!input) {
        return { success: false, reason: 'chat input not found' };
      }
      if (!sendBtn) {
        return { success: false, reason: 'send button not found' };
      }
      
      // 2. 聚焦并输入文本
      input.focus();
      input.click();
      input.innerText = \`${message}\`;
      
      // 3. 触发input事件
      input.dispatchEvent(new InputEvent('input', { 
        bubbles: true,
        data: \`${message}\`
      }));
      
      // 4. 点击发送按钮
      sendBtn.click();
      
      return { 
        success: true, 
        inputText: input.innerText,
        buttonFound: true
      };
    } catch (e) {
      return { success: false, reason: e.message };
    }
  })()`;

  return await trae.evaluate(expr);
}

// 获取聊天消息
async function getChatMessages(trae) {
  const expr = `(() => {
    try {
      const turns = document.querySelectorAll('.chat-turn');
      const messages = [];
      
      turns.forEach((turn, i) => {
        const isUser = turn.classList.contains('user');
        const contentEl = turn.querySelector('.chat-turn-content');
        const text = contentEl?.innerText || turn.innerText || '';
        
        messages.push({
          index: i,
          isUser: isUser,
          text: text.slice(0, 400),
          className: turn.className?.slice(0, 50) || ''
        });
      });
      
      return {
        success: true,
        messages: messages,
        messageCount: messages.length
      };
    } catch (e) {
      return { success: false, reason: e.message };
    }
  })()`;

  return await trae.evaluate(expr);
}

// 等待AI响应
async function waitForResponse(trae, initialCount, timeoutMs = 40000) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeoutMs) {
    const result = await getChatMessages(trae);
    if (result.success && result.messageCount > initialCount) {
      // 有新消息，检查是否是AI的回复
      const newMessages = result.messages.slice(initialCount);
      const aiResponse = newMessages.find(m => !m.isUser && m.text.length > 10);
      if (aiResponse) {
        return result;
      }
    }
    await new Promise(r => setTimeout(r, 2000));
  }
  
  return await getChatMessages(trae);
}

async function main() {
  const trae = new TraeCDP({ port: 9222 });
  const results = [];

  try {
    log.step('Connecting to Trae');
    await trae.connect();
    log.success('Connected');

    const now = new Date();
    const timeStr = now.toLocaleString('zh-CN', { 
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false 
    });
    log.info(`Current time: ${timeStr}`);

    const tasks = [
      { index: 0, name: '测试工程师', prompt: `当前时间是 ${timeStr}，请确认收到并回复当前时间。` },
      { index: 1, name: '研发工程师', prompt: `当前时间是 ${timeStr}，请确认收到并回复当前时间。` }
    ];

    for (const task of tasks) {
      log.step(`Processing Task [${task.index}]: ${task.name}`);

      // 切换任务
      log.info('Switching task...');
      const switchResult = await switchToTask(trae, task.index);
      if (switchResult.success) {
        log.success(`Switched to: ${switchResult.text}`);
      }
      await new Promise(r => setTimeout(r, 2000));

      // 获取当前消息数
      const beforeResult = await getChatMessages(trae);
      const initialCount = beforeResult.messageCount;
      log.info(`Initial messages: ${initialCount}`);

      // 发送消息
      log.info('Sending message...');
      const sendResult = await sendMessage(trae, task.prompt);
      if (sendResult.success) {
        log.success(`Message sent: "${sendResult.inputText?.slice(0, 50)}"`);
      } else {
        log.error(`Send failed: ${sendResult.reason}`);
        continue;
      }

      // 等待AI响应
      log.info('Waiting for AI response...');
      const response = await waitForResponse(trae, initialCount, 40000);
      
      if (response.success) {
        log.result(`\n--- Messages (${response.messageCount}) ---`);
        response.messages.forEach((msg, i) => {
          const type = msg.isUser ? '[User]' : '[AI]';
          log.result(`${type} ${msg.text.slice(0, 100)}`);
        });
        
        // 找到新发送的消息和AI回复
        const newMessages = response.messages.slice(initialCount);
        const userMsg = newMessages.find(m => m.isUser);
        const aiMsg = newMessages.find(m => !m.isUser);
        
        results.push({
          task: task.name,
          prompt: task.prompt,
          userMessage: userMsg?.text || '',
          aiResponse: aiMsg?.text || '',
          allMessages: response.messages,
          timestamp: new Date().toISOString()
        });
      }

      await new Promise(r => setTimeout(r, 3000));
    }

    // 汇总
    log.step('Final Results Summary');
    results.forEach((r, i) => {
      log.result(`\n========== Task ${i + 1}: ${r.task} ==========`);
      log.result(`Prompt: ${r.prompt}`);
      log.result(`User Message: ${r.userMessage.slice(0, 100)}`);
      log.result(`AI Response: ${r.aiResponse.slice(0, 200)}`);
    });

    // 截图
    const screenshotPath = `multi-task-final-${Date.now()}.png`;
    await trae.screenshot(screenshotPath);
    log.success(`Screenshot saved: ${screenshotPath}`);

    await trae.disconnect();
    log.step('All tasks completed successfully!');

  } catch (err) {
    log.error(err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

main();
