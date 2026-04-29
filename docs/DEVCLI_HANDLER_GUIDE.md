# DEVCLI 任务完整处理脚本使用指南

## 概述

`devcli-complete-handler.js` 是一个完整的 DEVCLI 任务处理脚本，实现了：
- **停止**卡住的任务（点击输入框的停止按钮）
- **检查**任务状态（分3次检查）
- **重试**上一次会话（点击重试按钮）
- **多次状态验证**确保操作成功

## 使用方式

### 命令行使用

```bash
# 默认参数（DEVCLI任务，最终检查延迟300秒=5分钟）
node devcli-complete-handler.js

# 指定任务类型
node devcli-complete-handler.js DEVCLI

# 指定任务类型和最终检查延迟（秒）
node devcli-complete-handler.js DEVCLI 300

# 不等待最终检查（0秒）
node devcli-complete-handler.js DEVCLI 0
```

### 作为模块使用

```javascript
const {
    handleDevcliComplete,
    checkTaskStatus,
    clickStopButton,
    clickRetryButton
} = require('./devcli-complete-handler');

// 完整处理流程
const results = await handleDevcliComplete('DEVCLI', 300);

// 单独使用功能
const status = await checkTaskStatus(trae, 'DEVCLI');
const stopResult = await clickStopButton(trae);
const retryResult = await clickRetryButton(trae);
```

## 核心代码片段说明

### 1. 任务状态检查函数

```javascript
/**
 * 检查任务状态
 * 检测：任务状态、是否"思考中"、是否卡住
 */
async function checkTaskStatus(trae, taskType) {
    return await trae.evaluate(`((taskType) => {
        const items = document.querySelectorAll('.index-module__task-item___zOpfg');
        for (const item of items) {
            const text = item.textContent || '';
            if (text.includes(taskType)) {
                // 解析状态
                let status = 'unknown';
                if (text.includes('完成')) status = 'completed';
                else if (text.includes('进行中')) status = 'in_progress';
                else if (text.includes('中断')) status = 'interrupted';

                // 检查"思考中"
                const hasThinking = document.body.textContent.includes('思考中');

                // 检查是否卡住（有后台运行/取消按钮）
                const isStuck = /* 检测逻辑 */;

                return {
                    found: true,
                    status,           // completed/in_progress/interrupted
                    text,             // 任务列表文本
                    hasThinking,      // 是否有"思考中"
                    isStuck,          // 是否卡住
                    timestamp: new Date().toISOString()
                };
            }
        }
        return { found: false, status: 'not_found' };
    })('${taskType}')`);
}
```

**使用场景**：
- 操作前检查当前任务状态
- 中断后确认任务是否已中断
- 重试后确认任务是否已重新开始

### 2. 点击停止按钮函数

