// src/actions/switch-task.ts - 切换任务槽位

import createDebug from 'debug';
import { CDPClient } from '../cdp/client.js';
import { TaskSwitchError } from '../errors.js';

const debug = createDebug('mvp:action:switch');

// 参考 get-latest-tasks.js 的实现
const TASK_ITEM_SELECTOR = '.index-module__task-item___zOpfg';

export async function switchTask(cdp: CDPClient, taskIndex: number): Promise<void> {
  debug(`Switching to task slot ${taskIndex}`);

  // 直接使用正确的选择器（参考 get-latest-tasks.js）
  const result = await cdp.evaluate(`
    (function() {
      const items = document.querySelectorAll('${TASK_ITEM_SELECTOR}');
      if (!items[${taskIndex}]) return null;
      items[${taskIndex}].click();
      return { success: true, text: items[${taskIndex}].textContent?.slice(0, 30) };
    })()
  `);

  if (!result) {
    throw new TaskSwitchError(taskIndex, `Task slot ${taskIndex} not found`);
  }

  // 等待 Chat 面板切换
  await sleep(1500);

  debug(`Switched to task slot ${taskIndex}: ${result.text}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
