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
  workspaces_base_dir: string;
}

export interface LarkUploadConfig {
  reply_mode: 'post' | 'card' | 'hybrid';
  root_folder_token?: string;
  upload_enabled: boolean;
  upload_timeout_ms: number;
  upload_retry: number;
  upload_concurrency: number;
}

export interface AppConfig {
  lark: {
    appId: string;
    appSecret: string;
    chatId: string;
    mentionKeyword: string;
    reply_mode: 'post' | 'card' | 'hybrid';
    root_folder_token?: string;
    upload_enabled: boolean;
    upload_timeout_ms: number;
    upload_retry: number;
    upload_concurrency: number;
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
  pmbot.response_timeout_ms ??= 300_000; // 默认5分钟
  pmbot.ack_on_receive ??= true;
  pmbot.online_notice ??= true;
  pmbot.workspaces_base_dir ??= '../workspaces';

  // 读取飞书上传配置（可选）
  const replyMode = (process.env.LARK_REPLY_MODE?.trim() || 'post') as 'post' | 'card' | 'hybrid';
  const rootFolderToken = process.env.LARK_ROOT_FOLDER_TOKEN?.trim() || undefined;
  const uploadEnabled = process.env.LARK_UPLOAD_ENABLED === 'true';

  // 启动校验
  if (replyMode === 'card' && !rootFolderToken) {
    throw new Error('LARK_REPLY_MODE=card requires LARK_ROOT_FOLDER_TOKEN');
  }
  if (replyMode === 'hybrid' && !rootFolderToken) {
    console.warn('[config] LARK_REPLY_MODE=hybrid but LARK_ROOT_FOLDER_TOKEN not set, falling back to post');
  }

  return {
    lark: {
      appId: need('LARK_APP_ID'),
      appSecret: need('LARK_APP_SECRET'),
      chatId: need('LARK_CHAT_ID'),
      mentionKeyword: process.env.LARK_MENTION_KEYWORD?.trim() || pmbot.mention_keyword || 'PMCLI',
      reply_mode: replyMode,
      root_folder_token: rootFolderToken,
      upload_enabled: uploadEnabled,
      upload_timeout_ms: Number(process.env.LARK_UPLOAD_TIMEOUT_MS ?? 30000),
      upload_retry: Number(process.env.LARK_UPLOAD_RETRY ?? 2),
      upload_concurrency: Number(process.env.LARK_UPLOAD_CONCURRENCY ?? 3),
    },
    cdp: {
      host: process.env.CDP_HOST?.trim() || 'localhost',
      port: Number(process.env.CDP_PORT ?? 9222),
    },
    pmbot,
  };
}
