// src/dom/task-scope.ts - 任务作用域选择器与辅助函数
// 基于 Step 0 DOM 实测结果：task-item 和 chat-turn 在同一个 split-view-container 的不同 split-view-view 中

import { CDPClient } from '../cdp/client.js';

/**
 * 任务作用域选择器常量
 * 所有选择器必须使用属性选择器或稳定业务类名，禁止硬编码 CSS Module 哈希
 */
export const SELECTORS = {
  /** 当前选中的任务项 */
  ACTIVE_TASK: '[class*="task-item"][class*="selected"]',
  /** chat-turn 元素 */
  CHAT_TURN: '.chat-turn',
  /** split-view-container - task-item 和 chat-turn 的共同父容器 */
  SPLIT_VIEW_CONTAINER: '.split-view-container',
  /** split-view-view - 包含 chat-turn 的视图 */
  SPLIT_VIEW_VIEW: '.split-view-view',
  /** 发送按钮 */
  SEND_BUTTON: '.chat-input-v2-send-button',
  /** 代码块 */
  CODE_BLOCK: 'pre code',
  /** 图片（排除头像） */
  IMAGE: 'img',
} as const;

/**
 * 任务作用域错误
 * 当无法找到活动任务或聊天容器时抛出
 */
export class TaskScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TaskScopeError';
  }
}

/**
 * 获取当前活动任务的聊天根容器
 * 策略：从 selected task-item 向上找到 split-view-container，
 * 然后找到**直接包含** chat-turn 的 split-view-view（不是通过嵌套子元素）
 *
 * 修复：使用 :scope > 限定直接子元素，避免递归查找嵌套的 chat-turn
 *
 * @returns 聊天根容器的 JS 代码字符串（用于 CDP evaluate）
 */
export const GET_SCOPED_CHAT_ROOT_SCRIPT = `
  // 1. 找到当前选中的任务项
  const activeTask = document.querySelector('${SELECTORS.ACTIVE_TASK}');
  if (!activeTask) return { __error: '__NO_ACTIVE_TASK__' };

  // 2. 向上找到 split-view-container
  let container = activeTask;
  while (container && !container.classList.contains('split-view-container')) {
    container = container.parentElement;
    if (!container) return { __error: '__NO_CONTAINER__' };
  }

  // 3. 在 container 的所有后代元素中找到包含 chat-turn 的 split-view-view
  // 修复：递归查找所有 split-view-view，找到包含 chat-turn 的那个
  const views = container.querySelectorAll(':scope > ${SELECTORS.SPLIT_VIEW_VIEW}');
  let chatRoot = null;
  
  // 首先尝试直接子元素
  for (const view of views) {
    const directChatTurns = view.querySelectorAll(':scope > * > .chat-turn, :scope > .chat-turn');
    if (directChatTurns.length > 0) {
      chatRoot = view;
      break;
    }
  }
  
  // 如果直接子元素没找到，递归查找嵌套的 split-view-view
  if (!chatRoot) {
    for (const view of views) {
      const nestedViews = view.querySelectorAll('.split-view-view');
      for (const nestedView of nestedViews) {
        const turns = nestedView.querySelectorAll('.chat-turn');
        if (turns.length > 0) {
          chatRoot = nestedView;
          break;
        }
      }
      if (chatRoot) break;
    }
  }

  // 5. 兜底：如果找不到，尝试在 container 内直接查找
  if (!chatRoot) {
    chatRoot = container.querySelector('.icube-chat-view-container, .chat-list-wrapper, [class*="chat-view"]');
  }

  if (!chatRoot) return { __error: '__NO_CHAT_ROOT__' };
`;

/**
 * 构建限定作用域的查询脚本
 * 在 CDP evaluate 中使用，确保只查询当前活动任务的 DOM
 *
 * @param innerSelector 内部选择器（如 '.chat-turn'）
 * @param queryType 查询类型：'single' | 'all'
 * @returns 可执行的 JS 代码字符串
 */
export function buildScopedQuery(innerSelector: string, queryType: 'single' | 'all' = 'all'): string {
  return `
    (function() {
      ${GET_SCOPED_CHAT_ROOT_SCRIPT}
      if (chatRoot && chatRoot.__error) return chatRoot.__error;
      if (!chatRoot) return '__NO_CHAT_ROOT__';

      const root = chatRoot;
      ${queryType === 'all'
        ? `return Array.from(root.querySelectorAll(${JSON.stringify(innerSelector)}));`
        : `return root.querySelector(${JSON.stringify(innerSelector)}) || null;`
      }
    })()
  `;
}

/**
 * 等待 DOM 稳定
 * 用于 recovery 后确认 DOM 不再变化
 *
 * @param cdp CDP 客户端
 * @param options 配置选项
 * @returns 是否稳定
 */
export async function waitForDomStable(
  cdp: CDPClient,
  options: {
    selector: string;
    stableMs: number;
    timeoutMs: number;
  }
): Promise<boolean> {
  const startTime = Date.now();
  let lastHtml = '';
  let stableStart = 0;

  while (Date.now() - startTime < options.timeoutMs) {
    const currentHtml = await cdp.evaluate<string>(`
      (function() {
        const el = document.querySelector(${JSON.stringify(options.selector)});
        return el ? el.outerHTML : '';
      })()
    `);

    if (currentHtml === lastHtml) {
      if (stableStart === 0) {
        stableStart = Date.now();
      } else if (Date.now() - stableStart >= options.stableMs) {
        return true;
      }
    } else {
      stableStart = 0;
      lastHtml = currentHtml;
    }

    await new Promise(resolve => setTimeout(resolve, 100));
  }

  return false;
}
