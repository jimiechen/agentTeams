// src/utils/workspace-logger.ts
// 工作空间隔离的文件日志系统
// 每个工作空间的日志独立存储到各自的 logs/YYYYMMDD/ 目录

import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import debug from 'debug';

export interface LogEntry {
  timestamp: string;
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';
  component: string;
  message: string;
  meta?: Record<string, any>;
}

/**
 * 获取当前日期字符串 (YYYYMMDD格式)
 */
function getDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

/**
 * 获取ISO日期字符串 (YYYY-MM-DD格式)
 */
function getISODateString(): string {
  return new Date().toISOString().split('T')[0];
}

export class WorkspaceLogger {
  private logFilePath: string;
  private debugLogger: debug.Debugger;
  private component: string;
  private dateStr: string;

  constructor(
    private workspacePath: string,
    component: string,
    private options: {
      logToFile?: boolean;
      logToConsole?: boolean;
      maxFileSizeMB?: number;
    } = {}
  ) {
    this.component = component;
    this.dateStr = getDateString();
    this.options = {
      logToFile: true,
      logToConsole: true,
      maxFileSizeMB: 100,
      ...options,
    };

    // 创建日志目录（按日期分组）
    // 路径: workspaces/PMCLI/logs/20260428/
    const logDir = join(workspacePath, 'logs', this.dateStr);
    mkdirSync(logDir, { recursive: true });

    // 日志文件路径: workspaces/PMCLI/logs/20260428/lark.log
    this.logFilePath = join(logDir, `${component}.log`);

    // 同时保留debug输出
    this.debugLogger = debug(`mvp:${component}`);

    // 写入启动标记
    this.info('Logger initialized', {
      workspace: workspacePath,
      logFile: this.logFilePath,
      date: this.dateStr,
    });
  }

  /**
   * 获取当前日志文件路径
   */
  getLogFilePath(): string {
    return this.logFilePath;
  }

  /**
   * 获取当前日期目录路径
   */
  getLogDir(): string {
    return join(this.workspacePath, 'logs', this.dateStr);
  }

  /**
   * 获取原始记录目录路径（按日期分组）
   */
  getRunsDir(): string {
    return join(this.workspacePath, 'runs', this.dateStr);
  }

  private write(level: LogEntry['level'], message: string, meta?: Record<string, any>) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      component: this.component,
      message,
      meta,
    };

    const line = JSON.stringify(entry) + '\n';

    // 写入文件
    if (this.options.logToFile) {
      try {
        appendFileSync(this.logFilePath, line);
      } catch (err) {
        console.error(`Failed to write log: ${err}`);
      }
    }

    // 控制台输出（通过debug库）
    if (this.options.logToConsole) {
      this.debugLogger(`${level}: ${message}`, meta || '');
    }
  }

  debug(message: string, meta?: Record<string, any>) {
    this.write('DEBUG', message, meta);
  }

  info(message: string, meta?: Record<string, any>) {
    this.write('INFO', message, meta);
  }

  warn(message: string, meta?: Record<string, any>) {
    this.write('WARN', message, meta);
  }

  error(message: string, meta?: Record<string, any>) {
    this.write('ERROR', message, meta);
  }

  fatal(message: string, meta?: Record<string, any>) {
    this.write('FATAL', message, meta);
  }

  /**
   * 记录心跳状态（专门用于wait-response监控）
   */
  logHeartbeat(checkCount: number, snapshot: {
    btnFunction: string;
    taskStatus: string;
    hasTerminalBtn: boolean;
    hasDeleteCard: boolean;
    lastTurnTextLen: number;
  }) {
    this.debug('Heartbeat', {
      checkCount,
      ...snapshot,
    });
  }

  /**
   * 记录飞书WS事件
   */
  logLarkEvent(event: string, data: any) {
    this.info(`Lark ${event}`, {
      event,
      ...data,
    });
  }

  /**
   * 记录任务生命周期
   */
  logTaskLifecycle(runId: string, phase: 'start' | 'ack' | 'switch' | 'fill' | 'submit' | 'wait' | 'complete' | 'error' | 'wiki-inject' | 'wiki-inject-failed', meta?: any) {
    this.info(`Task ${phase}`, {
      runId,
      phase,
      ...meta,
    });
  }

  /**
   * 记录恢复操作审计日志
   */
  logRecoveryAudit(entry: {
    taskId: string;
    action: 'click-stop' | 'send-esc' | 'dismiss-modal' | 'click-retain' | 'click-delete';
    targetSelector?: string;
    result: 'success' | 'failed' | 'skipped';
    reason: string;
    durationMs: number;
  }) {
    const auditEntry = {
      timestamp: new Date().toISOString(),
      ...entry,
    };

    // 写入独立的审计日志文件
    const auditLogPath = join(this.workspacePath, 'logs', this.dateStr, 'recovery-audit.jsonl');
    try {
      appendFileSync(auditLogPath, JSON.stringify(auditEntry) + '\n');
    } catch (err) {
      console.error(`Failed to write recovery audit log: ${err}`);
    }

    // 同时记录到主日志
    this.info('Recovery audit', entry);
  }
}

/**
 * 全局日志管理器
 * 为每个工作空间创建独立的logger实例
 */
export class LoggerManager {
  private loggers = new Map<string, WorkspaceLogger>();

  getLogger(workspacePath: string, component: string): WorkspaceLogger {
    const key = `${workspacePath}:${component}`;
    
    if (!this.loggers.has(key)) {
      this.loggers.set(key, new WorkspaceLogger(workspacePath, component));
    }
    
    return this.loggers.get(key)!;
  }

  /**
   * 获取所有logger的统计信息
   */
  getStats(): Record<string, { logFile: string; entries: number }> {
    const stats: Record<string, any> = {};
    this.loggers.forEach((logger, key) => {
      // 这里可以通过读取文件统计条目数
      stats[key] = {
        logFile: logger.getLogFilePath(),
      };
    });
    return stats;
  }
}

// 导出单例
export const loggerManager = new LoggerManager();
