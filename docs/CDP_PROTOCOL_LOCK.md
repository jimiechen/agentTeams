---
title: CDP 协议版本锁定策略
version: "1.0.0"
date: 2026-04-26
status: Approved
tags:
  - cdp
  - protocol
  - version-lock
  - testing
related_prd: trae-agent-team-prd.md
---

# CDP 协议版本锁定策略

> 配套文档：[[trae-agent-team-prd]] v2.8.0 | [[CDP_MOCK_STRATEGY]]
> 评审驱动：v2.8.0 评审指出 CDP 协议随 Chrome/Trae 更新可能变化，自研 WS Mock 维护成本高

---

## 1. 问题

CDP（Chrome DevTools Protocol）协议版本随 Chrome/Trae IDE 更新持续变化：
- 新增/废弃 Method 和 Event
- 参数结构变更
- Target 类型变化

如果不锁定协议版本，CDP Mock Server 和集成测试会频繁失效。

## 2. 锁定策略

### 2.1 三层版本锁定

| 层级 | 锁定内容 | 管理方式 |
|------|---------|---------|
| **Trae IDE 版本** | 预研和开发使用固定 Trae 版本 | `docs/TRADE_VERSION_LOCK.md` 记录锁定版本 |
| **CDP 协议快照** | 当前 Trae 版本的 CDP 协议 JSON | `tests/fixtures/cdp-protocol/` 目录存储 |
| **DOM 快照** | 当前 Trae 版本的 workbench DOM 结构 | `tests/fixtures/dom-snapshots/` 目录存储 |

### 2.2 版本锁定文件

```yaml
# docs/TRADE_VERSION_LOCK.yaml
locked_versions:
  trae:
    version: "1.8.2"              # 锁定的 Trae IDE 版本
    channel: "stable"              # stable / beta / canary
    cdp_protocol_version: "1.3"    # CDP 协议主版本
    chromium_version: "124.0.6367" # 底层 Chromium 版本
  lock_date: "2026-04-26"
  lock_reason: "Phase 0 预研基线"
  unlock_criteria:
    - "Phase 0 预研完成"
    - "Trae 大版本更新（minor+）"
    - "CDP 协议不兼容变更"
```

### 2.3 CDP Domain/Method 粒度锁定

> **评审驱动**：Claude 最终评审指出锁定粒度需细化到具体的 CDP Domain 和 Method，而非仅锁定 Trae 应用版本号。

**核心依赖的 CDP Domain 和 Method 清单**：

| Domain | Method | 用途 | 版本要求 |
|--------|--------|------|---------|
| **Runtime** | `Runtime.evaluate` | Chat 输入框内容读取/校验 | v1.3+ |
| **Runtime** | `Runtime.enable` | 启用运行时事件 | v1.3+ |
| **DOM** | `DOM.getDocument` | 获取 DOM 树结构 | v1.3+ |
| **DOM** | `DOM.querySelector` | 查找 Chat 输入框元素 | v1.3+ |
| **DOM** | `DOM.querySelector` | 查找发送按钮元素 | v1.3+ |
| **DOM** | `DOM.getOuterHTML` | 获取元素 HTML（内容校验） | v1.3+ |
| **Input** | `Input.dispatchMouseEvent` | 点击发送按钮 | v1.3+ |
| **Input** | `Input.insertText` | 填充 Chat 输入框（P0 策略） | v1.3+ |
| **Target** | `Target.getTargets` | 获取 Trae 页面 Target | v1.3+ |
| **Page** | `Page.reload` | 页面重载（异常恢复） | v1.3+ |

**版本锁定文件扩展**：

```yaml
# docs/TRADE_VERSION_LOCK.yaml（扩展）
locked_cdp_methods:
  - domain: "Runtime"
    method: "evaluate"
    min_version: "1.3"
    criticality: "critical"         # critical: 缺失则系统不可用
  - domain: "DOM"
    method: "querySelector"
    min_version: "1.3"
    criticality: "critical"
  - domain: "DOM"
    method: "getDocument"
    min_version: "1.3"
    criticality: "critical"
  - domain: "Input"
    method: "dispatchMouseEvent"
    min_version: "1.3"
    criticality: "critical"
  - domain: "Input"
    method: "insertText"
    min_version: "1.3"
    criticality: "high"             # high: 缺失则降级到 P1 策略
  - domain: "Target"
    method: "getTargets"
    min_version: "1.3"
    criticality: "critical"
  - domain: "Page"
    method: "reload"
    min_version: "1.3"
    criticality: "low"              # low: 缺失仅影响异常恢复
```

