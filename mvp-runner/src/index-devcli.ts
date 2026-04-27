import { config } from 'dotenv';
import debug from 'debug';
import { loadConfig } from './config.js';
import { CDPClient } from './cdp/client.js';
import { LarkBot } from './lark/client.js';
import { LarkRunner } from './runner-lark.js';

// 加载 DEVCLI 环境变量
config({ path: '.env.devcli' });

const log = debug('mvp:boot:devcli');

async function main() {
  // 1. 加载配置
  const cfg = loadConfig();
  log('config loaded: chat=%s keyword=@%s cdp=%s:%d',
    cfg.lark.chatId, cfg.lark.mentionKeyword, cfg.cdp.host, cfg.cdp.port);

  // 2. 连接 CDP
  const cdp = new CDPClient(cfg.cdp.host, cfg.cdp.port);
  await cdp.connect();
  log('✅ CDP connected');

  // 4. 飞书 Bot
  const bot = new LarkBot({
    appId: cfg.lark.appId,
    appSecret: cfg.lark.appSecret,
    chatId: cfg.lark.chatId,
    mentionKeyword: cfg.lark.mentionKeyword,
  });

  // 5. 组装 runner 并注册 handler
  const runner = new LarkRunner(cfg, cdp, bot);
  await bot.start(runner.handle);
  log('✅ Lark WS listening');

  // 6. 上线通知
  if (cfg.pmbot.online_notice) {
    try {
      await bot.sendText(
        `🟢 DEVCLI Runner 上线
` +
        `关键字: @${cfg.lark.mentionKeyword}
` +
        `用法: @${cfg.lark.mentionKeyword} [#slot] <prompt>`,
      );
    } catch (err) {
      log('send online notice failed: %s', (err as Error).message);
    }
  }

  // 7. 优雅退出
  const shutdown = async (signal: string) => {
    log('%s received, shutting down', signal);
    try { await bot.sendText('🔴 DEVCLI Runner 下线'); } catch {}
    await cdp.disconnect();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('uncaughtException', (err) => {
    log('uncaughtException: %s', err.stack ?? err.message);
  });
  process.on('unhandledRejection', (reason) => {
    log('unhandledRejection: %o', reason);
  });

  log('🚀 DEVCLI Runner is up and running. Send "@%s <prompt>" in the target group to test.',
    cfg.lark.mentionKeyword);
}

main().catch((err) => {
  console.error('[FATAL] Failed to boot:', err);
  process.exit(1);
});
