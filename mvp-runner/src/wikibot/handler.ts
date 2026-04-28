/**
 * WikiBot 飞书消息处理器
 * 职责: 接收调度脚本或用户的wiki命令，执行蒸馏/合并/查询
 */

import debug from 'debug';
import path from 'node:path';
import type { CDPClient } from '../cdp/client.js';
import type { LarkBot, LarkInbound } from '../lark/client.js';
import { withChatMutex } from '../mutex.js';

import { execute as wikiDistill } from '../skills/wiki-distill.js';
import { execute as wikiMerge } from '../skills/wiki-merge.js';
import { execute as wikiInject, invalidateCache } from '../skills/wiki-inject.js';
import {
  queryWiki,
  queryLast,
  queryLastWeek,
  queryHistory,
  getTodos,
  formatTodos,
  checkPromotions,
} from './query.js';

const log = debug('mvp:wikibot');

export interface WikiBotConfig {
  enabled: boolean;
  slotIndex: number;           // WikiBot专用slot (默认2)
  workspacePath: string;       // WikiBot工作区路径
  targetWorkspaces: string[];  // 需要蒸馏的工作区列表
  timeoutMs: {
    distill: number;
    merge: number;
  };
  // 飞书消息过滤
  allowedSenders: string[];    // 只允许这些sender触发wiki任务
  requiredPrefix: string;      // 消息前缀过滤
}

export class WikiBotHandler {
  constructor(
    private cfg: WikiBotConfig,
    private cdp: CDPClient,
    private bot: LarkBot,
  ) {}

  /** 判断消息是否应由WikiBot处理 */
  shouldHandle(msg: LarkInbound): boolean {
    if (!this.cfg.enabled) return false;

    // 检查sender白名单
    if (this.cfg.allowedSenders.length > 0) {
      if (!this.cfg.allowedSenders.includes(msg.senderId)) {
        return false;
      }
    }

    // 检查前缀
    const text = msg.text.trim();
    if (this.cfg.requiredPrefix && !text.startsWith(this.cfg.requiredPrefix)) {
      return false;
    }

    return true;
  }

  /** 主处理器 */
  handle = async (msg: LarkInbound): Promise<void> => {
    const text = msg.text.trim();
    const runId = `wiki-${new Date().toISOString().replace(/[:.]/g, '-')}`;

    log('[%s] WikiBot received: %s', runId, text.substring(0, 100));

    try {
      // 解析命令
      const command = this.parseCommand(text);

      if (!command) {
        await this.bot.reply(msg.messageId,
          `⚠️ 未知命令。可用命令:\n` +
          `  @WikiBot distill [workspace] - 执行每日蒸馏\n` +
          `  @WikiBot merge [workspace]   - 执行每周合并\n` +
          `  @WikiBot inject [workspace]  - 测试Context注入\n` +
          `  @WikiBot status               - 查看wiki状态\n` +
          `  @WikiBot 上次/上周/历史       - 查询记忆\n` +
          `  @WikiBot todo [workspace]     - 查看待办\n` +
          `  @WikiBot promote              - 检查晋升候选`
        );
        return;
      }

      // 发送ACK
      await this.bot.reply(msg.messageId, `🤖 WikiBot 开始执行: ${command.type}...`);

      // 加锁执行（与主任务互斥）
      await withChatMutex(`wikibot-${runId}`, async () => {
        const result = await this.executeCommand(command, runId);

        if (result.success) {
          await this.bot.reply(msg.messageId,
            `✅ WikiBot 完成 ${command.type}\n` +
            `${result.details}`
          );
        } else {
          await this.bot.reply(msg.messageId,
            `❌ WikiBot 失败: ${command.type}\n` +
            `${result.error}`
          );
        }
      });

    } catch (err) {
      const errMsg = (err as Error).message;
      log('[%s] WikiBot error: %s', runId, errMsg);
      await this.bot.reply(msg.messageId, `❌ WikiBot 执行异常: ${errMsg}`);
    }
  };

  /** 解析命令 */
  private parseCommand(text: string): { type: string; workspace?: string; query?: string } | null {
    // 去掉前缀
    const cmdText = this.cfg.requiredPrefix
      ? text.replace(this.cfg.requiredPrefix, '').trim()
      : text.trim();

    const parts = cmdText.split(/\s+/);
    const cmd = parts[0]?.toLowerCase();

    switch (cmd) {
      case 'distill':
      case '蒸馏':
        return { type: 'distill', workspace: parts[1] };
      case 'merge':
      case '合并':
        return { type: 'merge', workspace: parts[1] };
      case 'inject':
      case '注入':
        return { type: 'inject', workspace: parts[1] };
      case 'status':
      case '状态':
        return { type: 'status' };
      // Phase 4: 查询命令
      case 'query':
      case '查询':
      case '上次':
      case '上周':
      case '历史':
        return { type: 'query', query: cmdText };
      case 'todo':
        return { type: 'todo', workspace: parts[1] };
      case 'promote':
      case '晋升':
        return { type: 'promote' };
      default:
        // 尝试匹配查询关键词
        if (/^(上次|最近|之前|历史|last|latest|week|history)/.test(cmd)) {
          return { type: 'query', query: cmdText };
        }
        return null;
    }
  }

