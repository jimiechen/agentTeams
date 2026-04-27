import debug from 'debug';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { CDPClient } from './cdp/client.js';

import { switchTask } from './actions/switch-task.js';
import { fillPrompt } from './actions/fill-prompt.js';
import { submit } from './actions/submit.js';
import { waitResponse } from './actions/wait-response.js';
import { withChatMutex } from './mutex.js';
import { parseCommand } from './lark/parser.js';
import type { LarkBot, LarkInbound } from './lark/client.js';
import type { AppConfig } from './config.js';

const log = debug('mvp:runner-lark');

export class LarkRunner {
  private runsDir: string;

  constructor(
    private cfg: AppConfig,
    private cdp: CDPClient,
    private lark: LarkBot,
  ) {
    this.runsDir = path.resolve('./runs');
    mkdirSync(this.runsDir, { recursive: true });
  }

  /** 注册到 LarkBot.start(handler) 的飞书消息回调。 */
  handle = async (msg: LarkInbound): Promise<void> => {
    // 1. 白名单
    const allowed = this.cfg.pmbot.allowed_users;
    if (allowed.length > 0 && !allowed.includes(msg.senderId)) {
      log('reject sender=%s (not in allowlist)', msg.senderId);
      await this.lark.reply(msg.messageId, `⛔ 权限不足`);
      return;
    }

    // 2. 解析指令
    const parsed = parseCommand(msg.text, this.cfg.pmbot.default_slot, this.cfg.pmbot.mention_keyword);
    if (!parsed || !parsed.prompt) {
      await this.lark.reply(msg.messageId,
        `⚠️ 指令为空。用法：\n` +
        `  @${this.cfg.pmbot.mention_keyword} <prompt>\n` +
        `  @${this.cfg.pmbot.mention_keyword} #<slot编号> <prompt>`);
      return;
    }

    // 3. 立即 ACK
    if (this.cfg.pmbot.ack_on_receive) {
      await this.lark.reply(msg.messageId,
        `✅ 已收到 (slot=${parsed.slot})，排队中…`);
    }

    // 4. 加锁执行四步
    const runId = new Date().toISOString().replace(/[:.]/g, '-');
    const startedAt = Date.now();

    try {
      await withChatMutex(`run-${runId}`, async () => {
        log('[%s] slot=%d prompt="%s"', runId, parsed.slot, parsed.prompt.slice(0, 40));

        await this.lark.sendText(`🔀 切换到 slot #${parsed.slot}…`);
        await switchTask(this.cdp, parsed.slot);

        await fillPrompt(this.cdp, parsed.prompt);

        await submit(this.cdp);
        await this.lark.sendText(`📤 已提交，等待 AI 响应…`);

        const response = await waitResponse(this.cdp, {
          timeoutMs: this.cfg.pmbot.response_timeout_ms,
        });

        const duration = Date.now() - startedAt;
        this.persist(runId, parsed, response, duration, msg.senderId);

        const maxChars = this.cfg.pmbot.response_max_chars;
        const body = response.length > maxChars
          ? response.slice(0, maxChars) + `\n\n… (truncated, full ${response.length} chars saved to runs/${runId}.md)`
          : response;

        // 发送结果到群聊
        log('[%s] sending reply to group, length=%d', runId, body.length);
        try {
          await this.lark.replyPost(
            msg.messageId,
            `🤖 AI 响应 (slot ${parsed.slot}, ${Math.round(duration / 1000)}s)`,
            body,
          );
          log('[%s] reply sent successfully', runId);
        } catch (replyErr) {
          log('[%s] replyPost failed: %s', runId, (replyErr as Error).message);
          // 降级为普通文本回复
          try {
            await this.lark.reply(msg.messageId, `🤖 AI 响应:\n${body.slice(0, 1000)}`);
            log('[%s] fallback reply sent', runId);
          } catch (fallbackErr) {
            log('[%s] fallback reply also failed: %s', runId, (fallbackErr as Error).message);
          }
        }

        log('[%s] done in %dms', runId, duration);
      });
    } catch (err) {
      const errMsg = (err as Error).message;
      log('[%s] failed: %s', runId, errMsg);
      await this.lark.reply(msg.messageId, `❌ 执行失败：${errMsg}`);
      this.persist(runId, parsed, `<ERROR: ${errMsg}>`, Date.now() - startedAt, msg.senderId);
    }
  };

  private persist(
    runId: string,
    parsed: { slot: number; prompt: string; raw: string },
    response: string,
    durationMs: number,
    senderId: string,
  ): void {
    const file = path.join(this.runsDir, `${runId}.md`);
    const md = [
      `# Run ${runId}`,
      ``,
      `- **Slot**: ${parsed.slot}`,
      `- **Sender**: ${senderId}`,
      `- **Duration**: ${durationMs} ms`,
      ``,
      `## Prompt`,
      ``,
      `> ${parsed.prompt.replace(/\n/g, '\n> ')}`,
      ``,
      `## Response`,
      ``,
      response,
      ``,
    ].join('\n');
    writeFileSync(file, md, 'utf-8');
    log('persisted → %s', file);
  }
}
