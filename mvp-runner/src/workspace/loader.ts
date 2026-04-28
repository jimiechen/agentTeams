// src/workspace/loader.ts - 加载工作空间配置
import { config } from 'dotenv';
import { readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import createDebug from 'debug';

const debug = createDebug('mvp:workspace');

export interface WorkspaceConfig {
  name: string;
  dir: string;
  envFile: string;
  larkAppId: string;
  larkAppSecret: string;
  chatId: string;
  mentionKeyword: string;
}

const WORKSPACES_DIR = path.resolve('..', 'workspaces');

/**
 * 扫描并加载所有工作空间配置
 */
export function loadWorkspaces(): WorkspaceConfig[] {
  const workspaces: WorkspaceConfig[] = [];
  
  if (!existsSync(WORKSPACES_DIR)) {
    debug('Workspaces directory not found: %s', WORKSPACES_DIR);
    return workspaces;
  }
  
  const entries = readdirSync(WORKSPACES_DIR, { withFileTypes: true });
  
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    
    const name = entry.name;
    const dir = path.join(WORKSPACES_DIR, name);
    const envFile = path.join(dir, `.env.${name.toLowerCase()}`);
    
    if (!existsSync(envFile)) {
      debug('Env file not found for workspace %s: %s', name, envFile);
      continue;
    }
    
    // 临时加载环境变量读取配置
    const originalEnv = { ...process.env };
    config({ path: envFile, override: true });
    
    const larkAppId = process.env.LARK_APP_ID;
    const larkAppSecret = process.env.LARK_APP_SECRET;
    const chatId = process.env.LARK_CHAT_ID;
    const mentionKeyword = process.env.LARK_MENTION_KEYWORD;
    
    // 恢复原始环境变量
    process.env = originalEnv;
    
    if (!larkAppId || !larkAppSecret || !chatId || !mentionKeyword) {
      debug('Invalid config for workspace %s, skipping', name);
      continue;
    }
    
    workspaces.push({
      name,
      dir,
      envFile,
      larkAppId,
      larkAppSecret,
      chatId,
      mentionKeyword,
    });
    
    debug('Loaded workspace: %s (keyword=%s)', name, mentionKeyword);
  }
  
  return workspaces;
}

/**
 * 根据mention关键字查找对应的工作空间
 */
export function findWorkspaceByMention(workspaces: WorkspaceConfig[], text: string): WorkspaceConfig | null {
  // 优先精确匹配
  for (const ws of workspaces) {
    const keyword = ws.mentionKeyword;
    const regex = new RegExp(`@\\b${keyword}\\b`, 'i');
    if (regex.test(text)) {
      return ws;
    }
  }
  return null;
}

/**
 * 获取默认工作空间（第一个）
 */
export function getDefaultWorkspace(workspaces: WorkspaceConfig[]): WorkspaceConfig | null {
  return workspaces[0] || null;
}
