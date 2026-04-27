/**
 * ChatMutex 并发锁状态机
 * PRD 对应：3.2 并发控制 + 10.2 ChatMutex 异常保护
 * 执行卡片：exec-units/chat-mutex.yaml (xstate_binding)
 *
 * 状态流转：idle → locked → idle (正常释放)
 *                     → timeout → idle (超时释放)
 */

import { createMachine, assign } from 'xstate';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger';
import { eventBus } from '../core/event-bus';

const STATE_DIR = path.join(
  process.env.HOME || '/tmp',
  '.trae-agent-team',
  '.mutex-state'
);

export interface MutexContext {
  port: number;
  locked: boolean;
  currentTaskId: string | null;
  queue: Array<{ taskId: string; timestamp: number }>;
  lockTimeoutMs: number;
  maxQueueSize: number;
}

export type MutexEvent =
  | { type: 'ACQUIRE'; taskId: string }
  | { type: 'RELEASE' }
  | { type: 'TIMEOUT' }
  | { type: 'PROCESS_CRASH' };

export const chatMutexMachine = createMachine(
  {
    id: 'chatMutexMachine',
    initial: 'idle',
    context: {
      port: 9222,
      locked: false,
      currentTaskId: null,
      queue: [],
      lockTimeoutMs: 30000,
      maxQueueSize: 100,
    } as MutexContext,
    states: {
      idle: {
        entry: 'persistState',
        on: {
          ACQUIRE: [
            {
              target: 'locked',
              cond: 'canAcquire',
              actions: [
                assign({
                  locked: true,
                  currentTaskId: (_, e) => e.taskId,
                }),
                'startLockTimer',
                'persistState',
              ],
            },
            {
              // 队列未满时入队
              target: 'idle',
              cond: 'queueNotFull',
              actions: [
                assign({
                  queue: (ctx, e) => [
                    ...ctx.queue,
                    { taskId: e.taskId, timestamp: Date.now() },
                  ],
                }),
                'logQueued',
              ],
            },
          ],
        },
      },
      locked: {
        after: {
          LOCK_TIMEOUT: {
            target: 'idle',
            actions: ['forceRelease', 'emitTimeoutAlert'],
          },
        },
        on: {
          RELEASE: [
            {
              // 队列为空 → 完全释放
              target: 'idle',
              cond: 'isQueueEmpty',
              actions: [
                assign({
                  locked: false,
                  currentTaskId: null,
                }),
                'clearLockTimer',
                'persistState',
                'logReleased',
              ],
            },
            {
              // 队列不空 → 推进下一个任务
              target: 'locked',
              cond: 'isQueueNotEmpty',
              actions: [
                assign({
                  currentTaskId: (ctx) => ctx.queue[0]?.taskId || null,
                  queue: (ctx) => ctx.queue.slice(1),
                }),
                'resetLockTimer',
                'persistState',
                'logAdvanced',
              ],
            },
          ],
          ACQUIRE: {
            // 已锁定时入队
            target: 'locked',
            cond: 'queueNotFull',
            actions: [
              assign({
                queue: (ctx, e) => [
                  ...ctx.queue,
                  { taskId: e.taskId, timestamp: Date.now() },
                ],
              }),
              'logQueued',
            ],
          },
          PROCESS_CRASH: {
            target: 'idle',
            actions: ['forceRelease', 'emitCrashAlert'],
          },
        },
      },
    },
  },
  {
    guards: {
      canAcquire: (ctx) => !ctx.locked,
      isQueueEmpty: (ctx) => ctx.queue.length === 0,
      isQueueNotEmpty: (ctx) => ctx.queue.length > 0,
      queueNotFull: (ctx) => ctx.queue.length < ctx.maxQueueSize,
    },
    actions: {
      startLockTimer: (ctx) => {
        logger.info('Lock timer started', { port: ctx.port, taskId: ctx.currentTaskId });
      },
      clearLockTimer: () => {
        // 由运行时实现 setTimeout 清理
      },
      resetLockTimer: (ctx) => {
        logger.info('Lock timer reset for next task', { port: ctx.port, taskId: ctx.currentTaskId });
      },
      forceRelease: (ctx) => {
        logger.warn('Lock force released', {
          port: ctx.port,
          taskId: ctx.currentTaskId,
          reason: 'timeout_or_crash',
        });
      },
      emitTimeoutAlert: (ctx) => {
        eventBus.emit('mutex:timeout', {
          port: ctx.port,
          taskId: ctx.currentTaskId,
          reason: 'lock_timeout',
        });
      },
      emitCrashAlert: (ctx) => {
        eventBus.emit('mutex:timeout', {
          port: ctx.port,
          taskId: ctx.currentTaskId,
          reason: 'process_crash',
        });
      },
      persistState: (ctx) => {
        try {
          if (!fs.existsSync(STATE_DIR)) {
            fs.mkdirSync(STATE_DIR, { recursive: true });
          }
          const stateFile = path.join(STATE_DIR, `mutex-${ctx.port}.json`);
          fs.writeFileSync(stateFile, JSON.stringify({
            port: ctx.port,
            locked: ctx.locked,
            currentTaskId: ctx.currentTaskId,
            queue: ctx.queue,
            timestamp: Date.now(),
          }));
        } catch (err) {
          logger.error('Failed to persist mutex state', { port: ctx.port, error: (err as Error).message });
        }
      },
      logQueued: (ctx, event) => {
        logger.info('Task queued', {
          port: ctx.port,
          taskId: (event as { type: 'ACQUIRE'; taskId: string }).taskId,
          queueLength: ctx.queue.length,
        });
      },
      logReleased: (ctx) => {
        logger.info('Lock released', { port: ctx.port, taskId: ctx.currentTaskId });
      },
      logAdvanced: (ctx) => {
        logger.info('Queue advanced', {
          port: ctx.port,
          nextTaskId: ctx.currentTaskId,
          remainingQueue: ctx.queue.length,
        });
      },
    },
    delays: {
      LOCK_TIMEOUT: (ctx) => ctx.lockTimeoutMs,
    },
  }
);
