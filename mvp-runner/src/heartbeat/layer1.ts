/**
 * Layer 1 Collector - 快速检测层
 * 5秒周期，<5ms成本，轻量级DOM状态采集
 */

import type { CDPClient } from '../cdp/client.js';
import type { HeartbeatMode, DetectionResult, Signal } from './types.js';
import createDebug from 'debug';

const debug = createDebug('mvp:heartbeat:layer1');

export interface Layer1Payload {
  timestamp: number;
  taskStatus: string | null;
  hasBackgroundBtn: boolean;
  hasCancelBtn: boolean;
  hasRetainDeleteBtns: boolean;
  activeTaskId: string | null;
  domHash: string;
  tasks: TaskSnapshot[];
}

export interface TaskSnapshot {
  index: number;
  name: string;
  status: string;
  isSelected: boolean;
  isActive: boolean;
}

export class Layer1Collector {
  private lastDomHash: string = '';
  private lastTasksHash: string = '';

  async collect(cdp: CDPClient): Promise<{
    payload: Layer1Payload;
    result: DetectionResult;
  }> {
    const startTime = Date.now();

    try {
      // 并行采集多个信号
      const [
        tasks,
        hasBackgroundBtn,
        hasCancelBtn,
        hasRetainDeleteBtns,
        domHash,
      ] = await Promise.all([
        this.scanAllTasks(cdp),
        this.hasElement(cdp, '.icd-btn.icd-btn-tertiary', '后台运行'),
        this.hasElement(cdp, '.icd-btn.icd-btn-tertiary', '取消'),
        this.hasRetainDeleteButtons(cdp),
        this.getDomHash(cdp),
      ]);

      // 从任务列表中提取当前活动任务信息
      const activeTask = tasks.find(t => t.isActive) || tasks.find(t => t.isSelected);
      const taskStatus = activeTask?.status || null;
      const activeTaskId = activeTask?.name || null;

      const payload: Layer1Payload = {
        timestamp: startTime,
        taskStatus,
        hasBackgroundBtn,
        hasCancelBtn,
        hasRetainDeleteBtns,
        activeTaskId,
        domHash,
        tasks,
      };

      const mode = this.determineMode(payload);
      const cost = Date.now() - startTime;

      // 检测DOM变化
      const domChanged = this.lastDomHash !== '' && this.lastDomHash !== domHash;
      this.lastDomHash = domHash;

      // 检测任务列表变化
      const tasksHash = this.getTasksHash(tasks);
      const tasksChanged = this.lastTasksHash !== '' && this.lastTasksHash !== tasksHash;
      this.lastTasksHash = tasksHash;

      const result: DetectionResult = {
        mode,
        confidence: this.calculateConfidence(payload, domChanged),
        signals: [
          {
            type: domChanged ? 'dom_changed' : 'thread_responsive',
            source: 'layer1',
            value: { taskStatus, hasBackgroundBtn, hasRetainDeleteBtns, tasksCount: tasks.length },
            timestamp: startTime,
            weight: mode === 'normal' ? 0.3 : 0.8,
          },
        ],
        timestamp: startTime,
        layer: 1,
        cost,
      };

      // 打印详细的 Layer 1 检查结果
      debug('Layer 1 check: cost=%dms, mode=%s, confidence=%d%%', cost, mode, Math.round(result.confidence * 100));
      debug('  Tasks[%d]: %s', tasks.length, tasks.map(t => `${t.name}(${t.status}${t.isActive ? ',active' : ''})`).join(', ') || 'none');
      debug('  Active: %s, Status: %s', activeTaskId || 'null', taskStatus || 'null');
      debug('  Buttons: background=%s, cancel=%s, retain/delete=%s', hasBackgroundBtn, hasCancelBtn, hasRetainDeleteBtns);
      debug('  DOM: changed=%s, hash=%s', domChanged, domHash);

      // 如果任务列表变化，额外打印一次
      if (tasksChanged) {
        debug('  ⚠️ Task list changed!');
      }

      return { payload, result };
    } catch (error) {
      // 采集失败时返回空payload，模式为normal
      const payload: Layer1Payload = {
        timestamp: startTime,
        taskStatus: null,
        hasBackgroundBtn: false,
        hasCancelBtn: false,
        hasRetainDeleteBtns: false,
        activeTaskId: null,
        domHash: '',
        tasks: [],
      };

      const result: DetectionResult = {
        mode: 'normal',
        confidence: 0.5,
        signals: [
          {
            type: 'thread_responsive',
            source: 'layer1',
            value: { error: error instanceof Error ? error.message : 'unknown' },
            timestamp: startTime,
            weight: 0.1,
          },
        ],
        timestamp: startTime,
        layer: 1,
        cost: Date.now() - startTime,
      };

      debug('Layer 1 check failed: %s', error instanceof Error ? error.message : 'unknown');

      return { payload, result };
    }
  }

