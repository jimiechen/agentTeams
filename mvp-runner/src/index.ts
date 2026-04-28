import 'dotenv/config';
import debug from 'debug';
import { loadConfig } from './config.js';
import { CDPClient } from './cdp/client.js';
import { LarkBot } from './lark/client.js';
import { MultiTaskRunner } from './runner-multi.js';
import { loadWorkspaces } from './workspace/loader.js';

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
  const cdp = new CDPClient(cfg.cdp.host, cfg.cdp.port);
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
  
  // 6. 启动所有Bot
  for (const bot of bots) {
    await bot.start(runner.handle);
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
