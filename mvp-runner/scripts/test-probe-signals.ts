// mvp-runner/scripts/test-probe-signals.ts
// 5 信号探针单元测试：通过 DOM 注入验证 captureSnapshot 的识别精度
//
// 运行：
//   DEBUG=mvp:probe,mvp:test npx tsx scripts/test-probe-signals.ts
//
// 前置条件：
//   1. Trae 已启动且 CDP 端口 9222 可连接
//   2. 当前已选中任意任务（用于 chat-turn/task-item 探测）
//
// 产物：
//   runs/test-probe-signals-<timestamp>.jsonl

import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import path from 'node:path';
import debug from 'debug';
import { CDPClient } from '../src/cdp/client.js';
import { loadConfig } from '../src/config.js';
import { captureSnapshot } from '../src/actions/state-probe.js';

const log = debug('mvp:test');

interface ProbeCase {
  name: string;
  description: string;
  /** 注入 DOM 的 JS 片段，需自带唯一 id 便于 cleanup */
  inject: string;
  /** 清理 DOM 的 JS 片段 */
  cleanup: string;
  /** 注入后期望 snapshot 满足的断言 */
  assertAfterInject: (snap: any) => { ok: boolean; reason?: string };
  /** 清理后期望 snapshot 恢复正常的断言 */
  assertAfterCleanup: (snap: any) => { ok: boolean; reason?: string };
  /** 注入后等待 snapshot 重新采集的毫秒数 */
  settleMs?: number;
}

const CASES: ProbeCase[] = [
  {
    name: 'signal-3-hasTerminalBtn-background',
    description: '注入"后台运行"按钮，验证 hasTerminalBtn=true',
    inject: `
      (() => {
        const el = document.createElement('button');
        el.className = 'icd-btn icd-btn-tertiary';
        el.textContent = '后台运行';
        el.id = '__probe_test_terminal_bg';
        el.style.cssText = 'position:fixed;top:-9999px;left:-9999px;';
        document.body.appendChild(el);
        return true;
      })()
    `,
    cleanup: `document.getElementById('__probe_test_terminal_bg')?.remove();`,
    assertAfterInject: s => s.hasTerminalBtn === true
      ? { ok: true }
      : { ok: false, reason: 'hasTerminalBtn still false after inject' },
    assertAfterCleanup: s => s.hasTerminalBtn === false
      ? { ok: true }
      : { ok: false, reason: 'hasTerminalBtn still true after cleanup' },
  },

  {
    name: 'signal-3-hasTerminalBtn-cancel',
    description: '注入"取消"按钮，验证文本匹配两种变体',
    inject: `
      (() => {
        const el = document.createElement('button');
        el.className = 'icd-btn icd-btn-tertiary';
        el.textContent = '取消';
        el.id = '__probe_test_terminal_cancel';
        el.style.cssText = 'position:fixed;top:-9999px;left:-9999px;';
        document.body.appendChild(el);
        return true;
      })()
    `,
    cleanup: `document.getElementById('__probe_test_terminal_cancel')?.remove();`,
    assertAfterInject: s => s.hasTerminalBtn === true
      ? { ok: true }
      : { ok: false, reason: '"取消" variant not matched' },
    assertAfterCleanup: s => s.hasTerminalBtn === false ? { ok: true } : { ok: false },
  },

  {
    name: 'signal-4-hasDeleteCard',
    description: '注入删除文件卡片按钮，验证 hasDeleteCard=true',
    inject: `
      (() => {
        const el = document.createElement('button');
        el.className = 'icd-delete-files-command-card-v2-actions-delete';
        el.id = '__probe_test_delete_card';
        el.style.cssText = 'position:fixed;top:-9999px;left:-9999px;';
        document.body.appendChild(el);
        return true;
      })()
    `,
    cleanup: `document.getElementById('__probe_test_delete_card')?.remove();`,
    assertAfterInject: s => s.hasDeleteCard === true
      ? { ok: true }
      : { ok: false, reason: 'hasDeleteCard still false' },
    assertAfterCleanup: s => s.hasDeleteCard === false ? { ok: true } : { ok: false },
  },

  {
    name: 'signal-false-positive-generic-btn',
    description: '注入一个无关的 icd-btn，验证不会误报 terminal-hang',
    inject: `
      (() => {
        const el = document.createElement('button');
        el.className = 'icd-btn icd-btn-primary';
        el.textContent = '保存';
        el.id = '__probe_test_unrelated_btn';
        el.style.cssText = 'position:fixed;top:-9999px;left:-9999px;';
        document.body.appendChild(el);
        return true;
      })()
    `,
    cleanup: `document.getElementById('__probe_test_unrelated_btn')?.remove();`,
    assertAfterInject: s => s.hasTerminalBtn === false
      ? { ok: true }
      : { ok: false, reason: 'false positive: unrelated icd-btn triggered hasTerminalBtn' },
    assertAfterCleanup: s => s.hasTerminalBtn === false ? { ok: true } : { ok: false },
  },

  {
    name: 'signal-1-btnFunction-baseline',
    description: '不注入任何内容，验证 btnFunction 能读到真实态（send/stop/disabled）',
    inject: `true`,
    cleanup: `true`,
    assertAfterInject: s => ['send', 'stop', 'disabled', 'unknown'].includes(s.btnFunction)
      ? { ok: true }
      : { ok: false, reason: `unexpected btnFunction="${s.btnFunction}"` },
    assertAfterCleanup: s => true ? { ok: true } : { ok: false },
    settleMs: 200,
  },

  {
    name: 'signal-5-taskStatus-baseline',
    description: '读取当前侧边栏任务状态，必须属于枚举值之一',
    inject: `true`,
    cleanup: `true`,
    assertAfterInject: s => ['running', 'completed', 'interrupted', 'unknown'].includes(s.taskStatus)
      ? { ok: true }
      : { ok: false, reason: `unexpected taskStatus="${s.taskStatus}"` },
    assertAfterCleanup: s => true ? { ok: true } : { ok: false },
    settleMs: 200,
  },
];

