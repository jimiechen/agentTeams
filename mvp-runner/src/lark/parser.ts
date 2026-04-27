export interface ParsedCommand {
  slot: number;
  prompt: string;
  raw: string;
}

/**
 * 解析 @PMCLI 指令。支持三种格式：
 *   @PMCLI 写一个快排                 → { slot: default, prompt: '写一个快排' }
 *   @PMCLI #2 修复登录接口             → { slot: 2, prompt: '修复登录接口' }
 *   @PMCLI slot=2 修复登录接口         → { slot: 2, prompt: '修复登录接口' }
 *
 * 飞书 content.text 里的 @ 会以 "@_user_1" 占位符呈现，调用前调用方需先替换掉。
 */
export function parseCommand(
  rawText: string,
  defaultSlot: number,
  keyword = 'PMCLI',
): ParsedCommand | null {
  // 清洗：去 @_user_xxx、去 @PMCLI、压空白
  const cleaned = rawText
    .replace(/@_user_\d+/g, '')
    .replace(new RegExp(`@?\\b${escapeRegExp(keyword)}\\b`, 'gi'), '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return null;

  // 格式一：#<num> <prompt>
  const m1 = /^#(\d+)\s+(.+)$/s.exec(cleaned);
  if (m1) {
    return { slot: Number(m1[1]), prompt: m1[2].trim(), raw: cleaned };
  }

  // 格式二：slot=<num> <prompt>
  const m2 = /^slot\s*=\s*(\d+)\s+(.+)$/is.exec(cleaned);
  if (m2) {
    return { slot: Number(m2[1]), prompt: m2[2].trim(), raw: cleaned };
  }

  // 格式三：纯 prompt
  return { slot: defaultSlot, prompt: cleaned, raw: cleaned };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
