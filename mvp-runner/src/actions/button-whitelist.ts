/**
 * Button Whitelist - 按钮白名单检查
 * 只允许点击预定义的按钮，防止误操作
 */

export interface ButtonWhitelistEntry {
  selector: string;
  displayName: string;
  riskLevel: 'low' | 'medium' | 'high';
  maxClicksPerHour: number;
}

export const BUTTON_WHITELIST: ButtonWhitelistEntry[] = [
  {
    selector: '.icd-btn.icd-btn-tertiary',
    displayName: '后台运行/取消',
    riskLevel: 'medium',
    maxClicksPerHour: 5,
  },
  {
    selector: '.icd-delete-files-command-card-v2-actions-cancel',
    displayName: '保留（删除弹窗）',
    riskLevel: 'low',
    maxClicksPerHour: 20,
  },
  {
    selector: '.icd-delete-files-command-card-v2-actions-delete',
    displayName: '删除（删除弹窗）',
    riskLevel: 'high',
    maxClicksPerHour: 2,
  },
  {
    selector: '.icd-overwrite-files-command-card-v2-actions-cancel',
    displayName: '保留（覆盖弹窗）',
    riskLevel: 'low',
    maxClicksPerHour: 20,
  },
  {
    selector: '.icd-overwrite-files-command-card-v2-actions-overwrite',
    displayName: '覆盖',
    riskLevel: 'high',
    maxClicksPerHour: 2,
  },
  {
    selector: '.chat-input-v2-send-button',
    displayName: '停止按钮',
    riskLevel: 'medium',
    maxClicksPerHour: 5,
  },
];

/**
 * 检查按钮是否在白名单中
 */
export function isButtonAllowed(selector: string): {
  allowed: boolean;
  entry?: ButtonWhitelistEntry;
  reason?: string;
} {
  const entry = BUTTON_WHITELIST.find(
    (b) => selector.includes(b.selector) || b.selector.includes(selector)
  );

  if (!entry) {
    return {
      allowed: false,
      reason: `按钮 "${selector}" 不在白名单中，操作被拒绝`,
    };
  }

  return { allowed: true, entry };
}

/**
 * 检查按钮风险等级
 */
export function getButtonRiskLevel(selector: string): 'low' | 'medium' | 'high' | 'unknown' {
  const result = isButtonAllowed(selector);
  return result.entry?.riskLevel || 'unknown';
}

/**
 * 检查按钮是否需要人工确认（高风险操作）
 */
export function requiresConfirmation(selector: string): boolean {
  const result = isButtonAllowed(selector);
  return result.entry?.riskLevel === 'high';
}
