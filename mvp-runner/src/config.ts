import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

export interface PmbotConfig {
  mention_keyword: string;
  allowed_users: string[];
  default_slot: number;
  response_max_chars: number;
  response_timeout_ms: number;
  ack_on_receive: boolean;
  online_notice: boolean;
}

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

function need(key: string): string {
  const v = process.env[key];
  if (!v || v.trim() === '') {
    throw new Error(`Missing required env var: ${key}. Please copy .env.example to .env and fill in.`);
  }
  return v.trim();
}

export function loadConfig(configPath = './config/pmbot.yaml'): AppConfig {
  const raw = readFileSync(configPath, 'utf-8');
  const pmbot = parse(raw) as PmbotConfig;

  // 补默认值，防止老配置缺字段
  pmbot.allowed_users ??= [];
  pmbot.default_slot ??= 0;
  pmbot.response_max_chars ??= 2000;
  pmbot.response_timeout_ms ??= 90_000;
  pmbot.ack_on_receive ??= true;
  pmbot.online_notice ??= true;

  return {
    lark: {
      appId: need('LARK_APP_ID'),
      appSecret: need('LARK_APP_SECRET'),
      chatId: need('LARK_CHAT_ID'),
      mentionKeyword: process.env.LARK_MENTION_KEYWORD?.trim() || pmbot.mention_keyword || 'PMCLI',
    },
    cdp: {
      host: process.env.CDP_HOST?.trim() || 'localhost',
      port: Number(process.env.CDP_PORT ?? 9222),
    },
    pmbot,
  };
}
