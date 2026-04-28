/**
 * Skill: wiki-inject
 * 职责: 在线注入，每次 fillPrompt 前构建 Context
 */

import {
  readFileSync,
  existsSync,
  statSync,
} from 'node:fs';
import path from 'node:path';

// ──────────────────────────────────────────────
// 类型定义
// ──────────────────────────────────────────────

interface WikiConfig {
  layer2MaxChars: number;
  layer1Days: number;
  layer1MaxChars: number;
  totalMaxChars: number;
  maxContextRatio: number;
  contextWindowSize: number;
}

interface SkillContext {
  params: {
    workspacePath: string;
    currentTask?: string;
    configOverride?: Partial<WikiConfig>;
  };
}

interface InjectResult {
  success: boolean;
  contextBlock: string;
  stats: {
    coreChars: number;
    dailyChars: number;
    totalChars: number;
    layer1DaysLoaded: number;
    cacheHit: boolean;
    truncated: boolean;
  };
  error?: string;
}

// ──────────────────────────────────────────────
// 内存缓存
// ──────────────────────────────────────────────

interface CacheEntry {
  content: string;
  loadedAt: number;
  fileMtime: number;
}

const cache = new Map<string, CacheEntry>();

/** 读取文件并缓存 */
function readWithCache(filePath: string): string | null {
  if (!existsSync(filePath)) return null;

  const mtime = statSync(filePath).mtimeMs;
  const cached = cache.get(filePath);

  if (cached && cached.fileMtime === mtime) {
    return cached.content;
  }

  const content = readFileSync(filePath, 'utf-8');
  cache.set(filePath, {
    content,
    loadedAt: Date.now(),
    fileMtime: mtime,
  });
  return content;
}

/** 清除指定工作区的所有缓存 */
export function invalidateCache(workspacePath: string): void {
  const prefix = path.resolve(workspacePath);
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
    }
  }
  console.log(`[wiki-inject] 已清除工作区缓存: ${workspacePath}`);
}

// ──────────────────────────────────────────────
// 工具函数
// ──────────────────────────────────────────────

function resolveConfig(override?: Partial<WikiConfig>): WikiConfig {
  const defaults: WikiConfig = {
    layer2MaxChars: 300,
    layer1Days: 3,
    layer1MaxChars: 1500,
    totalMaxChars: 1800,
    maxContextRatio: 0.15,
    contextWindowSize: 32000,
  };
  if (!override) return defaults;
  return { ...defaults, ...override };
}

function calcEffectiveLimit(config: WikiConfig): number {
  const ratioLimit = Math.floor(config.contextWindowSize * config.maxContextRatio);
  return Math.min(config.totalMaxChars, ratioLimit);
}

function getRecentDates(days: number): string[] {
  const dates: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}

function smartTruncate(content: string, maxChars: number): { text: string; truncated: boolean } {
  if (content.length <= maxChars) return { text: content, truncated: false };

  const cutPoint = content.lastIndexOf('\n', maxChars);
  const actualCut = cutPoint > maxChars * 0.7 ? cutPoint : maxChars;

  return {
    text: content.substring(0, actualCut) + '\n\n[...已截断至注入上限]',
    truncated: true,
  };
}

function isCoreStale(corePath: string): boolean {
  if (!existsSync(corePath)) return false;
  const mtime = statSync(corePath).mtimeMs;
  const ageMs = Date.now() - mtime;
  return ageMs > 8 * 24 * 60 * 60 * 1000;
}

// ──────────────────────────────────────────────
// Context Block 构建
// ──────────────────────────────────────────────

function buildContextBlock(
  coreContent: string,
  dailyEntries: Array<{ date: string; content: string }>,
  effectiveLimit: number,
  config: WikiConfig
): { block: string; stats: InjectResult['stats'] } {
  let totalChars = 0;
  let truncated = false;
  const parts: string[] = [];

  // ── Part 1: Layer 2 核心知识 ──────────────────
  let coreSection = '';
  if (coreContent) {
    const { text, truncated: coreTruncated } = smartTruncate(
      coreContent,
      config.layer2MaxChars
    );
    coreSection = text;
    truncated = truncated || coreTruncated;
    totalChars += coreSection.length;
  }

  // ── Part 2: Layer 1 最近 N 天 ─────────────────
  let dailySection = '';
  let dailyChars = 0;
  const layer1Budget = Math.min(
    config.layer1MaxChars,
    effectiveLimit - totalChars - 200
  );

  for (const { date, content } of dailyEntries) {
    const remaining = layer1Budget - dailyChars;
    if (remaining <= 50) break;

    const entry = `### 记忆 (${date})\n${content}`;
    const { text, truncated: entryTruncated } = smartTruncate(entry, remaining);
    dailySection += text + '\n\n';
    dailyChars += text.length;
    truncated = truncated || entryTruncated;
  }

  totalChars += dailyChars;

  // ── 组装最终 Context Block ────────────────────
  if (coreSection) {
    parts.push(`### 核心知识（长期有效）\n${coreSection}`);
  }

  if (dailySection) {
    parts.push(`### 近期动态（最近 ${config.layer1Days} 天）\n${dailySection}`);
  }

  if (parts.length === 0) {
    return {
      block: '',
      stats: {
        coreChars: 0,
        dailyChars: 0,
        totalChars: 0,
        layer1DaysLoaded: 0,
        cacheHit: false,
        truncated: false,
      },
    };
  }

  parts.push('---');

  const block = parts.join('\n\n');

  return {
    block,
    stats: {
      coreChars: coreSection.length,
      dailyChars,
      totalChars: block.length,
      layer1DaysLoaded: dailyEntries.length,
      cacheHit: false,
      truncated,
    },
  };
}

