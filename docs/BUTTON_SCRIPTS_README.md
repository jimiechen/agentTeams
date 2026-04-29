# 按钮检测与复制脚本文档（完整版）

本文档汇总了所有用于检测 Trae 任务按钮、状态判断和执行复制操作的脚本。

## 脚本列表

| 脚本名称 | 功能 | 状态 |
|---------|------|------|
| `check-pmcli-status.js` | 检查 PMCLI 任务状态和按钮 | ✅ 可用 |
| `get-pmcli-end-buttons.js` | 获取任务结束后的图表/操作按钮 | ✅ 可用 |
| `copy-from-clipboard-fixed.js` | **点击复制按钮+剪贴板读取** | ✅ **推荐** |
| `copy-final.js` | 最终版本（DOM提取） | ✅ 可用 |
| `wait-and-copy-md.js` | 等待任务完成后复制 | ✅ 可用 |
| `copy-full-conversation-md.js` | 复制完整对话（多轮） | ✅ 可用 |
| `copy-last-conversation.js` | 复制最后一轮对话 | ✅ 可用 |
| `copy-with-buttons.js` | 等待完成+点击复制按钮 | ✅ 可用 |
| `copy-with-hover-buttons.js` | Hover触发复制按钮 | ✅ 可用 |

---

## 1. 任务状态判断

### 1.1 状态类型

| 状态 | 识别特征 | 处理建议 |
|------|---------|---------|
| **completed** | 任务列表显示"完成" | 可以执行复制操作 |
| **in_progress** | 任务列表显示"进行中" | 等待任务完成 |
| **interrupted** | 任务列表显示"中断" | 需要人工处理 |
| **waiting** | 任务列表显示"等待" | 检查是否需要用户操作 |
| **timeout** | 长时间无响应 | 检查终端/模型状态 |

### 1.2 状态检测代码

```javascript
/**
 * 检测任务状态
 * @returns {string} 状态: completed/in_progress/interrupted/waiting/unknown
 */
async function checkTaskStatus(trae) {
    const status = await trae.evaluate(`(() => {
        const items = document.querySelectorAll('.index-module__task-item___zOpfg');
        for (const item of items) {
            const text = item.textContent || '';
            if (text.includes('PMCLI')) {
                let status = 'unknown';
                if (text.includes('完成')) status = 'completed';
                else if (text.includes('进行中')) status = 'in_progress';
                else if (text.includes('中断')) status = 'interrupted';
                else if (text.includes('等待')) status = 'waiting';
                return { status, text: text.slice(0, 50) };
            }
        }
        return { status: 'not_found' };
    })()`);
    return status;
}
```

### 1.3 等待任务完成

```javascript
/**
 * 等待任务完成，带超时机制
 * @param {number} maxWaitTimeMs 最大等待时间（毫秒）
 * @param {number} checkIntervalMs 检查间隔（毫秒）
 */
async function waitForCompletion(trae, maxWaitTimeMs = 300000, checkIntervalMs = 2000) {
    const startTime = Date.now();
    let isCompleted = false;
    let checkCount = 0;
    
    while (!isCompleted) {
        const elapsed = Date.now() - startTime;
        
        // 超时检查
        if (elapsed > maxWaitTimeMs) {
            console.log(`⏰ 等待超时 (${maxWaitTimeMs / 1000}秒)`);
            return false;
        }
        
        // 检查状态
        const statusCheck = await checkTaskStatus(trae);
        checkCount++;
        
        if (statusCheck.status === 'completed') {
            console.log(`✅ 任务已完成! (检查${checkCount}次)`);
            return true;
        }
        
        // 显示进度
        if (checkCount % 5 === 0) {
            process.stdout.write(`\r   等待中... ${(elapsed / 1000).toFixed(1)}s`);
        }
        
        // 等待下次检查
        await new Promise(r => setTimeout(r, checkIntervalMs));
    }
}
```

---

## 2. 终端/模型状态判断

