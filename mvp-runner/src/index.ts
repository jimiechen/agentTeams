import 'dotenv/config';
import debug from 'debug';
import path from 'node:path';
import { loadConfig } from './config.js';
import { CDPClient } from './cdp/client.js';
import { LarkBot } from './lark/client.js';
import { MultiTaskRunner } from './runner-multi.js';
import { loadWorkspaces } from './workspace/loader.js';
import { WikiBotHandler } from './wikibot/index.js';

const log = debug('mvp:boot');

async function main() {
  // 1. 加载基础配置
  const cfg = loadConfig();
  
  // 2. 加载所有工作空间
  const workspaces = loadWorkspaces();
  if (workspaces.length === 0) {
    console.error('[FATAL] No workspaces found');
    process.exit(1);
  }
  
  log('Loaded %d workspaces: %s', workspaces.length, workspaces.map(w => w.name).join(', '));

  // 3. 连接 CDP（共享一个CDP连接）
  const cdp = new CDPClient({ host: cfg.cdp.host, port: cfg.cdp.port });
  await cdp.connect();
  log('✅ CDP connected');

  // 4. 为每个工作空间创建Bot
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

  // 5. 创建多任务Runner
  const runner = new MultiTaskRunner(cfg, cdp, bots, workspaces);

  // 5.1 创建WikiBot处理器（Slot 2专用）
  const wikiBotEnabled = process.env.WIKIBOT_ENABLED === 'true';
  const wikiBotHandler = new WikiBotHandler({
    enabled: wikiBotEnabled,
    slotIndex: Number(process.env.WIKIBOT_SLOT_INDEX ?? 2),
    workspacePath: path.resolve('./workspaces/WikiBot'),
    targetWorkspaces: ['PMCLI', 'DEVCLI'],
    timeoutMs: {
      distill: Number(process.env.WIKIBOT_DISTILL_TIMEOUT ?? 600000),
      merge: Number(process.env.WIKIBOT_MERGE_TIMEOUT ?? 120000),
    },
    allowedSenders: process.env.WIKIBOT_ALLOWED_SENDERS?.split(',') ?? [],
    requiredPrefix: process.env.WIKIBOT_REQUIRED_PREFIX ?? '@WikiBot',
  }, cdp, bots[0]); // 使用第一个bot发送回复

  if (wikiBotEnabled) {
    log('✅ WikiBot enabled (slot #%d)', wikiBotHandler['cfg'].slotIndex);
  }

  // 6. 启动所有Bot（集成WikiBot消息路由）
  for (const bot of bots) {
    await bot.start(async (msg, keyword) => {
      // 优先检查是否应由WikiBot处理
      if (wikiBotEnabled && wikiBotHandler.shouldHandle(msg)) {
        await wikiBotHandler.handle(msg);
        return;
      }
      // 否则交给主runner处理
      await runner.handle(msg, keyword);
    });
  }
  log('✅ All Lark WS listening');

  // 7. 上线通知
  if (cfg.pmbot.online_notice) {
    for (const bot of bots) {
      try {
        await bot.sendText(
          `🟢 ${bot.keyword} Runner 上线\n` +
          `用法: @${bot.keyword} <prompt>`
        );
      } catch (err) {
        log('send online notice failed for %s: %s', bot.keyword, (err as Error).message);
      }
    }
  }

  // 8. 优雅退出
  const shutdown = async (signal: string) => {
    log('%s received, shutting down', signal);
    for (const bot of bots) {
      try { await bot.sendText(`🔴 ${bot.keyword} Runner 下线`); } catch {}
    }
    await cdp.disconnect();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  log('🚀 Multi-Task Runner is up with %d bots. Send "@<keyword> <prompt>" to test.', bots.length);
}

main().catch((err) => {
  console.error('[FATAL] Failed to boot:', err);
  process.exit(1);
});
