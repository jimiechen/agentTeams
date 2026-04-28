/**
 * Wiki Scheduler - 增强版调度器
 * 职责: 自动蒸馏、合并、失败重试、连续失败告警
 */

import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
} from 'node:fs';
import path from 'node:path';
import { execute as wikiDistill } from './wiki-distill.js';
import { execute as wikiMerge } from './wiki-merge.js';
import { invalidateCache } from './wiki-inject.js';

// ──────────────────────────────────────────────
// 类型定义
// ──────────────────────────────────────────────

export interface SchedulerConfig {
  workspaces: string[];
  distillSchedule: string;      // cron表达式
  mergeSchedule: string;        // cron表达式
  retryDelayMinutes: number;
  maxRetries: number;
  alertThreshold: number;       // 连续失败多少次告警
  larkNotify?: {
    enabled: boolean;
    webhook?: string;
    bot?: any;
  };
}

export interface SchedulerResult {
  success: boolean;
  tasks: Array<{
    workspace: string;
    type: 'distill' | 'merge';
    success: boolean;
    error?: string;
    retries: number;
  }>;
  alertSent?: boolean;
}

// ──────────────────────────────────────────────
// 工具函数
// ──────────────────────────────────────────────

/** 睡眠 */
function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

/** 检查今天是否已蒸馏 */
function isDistilledToday(workspacePath: string, date: string): boolean {
  const dailyFile = path.join(workspacePath, 'wiki', 'daily', `${date}.md`);
  return existsSync(dailyFile);
}

/** 读取连续失败次数 */
function getConsecutiveFailures(workspacePath: string): number {
  const errorLog = path.join(workspacePath, 'wiki', 'distill-errors.log');
  if (!existsSync(errorLog)) return 0;

  const content = readFileSync(errorLog, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());

  // 统计最近3天的失败记录
  let failures = 0;
  for (let i = lines.length - 1; i >= 0 && failures < 10; i--) {
    const line = lines[i];
    if (line.includes('distill failed') || line.includes('merge failed') || line.includes('LLM调用失败')) {
      failures++;
    } else if (line.includes('蒸馏完成') || line.includes('合并完成')) {
      break;
    }
  }
  return failures;
}

/** 发送飞书告警 */
async function sendLarkAlert(
  bot: any,
  title: string,
  content: string
): Promise<void> {
  if (!bot) {
    console.warn('[wiki-scheduler] 未配置bot，无法发送告警');
    return;
  }

  try {
    await bot.sendText(`⚠️ ${title}\n${content}`);
    console.log('[wiki-scheduler] 告警已发送');
  } catch (err) {
    console.error('[wiki-scheduler] 告警发送失败:', (err as Error).message);
  }
}

/** 记录调度日志 */
function logSchedule(workspacePath: string, message: string): void {
  const logPath = path.join(workspacePath, 'wiki', 'scheduler.log');
  const timestamp = new Date().toISOString();
  writeFileSync(logPath, `[${timestamp}] ${message}\n`, { flag: 'a' });
}

// ──────────────────────────────────────────────
// 带重试的蒸馏
// ──────────────────────────────────────────────

async function runDistillWithRetry(
  workspacePath: string,
  date: string,
  config: SchedulerConfig
): Promise<{ success: boolean; error?: string; retries: number }> {
  let retries = 0;

  while (retries <= config.maxRetries) {
    // 检查任务锁
    const runsDir = path.join(workspacePath, 'runs', date.replace(/-/g, ''));
    if (existsSync(runsDir)) {
      const files = require('node:fs').readdirSync(runsDir);
      const now = Date.now();
      const hasRecent = files.some((f: string) => {
        const stat = require('node:fs').statSync(path.join(runsDir, f));
        return now - stat.mtimeMs < 10 * 60 * 1000; // 10分钟内
      });

      if (hasRecent) {
        console.log(`[wiki-scheduler] ${path.basename(workspacePath)} 检测到活跃任务，等待${config.retryDelayMinutes}分钟后重试`);
        logSchedule(workspacePath, `任务锁检测，延迟重试 (${retries + 1}/${config.maxRetries})`);

        if (retries < config.maxRetries) {
          await sleep(config.retryDelayMinutes * 60 * 1000);
          retries++;
          continue;
        } else {
          return { success: false, error: '任务锁，重试次数耗尽', retries };
        }
      }
    }

    // 执行蒸馏
    const result = await wikiDistill({
      params: { workspacePath, date },
      env: {},
    });

    if (result.success) {
      invalidateCache(workspacePath);
      logSchedule(workspacePath, `蒸馏成功: ${result.fileCount}条记录, 压缩比${result.compressionRatio}:1`);
      return { success: true, retries };
    }

    // 失败处理
    if (result.error === 'recent_activity_detected') {
      if (retries < config.maxRetries) {
        console.log(`[wiki-scheduler] 蒸馏被任务锁阻止，${config.retryDelayMinutes}分钟后重试`);
        await sleep(config.retryDelayMinutes * 60 * 1000);
        retries++;
        continue;
      }
    }

    // 其他错误
    logSchedule(workspacePath, `蒸馏失败: ${result.error}`);
    return { success: false, error: result.error, retries };
  }

  return { success: false, error: '重试次数耗尽', retries };
}

