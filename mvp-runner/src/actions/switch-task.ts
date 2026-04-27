// src/actions/switch-task.ts - 切换任务槽位
// 最佳实践：通过任务名称匹配，不依赖固定索引

import createDebug from 'debug';
import { CDPClient } from '../cdp/client.js';
import { TaskSwitchError } from '../errors.js';

const debug = createDebug('mvp:action:switch');

// 任务选项卡选择器
const TASK_ITEM_SELECTOR = '.index-module__task-item___zOpfg';

/** 扫描所有任务 */
async function scanTasks(cdp: CDPClient): Promise<Array<{ index: number; text: string; isSelected: boolean }>> {
  return await cdp.evaluate(`
    (() => {
      const items = document.querySelectorAll('${TASK_ITEM_SELECTOR}');
      return Array.from(items).map((el, i) => ({
        index: i,
        text: el.textContent?.trim() || '',
        isSelected: el.className.includes('selected')
      }));
    })()
  `);
}

/** 通过 slot 索引或名称切换到指定任务 */
export async function switchTask(cdp: CDPClient, slot: number): Promise<void> {
  debug(`Switching to task slot ${slot}`);

  // 1. 扫描当前任务列表
  const tasks = await scanTasks(cdp);
  debug(`Found ${tasks.length} tasks: ${tasks.map(t => t.text).join(', ')}`);

  if (tasks.length === 0) {
    throw new TaskSwitchError(slot, 'No tasks found');
  }

  // 2. 找到目标任务
  // 优先使用索引，如果索引无效则通过名称匹配
  let targetTask = tasks.find(t => t.index === slot);
  
  // 如果索引无效，尝试通过名称匹配
  if (!targetTask) {
    const slotName = slot === 0 ? 'PMCLI' : `Slot${slot}`;
    targetTask = tasks.find(t => t.text.includes(slotName));
  }

  if (!targetTask) {
    throw new TaskSwitchError(slot, `Task slot ${slot} not found in ${tasks.length} tasks`);
  }

  debug(`Target task found: [${targetTask.index}] ${targetTask.text} (selected=${targetTask.isSelected})`);

  // 3. 如果不是当前选中，点击切换
  if (!targetTask.isSelected) {
    const result = await cdp.evaluate(`
      (() => {
        const items = document.querySelectorAll('${TASK_ITEM_SELECTOR}');
        if (!items[${targetTask.index}]) return { success: false, error: 'item not found' };
        items[${targetTask.index}].click();
        return { success: true, clickedIndex: ${targetTask.index} };
      })()
    `);

    if (!result.success) {
      throw new TaskSwitchError(slot, `Click failed: ${result.error}`);
    }

    // 等待面板切换
    await sleep(1500);
    debug(`Switched to task slot ${slot}: ${targetTask.text}`);
  } else {
    debug(`Task slot ${slot} already selected`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
