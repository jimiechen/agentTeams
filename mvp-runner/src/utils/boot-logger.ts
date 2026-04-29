/**
 * Boot Logger - 启动日志持久化
 * 存储到 mvp-runner/logs/YYYY-MM-DD/boot.log
 */

import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const LOGS_DIR = path.resolve('./logs');

function getTodayLogPath(): string {
  const today = new Date().toISOString().split('T')[0];
  const dir = path.join(LOGS_DIR, today);
  mkdirSync(dir, { recursive: true });
  return path.join(dir, 'boot.log');
}

function formatTimestamp(): string {
  return new Date().toISOString();
}

export function bootLog(level: 'INFO' | 'WARN' | 'ERROR', message: string, meta?: any): void {
  const timestamp = formatTimestamp();
  const metaStr = meta ? ' ' + JSON.stringify(meta) : '';
  const line = `[${timestamp}] [${level}] ${message}${metaStr}\n`;

  // 写入文件
  try {
    appendFileSync(getTodayLogPath(), line);
  } catch (err) {
    console.error('Failed to write boot log:', err);
  }

  // 同时输出到控制台
  console.log(line.trim());
}

export function bootInfo(message: string, meta?: any): void {
  bootLog('INFO', message, meta);
}

export function bootWarn(message: string, meta?: any): void {
  bootLog('WARN', message, meta);
}

export function bootError(message: string, meta?: any): void {
  bootLog('ERROR', message, meta);
}
