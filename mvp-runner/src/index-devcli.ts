// 必须在任何其他导入之前加载 DEVCLI 环境变量
import { config } from 'dotenv';
config({ path: '.env.devcli' });

import debug from 'debug';
import { loadConfig } from './config.js';
import { CDPClient } from './cdp/client.js';
import { LarkBot } from './lark/client.js';
import { MultiTaskRunner } from './runner-multi.js';

const log = debug('mvp:boot:devcli');

async function main() {
  // 1. 加载配置
  const cfg = loadConfig();
  log('config loaded: chat=%s keyword=@%s cdp=%s:%d',
    cfg.lark.chatId, cfg.lark.mentionKeyword, cfg.cdp.host, cfg.cdp.port);

  // 2. 连接 CDP
  const cdp = new CDPClient({ host: cfg.cdp.host, port: cfg.cdp.port });
  await cdp.connect();
  log('✅ CDP connected');

  // 3. 飞书 Bot
  const bot = new LarkBot({
    appId: cfg.lark.appId,
    appSecret: cfg.lark.appSecret,
    chatId: cfg.lark.chatId,
    mentionKeyword: cfg.lark.mentionKeyword,
  });

  // 4. 创建 Runner（使用 MultiTaskRunner 但只传一个 workspace）
  const workspace = {
    name: 'DEVCLI',
    larkAppId: cfg.lark.appId,
    larkAppSecret: cfg.lark.appSecret,
    chatId: cfg.lark.chatId,
    mentionKeyword: cfg.lark.mentionKeyword,
    slot: 0,
    taskName: 'DEVCLI',
  };
  const runner = new MultiTaskRunner(cfg, cdp, [bot], [workspace]);
  
  // 5. 启动 Bot
  await bot.start(runner.handle);
  log('✅ Lark WS listening');

  // 6. 上线通知
  if (cfg.pmbot.online_notice) {
    try {
      await bot.sendText(
        `🟢 DEVCLI Runner 上线\n` +
        `关键字: @${cfg.lark.mentionKeyword}\n` +
        `用法: @${cfg.lark.mentionKeyword} <prompt>`,
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