### 2.1 终端长时间无响应判断

```javascript
/**
 * 检查终端是否长时间无响应
 * 特征：出现"终端执行超时"提示、后台运行按钮、取消按钮
 */
async function checkTerminalTimeout(trae) {
    const terminalStatus = await trae.evaluate(`(() => {
        const result = {
            hasTimeout: false,
            hasRunInBackgroundButton: false,
            hasCancelButton: false,
            timeoutText: '',
            buttons: []
        };
        
        // 查找超时提示
        const messages = document.querySelectorAll('.chat-turn');
        const lastMessage = messages[messages.length - 1];
        if (lastMessage) {
            const text = lastMessage.textContent || '';
            result.hasTimeout = text.includes('超时') || text.includes('timeout') || text.includes('长时间');
            result.timeoutText = text.slice(0, 200);
        }
        
        // 查找终端按钮
        const allButtons = document.querySelectorAll('button');
        allButtons.forEach(btn => {
            const text = btn.textContent?.trim() || '';
            const ariaLabel = btn.getAttribute('aria-label') || '';
            
            if (text.includes('后台') || ariaLabel.includes('后台')) {
                result.hasRunInBackgroundButton = true;
                result.buttons.push({ type: 'background', text });
            }
            if (text.includes('取消') || ariaLabel.includes('取消')) {
                result.hasCancelButton = true;
                result.buttons.push({ type: 'cancel', text });
            }
        });
        
        return result;
    })()`);
    
    return terminalStatus;
}
```

### 2.2 大模型无响应判断

```javascript
/**
 * 检查大模型是否无响应（排队/等待中）
 * 特征：显示"排队提醒"、"请求量较高"等
 */
async function checkModelResponse(trae) {
    const modelStatus = await trae.evaluate(`(() => {
        const turns = document.querySelectorAll('.chat-turn');
        const lastTurn = turns[turns.length - 1];
        
        if (!lastTurn) return { isWaiting: false };
        
        const text = lastTurn.textContent || '';
        
        // 检查排队状态
        const isQueuing = text.includes('排队') || 
                         text.includes('请求量较高') || 
                         text.includes('排在第') ||
                         text.includes('等待中');
        
        // 提取排队位置
        let queuePosition = null;
        const queueMatch = text.match(/排在第 (\d+) 位/);
        if (queueMatch) {
            queuePosition = parseInt(queueMatch[1]);
        }
        
        return {
            isWaiting: isQueuing,
            queuePosition,
            text: text.slice(0, 100)
        };
    })()`);
    
    return modelStatus;
}
```

### 2.3 任务中断判断

```javascript
/**
 * 检查任务是否中断
 * 特征：显示"中断"、"失败"、错误提示等
 */
async function checkTaskInterrupted(trae) {
    const interruptStatus = await trae.evaluate(`(() => {
        // 检查任务列表状态
        const items = document.querySelectorAll('.index-module__task-item___zOpfg');
        let taskStatus = 'unknown';
        
        for (const item of items) {
            const text = item.textContent || '';
            if (text.includes('PMCLI')) {
                if (text.includes('中断')) taskStatus = 'interrupted';
                else if (text.includes('失败')) taskStatus = 'failed';
                break;
            }
        }
        
        // 检查最后一条消息是否有错误
        const turns = document.querySelectorAll('.chat-turn');
        const lastTurn = turns[turns.length - 1];
        let hasError = false;
        let errorText = '';
        
        if (lastTurn) {
            const text = lastTurn.textContent || '';
            hasError = text.includes('错误') || 
                      text.includes('失败') || 
                      text.includes('exception') ||
                      text.includes('error');
            errorText = text.slice(0, 100);
        }
        
        return {
            isInterrupted: taskStatus === 'interrupted' || taskStatus === 'failed',
            taskStatus,
            hasError,
            errorText
        };
    })()`);
    
    return interruptStatus;
}
```

### 2.4 用户操作提示中断判断