```javascript
/**
 * 点击停止按钮
 * 位置：Chat输入框右侧的绿色圆形按钮
 * 说明：AI生成时，发送按钮会变成停止按钮（同一位置）
 */
async function clickStopButton(trae) {
    return await trae.evaluate(`(() => {
        const result = { found: false, clicked: false };

        // 查找发送/停止按钮
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
```

**按钮特征**：
- class: `chat-input-v2-send-button`
- 背景色：绿色 `rgb(15, 220, 120)` 或淡绿色
- 位置：语音输入按钮旁边
- 图标：发送时显示纸飞机，停止时显示正方形

### 3. 点击重试按钮函数

```javascript
/**
 * 点击重试按钮
 * 查找策略：
 * 1. 通过 aria-label="重试" 查找
 * 2. 通过文本内容"重试" 查找
 * 3. 在"手动终止输出"消息旁查找
 */
async function clickRetryButton(trae) {
    return await trae.evaluate(`(() => {
        const result = { found: false, clicked: false };

        // 方法1: aria-label查找
        let retryButton = document.querySelector('button[aria-label="重试"]');
        if (retryButton) {
            result.method = 'aria-label';
            result.buttonInfo = {
                ariaLabel: retryButton.getAttribute('aria-label'),
                className: retryButton.className
            };
            retryButton.click();
            result.clicked = true;
            return result;
        }

        // 方法2: 文本内容查找
        const allButtons = document.querySelectorAll('button');
        for (const btn of allButtons) {
            const text = btn.textContent?.trim();
            if (text === '重试') {
                result.method = 'text-content';
                btn.click();
                result.clicked = true;
                return result;
            }
        }

        // 方法3: 在上一次"手动终止输出"消息旁查找
        const chatTurns = document.querySelectorAll('.chat-turn');
        for (let i = chatTurns.length - 1; i >= 0; i--) {
            const turn = chatTurns[i];
            if (turn.textContent.includes('手动终止输出')) {
                retryButton = turn.querySelector('button[aria-label="重试"]');
                if (retryButton) { 'method' : 'previous-message';
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
```

**按钮特征**：
- aria-label: `"重试"`
- class: `icd-btn retry icd-btn-default icd-btn-small icd-btn-icon-only`
- 位置：消息底部操作栏（复制按钮旁边）

### 4. 完整处理流程

```javascript
async function handleDevcliComplete(taskType = 'DEVCLI', finalCheckDelay = 300) {
    const results = {
        checks: [],      // 3次状态检查结果
        operations: [],  // 操作记录
        finalStatus: ''
    };

    // ========== 第1次状态检查（操作前） ==========
    const check1 = await checkTaskStatus(trae, taskType);
    results.checks.push({ step: 1, phase: 'before_operation', ...check1 });

    if (check1.status === 'completed') {
        return { finalStatus: 'already_completed' };
    }

    // ========== 步骤1：点击停止按钮 ==========
    const stopResult = await clickStopButton(trae);
    await sleep(2000);

    // ========== 第2次状态检查（中断后） ==========
    const check2 = await checkTaskStatus(trae, taskType);
    results.checks.push({ step: 2, phase: 'after_interrupt', ...check2 });

    if (check2.status !== 'interrupted') {
        return { finalStatus: 'no_retry_needed' };
    }

    // ========== 步骤2：点击重试按钮 ==========
    const retryResult = await clickRetryButton(trae);
    await sleep(3000);

    // ========== 第3次状态检查（重试后立即） ==========
    const check3 = await checkTaskStatus(trae, taskType);
    results.checks.push({ step: 3, phase: 'after_retry', ...check3 });

    // ========== 最终状态检查（延迟后） ==========
    if (finalCheckDelay > 0) {
        await sleep(finalCheckDelay * 1000);
        const check4 = await checkTaskStatus(trae, taskType);
        results.checks.push({ step: 4, phase: 'final_check', ...check4 });
    }

    return results;
}
```

## 状态判断逻辑

| 状态 | 判断条件 | 处理建议 |
|------|---------|---------|
| **completed** | 任务列表显示"完成" | 无需操作 |
| **in_progress** | 任务列表显示"进行中" | 检查是否卡住 |
| **interrupted** | 任务列表显示"中断" | 点击重试按钮 |
| **hasThinking** | 页面显示"思考中..." | 点击停止按钮 |
| **isStuck** | 有"后台运行"/"取消"按钮 | 点击后台运行或取消 |

## 3次状态检查说明

```
第1次检查（操作前）
    ↓
如果 completed → 结束
    ↓
点击停止按钮
    ↓
等待2秒
    ↓
第2次检查（中断后）
    ↓
如果不是 interrupted → 结束
    ↓
点击重试按钮
    ↓
等待3秒
    ↓
第3次检查（重试后立即）
    ↓
等待 finalCheckDelay 秒（默认300秒=5分钟）
    ↓
最终检查（可选）
    ↓
输出总结报告
```

## 输出示例

```
══════════════════════════════════════════════════════════════
                  执行结果总结报告
══════════════════════════════════════════════════════════════

【状态检查记录】
  第1次 (before_operation):
    - 状态: in_progress
    - 时间: 13:52:30
  第2次 (after_interrupt):
    - 状态: interrupted
    - 时间: 13:52:32
  第3次 (after_retry):
    - 状态: in_progress
    - 时间: 13:52:35
  第4次 (final_check):
    - 状态: completed
    - 时间: 13:57:35

【操作记录】
  - stop: ✅ 成功
  - retry: ✅ 成功

【最终状态】: completed
【开始时间】: 2026-04-29T13:52:30.000Z
【结束时间】: 2026-04-29T13:57:35.000Z
```

## 常见问题

### Q1: 为什么找不到停止按钮？
- 可能任务没有在生成中
- 可能按钮class名已更改
- 检查是否在正确的任务(DEVCLI)中

### Q2: 为什么找不到重试按钮？
- 可能任务没有被中断
- 尝试滚动到上一次"手动终止输出"消息
- 检查按钮是否在消息底部操作栏

### Q3: 重试后任务还是卡住？
- 可以增加 `finalCheckDelay` 时间
- 可能需要多次重试
- 检查终端命令是否有问题（如git命令）

## 相关文件

- `devcli-complete-handler.js` - 完整处理脚本
- `core-scripts/trae-cdp.js` - CDP连接核心模块
- `BUTTON_SCRIPTS_README.md` - 按钮操作完整文档

---

*文档版本: 2024-04-29*
*适用: Trae IDE DEVCLI任务处理*