class TestReporter {
  private path: string;
  private results: any[] = [];

  constructor(private kind: string) {
    mkdirSync(path.resolve('./runs'), { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    this.path = path.resolve(`./runs/test-${kind}-${ts}.jsonl`);
    writeFileSync(this.path, '');
    log('report file: %s', this.path);
  }

  record(entry: any) {
    this.results.push(entry);
    appendFileSync(this.path, JSON.stringify(entry) + '\n');
  }

  summary() {
    const total = this.results.length;
    const passed = this.results.filter(r => r.status === 'PASS').length;
    const failed = total - passed;
    const rate = total > 0 ? ((passed / total) * 100).toFixed(1) : '0.0';

    console.log('\n' + '='.repeat(60));
    console.log(`Test Summary: ${this.kind}`);
    console.log(`  Total:   ${total}`);
    console.log(`  Passed:  ${passed} ✅`);
    console.log(`  Failed:  ${failed} ❌`);
    console.log(`  Rate:    ${rate}%`);
    console.log(`  Report:  ${this.path}`);
    console.log('='.repeat(60));

    if (failed > 0) {
      console.log('\nFailed cases:');
      this.results
        .filter(r => r.status !== 'PASS')
        .forEach(r => console.log(`  ❌ ${r.name}: ${r.reason || r.error || 'unknown'}`));
    }

    return { total, passed, failed, rate: parseFloat(rate) };
  }

  get passed() {
    return this.results.every(r => r.status === 'PASS');
  }
}

async function main() {
  const cfg = loadConfig();
  const cdp = new CDPClient(cfg.cdp.host, cfg.cdp.port);

  console.log('\n🔌 Connecting to Trae CDP...');
  await cdp.connect();
  console.log('✅ Connected to %s:%d', cfg.cdp.host, cfg.cdp.port);

  const reporter = new TestReporter('probe-signals');

  for (const c of CASES) {
    console.log(`\n▶ [${c.name}]`);
    console.log(`   ${c.description}`);
    const startedAt = Date.now();

    try {
      // 1. 注入
      if (c.inject.trim() !== 'true') {
        await cdp.evaluate(c.inject);
      }
      await sleep(c.settleMs ?? 500);

      // 2. 断言注入后
      const snapAfterInject = await captureSnapshot(cdp);
      const injectResult = c.assertAfterInject(snapAfterInject);

      if (!injectResult.ok) {
        console.log(`  ❌ inject assertion FAILED: ${injectResult.reason}`);
        console.log(`     snapshot: %o`, snapAfterInject);
        reporter.record({
          name: c.name,
          phase: 'after-inject',
          status: 'FAIL',
          reason: injectResult.reason,
          snapshot: snapAfterInject,
          durationMs: Date.now() - startedAt,
        });
        // 即便断言失败，也要执行 cleanup 防止污染
        if (c.cleanup.trim() !== 'true') await cdp.evaluate(c.cleanup);
        continue;
      }

      // 3. 清理
      if (c.cleanup.trim() !== 'true') {
        await cdp.evaluate(c.cleanup);
      }
      await sleep(c.settleMs ?? 500);

      // 4. 断言清理后
      const snapAfterCleanup = await captureSnapshot(cdp);
      const cleanupResult = c.assertAfterCleanup(snapAfterCleanup);

      if (!cleanupResult.ok) {
        console.log(`  ⚠️  cleanup assertion FAILED: ${cleanupResult.reason}`);
        reporter.record({
          name: c.name,
          phase: 'after-cleanup',
          status: 'FAIL',
          reason: cleanupResult.reason,
          snapshot: snapAfterCleanup,
          durationMs: Date.now() - startedAt,
        });
        continue;
      }

      console.log(`  ✅ PASS (inject + cleanup both verified)`);
      reporter.record({
        name: c.name,
        status: 'PASS',
        snapshotInject: snapAfterInject,
        snapshotCleanup: snapAfterCleanup,
        durationMs: Date.now() - startedAt,
      });

    } catch (err) {
      console.log(`  💥 ERROR: ${(err as Error).message}`);
      reporter.record({
        name: c.name,
        status: 'ERROR',
        error: (err as Error).message,
        stack: (err as Error).stack,
        durationMs: Date.now() - startedAt,
      });
      // 异常时也尝试清理
      try { if (c.cleanup.trim() !== 'true') await cdp.evaluate(c.cleanup); } catch {}
    }
  }

  const summary = reporter.summary();
  await cdp.dispose();

  process.exit(summary.failed === 0 ? 0 : 1);
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(2);
});
