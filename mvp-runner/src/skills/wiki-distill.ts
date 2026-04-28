/**
 * Skill: wiki-distill
 * 职责: Layer 0 (runs) → Layer 1 (wiki/daily) 每日蒸馏
 */

import {
  readdirSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  statSync,
  renameSync,
} from 'node:fs';
import path from 'node:path';
import https from 'node:https';

// ──────────────────────────────────────────────
// 类型定义
// ──────────────────────────────────────────────

interface SkillContext {
  params: {
    workspacePath: string;
    date?: string;
    dryRun?: boolean;
  };
  env: {
    OPENAI_API_KEY?: string;
    OPENAI_BASE_URL?: string;
    DISTILL_MODEL?: string;
  };
}

interface DistillResult {
  success: boolean;
  outputPath?: string;
  compressionRatio?: number;
  rawChars: number;
  distilledChars: number;
  fileCount: number;
  error?: string;
  quality?: 'good' | 'low' | 'failed';
}

// ──────────────────────────────────────────────
// 工具函数
// ──────────────────────────────────────────────

/** 检查目录内是否有最近 N 分钟内修改的文件（任务锁检测） */
function hasRecentActivity(dirPath: string, withinMinutes = 10): boolean {
  if (!existsSync(dirPath)) return false;
  const now = Date.now();
  const threshold = withinMinutes * 60 * 1000;
  try {
    const files = readdirSync(dirPath);
    return files.some((f) => {
      const stat = statSync(path.join(dirPath, f));
      return now - stat.mtimeMs < threshold;
    });
  } catch {
    return false;
  }
}

/** 计算动态 Layer 1 字数上限 */
function calcMaxChars(rawChars: number): number {
  if (rawChars < 3000) return 200;
  if (rawChars < 10000) return 400;
  return 500;
}

/** 截断原始内容，防止 token 超限 */
function truncateForToken(content: string, maxTokens = 6000): string {
  const estimatedChars = maxTokens * 1.5;
  if (content.length <= estimatedChars) return content;
  return content.substring(0, estimatedChars) + '\n\n[内容已截断，超出token限制]';
}

/** 评估蒸馏输出质量 */
function assessQuality(
  output: string,
  maxChars: number
): 'good' | 'low' | 'failed' {
  if (output.length < 50) return 'failed';
  const requiredSections = ['新增知识', '失败模式', '用户偏好', '协议变更', '性能基线'];
  const presentCount = requiredSections.filter((s) => output.includes(s)).length;
  if (presentCount < 3) return 'low';
  if (output.length < maxChars * 0.3) return 'low';
  return 'good';
}

/** 生成降级摘要 */
function generateFallbackSummary(
  rawFiles: string[],
  runsDir: string,
  date: string,
  dateSubdir: string
): string {
  const fullRunsDir = path.join(runsDir, dateSubdir);
  const prompts = rawFiles
    .slice(0, 10)
    .map((f) => {
      const content = readFileSync(path.join(fullRunsDir, f), 'utf-8');
      const promptLine = content.split('\n').find((l) => l.startsWith('## Prompt'));
      const nextLine = content
        .split('\n')
        .slice(content.split('\n').indexOf(promptLine ?? '') + 1)
        .find((l) => l.trim().length > 0);
      return `- ${nextLine ?? f}`;
    })
    .join('\n');

  return `# ${date} 今日记忆 [低质量-降级摘要]

## 新增知识
- 蒸馏服务不可用，以下为原始执行摘要

## 执行概览
${prompts}

## 失败模式
- 待人工补充

## 用户偏好
- 待人工补充

## 协议变更
- 待人工补充

## 性能基线
- 待人工补充`;
}

// ──────────────────────────────────────────────
// LLM 调用
// ──────────────────────────────────────────────