  /**
   * 扫描所有任务列表
   */
  private async scanAllTasks(cdp: CDPClient): Promise<TaskSnapshot[]> {
    try {
      const tasks = await cdp.evaluate<TaskSnapshot[]>(`
        (() => {
          const items = document.querySelectorAll('.index-module__task-item___zOpfg');
          if (!items.length) return [];
          
          return Array.from(items).map((el, index) => {
            const text = el.textContent?.trim() || '';
            
            // 识别任务名称
            let name = 'unknown';
            if (text.includes('PMCLI')) name = 'PMCLI';
            else if (text.includes('DEVCLI')) name = 'DEVCLI';
            else if (text.includes('WikiBot')) name = 'WikiBot';
            
            // 识别状态
            let status = 'unknown';
            if (text.includes('完成')) status = 'completed';
            else if (text.includes('进行中')) status = 'in_progress';
            else if (text.includes('中断')) status = 'interrupted';
            else if (text.includes('空闲') || text.includes('idle')) status = 'idle';
            
            // 检查是否选中/活动
            const isSelected = el.className.includes('selected') || el.className.includes('active');
            const isActive = el.className.includes('active') || el.className.includes('running');
            
            return { index, name, status, isSelected, isActive };
          }).filter(t => t.name !== 'unknown');
        })()
      `);
      return tasks || [];
    } catch (err) {
      debug('Scan tasks failed: %s', err instanceof Error ? err.message : 'unknown');
      return [];
    }
  }

  private getTasksHash(tasks: TaskSnapshot[]): string {
    return tasks.map(t => `${t.name}:${t.status}:${t.isActive ? '1' : '0'}`).join('|');
  }

  private determineMode(payload: Layer1Payload): HeartbeatMode {
    // 如果存在保留/删除按钮，说明有弹窗阻塞
    if (payload.hasRetainDeleteBtns) return 'frozen';

    // 如果存在后台运行按钮，说明任务可能在后台
    if (payload.hasBackgroundBtn) return 'background';

    // 如果存在取消按钮，说明有任务在进行中
    if (payload.hasCancelBtn) return 'normal';

    // 检查是否有进行中的任务
    const hasInProgress = payload.tasks.some(t => t.status === 'in_progress');
    if (hasInProgress) return 'normal';

    // 检查是否有活动任务
    const hasActive = payload.tasks.some(t => t.isActive);
    if (hasActive) return 'normal';

    // 检查是否有中断的任务 - 需要恢复
    const hasInterrupted = payload.tasks.some(t => t.status === 'interrupted');
    if (hasInterrupted) {
      debug('⚠️ Detected interrupted task, marking as frozen for recovery');
      return 'frozen';
    }

    // 如果没有任何任务活动，可能是空闲状态
    if (payload.tasks.length === 0 || payload.tasks.every(t => t.status === 'idle' || t.status === 'completed')) {
      return 'idle';
    }

    return 'normal';
  }

  private calculateConfidence(payload: Layer1Payload, domChanged: boolean): number {
    let confidence = 0.5;

    if (payload.hasRetainDeleteBtns) confidence += 0.4;
    if (payload.hasBackgroundBtn) confidence += 0.2;
    if (payload.hasCancelBtn) confidence += 0.1;
    if (payload.taskStatus) confidence += 0.2;
    if (domChanged) confidence += 0.1;
    if (payload.activeTaskId) confidence += 0.1;
    if (payload.tasks.length > 0) confidence += 0.1;

    return Math.min(confidence, 1.0);
  }

  private async hasElement(cdp: CDPClient, selector: string, text?: string): Promise<boolean> {
    try {
      const expression = text
        ? `
          (() => {
            const elements = document.querySelectorAll('${selector}');
            return Array.from(elements).some(el => el.textContent?.includes('${text}'));
          })()
        `
        : `document.querySelector('${selector}') !== null`;

      const value = await cdp.evaluate<boolean>(expression);
      return value || false;
    } catch {
      return false;
    }
  }

  private async hasRetainDeleteButtons(cdp: CDPClient): Promise<boolean> {
    try {
      const value = await cdp.evaluate<boolean>(`
        (() => {
          const hasRetain = !!document.querySelector('.icd-delete-files-command-card-v2-actions-cancel, .icd-overwrite-files-command-card-v2-actions-cancel');
          const hasDelete = !!document.querySelector('.icd-delete-files-command-card-v2-actions-delete, .icd-overwrite-files-command-card-v2-actions-delete');
          return hasRetain && hasDelete;
        })()
      `);
      return value || false;
    } catch {
      return false;
    }
  }

  private async getDomHash(cdp: CDPClient): Promise<string> {
    try {
      const value = await cdp.evaluate<string>(`
        (() => {
          const body = document.body;
          if (!body) return '';
          // 简单的DOM哈希：统计关键元素数量
          const counts = [
            document.querySelectorAll('button').length,
            document.querySelectorAll('.chat-turn').length,
            document.querySelectorAll('.index-module__task-item___zOpfg').length,
            document.querySelectorAll('.icd-modal').length,
          ];
          return counts.join(',');
        })()
      `);
      return value || '';
    } catch {
      return '';
    }
  }
}
