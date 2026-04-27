import { Mutex } from 'async-mutex';
import debug from 'debug';

const log = debug('mvp:mutex');

/**
 * 全局 ChatMutex —— 保证同一时刻只有一条飞书指令在操作 Trae Chat。
 * 作用范围：switchTask → fillPrompt → submit → waitResponse 整个任务周期。
 */
export const chatMutex = new Mutex();

/** 便捷包装：自动 acquire + release，带耗时日志。 */
export async function withChatMutex<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<T> {
  const waitStart = Date.now();
  const release = await chatMutex.acquire();
  const waitedMs = Date.now() - waitStart;
  if (waitedMs > 100) log('[%s] waited %dms for mutex', label, waitedMs);

  const runStart = Date.now();
  try {
    return await fn();
  } finally {
    release();
    log('[%s] released mutex (ran %dms)', label, Date.now() - runStart);
  }
}
