// scripts/inject-prompt.ts
// 一次性 CLI：从终端注入 prompt 到指定 Trae 任务，可选等待回复
// 用法见文件末尾 USAGE 字符串

import createDebug from 'debug';
import { CDPClient } from '../src/cdp/client.js';
import { scanTasks, findTaskSlot } from '../src/actions/scan-tasks.js';
import { switchTask } from '../src/actions/switch-task.js';
import { fillPrompt } from '../src/actions/fill-prompt.js';
import { submit } from '../src/actions/submit.js';
import { waitResponse } from '../src/actions/wait-response.js';

const debug = createDebug('mvp:inject');

interface CliArgs {
  task: string;
  prompt: string;
  wait: boolean;
  timeoutMs: number;
  traceId?: string;
  cdpHost: string;
  cdpPort: number;
}

const USAGE = `
Usage:
  npx tsx scripts/inject-prompt.ts --task <NAME> --prompt <TEXT> [options]

Required:
  --task <NAME>          Task name shown in Trae sidebar, e.g. PMCLI / DEVCLI / TESTCLI
  --prompt <TEXT>        Prompt text. Use quotes if it contains spaces.

Options:
  --wait                 Wait for AI response and print it to stdout
  --timeout <ms>         Wait timeout in ms, default 300000 (5 min)
  --trace-id <id>        Marker echoed in logs, useful for regression test correlation
  --cdp-host <host>      Default localhost
  --cdp-port <port>      Default 9222
  -h, --help             Show this help

Exit codes:
  0   Success (submitted; if --wait, also received reply)
  2   Task name not found in sidebar
  3   Fill / submit failed
  4   Wait timeout
  5   CDP connection failed
  64  Bad arguments
`;

function parseArgs(argv: string[]): CliArgs {
  const args: Partial<CliArgs> = {
    wait: false,
    timeoutMs: 300000,
    cdpHost: 'localhost',
    cdpPort: 9222,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case '--task': args.task = next(); break;
      case '--prompt': args.prompt = next(); break;
      case '--wait': args.wait = true; break;
      case '--timeout': args.timeoutMs = Number(next()); break;
      case '--trace-id': args.traceId = next(); break;
      case '--cdp-host': args.cdpHost = next(); break;
      case '--cdp-port': args.cdpPort = Number(next()); break;
      case '-h':
      case '--help':
        console.log(USAGE);
        process.exit(0);
      default:
        console.error(`[inject] unknown arg: ${a}`);
        console.error(USAGE);
        process.exit(64);
    }
  }
  if (!args.task || !args.prompt) {
    console.error('[inject] --task and --prompt are required');
    console.error(USAGE);
    process.exit(64);
  }
  return args as CliArgs;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const tag = args.traceId ? `[inject:${args.traceId}]` : '[inject]';
  const startedAt = Date.now();

  console.log(`${tag} task=${args.task} promptLen=${args.prompt.length} wait=${args.wait}`);

  const cdp = new CDPClient({ host: args.cdpHost, port: args.cdpPort });

  try {
    try {
      await cdp.connect();
    } catch (e) {
      console.error(`${tag} CDP connect failed: ${(e as Error).message}`);
      process.exit(5);
    }
    console.log(`${tag} CDP connected`);

    // 1. 扫描任务，把名字翻译成 index
    const tasks = await scanTasks(cdp);
    console.log(`${tag} sidebar tasks: ${tasks.map(t => `${t.index}:${t.name}(${t.status})`).join(', ')}`);
    const slot = findTaskSlot(tasks, args.task);
    if (slot < 0) {
      console.error(`${tag} task "${args.task}" not found`);
      process.exit(2);
    }

    // 2. 切换任务
    try {
      await switchTask(cdp, slot);
    } catch (e) {
      console.error(`${tag} switchTask failed: ${(e as Error).message}`);
      process.exit(3);
    }
    console.log(`${tag} switched to slot ${slot}`);

    // 3. 填入 prompt
    try {
      await fillPrompt(cdp, args.prompt);
    } catch (e) {
      console.error(`${tag} fillPrompt failed: ${(e as Error).message}`);
      process.exit(3);
    }
    console.log(`${tag} prompt filled`);

    // 4. 提交
    try {
      await submit(cdp);
    } catch (e) {
      console.error(`${tag} submit failed: ${(e as Error).message}`);
      process.exit(3);
    }
    const submitMs = Date.now() - startedAt;
    console.log(`${tag} submitted (${submitMs}ms elapsed)`);

    // 5. 可选：等待回复
    if (args.wait) {
      console.log(`${tag} waiting for reply (timeout=${args.timeoutMs}ms)...`);
      try {
        const reply = await waitResponse(cdp, {
          taskName: args.task,
          timeoutMs: args.timeoutMs,
        });
        const totalMs = Date.now() - startedAt;
        console.log(`${tag} reply received (${reply.length} chars, total ${totalMs}ms)`);
        console.log('---REPLY-BEGIN---');
        console.log(reply);
        console.log('---REPLY-END---');
      } catch (e) {
        const msg = (e as Error).message;
        console.error(`${tag} waitResponse failed: ${msg}`);
        process.exit(msg.includes('超时') || msg.includes('timeout') ? 4 : 3);
      }
    }
  } finally {
    cdp.disconnect();
  }
}

main().catch((e) => {
  console.error('[inject] fatal:', e);
  process.exit(1);
});
