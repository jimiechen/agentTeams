/**
 * Layer 1 Collector - 快速检测层
 * 5秒周期，<5ms成本，轻量级DOM状态采集
 */

import type { CDPClient } from '../cdp/client.js';
import type { HeartbeatMode, DetectionResult, Signal } from './types.js';

export interface Layer1Payload {
  timestamp: number;
  taskStatus: string | null;
  hasBackgroundBtn: boolean;
  hasCancelBtn: boolean;
  hasRetainDeleteBtns: boolean;
  activeTaskId: string | null;
  domHash: string;
}

export class Layer1Collector {
  private lastDomHash: string = '';

  async collect(cdp: CDPClient): Promise<{
    payload: Layer1Payload;
    result: DetectionResult;
  }> {
    const startTime = Date.now();

    try {
      // 并行采集多个信号
      const [
        taskStatus,
        hasBackgroundBtn,
        hasCancelBtn,
        hasRetainDeleteBtns,
        activeTaskId,
        domHash,
      ] = await Promise.all([
        this.getTaskStatus(cdp),
        this.hasElement(cdp, '.icd-btn.icd-btn-tertiary', '后台运行'),
        this.hasElement(cdp, '.icd-btn.icd-btn-tertiary', '取消'),
        this.hasRetainDeleteButtons(cdp),
        this.getActiveTaskId(cdp),
        this.getDomHash(cdp),
      ]);

      const payload: Layer1Payload = {
        timestamp: startTime,
        taskStatus,
        hasBackgroundBtn,
        hasCancelBtn,
        hasRetainDeleteBtns,
        activeTaskId,
        domHash,
      };

      const mode = this.determineMode(payload);
      const cost = Date.now() - startTime;

      // 检测DOM变化
      const domChanged = this.lastDomHash !== '' && this.lastDomHash !== domHash;
      this.lastDomHash = domHash;

      const result: DetectionResult = {
        mode,
        confidence: this.calculateConfidence(payload, domChanged),
        signals: [
          {
            type: domChanged ? 'dom_changed' : 'thread_responsive',
            source: 'layer1',
            value: { taskStatus, hasBackgroundBtn, hasRetainDeleteBtns },
            timestamp: startTime,
            weight: mode === 'normal' ? 0.3 : 0.8,
          },
        ],
        timestamp: startTime,
        layer: 1,
        cost,
      };

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

      return { payload, result };
    }
  }

  private determineMode(payload: Layer1Payload): HeartbeatMode {
    // 如果存在保留/删除按钮，说明有弹窗阻塞
    if (payload.hasRetainDeleteBtns) return 'frozen';

    // 如果存在后台运行按钮，说明任务可能在后台
    if (payload.hasBackgroundBtn) return 'background';

    // 如果存在取消按钮，说明有任务在进行中
    if (payload.hasCancelBtn) return 'normal';

    // 如果没有任何按钮，可能是空闲状态
    if (!payload.taskStatus) return 'idle';

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

    return Math.min(confidence, 1.0);
  }

  private async getTaskStatus(cdp: CDPClient): Promise<string | null> {
    try {
      const value = await cdp.evaluate<string | null>(`
        (() => {
          const items = document.querySelectorAll('.index-module__task-item___zOpfg');
          for (const item of items) {
            if (item.classList.contains('index-module__task-item--active___xyz')) {
              const statusEl = item.querySelector('.task-status-text');
              return statusEl?.textContent?.trim() || null;
            }
          }
          return null;
        })()
      `);
      return value;
    } catch {
      return null;
    }
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

  private async getActiveTaskId(cdp: CDPClient): Promise<string | null> {
    try {
      const value = await cdp.evaluate<string | null>(`
        (() => {
          const activeItem = document.querySelector('.index-module__task-item--active___xyz');
          if (!activeItem) return null;
          return activeItem.getAttribute('data-task-id') || 
                 activeItem.querySelector('[data-id]')?.getAttribute('data-id') || null;
        })()
      `);
      return value;
    } catch {
      return null;
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
