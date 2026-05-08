# Trae 任务完成通知飞书群聊实现调研

**调研时间**: 2026-05-08
**调研范围**: `/workspace/mvp-runner/src`
**调研目的**: 分析 Trae 任务完成后，结果如何回传到飞书群聊

---

## 1. 整体架构

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   飞书群聊       │────▶│  LarkBot (WS)    │────▶│ MultiTaskRunner │
│   @PMCLI xxx    │     │  接收消息         │     │  任务处理        │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                               ▲                          │
                               │                          │
                        ┌──────┴──────┐                   │
                        │ replyPost() │◀──────────────────┘
                        │ 发送结果     │
                        └─────────────┘
```

## 2. 核心组件

### 2.1 LarkBot (`src/lark/client.ts`)

飞书机器人客户端，负责 WebSocket 长连接和消息收发。

**关键方法**:

```typescript
// 启动 WebSocket 长连接，监听群消息
async start(handler: LarkHandler): Promise<void> {
  const dispatcher = new lark.EventDispatcher({}).register({
    'im.message.receive_v1': async (data: any) => {
      // 处理收到的 @PMCLI 消息
      // ...
    },
  });
  await this.wsClient.start({ eventDispatcher: dispatcher });
}

// 发送纯文本消息到群聊（用于上线/下线通知）
async sendText(text: string): Promise<void> {
  await this.client.im.message.create({
    params: { receive_id_type: 'chat_id' },
    data: {
      receive_id: this.chatId,
      msg_type: 'text',
      content: JSON.stringify({ text }),
    },
  });
}

// 回复消息（引用回复）
async reply(messageId: string, text: string): Promise<void> {
  await this.client.im.message.reply({
    path: { message_id: messageId },
    data: { msg_type: 'text', content: JSON.stringify({ text }) },
  });
}

// 回复富文本消息（支持长内容）
async replyPost(messageId: string, title: string, body: string): Promise<void> {
  const content = {
    zh_cn: {
      title,
      content: [[{ tag: 'text', text: body }]],
    },
  };
  await this.client.im.message.reply({
    path: { message_id: messageId },
    data: { msg_type: 'post', content: JSON.stringify(content) },
  });
}
```

### 2.2 MultiTaskRunner (`src/runner-multi.ts`)

多任务运行器，核心任务处理逻辑。

**消息处理流程** (`handle` 方法):

```typescript
handle = async (msg: LarkInbound, botKeyword: string): Promise<void> => {
  // 1. 白名单校验
  const allowed = this.cfg.pmbot.allowed_users;
  if (allowed.length > 0 && !allowed.includes(msg.senderId)) {
    await this.replyByKeyword(botKeyword, msg.messageId, `⛔ 权限不足`);
    return;
  }

  // 2. 解析指令
  const parsed = parseCommand(msg.text, this.cfg.pmbot.default_slot, botKeyword);
  
  // 3. 立即 ACK
  if (this.cfg.pmbot.ack_on_receive) {
    await this.replyByKeyword(botKeyword, msg.messageId, `✅ 已收到，排队中…`);
  }

  // 4. 加锁执行任务
  await withChatMutex(`run-${runId}`, async () => {
    // 4.1 切换任务槽
    await switchTask(this.cdp, targetSlot);
    
    // 4.2 填充提示词
    await fillPrompt(this.cdp, parsed.prompt);
    
    // 4.3 提交任务
    await submit(this.cdp);
    await this.sendByKeyword(botKeyword, `📤 已提交，等待 AI 响应…`);
    
    // 4.4 等待响应（心跳检测）
    const response = await waitResponse(this.cdp, {
      timeoutMs: this.cfg.pmbot.response_timeout_ms,
      taskName: targetTaskName || undefined,
    });
    
    // 4.5 保存结果到文件
    this.persist(runId, parsed, response, duration, msg.senderId, targetTaskName, targetSlot);
    
    // 4.6 发送结果到飞书群聊 ⭐ 核心
    await this.replyByKeyword(botKeyword, msg.messageId,
      `🤖 ${taskDisplay} 响应 (${Math.round(duration / 1000)}s)`,
      body  // 响应内容
    );
  });
};
```

**回复方法**:

```typescript
// 根据 keyword 查找对应的 bot 并发送富文本回复
private async replyByKeyword(keyword: string, messageId: string, text: string, body?: string): Promise<void> {
  const bot = this.bots.find(b => b.keyword === keyword);
  if (!bot) return;
  
  if (body) {
    await bot.replyPost(messageId, text, body);  // 富文本（支持长内容）
  } else {
    await bot.reply(messageId, text);  // 纯文本
  }
}
```

### 2.3 启动入口 (`src/index.ts`)

```typescript
async function main() {
  // 1. 加载配置
  const cfg = loadConfig();
  
  // 2. 加载工作空间
  const workspaces = loadWorkspaces();
  
  // 3. 连接 CDP
  const cdp = new CDPClient({ host: cfg.cdp.host, port: cfg.cdp.port });
  await cdp.connect();
  
  // 4. 为每个工作空间创建 Bot
  const bots: LarkBot[] = [];
  for (const ws of workspaces) {
    const bot = new LarkBot({
      appId: ws.larkAppId,
      appSecret: ws.larkAppSecret,
      chatId: ws.chatId,
      mentionKeyword: ws.mentionKeyword,
    });
    bots.push(bot);
  }
  
  // 5. 创建 Runner
  const runner = new MultiTaskRunner(cfg, cdp, bots, workspaces);
  
  // 6. 启动所有 Bot
  for (const bot of bots) {
    await bot.start(runner.handle);  // 注册消息处理器
  }
  
  // 7. 上线通知
  if (cfg.pmbot.online_notice) {
    await bot.sendText(`🟢 ${bot.keyword} Runner 上线`);
  }
}
```

## 3. 通知流程详解

### 3.1 消息触发链路

```
用户发送 @PMCLI <prompt> 
    ↓
