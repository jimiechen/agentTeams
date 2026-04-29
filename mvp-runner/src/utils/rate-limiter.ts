/**
 * Rate Limiter - 速率限制器
 * 防止恢复操作过于频繁
 */

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  reason?: string;
}

export class RateLimiter {
  private operations: Map<string, number[]> = new Map();

  /**
   * 检查操作是否允许执行
   * @param operationType 操作类型
   * @param maxOps 时间窗口内最大操作次数
   * @param windowMs 时间窗口（毫秒）
   */
  checkLimit(
    operationType: string,
    maxOps: number,
    windowMs: number
  ): RateLimitResult {
    const now = Date.now();
    const history = this.operations.get(operationType) || [];
    const windowStart = now - windowMs;
    const recentOps = history.filter((t) => t > windowStart);

    this.operations.set(operationType, recentOps);

    if (recentOps.length >= maxOps) {
      const oldestOp = Math.min(...recentOps);
      const resetTime = oldestOp + windowMs;
      return {
        allowed: false,
        remaining: 0,
        resetTime,
        reason: `操作 "${operationType}" 超出速率限制（${maxOps}次/${Math.round(windowMs / 1000)}秒），请在${Math.ceil((resetTime - now) / 1000)}秒后重试`,
      };
    }

    return {
      allowed: true,
      remaining: maxOps - recentOps.length,
      resetTime: now + windowMs,
    };
  }

  /**
   * 记录一次操作
   */
  recordOperation(operationType: string): void {
    const history = this.operations.get(operationType) || [];
    history.push(Date.now());
    this.operations.set(operationType, history);
  }

  /**
   * 获取操作统计
   */
  getStats(operationType: string, windowMs: number = 3600000): {
    count: number;
    firstOp: number | null;
    lastOp: number | null;
  } {
    const now = Date.now();
    const history = this.operations.get(operationType) || [];
    const windowStart = now - windowMs;
    const recentOps = history.filter((t) => t > windowStart);

    return {
      count: recentOps.length,
      firstOp: recentOps.length > 0 ? Math.min(...recentOps) : null,
      lastOp: recentOps.length > 0 ? Math.max(...recentOps) : null,
    };
  }

  /**
   * 清空所有限制记录
   */
  reset(): void {
    this.operations.clear();
  }
}

/** 全局恢复操作速率限制器 */
export const recoveryRateLimiter = new RateLimiter();