async function callLLM(
  prompt: string,
  apiKey: string,
  baseUrl = 'https://api.openai.com',
  model = 'gpt-4o-mini'
): Promise<string> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1000,
      temperature: 0.3,
    });

    const url = new URL(`${baseUrl}/v1/chat/completions`);
    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            reject(new Error(`LLM API Error: ${parsed.error.message}`));
          } else {
            resolve(parsed.choices?.[0]?.message?.content ?? '');
          }
        } catch (e) {
          reject(new Error(`JSON parse failed: ${data.substring(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(60000, () => {
      req.destroy();
      reject(new Error('LLM API timeout (60s)'));
    });
    req.write(body);
    req.end();
  });
}

// ──────────────────────────────────────────────
// Prompt 构建
// ──────────────────────────────────────────────

function buildDistillPrompt(rawContent: string, date: string, maxChars: number): string {
  return `## 角色
你是项目记忆蒸馏专家，负责将原始执行记录提炼为结构化知识。

## 任务
将以下 ${date} 的执行记录，按六维度提炼为 ${maxChars} 字以内的"今日记忆"。

## 原始记录
${truncateForToken(rawContent)}

## 输出格式（严格遵循，使用 Markdown）

# ${date} 今日记忆

## 新增知识
- （今天学到了什么关键知识，包括项目结构、API行为、环境特性）

## 失败模式
- （出现了什么类型的失败、如何修复、恢复率如何）

## 用户偏好
- （用户表现出什么习惯、偏好、工作节奏）

## 协议变更
- （DOM选择器、配置项、API接口的变化）

## 性能基线
- （关键指标均值：switchTask/fillPrompt/waitResponse，与历史基线的偏差）

## 下一步关注
- （明天需要继续跟进的具体事项，必须可操作，非泛泛而谈）

## 要求
1. 只保留有价值的信息，删除一次性事件和已关闭的问题
2. 用项目内部术语，假设读者熟悉上下文
3. 总字数控制在 ${maxChars} 字以内
4. 如果某个维度今天没有相关内容，写"无变化"，不要省略该维度
5. 用中文输出`;
}

// ──────────────────────────────────────────────
// 主执行逻辑
// ──────────────────────────────────────────────

export async function execute(context: SkillContext): Promise<DistillResult> {
  const {
    workspacePath,
    date = new Date().toISOString().split('T')[0],
    dryRun = false,
  } = context.params;

  const apiKey = context.env.OPENAI_API_KEY ?? process.env.OPENAI_API_KEY ?? '';
  const baseUrl = context.env.OPENAI_BASE_URL ?? process.env.OPENAI_BASE_URL;
  const model = context.env.DISTILL_MODEL ?? process.env.DISTILL_MODEL ?? 'gpt-4o-mini';

  // 日期格式: 20260428
  const dateSubdir = date.replace(/-/g, '');
  const runsDir = path.resolve(workspacePath, 'runs');
  const layer1Dir = path.resolve(workspacePath, 'wiki', 'daily');
  const errorLogPath = path.resolve(workspacePath, 'wiki', 'distill-errors.log');
  const todoPath = path.resolve(workspacePath, 'wiki', 'todo.md');

  // ── 前置检查 ──────────────────────────────────

  // 1. 任务锁检测
  if (hasRecentActivity(path.join(runsDir, dateSubdir), 10)) {
    const msg = `[${new Date().toISOString()}] 检测到最近10分钟有任务活动，蒸馏延迟\n`;
    writeFileSync(errorLogPath, msg, { flag: 'a' });
    return {
      success: false,
      error: 'recent_activity_detected',
      rawChars: 0,
      distilledChars: 0,
      fileCount: 0,
    };
  }

  // 2. 检查 Layer 1 是否已存在
  mkdirSync(layer1Dir, { recursive: true });
  const outputPath = path.join(layer1Dir, `${date}.md`);
  if (existsSync(outputPath)) {
    console.log(`[wiki-distill] Layer 1 已存在: ${outputPath}，跳过`);
    return {
      success: true,
      outputPath,
      rawChars: 0,
      distilledChars: readFileSync(outputPath, 'utf-8').length,
      fileCount: 0,
      quality: 'good',
    };
  }

  // ── 读取 Layer 0 ──────────────────────────────

  const fullRunsDir = path.join(runsDir, dateSubdir);
  if (!existsSync(fullRunsDir)) {
    return {
      success: false,
      error: `runs 目录不存在: ${fullRunsDir}`,
      rawChars: 0,
      distilledChars: 0,
      fileCount: 0,
    };
  }

  const allFiles = readdirSync(fullRunsDir).sort();
  const todayFiles = allFiles.filter(
    (f) => f.endsWith('.md') && !f.endsWith('.pending.md')
  );

  if (todayFiles.length === 0) {
    console.log(`[wiki-distill] ${date} 没有执行记录，跳过`);
    return {
      success: true,
      rawChars: 0,
      distilledChars: 0,
      fileCount: 0,
      quality: 'good',
    };
  }

  const rawContent = todayFiles
    .map((f) => {
      const content = readFileSync(path.join(fullRunsDir, f), 'utf-8');
      return `\n\n### 记录: ${f}\n${content}`;
    })
    .join('\n');

  const rawChars = rawContent.length;
  const maxChars = calcMaxChars(rawChars);

  console.log(
    `[wiki-distill] 读取 ${todayFiles.length} 条记录，共 ${rawChars} 字，目标压缩至 ${maxChars} 字`
  );

  // ── Dry Run 模式 ──────────────────────────────

  const prompt = buildDistillPrompt(rawContent, date, maxChars);

  if (dryRun) {
    console.log('[wiki-distill] DRY RUN - Prompt 预览:\n');
    console.log(prompt.substring(0, 500) + '...');
    return {
      success: true,
      rawChars,
      distilledChars: 0,
      fileCount: todayFiles.length,
    };
  }

  // ── 调用 LLM 蒸馏 ─────────────────────────────

  if (!apiKey) {
    const errMsg = `[${new Date().toISOString()}] OPENAI_API_KEY 未配置，蒸馏失败\n`;
    writeFileSync(errorLogPath, errMsg, { flag: 'a' });
    return {
      success: false,
      error: 'missing_api_key',
      rawChars,
      distilledChars: 0,
      fileCount: todayFiles.length,
    };
  }

  let distilled: string;
  let quality: 'good' | 'low' | 'failed';

  try {
    distilled = await callLLM(prompt, apiKey, baseUrl, model);
    quality = assessQuality(distilled, maxChars);

    // 质量差时降级为原始摘要
    if (quality === 'failed') {
      console.warn('[wiki-distill] 蒸馏质量不达标（failed），使用降级摘要');
      distilled = generateFallbackSummary(todayFiles, runsDir, date, dateSubdir);
      quality = 'low';
    }
  } catch (err) {
    const errMsg = `[${new Date().toISOString()}] LLM调用失败: ${(err as Error).message}\n`;
    writeFileSync(errorLogPath, errMsg, { flag: 'a' });
    console.warn('[wiki-distill] LLM 不可用，使用降级摘要');
    distilled = generateFallbackSummary(todayFiles, runsDir, date, dateSubdir);
    quality = 'low';
  }

  // ── 写入 Layer 1 ──────────────────────────────

  writeFileSync(outputPath, distilled, 'utf-8');
  console.log(`[wiki-distill] 写入 ${outputPath}（质量: ${quality}）`);

  // ── 同步更新 todo.md ──

  const todoSection = distilled.match(/## 下一步关注\n([\s\S]*?)(?=\n##|$)/)?.[1] ?? '';
  if (todoSection.trim()) {
    const todoEntry = `\n## ${date}\n${todoSection.trim()}\n`;
    writeFileSync(todoPath, todoEntry, { flag: 'a' });
  }

  return {
    success: true,
    outputPath,
    compressionRatio: Math.round(rawChars / distilled.length),
    rawChars,
    distilledChars: distilled.length,
    fileCount: todayFiles.length,
    quality,
  };
}

export default execute;
