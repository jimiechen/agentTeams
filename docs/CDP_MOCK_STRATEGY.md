---
title: CDP Mock 策略说明
version: "1.0.0"
date: 2026-04-26
status: Review
tags:
  - cdp
  - mock
  - testing
  - strategy
---

# CDP Mock 策略说明

> 配套文档：[[trae-agent-team-prd]] v2.6.0 | [[DO_AND_TESTING_SPEC]]
> 评审驱动：v2.5.0 评审指出 `chrome-remote-interface` 基于 WebSocket，直接 Mock 难度高，需明确技术路径

---

## 1. 问题分析

### 1.1 为什么 CDP Mock 困难

`chrome-remote-interface` 通过 WebSocket 连接 Chrome DevTools Protocol，Mock 的核心挑战：

1. **协议层复杂**：CDP 包含 100+ Domain、500+ Method，每个 Method 有特定的参数和返回值结构
2. **事件驱动**：CDP 是双向通信，Mock 需要模拟事件推送（如 `DOM.childNodeInserted`）
3. **状态依赖**：许多 Method 有前置条件（如 `Runtime.evaluate` 需要 `Runtime.enable`）
4. **浏览器环境**：注入的脚本运行在真实浏览器中，Mock 需要模拟 DOM 环境

### 1.2 测试分层策略

不同测试层级使用不同的 Mock 策略：

| 测试层级 | Mock 策略 | 工具 | 适用场景 |
|---------|---------|------|---------|
| **单元测试** | 接口 Mock | Vitest `vi.mock()` | ChatMutex、TaskManager、ConfigManager |
| **集成测试** | CDP 代理 Mock | 自建 Mock Server | ChatFiller、UIRecognizer、SceneDetector |
| **E2E 冒烟** | 真实 CDP + Playwright | Playwright + chromium | 完整链路验证 |

---

## 2. 方案一：接口 Mock（单元测试）

### 2.1 策略

直接 Mock `chrome-remote-interface` 模块的导出函数，不建立真实 WebSocket 连接。

### 2.2 实现

```typescript
// tests/__mocks__/chrome-remote-interface.ts
export async function createMockCDP(overrides = {}) {
  const events = new Map<string, Function[]>();
  const handlers = {
    Runtime: {
      enable: vi.fn().mockResolvedValue({}),
      evaluate: vi.fn().mockResolvedValue({
        result: { value: null, type: 'undefined' }
      }),
      // ... 其他 Method
    },
    DOM: {
      getDocument: vi.fn().mockResolvedValue({
        root: { nodeId: 1, nodeName: 'HTML' }
      }),
      // ... 其他 Method
    },
    Target: {
      setDiscoverTargets: vi.fn().mockResolvedValue({}),
      getTargets: vi.fn().mockResolvedValue({
        targetInfos: [
          { targetId: 'page-1', type: 'page', url: 'vscode-file://workbench' }
        ]
      }),
      // ... 其他 Method
    },
    Input: {
      dispatchMouseEvent: vi.fn().mockResolvedValue({}),
      // ... 其他 Method
    },
    ...overrides
  };

  const mockClient = {
    on: vi.fn((event, callback) => {
      if (!events.has(event)) events.set(event, []);
      events.get(event)!.push(callback);
    }),
    off: vi.fn((event, callback) => {
      const cbs = events.get(event);
      if (cbs) {
        const idx = cbs.indexOf(callback);
        if (idx >= 0) cbs.splice(idx, 1);
      }
    }),
    emit: vi.fn((event, ...args) => {
      const cbs = events.get(event) || [];
      cbs.forEach(cb => cb(...args));
    }),
    close: vi.fn().mockResolvedValue({}),
  };

  // 代理 Domain 调用
  for (const [domain, methods] of Object.entries(handlers)) {
    mockClient[domain] = {};
    for (const [method, fn] of Object.entries(methods)) {
      mockClient[domain][method] = fn;
    }
  }

  return { client: mockClient, events, handlers };
}

// Mock 模块导出
export default {
  createMockCDP,
};
```

### 2.3 使用示例

```typescript
// tests/cdp/chat-filler.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockCDP } from '../../__mocks__/chrome-remote-interface';

describe('ChatFiller', () => {
  let mockCDP: ReturnType<typeof createMockCDP>;

  beforeEach(async () => {
    mockCDP = await createMockCDP({
      Runtime: {
        evaluate: vi.fn().mockResolvedValue({
          result: { value: 'filled', type: 'string' }
        }),
      },
    });
  });

  it('should fill chat input using execCommand strategy', async () => {
    const filler = new ChatFiller(mockCDP.client);
    await filler.fill('test prompt');

    expect(mockCDP.handlers.Runtime.evaluate).toHaveBeenCalled();
    expect(mockCDP.handlers.Input.dispatchMouseEvent).toHaveBeenCalledTimes(2); // press + release
  });
});
```

