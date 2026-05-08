/**
 * markdown-formatter.ts - 响应内容格式化为标准 Markdown
 * 纯函数模块，零依赖，便于测试
 */

export interface ResponseMetadata {
  runId: string;
  taskSlot: number;
  taskName?: string;
  senderId: string;
  promptText: string;
  responseText: string;
  durationMs: number;
  startedAt: string;
  finishedAt: string;
}

/**
 * 将任务执行结果格式化为标准 Markdown 文档
 */
export function formatResponseToMarkdown(meta: ResponseMetadata): string {
  const taskNameDisplay = meta.taskName ?? '未命名';
  const durationSec = (meta.durationMs / 1000).toFixed(1);

  return `# Trae 任务执行报告

> **Run ID**: \`${meta.runId}\`
> **任务槽**: \`${meta.taskSlot}\`
> **任务名**: \`${taskNameDisplay}\`
> **发起人**: \`${meta.senderId}\`
> **开始时间**: ${meta.startedAt}
> **结束时间**: ${meta.finishedAt}
> **耗时**: ${durationSec}s

---

## 原始提示词

\`\`\`text
${meta.promptText}
\`\`\`

---

## AI 响应内容

${meta.responseText}

---

## 元数据

\`\`\`json
${JSON.stringify({
    runId: meta.runId,
    taskSlot: meta.taskSlot,
    taskName: taskNameDisplay,
    senderId: meta.senderId,
    durationMs: meta.durationMs,
    startedAt: meta.startedAt,
    finishedAt: meta.finishedAt,
  }, null, 2)}
\`\`\`
`;
}

/**
 * 从响应文本中提取摘要，用于群消息展示
 * - 代码块替换为 [代码块]
 * - 图片替换为 [图片]
 * - 多个空行压缩为单空格
 * - 超出 maxChars 截断并加 "..."
 */
export function extractSummary(responseText: string, maxChars = 200): string {
  if (!responseText || responseText.trim().length === 0) {
    return '（无内容）';
  }

  const cleaned = responseText
    // 替换代码块为占位符
    .replace(/```[\s\S]*?```/g, ' [代码块] ')
    // 替换行内代码为占位符
    .replace(/`[^`]+`/g, ' [代码] ')
    // 替换图片为占位符
    .replace(/!\[.*?\]\(.*?\)/g, ' [图片] ')
    // 替换链接为占位符
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // 多个空行压缩为单空格
    .replace(/\n{2,}/g, ' ')
    // 单个换行替换为空格
    .replace(/\n/g, ' ')
    // 多个空格压缩为单空格
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (cleaned.length > maxChars) {
    return cleaned.slice(0, maxChars) + '...';
  }

  return cleaned;
}