Lark WebSocket 接收消息
    ↓
EventDispatcher 解析 im.message.receive_v1
    ↓
LarkBot 检查是否 @PMCLI
    ↓
调用 runner.handle(inbound, keyword)
    ↓
MultiTaskRunner 开始执行任务
```

### 3.2 任务完成通知链路

```
任务执行完成 (waitResponse 返回)
    ↓
持久化结果到 runs/{taskName}/{runId}.md
    ↓
调用 replyByKeyword(botKeyword, msg.messageId, title, body)
    ↓
LarkBot.replyPost(messageId, title, body)
    ↓
飞书 API 回复消息到群聊
```

### 3.3 通知类型

| 场景 | 方法 | 说明 |
|------|------|------|
| 收到指令 ACK | `reply()` | 纯文本 "✅ 已收到，排队中…" |
| 任务提交 | `sendText()` | 纯文本 "📤 已提交，等待 AI 响应…" |
| 任务完成 | `replyPost()` | 富文本，支持长内容 |
| 执行失败 | `reply()` | 纯文本 "❌ 执行失败：{error}" |
| 上线/下线 | `sendText()` | 纯文本 |

## 4. 配置说明

### 4.1 工作空间配置 (`src/workspace/loader.ts`)

```typescript
export interface WorkspaceConfig {
  name: string;           // 工作空间名称
  dir: string;             // 工作目录
  envFile: string;         // 环境变量文件
  larkAppId: string;       // 飞书 App ID
  larkAppSecret: string;  // 飞书 App Secret
  chatId: string;          // 群聊 ID
  mentionKeyword: string;  // @ 关键字 (如 PMCLI, DEVCLI)
}
```

### 4.2 主配置 (`src/config.ts`)

```typescript
export interface AppConfig {
  lark: {
    appId: string;
    appSecret: string;
    chatId: string;
    mentionKeyword: string;
  };
  cdp: {
    host: string;
    port: number;
  };
  pmbot: PmbotConfig;
}

interface PmbotConfig {
  allowed_users: string[];       // 白名单用户
  ack_on_receive: boolean;       // 收到消息立即 ACK
  online_notice: boolean;         // 上线通知
  response_timeout_ms: number;    // 响应超时时间
  response_max_chars: number;     // 最大响应字符数
  workspaces_base_dir: string;    // 工作空间基础目录
  default_slot: number;           // 默认任务槽
}
```

## 5. 关键代码片段

### 5.1 结果发送到群聊

```typescript
// runner-multi.ts 第 157-163 行
// 发送结果到群聊
log('[%s] sending reply to group, length=%d', runId, body.length);
try {
  await this.replyByKeyword(botKeyword, msg.messageId,
    `🤖 ${taskDisplay} 响应 (${Math.round(duration / 1000)}s)`,
    body
  );
  log('[%s] reply sent successfully', runId);
} catch (replyErr) {
  // 降级处理：截断内容发送
  log('[%s] replyPost failed: %s', runId, (replyErr as Error).message);
  try {
    await this.replyByKeyword(botKeyword, msg.messageId, 
      `🤖 ${taskDisplay} 响应:\n${body.slice(0, 1000)}`);
  } catch (fallbackErr) {
    log('[%s] fallback reply also failed: %s', runId, (fallbackErr as Error).message);
  }
}
```

### 5.2 富文本消息格式

```typescript
// lark/client.ts 第 151-157 行
async replyPost(messageId: string, title: string, body: string): Promise<void> {
  const content = {
    zh_cn: {
      title,
      content: [[{ tag: 'text', text: body }]],
    },
  };
  await this.client.im.message.reply({
    path: { message_id: messageId },
    data: {
      msg_type: 'post',
      content: JSON.stringify(content),
    },
  });
}
```

## 6. 结论

**当前实现方式**:
1. 使用飞书 WebSocket 长连接接收群聊 @PMCLI 消息
2. 任务完成后，调用 `replyPost()` 方法**引用回复**触发消息
3. 回复消息包含标题和响应正文（富文本格式）
4. 响应内容同时持久化到 `runs/{taskName}/{runId}.md` 文件

**关键入口**: [runner-multi.ts](file:///workspace/mvp-runner/src/runner-multi.ts#L157-L173) 第 157-173 行

**通知方法**: [LarkBot.replyPost()](file:///workspace/mvp-runner/src/lark/client.ts#L151-L170)

---

**评审要点**:
1. 当前实现是否满足长响应场景的需求？
2. 是否有考虑消息截断后的完整内容查看方式？
3. 错误处理降级策略是否完善？