**Mock Server 启动时校验**：

```typescript
// tests/helpers/cdp-mock-server.ts
function validateLockedMethods(protocol: any) {
  const lock = YAML.parse(fs.readFileSync('docs/TRADE_VERSION_LOCK.yaml', 'utf-8'));
  for (const method of lock.locked_cdp_methods) {
    const domain = protocol.domains.find((d: any) => d.domain === method.domain);
    if (!domain) {
      throw new Error(`CDP Domain ${method.domain} 不存在于协议 v${protocol.version}`);
    }
    const methodDef = domain.commands?.find((c: any) => c.name === method.method);
    if (!methodDef) {
      if (method.criticality === 'critical') {
        throw new Error(`CDP Method ${method.domain}.${method.method} 缺失，系统不可用`);
      }
      logger.warn(`CDP Method ${method.domain}.${method.method} 缺失，将触发降级策略`);
    }
  }
}
```

### 2.3 CDP 协议快照获取

```bash
# 获取当前 Trae 实例的 CDP 协议信息
node scripts/capture-cdp-protocol.js --port 9222 --output tests/fixtures/cdp-protocol/

# 输出文件
tests/fixtures/cdp-protocol/
├── protocol.json           # 完整协议描述
├── domains/
│   ├── Runtime.json        # Runtime Domain 方法列表
│   ├── DOM.json            # DOM Domain 方法列表
│   ├── Target.json         # Target Domain 方法列表
│   └── Input.json          # Input Domain 方法列表
└── browser-info.json       # 浏览器版本信息
```

### 2.4 DOM 快照获取

```bash
# 获取当前 Trae workbench 的 DOM 快照
node scripts/capture-dom-snapshot.js --port 9222 --output tests/fixtures/dom-snapshots/

# 输出文件
tests/fixtures/dom-snapshots/
├── trae-v1.8.2-workbench.html       # 完整 DOM
├── trae-v1.8.2-chat-input.html      # Chat 输入区域
├── trae-v1.8.2-ai-working.html      # AI 工作中状态
└── trae-v1.8.2-context-limit.html   # 上下文限制弹窗
```

## 3. Mock Server 协议兼容

### 3.1 协议版本校验

CDP Mock Server 启动时校验协议版本：

```typescript
// tests/helpers/cdp-mock-server.ts
export class CDPMockServer {
  async start() {
    const protocol = JSON.parse(
      fs.readFileSync('tests/fixtures/cdp-protocol/protocol.json', 'utf-8')
    );
    this.protocolVersion = protocol.version;

    // 校验 Mock 定义的方法是否在协议中存在
    for (const [domain, methods] of Object.entries(this.handlers)) {
      for (const method of Object.keys(methods)) {
        if (!this.methodExists(domain, method)) {
          logger.warn(`Mock method ${domain}.${method} not found in protocol v${this.protocolVersion}`);
        }
      }
    }
  }
}
```

### 3.2 E2E 层优先使用 Playwright 内置 cdpSession

为减少自研 Mock 维护负担，E2E 测试优先使用 Playwright 内置的 `cdpSession`：

```typescript
// tests/e2e/helpers/trae-mock-page.ts
const context = await browser.newContext();
const page = await context.newPage();

// 使用 Playwright 内置 CDP Session
const cdpSession = await context.newCDPSession(page);
await cdpSession.send('Runtime.enable');

// 拦截 CDP 请求进行 Mock
page.on('request', (request) => {
  // 按需拦截
});
```

## 4. 版本升级流程

```
Trae IDE 发布新版本
      │
      ▼
评估影响范围
  ├── 仅 UI 变化 → 更新 DOM 快照 + 重新探测 UI
  ├── CDP 协议变更 → 更新协议快照 + 修复 Mock Server
  └── 无影响 → 无需操作
      │
      ▼
运行 UI Recognizer 探测
      │
      ├── 全部匹配 → 更新缓存，无需代码修改
      └── 部分失败 → 更新选择器覆盖 + 重新运行测试
      │
      ▼
更新 TRADE_VERSION_LOCK.yaml
      │
      ▼
CI 全量测试通过 → 版本锁定更新完成
```
