/**
 * Terminal Logger - 终端输出滚动日志持久化
 * 存储到 mvp-runner/logs/terminal/terminal-YYYYMMDD-HHMMSS.log
 * 最多保留10个历史日志文件，自动清理旧文件
 */

import {
  createWriteStream,
  mkdirSync,
  readdirSync,
  statSync,
  unlinkSync,
  existsSync,
} from 'node:fs';
import path from 'node:path';

const TERMINAL_LOGS_DIR = path.resolve('./logs/terminal');
const MAX_LOG_FILES = 10;

/** 确保日志目录存在 */
function ensureDir(): void {
  mkdirSync(TERMINAL_LOGS_DIR, { recursive: true });
}

/** 获取当前日志文件路径（按启动时间命名） */
function getCurrentLogPath(): string {
  ensureDir();
  const now = new Date();
  const timestamp =
    now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0') +
    '-' +
    String(now.getHours()).padStart(2, '0') +
    String(now.getMinutes()).padStart(2, '0') +
    String(now.getSeconds()).padStart(2, '0');
  return path.join(TERMINAL_LOGS_DIR, `terminal-${timestamp}.log`);
}

/** 清理旧日志文件，保留最新的 MAX_LOG_FILES 个 */
function cleanupOldLogs(): void {
  if (!existsSync(TERMINAL_LOGS_DIR)) return;

  try {
    const files = readdirSync(TERMINAL_LOGS_DIR)
      .filter(f => f.startsWith('terminal-') && f.endsWith('.log'))
      .map(f => ({
        name: f,
        path: path.join(TERMINAL_LOGS_DIR, f),
        mtime: statSync(path.join(TERMINAL_LOGS_DIR, f)).mtimeMs,
      }))
      .sort((a, b) => b.mtime - a.mtime); // 最新的在前

    // 删除超出限制的旧文件
    if (files.length >= MAX_LOG_FILES) {
      const toDelete = files.slice(MAX_LOG_FILES);
      for (const file of toDelete) {
        try {
          unlinkSync(file.path);
          console.log(`[terminal-logger] 清理旧日志: ${file.name}`);
        } catch {
          // 忽略删除失败
        }
      }
    }
  } catch {
    // 忽略清理错误
  }
}

/** 终端日志捕获器 */
export class TerminalLogger {
  private logPath: string;
  private writeStream: ReturnType<typeof createWriteStream>;
  private originalStdoutWrite: typeof process.stdout.write;
  private originalStderrWrite: typeof process.stderr.write;
  private isCapturing = false;

  constructor() {
    cleanupOldLogs();
    this.logPath = getCurrentLogPath();
    this.writeStream = createWriteStream(this.logPath, { flags: 'a' });
    this.originalStdoutWrite = process.stdout.write.bind(process.stdout);
    this.originalStderrWrite = process.stderr.write.bind(process.stderr);
  }

  /** 开始捕获终端输出 */
  start(): void {
    if (this.isCapturing) return;
    this.isCapturing = true;

    const writeLog = (chunk: any) => {
      const text = typeof chunk === 'string' ? chunk : chunk.toString();
      this.writeStream.write(text);
    };

    // 拦截 stdout
    process.stdout.write = ((chunk: any, encoding?: any, callback?: any) => {
      writeLog(chunk);
      return this.originalStdoutWrite(chunk, encoding, callback);
    }) as typeof process.stdout.write;

    // 拦截 stderr
    process.stderr.write = ((chunk: any, encoding?: any, callback?: any) => {
      writeLog(chunk);
      return this.originalStderrWrite(chunk, encoding, callback);
    }) as typeof process.stderr.write;

    console.log(`[terminal-logger] 终端日志已捕获 → ${this.logPath}`);
  }

  /** 停止捕获 */
  stop(): void {
    if (!this.isCapturing) return;
    this.isCapturing = false;

    process.stdout.write = this.originalStdoutWrite;
    process.stderr.write = this.originalStderrWrite;

    this.writeStream.end();
    console.log(`[terminal-logger] 终端日志已停止，保存至 ${this.logPath}`);
  }

  /** 获取当前日志文件路径 */
  getLogPath(): string {
    return this.logPath;
  }

  /** 获取所有历史日志文件列表 */
  static getLogFiles(): Array<{ name: string; path: string; size: number; mtime: Date }> {
    if (!existsSync(TERMINAL_LOGS_DIR)) return [];

    try {
      return readdirSync(TERMINAL_LOGS_DIR)
        .filter(f => f.startsWith('terminal-') && f.endsWith('.log'))
        .map(f => {
          const filePath = path.join(TERMINAL_LOGS_DIR, f);
          const stat = statSync(filePath);
          return {
            name: f,
            path: filePath,
            size: stat.size,
            mtime: stat.mtime,
          };
        })
        .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
    } catch {
      return [];
    }
  }
}

/** 全局单例 */
let globalTerminalLogger: TerminalLogger | null = null;

export function startTerminalLogging(): TerminalLogger {
  if (!globalTerminalLogger) {
    globalTerminalLogger = new TerminalLogger();
    globalTerminalLogger.start();
  }
  return globalTerminalLogger;
}

export function stopTerminalLogging(): void {
  globalTerminalLogger?.stop();
  globalTerminalLogger = null;
}

export function getTerminalLogPath(): string | null {
  return globalTerminalLogger?.getLogPath() ?? null;
}