```javascript
/**
 * 检查是否有用户操作提示（需要人工介入）
 * 特征：出现"请确认"、"请选择"、"删除/保留"对话框等
 */
async function checkUserPrompt(trae) {
    const promptStatus = await trae.evaluate(`(() => {
        const result = {
            hasPrompt: false,
            promptType: null,
            buttons: [],
            promptText: ''
        };
        
        // 查找提示对话框或特殊按钮
        const allButtons = document.querySelectorAll('button');
        
        allButtons.forEach(btn => {
            const text = btn.textContent?.trim() || '';
            const ariaLabel = btn.getAttribute('aria-label') || '';
            
            // 删除/保留按钮（任务结束后的选择）
            if (text.includes('删除') || ariaLabel.includes('删除')) {
                result.hasPrompt = true;
                result.promptType = 'delete_or_keep';
                result.buttons.push({ action: 'delete', text });
            }
            if (text.includes('保留') || ariaLabel.includes('保留')) {
                result.buttons.push({ action: 'keep', text });
            }
            
            // 确认/取消按钮
            if (text.includes('确认') || text.includes('确定')) {
                result.hasPrompt = true;
                result.promptType = 'confirm';
                result.buttons.push({ action: 'confirm', text });
            }
            if (text === '取消' || ariaLabel === '取消') {
                result.buttons.push({ action: 'cancel', text });
            }
        });
        
        // 查找提示文本
        if (result.hasPrompt) {
            const lastTurn = document.querySelector('.chat-turn:last-child');
            if (lastTurn) {
                result.promptText = lastTurn.textContent?.slice(0, 100) || '';
            }
        }
        
        return result;
    })()`);
    
    return promptStatus;
}
```

---

## 3. 按钮列表与分类

### 3.1 任务相关按钮

| 按钮 | aria-label | 触发条件 | 处理方式 |
|------|-----------|---------|---------|
| **后台运行** | "后台运行" | 终端执行超时 | 点击让终端后台执行 |
| **取消** | "取消" | 终端执行超时/用户取消 | 点击取消当前操作 |
| **删除** | "删除" | 任务完成后 | 点击删除任务历史 |
| **保留** | "保留" | 任务完成后 | 点击保留任务历史 |

### 3.2 消息操作按钮

| 按钮 | aria-label | 位置 | 触发方式 | 用户消息 | AI消息 |
|------|-----------|------|---------|---------|--------|
| **复制全部** | "复制全部" | 消息底部 | Hover显示 | ❌ 无 | ✅ 有 |
| **复制** | "复制" | 代码块右上角 | 始终可见 | ✅ 有 | ✅ 有 |
| **插入到光标处** | "插入到光标处" | 代码块右上角 | 始终可见 | ❌ 无 | ✅ 有 |
| **添加到新文件** | "添加到新文件" | 代码块右上角 | 始终可见 | ❌ 无 | ✅ 有 |
| **赞** | "赞" | 消息底部 | Hover显示 | ❌ 无 | ✅ 有 |
| **踩** | "踩" | 消息底部 | Hover显示 | ❌ 无 | ✅ 有 |
| **重试** | "重试" | 消息底部 | Hover显示 | ❌ 无 | ✅ 有 |

### 3.3 按钮检测代码

```javascript
/**
 * 获取消息中的所有按钮
 * @param {number} messageIndex 消息索引
 */
async function getMessageButtons(trae, messageIndex) {
    const buttons = await trae.evaluate(`(() => {
        const turns = document.querySelectorAll('.chat-turn');
        const turn = turns[${messageIndex}];
        
        if (!turn) return [];
        
        const buttonElements = turn.querySelectorAll('button');
        const buttons = [];
        
        buttonElements.forEach((btn, index) => {
            const ariaLabel = btn.getAttribute('aria-label') || '';
            const text = btn.textContent?.trim() || '';
            const className = btn.className || '';
            const style = window.getComputedStyle(btn);
            
            buttons.push({
                index,
                ariaLabel,
                text,
                className: className.slice(0, 50),
                isVisible: style.display !== 'none' && style.visibility !== 'hidden',
                isCopyButton: ariaLabel.includes('复制'),
                isCopyAllButton: ariaLabel === '复制全部',
                isActionButton: ariaLabel.includes('赞') || ariaLabel.includes('踩') || ariaLabel.includes('重试')
            });
        });
        
        return buttons;
    })()`);
    
    return buttons;
}
```

