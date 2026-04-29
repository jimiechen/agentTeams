// src/cdp/client.ts - CDP 长连接模块（心跳 + 自动重连）

import CDP from 'chrome-remote-interface';
import createDebug from 'debug';
import { ConnectionError } from '../errors.js';

const debug = createDebug('mvp:cdp');

export interface CDPClientOptions {
  host?: string;
  port?: number;
  targetFilter?: (target: CDP.Target) => boolean;
}

export class CDPClient {
  private client: CDP.Client | null = null;
  private host: string;
  private port: number;
  private targetFilter: (target: CDP.Target) => boolean;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempt = 0;
  private maxReconnectAttempts = 5;
  private isShuttingDown = false;

  public Runtime!: CDP.StableDomains['Runtime'];
  public DOM!: CDP.StableDomains['DOM'];
  public Input!: CDP.StableDomains['Input'];
  public Page!: CDP.StableDomains['Page'];

  constructor(opts: CDPClientOptions = {}) {
    this.host = opts.host ?? 'localhost';
    this.port = opts.port ?? 9222;
    this.targetFilter = opts.targetFilter ?? ((t: CDP.Target) =>
      t.type === 'page' && (t.title?.includes('Trae') || t.title?.includes('SOLO'))
    );
  }

  async connect(): Promise<void> {
    this.isShuttingDown = false;
    this.reconnectAttempt = 0;

    try {
      const targets = await CDP.List({ host: this.host, port: this.port });
      debug(`Found ${targets.length} targets`);

      const mainTarget = targets.find(this.targetFilter);
      if (!mainTarget) {
        throw new ConnectionError(
          `No matching target found. Available: ${targets.map(t => `${t.type}:${t.title}`).join(', ')}`
        );
      }

      debug(`Connecting to target: ${mainTarget.title} (${mainTarget.id})`);

      this.client = await CDP({
        host: this.host,
        port: this.port,
        target: mainTarget,
      });

      const { Runtime, DOM, Input, Page } = this.client;
      this.Runtime = Runtime;
      this.DOM = DOM;
      this.Input = Input;
      this.Page = Page;

      await Promise.all([
        Runtime.enable(),
        DOM.enable(),
        Page.enable(),
      ]);

      debug('CDP connected, domains enabled');

      // 心跳保活（默认10s，可通过环境变量 HEARTBEAT_INTERVAL_MS 调整）
      const heartbeatInterval = Number(process.env.HEARTBEAT_INTERVAL_MS) || 10000;
      this.heartbeatTimer = setInterval(async () => {
        try {
          await this.Runtime.evaluate({ expression: '1' });
          debug('Heartbeat OK');
        } catch {
          debug('Heartbeat failed');
          this.handleDisconnect();
        }
      }, heartbeatInterval);

      // 断连监听
      this.client.on('disconnect', () => {
        debug('Client disconnected event');
        this.handleDisconnect();
      });

      this.reconnectAttempt = 0;
    } catch (err) {
      throw new ConnectionError(`CDP connect failed: ${(err as Error).message}`);
    }
  }

  private handleDisconnect(): void {
    if (this.isShuttingDown) return;

    this.stopHeartbeat();

    if (this.reconnectAttempt >= this.maxReconnectAttempts) {
      debug(`Reconnect failed after ${this.maxReconnectAttempts} attempts, giving up`);
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempt), 16000);
    this.reconnectAttempt++;
    debug(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempt}/${this.maxReconnectAttempts})`);

    setTimeout(async () => {
      try {
        await this.connect();
        debug('Reconnect successful');
      } catch (err) {
        debug(`Reconnect failed: ${(err as Error).message}`);
        this.handleDisconnect();
      }
    }, delay);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  get isConnected(): boolean {
    return this.client !== null;
  }

  disconnect(): void {
    this.isShuttingDown = true;
    this.stopHeartbeat();
    if (this.client) {
      try {
        this.client.close();
      } catch {
        // ignore
      }
      this.client = null;
    }
    debug('CDP disconnected');
  }

  async evaluate<T = any>(expression: string, returnByValue = true): Promise<T> {
    if (!this.client) throw new ConnectionError('Not connected');
    const { result } = await this.Runtime.evaluate({ expression, returnByValue });
    return result.value as T;
  }
}
