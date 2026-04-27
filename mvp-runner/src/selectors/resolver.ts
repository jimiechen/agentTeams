// src/selectors/resolver.ts - 选择器配置外化 + 版本适配层

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import createDebug from 'debug';
import { CDPClient } from '../cdp/client.js';
import { SelectorResolutionError } from '../errors.js';

const debug = createDebug('mvp:selectors');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_DIR = path.resolve(__dirname, '../../config');

interface SelectorConfig {
  primary: string;
  fallback?: string[];
}

interface SelectorsFile {
  trae_version: string;
  chat: {
    input: SelectorConfig;
    send_button: SelectorConfig;
    chat_turn: SelectorConfig;
  };
  task_list: {
    item: SelectorConfig;
  };
}

let cachedSelectors: SelectorsFile | null = null;
let cachedResolutions = new Map<string, string>();

/**
 * 加载选择器配置文件
 */
export function loadSelectors(version?: string): SelectorsFile {
  if (cachedSelectors) return cachedSelectors;

  const configDir = fs.readdirSync(CONFIG_DIR)
    .filter(f => f.startsWith('selectors.') && f.endsWith('.json'))
    .sort()
    .reverse();

  if (configDir.length === 0) {
    throw new Error(`No selector config files found in ${CONFIG_DIR}`);
  }

  const filename = version
    ? configDir.find(f => f.includes(version)) ?? configDir[0]
    : configDir[0];

  debug(`Loading selectors from ${filename}`);
  const raw = fs.readFileSync(path.join(CONFIG_DIR, filename), 'utf-8');
  const parsed: SelectorsFile = JSON.parse(raw);
  cachedSelectors = parsed;
  return cachedSelectors;
}

/**
 * 获取选择器配置对象（按路径，如 'chat.input'）
 */
export function getSelectorConfig(configPath: string): SelectorConfig {
  const selectors = loadSelectors();
  const parts = configPath.split('.');
  let current: any = selectors;
  for (const part of parts) {
    current = current[part];
    if (!current) throw new Error(`Selector path "${configPath}" not found`);
  }
  return current as SelectorConfig;
}

/**
 * 解析选择器：依次尝试 primary → fallback，返回第一个在 DOM 中能找到节点的选择器
 */
export async function resolve(cdp: CDPClient, configPath: string): Promise<string> {
  // 检查缓存
  if (cachedResolutions.has(configPath)) {
    debug(`Cache hit for ${configPath}: ${cachedResolutions.get(configPath)}`);
    return cachedResolutions.get(configPath)!;
  }

  const config = getSelectorConfig(configPath);
  const candidates = [config.primary, ...(config.fallback ?? [])];
  const tried: string[] = [];

  for (const selector of candidates) {
    tried.push(selector);
    try {
      const result = await cdp.evaluate(
        `document.querySelector('${selector.replace(/'/g, "\\'")}') !== null`
      );
      if (result) {
        if (selector !== config.primary) {
          console.warn(`[selectors] Primary "${config.primary}" failed, using fallback "${selector}" for "${configPath}"`);
        }
        debug(`Resolved ${configPath} → ${selector}`);
        cachedResolutions.set(configPath, selector);
        return selector;
      }
    } catch {
      debug(`Selector "${selector}" evaluation failed for ${configPath}`);
    }
  }

  throw new SelectorResolutionError(configPath, tried);
}

/**
 * 清除缓存（Trae 升级后调用）
 */
export function clearCache(): void {
  cachedResolutions.clear();
  cachedSelectors = null;
  debug('Selector cache cleared');
}