---

## 4. 复制按钮操作（完整流程）

### 4.1 复制流程图

```
开始
  ↓
连接CDP
  ↓
切换到PMCLI任务
  ↓
等待任务完成 ←──→ 检查状态（每2秒）
  ↓                              ↓
任务完成 ────────────────────────→ 超时
  ↓                                ↓
定位最后一轮对话                    结束
  ↓
├─→ 操作用户消息（直接提取innerText）
│
└─→ 操作AI消息
      ↓
    滚动到视图
      ↓
    Hover消息（mouseenter事件）
      ↓
    查找"复制全部"按钮
      ↓
    点击复制按钮
      ↓
    从系统剪贴板读取
      ↓
    保存为MD文件
      ↓
    结束
```

### 4.2 完整复制代码

```javascript
/**
 * 点击AI消息复制按钮并从剪贴板读取
 */
async function copyAIMessage(trae, aiIndex) {
    // 1. 滚动到AI消息
    await trae.evaluate(`(() => {
        const turns = document.querySelectorAll('.chat-turn');
        const aiTurn = turns[${aiIndex}];
        aiTurn.scrollIntoView({ behavior: 'instant', block: 'center' });
    })()`);
    await new Promise(r => setTimeout(r, 500));

    // 2. Hover AI消息显示按钮
    await trae.evaluate(`(() => {
        const turns = document.querySelectorAll('.chat-turn');
        const aiTurn = turns[${aiIndex}];
        
        // 触发mouseenter事件
        const event = new MouseEvent('mouseenter', { 
            bubbles: true,
            cancelable: true 
        });
        aiTurn.dispatchEvent(event);
    })()`);
    await new Promise(r => setTimeout(r, 600));

    // 3. 点击复制全部按钮
    const copyResult = await trae.evaluate(`(() => {
        const turns = document.querySelectorAll('.chat-turn');
        const aiTurn = turns[${aiIndex}];
        
        // 优先查找"复制全部"按钮
        let copyBtn = aiTurn.querySelector('button[aria-label="复制全部"]');
        
        // 备选：查找其他复制按钮
        if (!copyBtn) {
            copyBtn = aiTurn.querySelector('button[aria-label*="复制"]');
        }
        
        if (copyBtn) {
            copyBtn.click();
            return { 
                success: true, 
                buttonText: copyBtn.getAttribute('aria-label') 
            };
        }
        
        return { success: false, error: '未找到复制按钮' };
    })()`);

    if (!copyResult.success) {
        console.log(`⚠️ ${copyResult.error}`);
        return null;
    }

    console.log(`✅ 已点击复制按钮: ${copyResult.buttonText}`);
    
    // 等待复制到剪贴板
    await new Promise(r => setTimeout(r, 800));

    // 4. 从系统剪贴板读取
    const { execSync } = require('child_process');
    let content = '';
    
    try {
        // 使用PowerShell读取剪贴板，指定UTF8编码
        content = execSync(
            'powershell.exe -command "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Get-Clipboard"', 
            { encoding: 'utf-8', timeout: 5000 }
        );
        
        // 检查编码是否正确
        if (content.includes('��')) {
            throw new Error('编码错误');
        }
        
        console.log(`✅ 从剪贴板读取: ${content.length} 字符`);
        return content;
    } catch (e) {
        console.log(`⚠️ 剪贴板读取失败: ${e.message}`);
        console.log('   回退到DOM提取...');
        
        // 回退方案：从DOM提取
        content = await trae.evaluate(`(() => {
            const turns = document.querySelectorAll('.chat-turn');
            const aiTurn = turns[${aiIndex}];
            const body = aiTurn.querySelector('[class*="markdown-body"]') || aiTurn;
            return body.innerText || '';
        })()`);
        
        console.log(`✅ DOM提取: ${content.length} 字符`);
        return content;
    }
}
```

