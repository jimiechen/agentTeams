import lark from '@larksuiteoapi/node-sdk';
import debug from 'debug';
import type { WorkspaceLogger } from '../utils/workspace-logger.js';

const log = debug('mvp:lark');

export interface LarkInbound {
  chatId: string;
  messageId: string;
  senderId: string;
  text: string;
  rawContent: string;
  mentionedKeywords: string[];
}

export type LarkHandler = (msg: LarkInbound, keyword: string) => Promise<void> | void;

export class LarkBot {
  private client: lark.Client;
  private wsClient: lark.WSClient;
  private chatId: string;
  private mentionKeyword: string;
  private logger?: WorkspaceLogger;

  /** 关键字访问器 */
  get keyword(): string {
    return this.mentionKeyword;
  }

  constructor(opts: {
    appId: string;
    appSecret: string;
    chatId: string;
    mentionKeyword: string;
    workspacePath?: string;
    logger?: WorkspaceLogger;
  }) {
    this.chatId = opts.chatId;
    this.mentionKeyword = opts.mentionKeyword;
    this.logger = opts.logger;

    this.client = new lark.Client({
      appId: opts.appId,
      appSecret: opts.appSecret,
      disableTokenCache: false,
    });
    this.wsClient = new lark.WSClient({
      appId: opts.appId,
      appSecret: opts.appSecret,
    });
  }

  /** 设置logger（用于动态绑定工作空间） */
  setLogger(logger: WorkspaceLogger) {
    this.logger = logger;
  }

  /** 启动飞书 WS 长连接，收到 @PMCLI 的群消息时触发 handler。 */
  async start(handler: LarkHandler): Promise<void> {
    log('Starting LarkBot with chat_id=%s', this.chatId);
    this.logger?.info('Starting LarkBot', { chatId: this.chatId, keyword: this.mentionKeyword });

    const dispatcher = new lark.EventDispatcher({}).register({
      'im.message.receive_v1': async (data: any) => {
        try {
          log('Received message event: %o', data);
          const msg = data.message;

          // 只处理目标群
          if (msg.chat_id !== this.chatId) {
            log('skip: chat_id mismatch (%s)', msg.chat_id);
            this.logger?.debug('Skip message: chat_id mismatch', { chatId: msg.chat_id });
            return { code: 0 };
          }

          // 只处理群聊 text 消息（暂不支持富文本/图片/文件）
          if (msg.chat_type !== 'group' || msg.message_type !== 'text') {
            log('skip: not a group text (type=%s)', msg.message_type);
            this.logger?.debug('Skip message: not group text', { messageType: msg.message_type });
            return { code: 0 };
          }

          const content = safeJsonParse<{ text?: string }>(msg.content, {});
          const rawText = content.text ?? '';

          log('checking message: text="%s", mentions=%o', rawText.slice(0, 50), msg.mentions);

          // 检查是否 @ 了 PMCLI
          const mentions: Array<{ key: string; name: string; id: any }> = msg.mentions ?? [];
          const hitByMention = mentions.some(
            m => (m.name ?? '').toUpperCase() === this.mentionKeyword.toUpperCase(),
          );

          // 放宽文本匹配条件：支持 @PMCLI 或 PMCLI（不分大小写）
          const keywordPattern = new RegExp(`@?${escapeRegExp(this.mentionKeyword)}`, 'i');
          const hitByText = keywordPattern.test(rawText);

          log('hitByMention=%s, hitByText=%s, keyword=%s', hitByMention, hitByText, this.mentionKeyword);

          this.logger?.logLarkEvent('message_check', {
            hitByMention,
            hitByText,
            keyword: this.mentionKeyword,
            textPreview: rawText.slice(0, 50),
          });

          if (!hitByMention && !hitByText) {
            log('skip: no @%s mention in text="%s"', this.mentionKeyword, rawText.slice(0, 50));
            this.logger?.debug('Skip message: no mention', { keyword: this.mentionKeyword });
            return { code: 0 };
          }

          // 把 @_user_xxx 占位符换成 @PMCLI 便于 parser 处理
          const cleanedText = rawText.replace(/@_user_\d+/g, `@${this.mentionKeyword}`);

          const inbound: LarkInbound = {
            chatId: msg.chat_id,
            messageId: msg.message_id,
            senderId: data.sender?.sender_id?.open_id ?? 'unknown',
            text: cleanedText,
            rawContent: msg.content,
            mentionedKeywords: [this.mentionKeyword],
          };

          log('inbound id=%s sender=%s text="%s"',
            inbound.messageId, inbound.senderId, inbound.text.slice(0, 80));

          this.logger?.logLarkEvent('message_received', {
            messageId: inbound.messageId,
            senderId: inbound.senderId,
            textPreview: inbound.text.slice(0, 80),
          });

          // 异步处理，立即 ack 飞书服务器（prevent WS 心跳超时）
          Promise.resolve(handler(inbound, this.mentionKeyword)).catch(err => {
            log('handler error: %s', (err as Error).message);
            this.logger?.error('Handler error', {
              error: (err as Error).message,
              stack: (err as Error).stack,
            });
          });

          return { code: 0 };
        } catch (err) {
          const errorMsg = (err as Error).stack ?? (err as Error).message;
          log('dispatch error: %s', errorMsg);
          this.logger?.error('Dispatch error', {
            error: (err as Error).message,
            stack: (err as Error).stack,
          });
          return { code: 0 };
        }
      },
    });

    await this.wsClient.start({ eventDispatcher: dispatcher });
    log('lark ws started, chat_id=%s keyword=@%s', this.chatId, this.mentionKeyword);
    this.logger?.info('Lark WebSocket started', { chatId: this.chatId, keyword: this.mentionKeyword });
  }

