// src/actions/scan-tasks.ts - 扫描侧边栏任务列表
import createDebug from 'debug';
import { CDPClient } from '../cdp/client.js';

const debug = createDebug('mvp:action:scan');

export interface TaskInfo {
  index: number;
  name: string;
  text: string;
  status: 'completed' | 'in_progress' | 'interrupted' | 'unknown';
  isSelected: boolean;
  hasCompleteIcon: boolean;
}

/**
 * 扫描侧边栏任务列表
 * 返回所有任务的信息
 */
export async function scanTasks(cdp: CDPClient): Promise<TaskInfo[]> {
  debug('Scanning task list...');
  
  const result = await cdp.evaluate<TaskInfo[]>(`
    (function() {
      const items = document.querySelectorAll('.index-module__task-item___zOpfg');
      
      return Array.from(items).map((el, index) => {
        const text = el.textContent?.trim() || '';
        
        // 识别任务名称
        let name = 'unknown';
        if (text.includes('PMCLI')) name = 'PMCLI';
        else if (text.includes('DEVCLI')) name = 'DEVCLI';
        
        // 识别状态
        let status = 'unknown';
        if (text.includes('完成')) status = 'completed';
        else if (text.includes('进行中')) status = 'in_progress';
        else if (text.includes('中断')) status = 'interrupted';
        
        // 检查完成图标
        const hasCompleteIcon = el.querySelector('.index-module__task-status__complete___ThOzg') !== null;
        
        // 检查是否选中
        const isSelected = el.className.includes('selected');
        
        return {
          index,
          name,
          text: text.slice(0, 60),
          status,
          isSelected,
          hasCompleteIcon
        };
      });
    })()
  `);
  
  const tasks: TaskInfo[] = result || [];
  debug(`Found ${tasks.length} tasks: ${tasks.map((t: TaskInfo) => `${t.name}(${t.status})`).join(', ')}`);
  
  return tasks;
}

/**
 * 根据任务名称查找对应的slot索引
 * @param tasks 任务列表
 * @param taskName 任务名称，如 'PMCLI' 或 'DEVCLI'
 * @returns 任务索引，未找到返回 -1
 */
export function findTaskSlot(tasks: TaskInfo[], taskName: string): number {
  const task = tasks.find(t => t.name.toUpperCase() === taskName.toUpperCase());
  return task ? task.index : -1;
}

/**
 * 检查指定任务是否已完成
 */
export function isTaskCompleted(tasks: TaskInfo[], taskName: string): boolean {
  const task = tasks.find(t => t.name.toUpperCase() === taskName.toUpperCase());
  return task ? task.status === 'completed' : false;
}

/**
 * 获取当前选中的任务
 */
export function getSelectedTask(tasks: TaskInfo[]): TaskInfo | null {
  return tasks.find(t => t.isSelected) || null;
}
