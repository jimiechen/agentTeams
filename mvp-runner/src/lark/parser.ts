export interface ParsedCommand {
  slot: number;
  prompt: string;
  raw: string;
  mentionTask?: string; // 被mention的任务名称：PMCLI 或 DEVCLI
}

// 支持的任务名称列表
export const SUPPORTED_TASKS = ['PMCLI', 'DEVCLI'];

/**
 * 从文本中提取mention的任务名称
 * 支持 @PMCLI @DEVCLI 等
 */
export function extractMentionTask(rawText: string): string | null {
  for (const task of SUPPORTED_TASKS) {
    // 匹配 @PMCLI 或 @DEVCLI (不区分大小写)
    const regex = new RegExp(`@\\b${task}\\b`, 'i');
    if (regex.test(rawText)) {
      return task;
    }
  }
  return null;
}

/**
 * 解析 @PMCLI/@DEVCLI 指令。支持格式：
 *   @PMCLI 写一个快排                 → { mentionTask: 'PMCLI', prompt: '写一个快排' }
 *   @DEVCLI #2 修复登录接口           → { mentionTask: 'DEVCLI', slot: 2, prompt: '修复登录接口' }
 *   @PMCLI slot=2 修复登录接口         → { mentionTask: 'PMCLI', slot: 2, prompt: '修复登录接口' }
 *
 * 飞书 content.text 里的 @ 会以 "@_user_1" 占位符呈现，调用前调用方需先替换掉。
 */
export function parseCommand(
  rawText: string,
  defaultSlot: number,
  keyword = 'PMCLI',
): ParsedCommand | null {
  // 1. 提取mention的任务名称
  const mentionTask = extractMentionTask(rawText);
  
  // 2. 清洗：去 @_user_xxx、去 @PMCLI/@DEVCLI、压空白
  let cleaned = rawText
    .replace(/@_user_\d+/g, '');
  
  // 移除所有支持的任务名称mention
  for (const task of SUPPORTED_TASKS) {
    cleaned = cleaned.replace(new RegExp(`@?\\b${task}\\b`, 'gi'), '');
  }
  
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  if (!cleaned) return null;

  // 格式一：#<num> <prompt>
  const m1 = /^#(\d+)\s+(.+)$/s.exec(cleaned);
  if (m1) {
    return { slot: Number(m1[1]), prompt: m1[2].trim(), raw: cleaned, mentionTask: mentionTask || undefined };
  }

  // 格式二：slot=<num> <prompt>
  const m2 = /^slot\s*=\s*(\d+)\s+(.+)$/is.exec(cleaned);
  if (m2) {
    return { slot: Number(m2[1]), prompt: m2[2].trim(), raw: cleaned, mentionTask: mentionTask || undefined };
  }

  // 格式三：纯 prompt
  return { slot: defaultSlot, prompt: cleaned, raw: cleaned, mentionTask: mentionTask || undefined };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