---

## 3. 方案二：CDP Mock Server（集成测试）

### 3.1 策略

搭建轻量 CDP Mock Server，模拟 Chrome DevTools Protocol 的 WebSocket 通信。使用 `ws` 库实现 WebSocket 服务端。

### 3.2 架构

```
┌─────────────────────┐     WebSocket      ┌─────────────────────┐
│  测试代码            │ ◄══════════════► │  CDP Mock Server      │
│  (chrome-remote-    │     port: 9333     │                      │
│   interface)        │                    │  • 模拟 CDP Method   │
│                     │                    │  • 推送 CDP Event    │
│                     │                    │  • 可配置响应        │
└─────────────────────┘                    └─────────────────────┘
```

### 3.3 实现

```typescript
// tests/helpers/cdp-mock-server.ts
import { WebSocketServer, WebSocket } from 'ws';

interface MockResponse {
  id: number;
  result: Record<string, unknown>;
}

interface MockEvent {
  method: string;
  params: Record<string, unknown>;
}

export class CDPMockServer {
  private wss: WebSocketServer | null = null;
  private port: number;
  private messageId = 0;
  private responses: Map<string, MockResponse> = new Map();
  private eventQueue: MockEvent[] = [];

  constructor(port = 9333) {
    this.port = port;
  }

  async start() {
    this.wss = new WebSocketServer({ port: this.port });

    this.wss.on('connection', (ws) => {
      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());

        if (msg.method) {
          // 处理 Method 调用
          const key = `${msg.method}`;
          const response = this.responses.get(key) || {
            id: msg.id,
            result: {}
          };
          ws.send(JSON.stringify({ ...response, id: msg.id }));
        }
      });

      // 推送预设事件
      for (const event of this.eventQueue) {
        setTimeout(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(event));
          }
        }, 50);
      }
    });
  }

  // 配置 Method 响应
  onMethod(method: string, result: Record<string, unknown>) {
    this.responses.set(method, { id: this.messageId++, result });
  }

  // 推送事件
  pushEvent(method: string, params: Record<string, unknown>) {
    this.eventQueue.push({ method, params });
  }

  // 推送延迟事件
  pushDelayedEvent(method: string, params: Record<string, unknown>, delayMs: number) {
    this.eventQueue.push({ method, params });
    // 在实际实现中需要支持延迟
  }

  async stop() {
    if (this.wss) {
      await new Promise(resolve => this.wss!.close(resolve));
    }
  }

  getPort() {
    return this.port;
  }
}
```

### 3.4 使用示例

```typescript
// tests/cdp/ui-recognizer.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CDPMockServer } from '../helpers/cdp-mock-server';

describe('UIRecognizer', () => {
  let server: CDPMockServer;

  beforeEach(async () => {
    server = new CDPMockServer(9333);
    await server.start();

    // 模拟 Target 发现
    server.onMethod('Target.setDiscoverTargets', {});
    server.onMethod('Target.getTargets', {
      targetInfos: [
        { targetId: 'page-1', type: 'page', url: 'vscode-file://workbench' }
      ]
    });

    // 模拟 Runtime.evaluate 返回 DOM 探测结果
    server.onMethod('Runtime.enable', {});
    server.onMethod('Runtime.evaluate', {
      result: {
        value: JSON.stringify({
          fps: [
            {
              tagName: 'DIV', role: 'textbox', dataTestId: 'chat-input',
              contentEditable: 'true', placeholder: '发送消息',
              hidden: false, rect: { x: 100, y: 500, w: 800, h: 40 },
              classChain: [['chat-input-container']]
            },
            {
              tagName: 'BUTTON', role: 'button', dataTestId: 'send-btn',
              ariaLabel: '发送', hidden: false,
              rect: { x: 880, y: 510, w: 60, h: 30 },
              classChain: [['send-button']]
            }
          ],
          title: 'Trae - workbench',
          url: 'vscode-file://workbench'
        }),
        type: 'string'
      }
    });
  });

  afterEach(async () => {
    await server.stop();
  });

  it('should match chatInput via P0 data-testid strategy', async () => {
    const recognizer = new UIRecognizer();
    const results = await recognizer.probe(9333);

    expect(results.chatInput.matched).toBe(true);
    expect(results.chatInput.strategy).toBe('P0');
    expect(results.chatInput.selector).toContain('chat-input');
  });
});
```

