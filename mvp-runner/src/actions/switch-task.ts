// src/actions/switch-task.ts - 切换任务槽位

import createDebug from 'debug';
import { CDPClient } from '../cdp/client.js';
import { resolve } from '../selectors/resolver.js';
import { TaskSwitchError } from '../errors.js';

const debug = createDebug('mvp:action:switch');

export async function switchTask(cdp: CDPClient, taskIndex: number): Promise<void> {
  debug(`Switching to task slot ${taskIndex}`);

  const selector = await resolve(cdp, 'task_list.item');

  // 获取当前 Chat 面板内容 hash（用于验证切换成功）
  const beforeHash = await cdp.evaluate(
    `document.querySelector('.chat-panel')?.textContent?.length || 0`
  );

  // 获取目标任务项的坐标并点击
  const coords = await cdp.evaluate(`
    (function() {
      const items = document.querySelectorAll('${selector}');
      if (!items[${taskIndex}]) return null;
      const rect = items[${taskIndex}].getBoundingClientRect();
      return JSON.stringify({
        x: Math.round(rect.left + rect.width / 2),
        y: Math.round(rect.top + rect.height / 2)
      });
    })()
  `);

  if (!coords) {
    throw new TaskSwitchError(taskIndex, `Task slot ${taskIndex} not found`);
  }

  const { x, y } = JSON.parse(coords);

  // 点击目标任务项
  await cdp.Input.dispatchMouseEvent({
    type: 'mousePressed', x, y, button: 'left', clickCount: 1,
  });
  await sleep(80);
  await cdp.Input.dispatchMouseEvent({
    type: 'mouseReleased', x, y, button: 'left', clickCount: 1,
  });

  // 等待 Chat 面板切换
  await sleep(1500);

  // 验证切换成功
  const afterHash = await cdp.evaluate(
    `document.querySelector('.chat-panel')?.textContent?.length || 0`
  );

  if (afterHash === beforeHash) {
    debug(`Chat panel content unchanged, switch may have failed (before=${beforeHash}, after=${afterHash})`);
    // 不抛异常，因为可能是同一个任务
  }

  debug(`Switched to task slot ${taskIndex}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
