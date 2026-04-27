// src/runner.ts - MVP Runner 主循环

import fs from 'fs';
import path from 'path';
import { parse as parseYaml } from 'yaml';
import createDebug from 'debug';
import { CDPClient } from './cdp/client.js';
import { switchTask, fillPrompt, submit, waitResponse } from './actions/index.js';
import {
  MvpError,
  SelectorResolutionError,
} from './errors.js';

const debug = createDebug('mvp:runner');

interface TaskConfig {
  id: string;
  slot_index: number;
  prompt: string;
}

interface RunConfig {
  tasks: TaskConfig[];
  output_dir: string;
}

interface TaskResult {
  id: string;
  slotIndex: number;
  prompt: string;
  success: boolean;
  startedAt: string;
  durationMs: number;
  error?: string;
  response?: string;
}

function parseArgs(): { configPath: string } {
  const args = process.argv.slice(2);
  let configPath = 'prompts.yaml';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--config' && args[i + 1]) {
      configPath = args[i + 1];
      i++;
    }
  }

  return { configPath };
}

async function runTask(cdp: CDPClient, task: TaskConfig): Promise<TaskResult> {
  const startTime = Date.now();
  const startedAt = new Date().toISOString();

  try {
    debug(`[1/4] Switching to slot ${task.slot_index}...`);
    await switchTask(cdp, task.slot_index);

    debug(`[2/4] Filling prompt...`);
    await fillPrompt(cdp, task.prompt);

    debug(`[3/4] Submitting...`);
    await submit(cdp);

    debug(`[4/4] Waiting for response...`);
    const response = await waitResponse(cdp);

    const durationMs = Date.now() - startTime;
    debug(`Task ${task.id} completed in ${durationMs}ms`);

    return {
      id: task.id,
      slotIndex: task.slot_index,
      prompt: task.prompt,
      success: true,
      startedAt,
      durationMs,
      response,
    };
  } catch (err) {
    const durationMs = Date.now() - startTime;

    if (err instanceof SelectorResolutionError) {
      // 选择器失效 → 终止整个 run
      console.error(`\n⚠️  ${err.message}`);
      console.error('Trae may have been updated. Run probe-02 to rebuild selectors config.');
      throw err;
    }

    const errorMsg = err instanceof MvpError ? err.message : (err as Error).message;
    console.error(`\n❌ Task ${task.id} failed: ${errorMsg}`);

    return {
      id: task.id,
      slotIndex: task.slot_index,
      prompt: task.prompt,
      success: false,
      startedAt,
      durationMs,
      error: errorMsg,
    };
  }
}

function writeResult(runDir: string, result: TaskResult): void {
  const content = [
    `# Task: ${result.id}`,
    `**Slot**: ${result.slotIndex}`,
    `**Started**: ${result.startedAt}`,
    `**Duration**: ${result.durationMs}ms`,
    `**Status**: ${result.success ? '✅ Success' : '❌ Failed'}`,
    '',
    '## Prompt',
    `> ${result.prompt}`,
    '',
    '## Response',
    result.response ?? result.error ?? '<RESPONSE TIMEOUT>',
    '',
  ].join('\n');

  fs.writeFileSync(path.join(runDir, `${result.id}.md`), content);
}

function writeErrors(runDir: string, results: TaskResult[]): void {
  const errors = results.filter(r => !r.success);
  if (errors.length === 0) return;

  const content = errors.map(r =>
    `[${r.id}] ${r.error} (slot ${r.slotIndex}, ${r.durationMs}ms)`
  ).join('\n');

  fs.writeFileSync(path.join(runDir, 'errors.log'), content + '\n');
}

async function main() {
  const { configPath } = parseArgs();

  console.log('=== Trae Agent Team MVP Runner ===\n');

  // 加载配置
  const configRaw = fs.readFileSync(configPath, 'utf-8');
  const config: RunConfig = parseYaml(configRaw);

  console.log(`Config: ${configPath}`);
  console.log(`Tasks: ${config.tasks.length}`);
  console.log(`Output: ${config.output_dir}`);
  console.log('');

  // 创建输出目录
  const runTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const runDir = path.resolve(config.output_dir, runTimestamp);
  fs.mkdirSync(runDir, { recursive: true });
  console.log(`Run directory: ${runDir}\n`);

  // 连接 CDP
  const cdp = new CDPClient();
  console.log('Connecting to Trae via CDP...');

  try {
    await cdp.connect();
    console.log('✅ CDP connected\n');
  } catch (err) {
    console.error(`\n❌ CDP connection failed: ${(err as Error).message}`);
    console.error('Make sure Trae is running with --remote-debugging-port=9222');
    process.exit(1);
  }

  const results: TaskResult[] = [];
  const totalStart = Date.now();

  // 顺序执行任务
  for (let i = 0; i < config.tasks.length; i++) {
    const task = config.tasks[i];
    console.log(`[${i + 1}/${config.tasks.length}] ${task.id} → slot ${task.slot_index}`);

    const result = await runTask(cdp, task);
    results.push(result);

    writeResult(runDir, result);

    if (result.success) {
      console.log(`  ✅ ${result.durationMs}ms (${result.response?.length ?? 0} chars response)\n`);
    } else {
      console.log(`  ❌ ${result.durationMs}ms\n`);
    }

    // 任务间等待
    if (i < config.tasks.length - 1) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  // 汇总
  const totalDuration = Date.now() - totalStart;
  const successCount = results.filter(r => r.success).length;
  const avgDuration = results.reduce((sum, r) => sum + r.durationMs, 0) / results.length;

  writeErrors(runDir, results);

  console.log('=== Summary ===');
  console.log(`✅ ${successCount}/${results.length} tasks completed in ${(totalDuration / 1000).toFixed(1)}s (avg ${(avgDuration / 1000).toFixed(1)}s/task)`);

  if (successCount < results.length) {
    console.log(`See ${runDir}/errors.log for details`);
  }

  cdp.disconnect();
}

main().catch((err) => {
  if (err instanceof SelectorResolutionError) {
    // 选择器失效已在上方处理
    process.exit(1);
  }

  console.error('\n❌ Fatal error:', (err as Error).message);
  process.exit(1);
});