// ──────────────────────────────────────────────
// 带重试的合并
// ──────────────────────────────────────────────

async function runMergeWithRetry(
  workspacePath: string,
  config: SchedulerConfig
): Promise<{ success: boolean; error?: string; retries: number }> {
  let retries = 0;

  while (retries <= config.maxRetries) {
    const result = await wikiMerge({
      params: { workspacePath },
      env: {},
    });

    if (result.success) {
      invalidateCache(workspacePath);
      logSchedule(workspacePath, `合并成功: ${result.weekFilesCount}天, ${result.itemsCount}条`);
      return { success: true, retries };
    }

    if (retries < config.maxRetries) {
      console.log(`[wiki-scheduler] 合并失败，${config.retryDelayMinutes}分钟后重试`);
      await sleep(config.retryDelayMinutes * 60 * 1000);
      retries++;
    } else {
      logSchedule(workspacePath, `合并失败: ${result.error}`);
      return { success: false, error: result.error, retries };
    }
  }

  return { success: false, error: '重试次数耗尽', retries };
}

// ──────────────────────────────────────────────
// 主调度函数
// ──────────────────────────────────────────────

export async function runScheduledDistill(config: SchedulerConfig): Promise<SchedulerResult> {
  const today = new Date().toISOString().split('T')[0];
  const tasks: SchedulerResult['tasks'] = [];
  let anyAlertSent = false;

  console.log(`\n=== [wiki-scheduler] 每日蒸馏 [${today}] ===\n`);

  for (const wsName of config.workspaces) {
    const wsPath = path.resolve('./workspaces', wsName);
    console.log(`\n-- 工作区: ${wsName}`);

    // 检查是否已蒸馏
    if (isDistilledToday(wsPath, today)) {
      console.log(`[wiki-scheduler] ${wsName} 今日已蒸馏，跳过`);
      tasks.push({ workspace: wsName, type: 'distill', success: true, retries: 0 });
      continue;
    }

    // 执行带重试的蒸馏
    const result = await runDistillWithRetry(wsPath, today, config);
    tasks.push({ workspace: wsName, type: 'distill', ...result });

    // 检查连续失败
    if (!result.success) {
      const failures = getConsecutiveFailures(wsPath);
      console.log(`[wiki-scheduler] ${wsName} 连续失败次数: ${failures}`);

      if (failures >= config.alertThreshold && !anyAlertSent) {
        await sendLarkAlert(
          config.larkNotify?.bot,
          'LLM Wiki蒸馏连续失败告警',
          `工作区: ${wsName}\n连续失败: ${failures}次\n时间: ${today}\n请人工介入检查`
        );
        anyAlertSent = true;
      }
    }
  }

  return {
    success: tasks.some(t => t.success),
    tasks,
    alertSent: anyAlertSent,
  };
}

export async function runScheduledMerge(config: SchedulerConfig): Promise<SchedulerResult> {
  const today = new Date().toISOString().split('T')[0];
  const tasks: SchedulerResult['tasks'] = [];

  console.log(`\n=== [wiki-scheduler] 每周合并 [${today}] ===\n`);

  for (const wsName of config.workspaces) {
    const wsPath = path.resolve('./workspaces', wsName);
    console.log(`\n-- 工作区: ${wsName}`);

    const result = await runMergeWithRetry(wsPath, config);
    tasks.push({ workspace: wsName, type: 'merge', ...result });
  }

  return {
    success: tasks.some(t => t.success),
    tasks,
  };
}

// ──────────────────────────────────────────────
// CLI入口
// ──────────────────────────────────────────────

async function main() {
  const mode = process.argv[2] ?? 'distill';

  const config: SchedulerConfig = {
    workspaces: ['PMCLI', 'DEVCLI'],
    distillSchedule: '0 4 * * *',
    mergeSchedule: '0 3 * * 0',
    retryDelayMinutes: 15,
    maxRetries: 3,
    alertThreshold: 3,
  };

  if (mode === 'distill') {
    const result = await runScheduledDistill(config);
    console.log('\n--- 蒸馏结果 ---');
    console.log(JSON.stringify(result, null, 2));
  } else if (mode === 'merge') {
    const result = await runScheduledMerge(config);
    console.log('\n--- 合并结果 ---');
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log('用法: npx tsx scripts/wiki-scheduler.ts [distill|merge]');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
