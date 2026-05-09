// src/dom/task-scope.ts - 任务作用域选择器与辅助函数
// 基于 Step 0 DOM 实测结果：task-item 和 chat-turn 在同一个 split-view-container 的不同 split-view-view 中

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
 * 然后找到包含 chat-turn 的 split-view-view
 *
 * @returns 聊天根容器的 JS 代码字符串（用于 CDP evaluate）
 */
export const GET_SCOPED_CHAT_ROOT_SCRIPT = `
(function() {
  // 1. 找到当前选中的任务项
  const activeTask = document.querySelector('${SELECTORS.ACTIVE_TASK}');
  if (!activeTask) return { __error: '__NO_ACTIVE_TASK__' };

  // 2. 向上找到 split-view-container
  let container = activeTask;
  while (container && !container.classList.contains('split-view-container')) {
    container = container.parentElement;
    if (!container) return { __error: '__NO_CONTAINER__' };
  }

  // 3. 在 container 的子元素中找到包含 chat-turn 的 split-view-view
  const views = container.querySelectorAll(':scope > ${SELECTORS.SPLIT_VIEW_VIEW}');
  let chatRoot = null;
  for (const view of views) {
    if (view.querySelectorAll('${SELECTORS.CHAT_TURN}').length > 0) {
      chatRoot = view;
      break;
    }
  }

  // 4. 兜底：如果找不到，尝试在 container 内直接查找
  if (!chatRoot) {
    chatRoot = container.querySelector('.icube-chat-view-container, .chat-list-wrapper, [class*="chat-view"]');
  }

  if (!chatRoot) return { __error: '__NO_CHAT_ROOT__' };

  return { __root: true, element: chatRoot };
})()
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
      ${GET_SCOPED_CHAT_ROOT_SCRIPT.replace('return { __root: true, element: chatRoot };', '')}
      if (chatRoot.__error) return chatRoot.__error;
      if (!chatRoot) return '__NO_CHAT_ROOT__';

      const root = chatRoot.element || chatRoot;
      ${queryType === 'all'
        ? `return Array.from(root.querySelectorAll(${JSON.stringify(innerSelector)}));`
        : `return root.querySelector(${JSON.stringify(innerSelector)}) || null;`
      }
    })()
  `;
}

/**
 * 获取限定作用域的 chat-turn 列表
 * 用于替换全局 document.querySelectorAll('.chat-turn')
 */
export const SCOPED_CHAT_TURN_SCRIPT = `
(function() {
  ${GET_SCOPED_CHAT_ROOT_SCRIPT.replace('return { __root: true, element: chatRoot };', '')}
  if (chatRoot.__error) return chatRoot.__error;
  if (!chatRoot) return '__NO_CHAT_ROOT__';

  const root = chatRoot.element || chatRoot;
  return Array.from(root.querySelectorAll('${SELECTORS.CHAT_TURN}'));
})()
`;

/**
 * 获取最后一个 AI chat-turn（非用户消息）
 */
export const GET_LAST_AI_TURN_SCRIPT = `
(function() {
  ${GET_SCOPED_CHAT_ROOT_SCRIPT.replace('return { __root: true, element: chatRoot };', '')}
  if (chatRoot.__error) return chatRoot.__error;
  if (!chatRoot) return '__NO_CHAT_ROOT__';

  const root = chatRoot.element || chatRoot;
  const turns = root.querySelectorAll('${SELECTORS.CHAT_TURN}');
  if (turns.length === 0) return '';

  for (let i = turns.length - 1; i >= 0; i--) {
    const turn = turns[i];
    if (!turn.classList.contains('user')) {
      return (turn.innerText || '').replace(/复制图片/g, '').trim();
    }
  }
  return '';
})()
`;

export interface WaitForDomStableOptions {
  selector: string;
  stableMs: number;
  timeoutMs: number;
}

export async function waitForDomStable(
  cdp: { evaluate<T>(script: string): Promise<T> },
  options: WaitForDomStableOptions
): Promise<boolean> {
  const { selector, stableMs, timeoutMs } = options;

  const result = await cdp.evaluate<{ stable: boolean; timedOut: boolean }>(`
    new Promise((resolve) => {
      const target = document.querySelector(${JSON.stringify(selector)});
      if (!target) {
        resolve({ stable: false, timedOut: false });
        return;
      }

      let lastMutationTime = Date.now();
      let stableTimer: ReturnType<typeof setTimeout> | null = null;

      const checkStable = () => {
        const elapsed = Date.now() - lastMutationTime;
        if (elapsed >= ${stableMs}) {
          observer.disconnect();
          resolve({ stable: true, timedOut: false });
        }
      };

      const observer = new MutationObserver(() => {
        lastMutationTime = Date.now();
        if (stableTimer) clearTimeout(stableTimer);
        stableTimer = setTimeout(checkStable, ${stableMs});
      });

      observer.observe(target, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true,
      });

      setTimeout(() => {
        observer.disconnect();
        if (stableTimer) clearTimeout(stableTimer);
        resolve({ stable: false, timedOut: true });
      }, ${timeoutMs});

      stableTimer = setTimeout(checkStable, ${stableMs});
    })
  `);

  return result.stable;
}
