/**
 * 任务生命周期状态机
 * PRD 对应：3.1 任务生命周期
 * 执行卡片：exec-units/chat-mutex.yaml (xstate_binding)
 *
 * 状态流转：pending → assigned → running → completed/failed/blocked/cancelled
 */

import { createMachine, assign } from 'xstate';
import { logger } from '../utils/logger';
import { eventBus } from '../core/event-bus';

export interface TaskContext {
  taskId: string;
  title: string;
  description: string;
  priority: 'P0' | 'P1' | 'P2';
  status: 'pending' | 'assigned' | 'running' | 'completed' | 'failed' | 'blocked' | 'cancelled';
  retries: number;
  maxRetries: number;
  assignedAgent?: string;
  branch?: string;
  startedAt?: number;
  completedAt?: number;
  artifacts: string[];
}

export type TaskEvent =
  | { type: 'CREATE'; taskId: string; title: string; description: string; priority: TaskContext['priority'] }
  | { type: 'ASSIGN'; agentId: string }
  | { type: 'START' }
  | { type: 'COMPLETE'; artifacts: string[] }
  | { type: 'FAIL'; error: string }
  | { type: 'RETRY' }
  | { type: 'CANCEL' }
  | { type: 'BLOCK'; reason: string }
  | { type: 'UNBLOCK' };

export const taskMachine = createMachine(
  {
    id: 'task',
    initial: 'pending',
    context: {
      taskId: '',
      title: '',
      description: '',
      priority: 'P1',
      status: 'pending',
      retries: 0,
      maxRetries: 3,
      artifacts: [],
    } as TaskContext,
    states: {
      pending: {
        on: {
          CREATE: {
            target: 'pending',
            actions: [
              assign({
                taskId: (_, e) => e.taskId,
                title: (_, e) => e.title,
                description: (_, e) => e.description,
                priority: (_, e) => e.priority,
              }),
              'logCreated',
            ],
          },
          ASSIGN: {
            target: 'assigned',
            actions: [
              assign({
                assignedAgent: (_, e) => e.agentId,
                status: 'assigned',
              }),
              'logAssigned',
            ],
          },
          CANCEL: { target: 'cancelled' },
        },
      },
      assigned: {
        on: {
          START: {
            target: 'running',
            actions: [
              assign({ status: 'running', startedAt: Date.now() }),
              'logStarted',
            ],
          },
          CANCEL: { target: 'cancelled' },
        },
      },
      running: {
        after: {
          // 10 分钟无响应标记阻塞
          600000: { target: 'blocked', actions: 'notifyTimeout' },
        },
        on: {
          COMPLETE: {
            target: 'completed',
            actions: ['recordArtifacts', 'releaseMutex'],
          },
          FAIL: {
            target: 'failed',
            actions: 'logFailure',
          },
          BLOCK: {
            target: 'blocked',
            actions: 'logBlocked',
          },
          CANCEL: { target: 'cancelled' },
        },
      },
      completed: {
        type: 'final',
        entry: 'logCompleted',
      },
      failed: {
        on: {
          RETRY: {
            target: 'assigned',
            cond: 'canRetry',
            actions: [
              assign({ retries: (ctx) => ctx.retries + 1 }),
              'notifyRetry',
            ],
          },
          CANCEL: { target: 'cancelled' },
        },
      },
      blocked: {
        on: {
          UNBLOCK: { target: 'running', actions: 'logUnblocked' },
          RETRY: { target: 'assigned', cond: 'canRetry' },
          CANCEL: { target: 'cancelled' },
        },
      },
      cancelled: { type: 'final' },
    },
  },
  {
    guards: {
      canRetry: (ctx) => ctx.retries < ctx.maxRetries,
    },
    actions: {
      logCreated: (ctx) =>
        logger.info('Task created', { taskId: ctx.taskId, priority: ctx.priority }),
      logAssigned: (ctx) =>
        logger.info('Task assigned', { taskId: ctx.taskId, agent: ctx.assignedAgent }),
      logStarted: (ctx) =>
        logger.info('Task started', { taskId: ctx.taskId, agent: ctx.assignedAgent }),
      logCompleted: (ctx) =>
        logger.info('Task completed', {
          taskId: ctx.taskId,
          duration: Date.now() - (ctx.startedAt || 0),
          artifacts: ctx.artifacts,
        }),
      logFailure: (ctx, event) => {
        const error = (event as { type: 'FAIL'; error: string }).error;
        logger.error('Task failed', { taskId: ctx.taskId, error, retries: ctx.retries });
        eventBus.emit('task:failed', { taskId: ctx.taskId, error });
      },
      logBlocked: (ctx, event) => {
        const reason = (event as { type: 'BLOCK'; reason: string }).reason;
        logger.warn('Task blocked', { taskId: ctx.taskId, reason });
        eventBus.emit('task:blocked', { taskId: ctx.taskId, reason });
      },
      logUnblocked: (ctx) =>
        logger.info('Task unblocked', { taskId: ctx.taskId }),
      notifyTimeout: (ctx) => {
        logger.warn('Task timeout - marked as blocked', { taskId: ctx.taskId });
        eventBus.emit('task:timeout', { taskId: ctx.taskId });
      },
      notifyRetry: (ctx) =>
        logger.warn('Task retrying', { taskId: ctx.taskId, retry: ctx.retries + 1 }),
      recordArtifacts: assign({
        artifacts: (_, event) => (event as { type: 'COMPLETE'; artifacts: string[] }).artifacts,
        status: 'completed',
        completedAt: Date.now(),
      }),
      releaseMutex: (ctx) =>
        eventBus.emit('mutex:release', { taskId: ctx.taskId }),
    },
  }
);