  /** 执行命令 */
  private async executeCommand(
    command: { type: string; workspace?: string },
    runId: string
  ): Promise<{ success: boolean; details?: string; error?: string }> {
    const workspacesBase = path.resolve('./workspaces');

    switch (command.type) {
      case 'distill': {
        // 如果没有指定workspace，蒸馏所有目标工作区
        const targets = command.workspace
          ? [path.join(workspacesBase, command.workspace)]
          : this.cfg.targetWorkspaces.map(ws => path.join(workspacesBase, ws));

        const results: string[] = [];

        for (const wsPath of targets) {
          const wsName = path.basename(wsPath);
          log('[%s] Distilling workspace: %s', runId, wsName);

          const result = await wikiDistill({
            params: { workspacePath: wsPath },
            env: {},
          });

          if (result.success) {
            invalidateCache(wsPath);
            results.push(
              `${wsName}: ✅ 压缩比${result.compressionRatio}:1 | 质量${result.quality} | ${result.fileCount}条记录`
            );
          } else {
            results.push(`${wsName}: ❌ ${result.error}`);
          }
        }

        return {
          success: results.some(r => r.includes('✅')),
          details: results.join('\n'),
        };
      }

      case 'merge': {
        const targets = command.workspace
          ? [path.join(workspacesBase, command.workspace)]
          : this.cfg.targetWorkspaces.map(ws => path.join(workspacesBase, ws));

        const results: string[] = [];

        for (const wsPath of targets) {
          const wsName = path.basename(wsPath);
          log('[%s] Merging workspace: %s', runId, wsName);

          const result = await wikiMerge({
            params: { workspacePath: wsPath },
            env: {},
          });

          if (result.success) {
            invalidateCache(wsPath);
            results.push(
              `${wsName}: ✅ ${result.weekFilesCount}天 | ${result.previousCoreChars}→${result.newCoreChars}字 | ${result.itemsCount}条`
            );
          } else {
            results.push(`${wsName}: ❌ ${result.error}`);
          }
        }

        return {
          success: results.some(r => r.includes('✅')),
          details: results.join('\n'),
        };
      }

      case 'inject': {
        const wsPath = command.workspace
          ? path.join(workspacesBase, command.workspace)
          : path.join(workspacesBase, this.cfg.targetWorkspaces[0]);

        const wsName = path.basename(wsPath);
        log('[%s] Testing inject for: %s', runId, wsName);

        const result = await wikiInject({
          params: { workspacePath: wsPath },
        });

        if (result.success) {
          return {
            success: true,
            details:
              `${wsName}: ✅ 注入${result.stats.totalChars}字 | ` +
              `核心${result.stats.coreChars}字 | ` +
              `近期${result.stats.layer1DaysLoaded}天 | ` +
              `缓存${result.stats.cacheHit ? '命中' : '未命中'}`,
          };
        } else {
          return { success: false, error: result.error };
        }
      }

      case 'status': {
        // 收集所有工作区的wiki状态
        const statuses: string[] = [];
        for (const ws of this.cfg.targetWorkspaces) {
          const wsPath = path.join(workspacesBase, ws);
          const dailyDir = path.join(wsPath, 'wiki', 'daily');
          const corePath = path.join(wsPath, 'wiki', 'core', 'knowledge.md');

          const { existsSync, readdirSync, statSync } = await import('node:fs');

          let dailyCount = 0;
          if (existsSync(dailyDir)) {
            dailyCount = readdirSync(dailyDir).filter(f => f.endsWith('.md')).length;
          }

          let coreSize = 0;
          let coreAge = '';
          if (existsSync(corePath)) {
            const stat = statSync(corePath);
            coreSize = stat.size;
            const ageDays = Math.floor((Date.now() - stat.mtimeMs) / (24 * 60 * 60 * 1000));
            coreAge = `${ageDays}天前`;
          }

          statuses.push(
            `${ws}: Layer1=${dailyCount}天 | Layer2=${coreSize}字节(${coreAge})`
          );
        }

        return {
          success: true,
          details: statuses.join('\n'),
        };
      }

      // Phase 4: 查询接口
      case 'query': {
        const query = (command as any).query || '上次';
        const results: string[] = [];

        for (const ws of this.cfg.targetWorkspaces) {
          const wsPath = path.join(workspacesBase, ws);
          const result = queryWiki(wsPath, query);

          if (result.found) {
            results.push(`📚 ${ws} (${result.source}):\n${result.content.substring(0, 800)}...`);
          } else {
            results.push(`📚 ${ws}: ${result.content}`);
          }
        }

        return {
          success: true,
          details: results.join('\n\n---\n\n'),
        };
      }

      // Phase 4: 待办管理
      case 'todo': {
        const wsName = command.workspace || this.cfg.targetWorkspaces[0];
        const wsPath = path.join(workspacesBase, wsName);

        const todos = getTodos(wsPath, 'active');
        const formatted = formatTodos(todos);

        return {
          success: true,
          details: `📋 ${wsName} 待办:\n${formatted}`,
        };
      }

      // Phase 4: 晋升检查
      case 'promote': {
        const candidates = checkPromotions(this.cfg.targetWorkspaces);

        if (candidates.length === 0) {
          return {
            success: true,
            details: '暂无满足晋升条件的知识条目\n（需要2+工作区同时出现相同模式，持续2+周）',
          };
        }

        const lines = candidates.map(c =>
          `- "${c.pattern.substring(0, 50)}..." 出现在: ${c.workspaces.join(', ')}`
        );

        return {
          success: true,
          details: `🔍 发现 ${candidates.length} 条候选晋升知识:\n${lines.join('\n')}\n\n使用 "/wiki promote confirm" 确认晋升`,
        };
      }

      default:
        return { success: false, error: `未知命令: ${command.type}` };
    }
  }
}
