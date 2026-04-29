/**
 * Layer 1 Fast Detection - 快速检测层
 * 5秒周期，<5ms成本，轻量级DOM状态采集
 */

import type { CDPClient } from '../cdp/client.js';
import type { DetectionResult, HeartbeatMode } from './types.js';

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
      // 采集失败，返回空payload
      const cost = Date.now() - startTime;
      return {
        payload: {
          timestamp: startTime,
          taskStatus: null,
          hasBackgroundBtn: false,
          hasCancelBtn: false,
          hasRetainDeleteBtns: false,
          activeTaskId: null,
          domHash: '',
        },
        result: {
          mode: 'normal',
          confidence: 0.5,
          signals: [
            {
              type: 'thread_blocked',
              source: 'layer1',
              value: error instanceof Error ? error.message : 'unknown',
              timestamp: startTime,
              weight: 0.5,
            },
          ],
          timestamp: startTime,
          layer: 1,
          cost,
        },
      };
    }
  }

  private determineMode(payload: Layer1Payload): HeartbeatMode {
    if (payload.taskStatus?.includes('中断')) return 'frozen';
    if (payload.hasRetainDeleteBtns) return 'frozen';
    if (payload.hasBackgroundBtn) return 'background';
    if (payload.taskStatus === '完成') return 'normal';
    return 'normal';
  }

  private calculateConfidence(payload: Layer1Payload, domChanged: boolean): number {
    let confidence = 0.5;

    if (payload.taskStatus) confidence += 0.2;
    if (domChanged) confidence += 0.2;
    if (payload.activeTaskId) confidence += 0.1;

    return Math.min(confidence, 1.0);
  }

  private async getTaskStatus(cdp: CDPClient): Promise<string | null> {
    try {
      const result = await cdp.send('Runtime.evaluate', {
        expression: `
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
        `,
        returnByValue: true,
      });
      return result.result?.value || null;
    } catch {
      return null;
    }
  }

  private async hasElement(
    cdp: CDPClient,
    selector: string,
    text?: string
  ): Promise<boolean> {
    try {
      const expression = text
        ? `
          (() => {
            const elements = document.querySelectorAll('${selector}');
            return Array.from(elements).some(el => el.textContent?.includes('${text}'));
          })()
        `
        : `document.querySelector('${selector}') !== null`;

      const result = await cdp.send('Runtime.evaluate', {
        expression,
        returnByValue: true,
      });
      return result.result?.value || false;
    } catch {
      return false;
    }
  }

  private async hasRetainDeleteButtons(cdp: CDPClient): Promise<boolean> {
    try {
      const result = await cdp.send('Runtime.evaluate', {
        expression: `
          (() => {
            const hasRetain = !!document.querySelector('.icd-delete-files-command-card-v2-actions-cancel, .icd-overwrite-files-command-card-v2-actions-cancel');
            const hasDelete = !!document.querySelector('.icd-delete-files-command-card-v2-actions-delete, .icd-overwrite-files-command-card-v2-actions-overwrite');
            return hasRetain && hasDelete;
          })()
        `,
        returnByValue: true,
      });
      return result.result?.value || false;
    } catch {
      return false;
    }
  }

  private async getActiveTaskId(cdp: CDPClient): Promise<string | null> {
    try {
      const result = await cdp.send('Runtime.evaluate', {
        expression: `
          (() => {
            const activeItem = document.querySelector('.index-module__task-item--active___xyz');
            if (!activeItem) return null;
            return activeItem.getAttribute('data-task-id') || 
                   activeItem.querySelector('[data-id]')?.getAttribute('data-id') || null;
          })()
        `,
        returnByValue: true,
      });
      return result.result?.value || null;
    } catch {
      return null;
    }
  }

  private async getDomHash(cdp: CDPClient): Promise<string> {
    try {
      const result = await cdp.send('Runtime.evaluate', {
        expression: `
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
        `,
        returnByValue: true,
      });
      return result.result?.value || '';
    } catch {
      return '';
    }
  }
}
