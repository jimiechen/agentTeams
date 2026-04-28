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
import type { WorkspaceConfig } from './workspace/loader.js';
import { findWorkspaceByMention } from './workspace/loader.js';
import { WorkspaceLogger, loggerManager } from './utils/workspace-logger.js';
import { injectWikiContext } from './skills/wiki-inject.js';

const log = debug('mvp:runner-multi');

export class MultiTaskRunner {
  private runsDir: string;
  private loggers = new Map<string, WorkspaceLogger>();

  constructor(
    private cfg: AppConfig,
    private cdp: CDPClient,
    private bots: LarkBot[],
    private workspaces: WorkspaceConfig[],
  ) {
    this.runsDir = path.resolve('./runs');
    mkdirSync(this.runsDir, { recursive: true });

    // 为每个工作空间初始化logger
    this.initWorkspaceLoggers();
  }

  /** 初始化所有工作空间的logger */
  private initWorkspaceLoggers(): void {
    for (const ws of this.workspaces) {
      const logger = loggerManager.getLogger(ws.dir, 'lark');
      this.loggers.set(ws.name, logger);

      // 为对应的bot设置logger
      const bot = this.bots.find(b => b.keyword === ws.mentionKeyword);
      if (bot) {
        bot.setLogger(logger);
      }
    }
  }

  /** 获取工作空间的logger */
  private getLogger(workspaceName: string): WorkspaceLogger | undefined {
    return this.loggers.get(workspaceName);
  }