// ──────────────────────────────────────────────
// 主执行逻辑
// ──────────────────────────────────────────────

export async function execute(context: SkillContext): Promise<InjectResult> {
  const { workspacePath, currentTask, configOverride } = context.params;
  const config = resolveConfig(configOverride);
  const effectiveLimit = calcEffectiveLimit(config);

  const corePath = path.resolve(workspacePath, 'wiki', 'core', 'knowledge.md');
  const dailyDir = path.resolve(workspacePath, 'wiki', 'daily');
  const todoPath = path.resolve(workspacePath, 'wiki', 'todo.md');

  // ── Step 1: 读取 Layer 2 核心知识 ─────────────
  let coreContent = '';
  let cacheHit = false;

  const cached = cache.get(corePath);
  const coreMtime = existsSync(corePath) ? statSync(corePath).mtimeMs : 0;

  if (cached && cached.fileMtime === coreMtime) {
    coreContent = cached.content;
    cacheHit = true;
  } else {
    const raw = readWithCache(corePath);
    coreContent = raw ?? '';
    cacheHit = false;
  }

  if (isCoreStale(corePath)) {
    console.warn(
      '[wiki-inject] ⚠️  Layer 2 超过 8 天未更新，wiki-merge 可能失败'
    );
  }

  // ── Step 2: 读取最近 N 天的 Layer 1 ────────────
  const recentDates = getRecentDates(config.layer1Days);
  const dailyEntries: Array<{ date: string; content: string }> = [];

  for (const date of recentDates) {
    const filePath = path.join(dailyDir, `${date}.md`);
    const content = readWithCache(filePath);
    if (content) {
      dailyEntries.push({ date, content });
    }
  }

  // ── Step 3: 读取 todo.md ──────────────────────
  let todoContent = '';
  if (existsSync(todoPath)) {
    const raw = readWithCache(todoPath);
    if (raw && raw.trim().length > 10) {
      const todoLines = raw
        .split('\n')
        .filter((l) => /^[-*]\s+.+/.test(l) || l.startsWith('##'))
        .slice(0, 20);
      todoContent = todoLines.join('\n');
    }
  }

  // ── Step 4: 构建 Context Block ────────────────
  const { block, stats } = buildContextBlock(
    coreContent,
    dailyEntries,
    effectiveLimit,
    config
  );

  let finalBlock = block;
  if (todoContent && block) {
    const todoBlock = `### 待跟进事项\n\n${todoContent}`;
    const { text } = smartTruncate(todoBlock, 200);
    finalBlock += '\n\n' + text;
  }

  if (!finalBlock) {
    console.log('[wiki-inject] 暂无记忆可注入');
    return {
      success: true,
      contextBlock: '',
      stats: { ...stats, cacheHit },
    };
  }

  stats.cacheHit = cacheHit;

  console.log(
    `[wiki-inject] 注入完成 | ` +
    `核心: ${stats.coreChars}字 | 近期: ${stats.dailyChars}字 | 总计: ${stats.totalChars}字 | ` +
    `缓存: ${cacheHit ? '命中' : '未命中'} | 截断: ${stats.truncated ? '是' : '否'}`
  );

  return {
    success: true,
    contextBlock: finalBlock,
    stats,
  };
}

/**
 * 便捷函数：在 fillPrompt 前调用，将 wiki context 注入到 prompt 头部
 */
export async function injectWikiContext(
  workspacePath: string,
  rawPrompt: string,
  configOverride?: Partial<WikiConfig>
): Promise<string> {
  const result = await execute({
    params: { workspacePath, currentTask: rawPrompt, configOverride },
  });

  if (!result.success || !result.contextBlock) {
    return rawPrompt;
  }

  return `${result.contextBlock}\n\n---\n\n## 当前任务\n\n${rawPrompt}`;
}

export default execute;