  /** 往目标群发纯文本消息。 */
  async sendText(text: string): Promise<void> {
    this.logger?.logLarkEvent('send_text', { textPreview: text.slice(0, 50) });
    await this.client.im.message.create({
      params: { receive_id_type: 'chat_id' },
      data: {
        receive_id: this.chatId,
        msg_type: 'text',
        content: JSON.stringify({ text }),
      },
    });
  }

  /** 回复某条消息（引用回复，带上下文）。失败降级为 sendText。 */
  async reply(messageId: string, text: string): Promise<void> {
    try {
      this.logger?.logLarkEvent('reply', { messageId, textPreview: text.slice(0, 50) });
      await this.client.im.message.reply({
        path: { message_id: messageId },
        data: {
          msg_type: 'text',
          content: JSON.stringify({ text }),
        },
      });
    } catch (err) {
      log('reply failed, fallback to sendText: %s', (err as Error).message);
      this.logger?.error('Reply failed, fallback to sendText', {
        error: (err as Error).message,
        messageId,
      });
      await this.sendText(text);
    }
  }

  /** 回复富文本 post 消息，适合长内容（飞书对 text 消息有长度限制）。 */
  async replyPost(messageId: string, title: string, body: string): Promise<void> {
    const content = {
      zh_cn: {
        title,
        content: [[{ tag: 'text', text: body }]],
      },
    };
    try {
      this.logger?.logLarkEvent('reply_post', { messageId, title });
      await this.client.im.message.reply({
        path: { message_id: messageId },
        data: {
          msg_type: 'post',
          content: JSON.stringify(content),
        },
      });
    } catch (err) {
      log('replyPost failed, fallback to sendText: %s', (err as Error).message);
      this.logger?.error('ReplyPost failed, fallback to sendText', {
        error: (err as Error).message,
        messageId,
      });
      await this.sendText(`${title}\n${body}`);
    }
  }
}

function safeJsonParse<T>(s: string, fallback: T): T {
  try { return JSON.parse(s) as T; } catch { return fallback; }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
