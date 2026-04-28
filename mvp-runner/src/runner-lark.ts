import debug from 'debug';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { CDPClient } from './cdp/client.js';

import { switchTask } from './actions/switch-task.js';
import { fillPrompt } from './actions/fill-prompt.js';
import { submit } from './actions/submit.js';
import { waitResponse } from './actions/wait-response.js';
import { scanTasks, findTaskSlot, type TaskInfo } from './actions/scan-tasks.js';
import { withChatMutex } from './mutex.js';
import { parseCommand } from './lark/parser.js';
import type { LarkBot, LarkInbound } from './lark/client.js';
import type { AppConfig } from './config.js';

const log = debug('mvp:runner-lark');

// 任务到工作空间的映射
const TASK_WORKSPACE_MAP: Record<string, string> = {
  'PMCLI': 'd:\\TraeProject\\agentTeams\\workspaces\\PMCLI',
  'DEVCLI': 'd:\\TraeProject\\agentTeams\\workspaces\\DEVCLI',
};

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
        `  @PMCLI <prompt> - 使用PMCLI执行任务\n` +
        `  @DEVCLI <prompt> - 使用DEVCLI执行任务\n` +
        `  @PMCLI #<slot编号> <prompt> - 指定slot`);
      return;
    }

    // 3. 扫描任务列表，匹配mention的任务
    let targetSlot = parsed.slot;
    let targetTaskName = parsed.mentionTask;
    let taskInfo: TaskInfo | null = null;

    try {
      const tasks = await scanTasks(this.cdp);
      
      if (targetTaskName) {
        // 根据mention的任务名查找slot
        const matchedSlot = findTaskSlot(tasks, targetTaskName);
        if (matchedSlot >= 0) {
          targetSlot = matchedSlot;
          taskInfo = tasks.find(t => t.index === matchedSlot) || null;
          log('Matched task "%s" to slot #%d, status=%s', targetTaskName, targetSlot, taskInfo?.status);
        } else {
          log('Task "%s" not found in task list, using default slot #%d', targetTaskName, targetSlot);
          await this.lark.reply(msg.messageId, `⚠️ 未找到任务 "${targetTaskName}"，使用默认slot #${targetSlot}`);
        }
      } else {
        // 没有mention具体任务，使用当前选中的任务
        const selectedTask = tasks.find(t => t.isSelected);
        if (selectedTask) {
          targetTaskName = selectedTask.name;
          taskInfo = selectedTask;
          log('No specific task mentioned, using currently selected task: "%s" slot #%d', targetTaskName, targetSlot);
        }
      }
    } catch (err) {
      log('Failed to scan tasks: %s', (err as Error).message);
    }

    // 4. 立即 ACK
    const taskDisplay = targetTaskName || `slot #${targetSlot}`;
    if (this.cfg.pmbot.ack_on_receive) {
      await this.lark.reply(msg.messageId,
        `✅ 已收到 (${taskDisplay})，排队中…`);
    }

    // 5. 加锁执行
    const runId = new Date().toISOString().replace(/[:.]/g, '-');
    const startedAt = Date.now();

    try {
      await withChatMutex(`run-${runId}`, async () => {
        log('[%s] task=%s slot=%d prompt="%s"', runId, targetTaskName || 'unknown', targetSlot, parsed.prompt.slice(0, 40));

        // 切换到目标slot
        await this.lark.sendText(`🔀 切换到 ${taskDisplay}…`);
        await switchTask(this.cdp, targetSlot);

        // 填充提示词
        await fillPrompt(this.cdp, parsed.prompt);

        // 提交
        await submit(this.cdp);
        await this.lark.sendText(`📤 已提交，等待 AI 响应…`);

        // 等待响应（使用任务名进行心跳检查）
        const response = await waitResponse(this.cdp, {
          timeoutMs: this.cfg.pmbot.response_timeout_ms,
          taskName: targetTaskName || 'PMCLI', // 使用任务名进行心跳检查
        });

        const duration = Date.now() - startedAt;
        
        // 保存到对应工作空间
        this.persistToWorkspace(runId, targetTaskName, parsed, response, duration, msg.senderId);
        
        // 同时保存到默认runs目录
        this.persist(runId, parsed, response, duration, msg.senderId, targetTaskName, targetSlot);

        const maxChars = this.cfg.pmbot.response_max_chars;
        const taskDirName = targetTaskName || 'unknown';
        const body = response.length > maxChars
          ? response.slice(0, maxChars) + `\n\n… (truncated, full ${response.length} chars saved to runs/${taskDirName}/${runId}.md)`
          : response;

        // 发送结果到群聊
        log('[%s] sending reply to group, length=%d', runId, body.length);
        try {
          await this.lark.replyPost(
            msg.messageId,
            `🤖 ${taskDisplay} 响应 (${Math.round(duration / 1000)}s)`,
            body,
          );
          log('[%s] reply sent successfully', runId);
        } catch (replyErr) {
          log('[%s] replyPost failed: %s', runId, (replyErr as Error).message);
          // 降级为普通文本回复
          try {
            await this.lark.reply(msg.messageId, `🤖 ${taskDisplay} 响应:\n${body.slice(0, 1000)}`);
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
      this.persist(runId, parsed, `<ERROR: ${errMsg}>`, Date.now() - startedAt, msg.senderId, targetTaskName, targetSlot);
    }
  };

  /**
   * 保存到对应工作空间
   */
  private persistToWorkspace(
    runId: string,
    taskName: string | undefined,
    parsed: { slot: number; prompt: string; raw: string },
    response: string,
    durationMs: number,
    senderId: string,
  ): void {
    const task = taskName || 'UNKNOWN';
    const workspaceDir = TASK_WORKSPACE_MAP[task];
    
    if (!workspaceDir) {
      log('No workspace configured for task: %s', task);
      return;
    }

    try {
      mkdirSync(workspaceDir, { recursive: true });
      
      const file = path.join(workspaceDir, `${runId}.md`);
      const md = [
        `# Run ${runId}`,
        ``,
        `- **Task**: ${task}`,
        `- **Slot**: ${parsed.slot}`,
        `- **Sender**: ${senderId}`,
        `- **Duration**: ${durationMs} ms`,
        `- **Workspace**: ${workspaceDir}`,
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
      log('persisted to workspace → %s', file);
    } catch (err) {
      log('Failed to persist to workspace: %s', (err as Error).message);
    }
  }

  /**
   * 保存到runs目录（按任务分子目录）
   * 例如：runs/PMCLI/2026-04-27Txxxxx.md
   */
  private persist(
    runId: string,
    parsed: { slot: number; prompt: string; raw: string },
    response: string,
    durationMs: number,
    senderId: string,
    taskName?: string,
    actualSlot?: number,
  ): void {
    const task = taskName || 'unknown';
    const taskDir = path.join(this.runsDir, task);
    
    // 创建任务子目录
    mkdirSync(taskDir, { recursive: true });
    
    const file = path.join(taskDir, `${runId}.md`);
    const md = [
      `# Run ${runId}`,
      ``,
      `- **Task**: ${task}`,
      `- **Slot**: ${actualSlot !== undefined ? actualSlot : parsed.slot}`,
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