---

## 5. 完整使用示例

### 5.1 推荐脚本：copy-from-clipboard-fixed.js

**使用**:
```bash
# 默认300秒超时
node copy-from-clipboard-fixed.js

# 自定义60秒超时
node copy-from-clipboard-fixed.js 60
```

**输出示例**:
```
=== 点击复制按钮 + 从剪贴板读取（修复版）===

最大等待时间: 60秒

✅ 已连接到 Trae CN CDP

--- 切换到 PMCLI 任务 ---
✅ 已切换到 PMCLI 任务

--- 等待任务完成 ---

✅ 任务已完成! (检查1次)

--- 定位最后一轮对话 ---
找到对话:
  - 用户消息 #4
  - AI消息 #5

--- 操作用户消息 ---
✅ 用户消息已提取: 69 字符

--- 操作AI消息复制按钮 ---
✅ 已点击AI复制按钮
   内容已复制到系统剪贴板

--- 从系统剪贴板读取内容 ---
✅ 从剪贴板读取: 3904 字符

--- 保存到Markdown文件 ---
✅ 文件已保存: output/PMCLI_clipboard_2026-04-29T01-42-41.md
   文件大小: 5.05 KB

✅ 完成!
   文件: output/PMCLI_clipboard_2026-04-29T01-42-41.md
   用户消息 #4: 69 字符
   AI消息 #5: 3904 字符 (✅ 剪贴板)
```

### 5.2 生成的MD文件格式

```markdown
# PMCLI 最后一次会话记录

> **生成时间**: 2026/4/29 09:42:41  
> **任务类型**: PMCLI  
> **等待时间**: 7.0秒  
> **用户消息**: #4  
> **AI消息**: #5  
> **AI数据来源**: ✅ 剪贴板读取

---

## 💬 用户请求

```
用户消息内容...
```

---

## 🤖 AI响应

```
AI响应内容...
```

---

*从剪贴板读取 - 自动生成*
```

---

## 6. 故障排除

### 6.1 常见问题

| 问题 | 原因 | 解决方案 |
|------|------|---------|
| 找不到任务 | 任务未创建或名称不匹配 | 确认PMCLI任务存在 |
| 复制按钮未点击 | AI消息未完成生成 | 等待任务完成后再执行 |
| 剪贴板乱码 | 编码问题 | 脚本已修复UTF8编码 |
| 剪贴板读取失败 | PowerShell权限/无内容 | 回退到DOM提取 |
| 格式丢失 | 使用textContent | 改用innerText |

### 6.2 调试方法

```javascript
// 打印所有按钮信息
const allButtons = await trae.evaluate(`(() => {
    const buttons = document.querySelectorAll('button');
    return Array.from(buttons).map(btn => ({
        text: btn.textContent?.trim(),
        ariaLabel: btn.getAttribute('aria-label'),
        className: btn.className?.slice(0, 50)
    }));
})()`);
console.log('所有按钮:', allButtons);

// 打印消息结构
const messageStructure = await trae.evaluate(`(() => {
    const turn = document.querySelectorAll('.chat-turn')[0];
    return turn.innerHTML.slice(0, 1000);
})()`);
console.log('消息结构:', messageStructure);
```

---

## 7. 相关文件

- `core-scripts/trae-cdp.js` - CDP连接核心模块
- `scheme1-serializer.js` - Markdown序列化器
- `BUTTON_SCRIPTS_README.md` - 本文档

---

*文档版本: 2024-04-29*  
*最后更新: 完整版 - 包含状态判断、按钮操作、剪贴板读取*