---

## 4. 方案三：Playwright + chromium（E2E 冒烟）

### 4.1 策略

使用 Playwright 启动真实 Chromium 实例，模拟 Trae IDE 的 DOM 结构，通过 CDP 连接进行测试。

### 4.2 实现

```typescript
// tests/e2e/helpers/trae-mock-page.ts
import { chromium, Browser, Page } from 'playwright';

export class TraeMockPage {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private cdpPort: number;

  constructor(cdpPort = 9334) {
    this.cdpPort = cdpPort;
  }

  async launch() {
    this.browser = await chromium.launch({
      args: [`--remote-debugging-port=${this.cdpPort}`],
      headless: true,
    });

    const context = await this.browser.newContext();
    this.page = await context.newPage();

    // 注入模拟 Trae DOM 结构
    await this.page.setContent(this.getMockHTML());
  }

  getMockHTML() {
    return `
      <div id="workbench">
        <div class="chat-panel">
          <div class="chat-list">
            <div class="chat-item" data-testid="chat-list-item">Chat 1</div>
          </div>
          <div class="chat-input-area">
            <div contenteditable="true" data-testid="chat-input"
                 role="textbox" placeholder="发送消息"></div>
            <button data-testid="send-btn" aria-label="发送">发送</button>
          </div>
          <div class="status-bar">
            <span class="loading-indicator" style="display:none">AI 思考中...</span>
          </div>
        </div>
      </div>
    `;
  }

  getCDPPort() {
    return this.cdpPort;
  }

  async close() {
    if (this.browser) await this.browser.close();
  }
}
```

### 4.3 使用示例

```typescript
// tests/e2e/chat-filler.e2e.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TraeMockPage } from './helpers/trae-mock-page';
import CDP from 'chrome-remote-interface';

describe('ChatFiller E2E', () => {
  let mockPage: TraeMockPage;

  beforeEach(async () => {
    mockPage = new TraeMockPage(9334);
    await mockPage.launch();
  });

  afterEach(async () => {
    await mockPage.close();
  });

  it('should fill and send message via CDP', async () => {
    const client = await CDP({ port: mockPage.getCDPPort() });
    const { Runtime, Input, DOM } = client;

    await Runtime.enable();

    // 填充输入框
    await Runtime.evaluate({
      expression: `
        const el = document.querySelector('[data-testid="chat-input"]');
        el.focus();
        document.execCommand('insertText', false, 'test prompt');
      `,
      returnByValue: true,
    });

    // 验证填充结果
    const { result } = await Runtime.evaluate({
      expression: `document.querySelector('[data-testid="chat-input"]').innerText`,
      returnByValue: true,
    });

    expect(result.value).toBe('test prompt');

    await CDP.close(client);
  });
});
```

---

## 5. Mock 策略选择指南

| 场景 | 推荐方案 | 原因 |
|------|---------|------|
| ChatMutex 单元测试 | 方案一（接口 Mock） | 纯逻辑，无 CDP 依赖 |
| UIRecognizer 匹配测试 | 方案二（Mock Server） | 需要 CDP 协议交互 |
| ChatFiller 降级测试 | 方案三（Playwright） | 需要 Lexical 编辑器环境 |
| SceneDetector 场景测试 | 方案三（Playwright） | 需要 DOM 结构模拟 |
| LarkTerminal 集成测试 | 方案一（接口 Mock） | Mock child_process 即可 |
| 完整链路 E2E | 方案三（Playwright） | 最接近真实环境 |

---

## 6. Mock 数据管理

### 6.1 DOM 快照

```
tests/fixtures/dom-snapshots/
├── tre-v1.0-workbench.html        # Trae v1.0 完整 DOM 快照
├── tre-v1.1-workbench.html        # Trae v1.1 完整 DOM 快照
├── chat-input-focused.html        # Chat 输入框聚焦状态
├── ai-working-loading.html        # AI 工作中状态
├── context-limit-dialog.html      # 上下文限制弹窗
├── confirm-dialog.html            # 确认弹窗
└── service-exception.html         # 服务端异常
```

### 6.2 CDP 响应录制

```bash
# 录制真实 CDP 交互（开发阶段使用）
node tests/helpers/record-cdp.js --port 9222 --output tests/fixtures/cdp-sessions/

# 回放录制
node tests/helpers/replay-cdp.js --recording tests/fixtures/cdp-sessions/session-1.json
```