  /** 通用消息处理器 */
  handle = async (msg: LarkInbound, botKeyword: string): Promise<void> => {
    const runId = new Date().toISOString().replace(/[:.]/g, '-');
    const startedAt = Date.now();

    // 1. 白名单
    const allowed = this.cfg.pmbot.allowed_users;
    if (allowed.length > 0 && !allowed.includes(msg.senderId)) {
      log('reject sender=%s (not in allowlist)', msg.senderId);
      await this.replyByKeyword(botKeyword, msg.messageId, `⛔ 权限不足`);
      return;
    }

    // 2. 解析指令
    const parsed = parseCommand(msg.text, this.cfg.pmbot.default_slot, botKeyword);
    if (!parsed || !parsed.prompt) {
      await this.replyByKeyword(botKeyword, msg.messageId,
        `⚠️ 指令为空。用法：\n` +
        `  @PMCLI <prompt> - 使用PMCLI执行任务\n` +
        `  @DEVCLI <prompt> - 使用DEVCLI执行任务`);
      return;
    }

    // 3. 扫描当前任务列表
    let targetSlot = parsed.slot;
    let targetTaskName: string | null = null;
    let matchedWorkspace: WorkspaceConfig | null = null;

    try {
      const tasks = await scanTasks(this.cdp);
      log('Scanned %d tasks: %s', tasks.length, tasks.map(t => t.name).join(', '));

      // 3.1 根据mention查找对应的工作空间
      const mentionedWs = findWorkspaceByMention(this.workspaces, msg.text);
      
      if (mentionedWs) {
        // 3.2 在工作空间中查找mention的任务名对应的slot
        const matchedSlot = findTaskSlot(tasks, mentionedWs.name);
        if (matchedSlot >= 0) {
          targetSlot = matchedSlot;
          targetTaskName = mentionedWs.name;
          matchedWorkspace = mentionedWs;
          log('Matched mention "%s" to task "%s" at slot #%d', mentionedWs.mentionKeyword, targetTaskName, targetSlot);
        } else {
          // mention了但任务列表中没有，尝试使用当前选中的任务
          const selectedTask = tasks.find(t => t.isSelected);
          if (selectedTask) {
            targetTaskName = selectedTask.name;
            targetSlot = selectedTask.index;
            matchedWorkspace = this.workspaces.find(w => w.name === targetTaskName) || mentionedWs;
            log('Task "%s" not in list, using selected task "%s" at slot #%d', mentionedWs.name, targetTaskName, targetSlot);
          } else {
            // 既没有找到任务，也没有选中的任务，使用默认
            matchedWorkspace = mentionedWs;
            log('No matching task found for "%s", using default slot #%d', mentionedWs.name, targetSlot);
          }
        }
      } else {
        // 3.3 没有mention任何工作空间，使用当前选中的任务
        const selectedTask = tasks.find(t => t.isSelected);
        if (selectedTask) {
          targetTaskName = selectedTask.name;
          targetSlot = selectedTask.index;
          matchedWorkspace = this.workspaces.find(w => w.name === targetTaskName) || null;
          log('No mention found, using selected task "%s" at slot #%d', targetTaskName, targetSlot);
        } else {
          // 使用第一个工作空间作为默认
          matchedWorkspace = this.workspaces[0];
          targetTaskName = matchedWorkspace.name;
          log('No task selected, using default workspace "%s"', matchedWorkspace.name);
        }
      }
    } catch (err) {
      log('Failed to scan tasks: %s', (err as Error).message);
      // 扫描失败时使用默认
      matchedWorkspace = this.workspaces[0];
      targetTaskName = matchedWorkspace?.name || null;
    }

    // 4. 立即 ACK
    const taskDisplay = targetTaskName || `slot #${targetSlot}`;
    const wsDisplay = matchedWorkspace ? `[${matchedWorkspace.name}] ` : '';

    // 获取logger
    const logger = matchedWorkspace ? this.getLogger(matchedWorkspace.name) : undefined;
    logger?.logTaskLifecycle(runId, 'start', {
      senderId: msg.senderId,
      taskName: targetTaskName,
      slot: targetSlot,
      prompt: parsed.prompt.slice(0, 100),
    });

    if (this.cfg.pmbot.ack_on_receive) {
      await this.replyByKeyword(botKeyword, msg.messageId, `✅ ${wsDisplay}已收到 (${taskDisplay})，排队中…`);
      logger?.logTaskLifecycle(runId, 'ack', { taskDisplay });
    }

    // 5. 加锁执行
    try {
      await withChatMutex(`run-${runId}`, async () => {
        log('[%s] task=%s slot=%d prompt="%s"', runId, targetTaskName || 'unknown', targetSlot, parsed.prompt.slice(0, 40));
        logger?.logTaskLifecycle(runId, 'switch', { taskName: targetTaskName, slot: targetSlot });

        // 切换到目标slot
        await this.sendByKeyword(botKeyword, `🔀 切换到 ${taskDisplay}…`);
        await switchTask(this.cdp, targetSlot);

        // 注入Wiki Context（如果工作空间有wiki配置）
        let enrichedPrompt = parsed.prompt;
        if (matchedWorkspace) {
          try {
            enrichedPrompt = await injectWikiContext(matchedWorkspace.dir, parsed.prompt);
            logger?.logTaskLifecycle(runId, 'wiki-inject', {
              originalLength: parsed.prompt.length,
              enrichedLength: enrichedPrompt.length,
            });
          } catch (injectErr) {
            // 注入失败不阻断主流程，使用原始prompt
            log('[%s] wiki-inject failed: %s, using raw prompt', runId, (injectErr as Error).message);
            logger?.logTaskLifecycle(runId, 'wiki-inject-failed', {
              error: (injectErr as Error).message,
            });
          }
        }

        // 填充提示词
        await fillPrompt(this.cdp, enrichedPrompt);
        logger?.logTaskLifecycle(runId, 'fill', { promptLength: enrichedPrompt.length });

        // 提交
        await submit(this.cdp);
        await this.sendByKeyword(botKeyword, `📤 已提交，等待 AI 响应…`);
        logger?.logTaskLifecycle(runId, 'submit', {});

        // 等待响应
        const response = await waitResponse(this.cdp, {
          timeoutMs: this.cfg.pmbot.response_timeout_ms,
          taskName: targetTaskName || undefined,
          logger,  // 传入logger记录心跳
        });
        logger?.logTaskLifecycle(runId, 'wait', { responseLength: response.length });

        const duration = Date.now() - startedAt;

        // 保存到对应工作空间
        if (matchedWorkspace) {
          this.persistToWorkspace(runId, matchedWorkspace.name, parsed, response, duration, msg.senderId, targetSlot);
          logger?.logTaskLifecycle(runId, 'complete', {
            duration,
            responseLength: response.length,
            savedToWorkspace: matchedWorkspace.name,
          });
        }

        // 同时保存到runs目录
        this.persist(runId, parsed, response, duration, msg.senderId, targetTaskName, targetSlot);

        const maxChars = this.cfg.pmbot.response_max_chars;
        const taskDirName = targetTaskName || 'unknown';
        const body = response.length > maxChars
          ? response.slice(0, maxChars) + `\n\n… (truncated, full ${response.length} chars saved to runs/${taskDirName}/${runId}.md)`
          : response;

        // 发送结果到群聊
        log('[%s] sending reply to group, length=%d', runId, body.length);
        try {
          await this.replyByKeyword(botKeyword, msg.messageId,
            `🤖 ${taskDisplay} 响应 (${Math.round(duration / 1000)}s)`,
            body
          );
          log('[%s] reply sent successfully', runId);
        } catch (replyErr) {
          log('[%s] replyPost failed: %s', runId, (replyErr as Error).message);
          try {
            await this.replyByKeyword(botKeyword, msg.messageId, `🤖 ${taskDisplay} 响应:\n${body.slice(0, 1000)}`);
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
      logger?.logTaskLifecycle(runId, 'error', {
        error: errMsg,
        stack: (err as Error).stack,
        duration: Date.now() - startedAt,
      });
      await this.replyByKeyword(botKeyword, msg.messageId, `❌ 执行失败：${errMsg}`);
      this.persist(runId, parsed, `<ERROR: ${errMsg}>`, Date.now() - startedAt, msg.senderId, targetTaskName, targetSlot);
    }
  };

  /** 根据keyword查找对应的bot并发送回复 */
  private async replyByKeyword(keyword: string, messageId: string, text: string, body?: string): Promise<void> {
    const bot = this.bots.find(b => b.keyword === keyword);
    if (!bot) {
      log('Bot not found for keyword: %s', keyword);
      return;
    }
    
    if (body) {
      await bot.replyPost(messageId, text, body);
    } else {
      await bot.reply(messageId, text);
    }
  }

  /** 根据keyword查找对应的bot并发送文本 */
  private async sendByKeyword(keyword: string, text: string): Promise<void> {
    const bot = this.bots.find(b => b.keyword === keyword);
    if (!bot) {
      log('Bot not found for keyword: %s', keyword);
      return;
    }
    await bot.sendText(text);
  }

  /** 保存到工作空间 */
  private persistToWorkspace(
    runId: string,
    taskName: string,
    parsed: { slot: number; prompt: string; raw: string },
    response: string,
    durationMs: number,
    senderId: string,
    actualSlot: number,
  ): void {
    const workspacesBaseDir = path.resolve(this.cfg.pmbot.workspaces_base_dir);
    const workspaceDir = path.join(workspacesBaseDir, taskName);
    
    // 从runId提取日期 (2026-04-28T08-09-58-004Z -> 20260428)
    const dateMatch = runId.match(/^(\d{4})-(\d{2})-(\d{2})/);
    const dateStr = dateMatch ? `${dateMatch[1]}${dateMatch[2]}${dateMatch[3]}` : 'unknown';
    
    // 按日期分组存储: workspaces/DEVCLI/runs/20260428/
    const runsDir = path.join(workspaceDir, 'runs', dateStr);

    try {
      mkdirSync(runsDir, { recursive: true });

      const file = path.join(runsDir, `${runId}.md`);
      const md = [
        `# Run ${runId}`,
        ``,
        `- **Task**: ${taskName}`,
        `- **Slot**: ${actualSlot}`,
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

  /** 保存到runs目录（按任务和日期分子目录） */
  private persist(
    runId: string,
    parsed: { slot: number; prompt: string; raw: string },
    response: string,
    durationMs: number,
    senderId: string,
    taskName?: string | null,
    actualSlot?: number,
  ): void {
    const task = taskName || 'unknown';
    
    // 从runId提取日期 (2026-04-28T08-09-58-004Z -> 20260428)
    const dateMatch = runId.match(/^(\d{4})-(\d{2})-(\d{2})/);
    const dateStr = dateMatch ? `${dateMatch[1]}${dateMatch[2]}${dateMatch[3]}` : 'unknown';
    
    // 按任务和日期分组: runs/DEVCLI/20260428/
    const taskDir = path.join(this.runsDir, task, dateStr);

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
