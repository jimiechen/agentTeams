const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const os = require('os');

// ========== 配置管理 ==========
const CONFIG_DIR = path.join(os.homedir(), '.trae-agent-team');
const CONFIG_FILE = path.join(CONFIG_DIR, 'team-config.json');
const FINGERPRINT_DIR = path.join(CONFIG_DIR, 'fingerprints');

const DEFAULT_CONFIG = {
  version: '2.2.0',
  name: 'my-project',
  trae: {
    path: '',
    instances: [
      { id: 'agent-1', port: 9222, workspace: '', enabled: true },
      { id: 'agent-2', port: 9223, workspace: '', enabled: false },
      { id: 'agent-3', port: 9224, workspace: '', enabled: false }
    ],
    startupDelay: 5000,
    checkInterval: 5000,
    stableCount: 3
  },
  lark: {
    appId: '',
    appSecret: '',
    chatId: '',
    bitable: {
      appToken: '',
      tableId: ''
    }
  },
  git: {
    autoCommit: true,
    commitInterval: 30000,
    branchPrefix: 'task/',
    autoMerge: false,
    taskDocsDir: '.trae-tasks'
  },
  concurrency: {
    maxParallel: 3,
    chatSendTimeout: 10000,
    taskQueueSize: 100
  },
  uiRecognizer: {
    autoProbe: true,
    adaptive: true,
    cacheDir: CONFIG_DIR,
    probeTimeout: 10000,
    overrides: {}
  },
  approval: {
    enabled: true,
    gates: {
      taskStart: { enabled: true, timeoutMinutes: 60, timeoutAction: 'approve' },
      dangerousOperation: { enabled: true, timeoutMinutes: 5, timeoutAction: 'reject' },
      codeMerge: { enabled: true, timeoutMinutes: 1440, timeoutAction: 'reject' }
    }
  }
};

class ConfigManager {
  constructor(context) {
    this.context = context;
    this.config = null;
    this._onDidChange = new vscode.EventEmitter();
    this.onDidChange = this._onDidChange.event;
  }

  async load() {
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
        this.config = { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
      } else {
        this.config = { ...DEFAULT_CONFIG };
      }
    } catch (err) {
      this.config = { ...DEFAULT_CONFIG };
      vscode.window.showErrorMessage(`配置加载失败: ${err.message}`);
    }
    return this.config;
  }

  async save(newConfig) {
    this.config = { ...DEFAULT_CONFIG, ...newConfig };
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(this.config, null, 2));
    this._onDidChange.fire(this.config);
    return this.config;
  }

  get() {
    return this.config || DEFAULT_CONFIG;
  }

  getTraeVersion(port) {
    const fpPath = path.join(FINGERPRINT_DIR, `ui-fingerprint-${port}.json`);
    try {
      if (fs.existsSync(fpPath)) {
        const fp = JSON.parse(fs.readFileSync(fpPath, 'utf-8'));
        return fp.traeVersion || 'unknown';
      }
    } catch {}
    return 'unknown';
  }

  getAllFingerprints() {
    if (!fs.existsSync(FINGERPRINT_DIR)) return [];
    const files = fs.readdirSync(FINGERPRINT_DIR).filter(f => f.endsWith('.json'));
    return files.map(f => {
      try {
        return JSON.parse(fs.readFileSync(path.join(FINGERPRINT_DIR, f), 'utf-8'));
      } catch {
        return null;
      }
    }).filter(Boolean);
  }
}

// ========== UI 探测器（从测试脚本提取核心逻辑） ==========
class UIProbeRunner {
  constructor() {
    this.CDP = null;
  }

  async probe(port, timeout = 10000) {
    if (!this.CDP) {
      try {
        this.CDP = require('chrome-remote-interface');
      } catch {
        throw new Error('需要安装 chrome-remote-interface: npm install chrome-remote-interface');
      }
    }

    const client = await this.CDP({ port, timeout });
    const { Runtime, Target } = client;

    await Target.setDiscoverTargets({ discover: true });
    await new Promise(r => setTimeout(r, 1000));

    const { targetInfos } = await Target.getTargets();
    const target = targetInfos.find(t => t.type === 'page') ||
                   targetInfos.find(t => t.url.includes('workbench'));

    if (!target) {
      await this.CDP.close(client);
      throw new Error('未找到 Trae workbench 页面');
    }

    await this.CDP.close(client);
    const page = await this.CDP({ port, target, timeout });
    await page.Runtime.enable();

    const probeScript = `
      (() => {
        const elements = document.querySelectorAll(
          'input, textarea, [contenteditable], button, [role="button"], ' +
          '[role="textbox"], [aria-label], [data-testid], a, select'
        );
        const fps = [];
        for (const el of elements) {
          const r = el.getBoundingClientRect();
          const cs = window.getComputedStyle(el);
          const cc = [];
          let cur = el;
          for (let i = 0; i < 3 && cur; i++) {
            if (cur.className && typeof cur.className === 'string') {
              const cls = cur.className.split(/\\s+/).filter(c => c && !c.startsWith('__')).slice(0, 6);
              if (cls.length) cc.push(cls);
            }
            cur = cur.parentElement;
          }
          fps.push({
            tagName: el.tagName, type: el.type || '', role: el.getAttribute('role') || '',
            dataTestId: el.getAttribute('data-testid') || '', ariaLabel: el.getAttribute('aria-label') || '',
            placeholder: el.placeholder || '', contentEditable: el.contentEditable || '',
            disabled: el.disabled || false,
            hidden: el.hidden || cs.display === 'none' || cs.visibility === 'hidden',
            rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
            classChain: cc
          });
        }
        return JSON.stringify({ fps, title: document.title, url: window.location.href });
      })();
    `;

    const { result } = await page.Runtime.evaluate({ expression: probeScript, returnByValue: true });
    const data = JSON.parse(result.value);
    await this.CDP.close(page);

    return this.matchElements(data.fps);
  }

  matchElements(fingerprints) {
    const results = {};
    const strategies = {
      chatInput: [
        (el) => el.dataTestId && /chat.?input/i.test(el.dataTestId),
        (el) => el.role === 'textbox' && el.contentEditable === 'true',
        (el) => el.contentEditable === 'true' && /发送|send|ask|type|输入/i.test(el.placeholder || ''),
      ],
      sendButton: [
        (el) => el.dataTestId && /send/i.test(el.dataTestId),
        (el) => el.tagName === 'BUTTON' && /发送|send/i.test(el.ariaLabel || ''),
      ],
      statusIndicator: [
        (el) => el.dataTestId && /loading|thinking/i.test(el.dataTestId),
        (el) => el.classChain.some(c => c.some(cl => /loading|spinner|thinking/i.test(cl))),
      ],
      chatList: [
        (el) => el.dataTestId && /chat.?list|session/i.test(el.dataTestId),
        (el) => el.classChain.some(c => c.some(cl => /chat/i.test(cl) && /list|sidebar/i.test(cl))),
      ],
      newChatButton: [
        (el) => el.dataTestId && /new.?chat/i.test(el.dataTestId),
        (el) => (el.tagName === 'BUTTON') && /新建|new/i.test(el.ariaLabel || ''),
      ],
    };

    for (const [key, tests] of Object.entries(strategies)) {
      for (const fp of fingerprints) {
        if (fp.hidden) continue;
        for (let i = 0; i < tests.length; i++) {
          try {
            if (tests[i](fp)) {
              results[key] = {
                matched: true,
                strategy: `P${i}`,
                selector: fp.dataTestId ? `[data-testid="${fp.dataTestId}"]` :
                           fp.role ? `[role="${fp.role}"]` :
                           fp.placeholder ? `[placeholder="${fp.placeholder}"]` :
                           fp.ariaLabel ? `[aria-label="${fp.ariaLabel}"]` : 'unknown',
                element: { tag: fp.tagName, testId: fp.dataTestId, aria: fp.ariaLabel, pos: fp.rect }
              };
              break;
            }
          } catch {}
        }
        if (results[key]) break;
      }
      if (!results[key]) results[key] = { matched: false };
    }

    return results;
  }
}

// ========== Webview Provider ==========
class ConfigWebviewProvider {
  constructor(context, configManager, probeRunner) {
    this.context = context;
    this.configManager = configManager;
    this.probeRunner = probeRunner;
  }

  resolveWebviewView(webviewView) {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri]
    };
    webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);
    webviewView.webview.onDidReceiveMessage(async (message) => {
      await this.handleMessage(webviewView.webview, message);
    });
  }

  async openInEditor() {
    const panel = vscode.window.createWebviewPanel(
      'traeAgentTeamConfig',
      'Trae Agent Team 配置',
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    panel.webview.html = this.getHtmlForWebview(panel.webview);
    panel.webview.onDidReceiveMessage(async (message) => {
      await this.handleMessage(panel.webview, message);
    });
  }

  async handleMessage(webview, message) {
    switch (message.command) {
      case 'getConfig':
        webview.postMessage({ command: 'configLoaded', data: this.configManager.get() });
        break;

      case 'saveConfig':
        await this.configManager.save(message.data);
        vscode.window.showInformationMessage('配置已保存');
        break;

      case 'probeUI': {
        const port = message.port;
        try {
          webview.postMessage({ command: 'probeStart', port });
          const results = await this.probeRunner.probe(port);
          webview.postMessage({ command: 'probeResult', port, results });
        } catch (err) {
          webview.postMessage({ command: 'probeError', port, error: err.message });
        }
        break;
      }

      case 'browseTrae': {
        const uris = await vscode.window.showOpenDialog({
          filters: [{ name: 'Trae IDE', extensions: ['exe'] }],
          title: '选择 Trae IDE 可执行文件'
        });
        if (uris && uris[0]) {
          webview.postMessage({ command: 'traePathSelected', path: uris[0].fsPath });
        }
        break;
      }

      case 'browseWorkspace': {
        const uris = await vscode.window.showOpenDialog({
          canSelectFolders: true,
          canSelectFiles: false,
          title: '选择工作区目录'
        });
        if (uris && uris[0]) {
          webview.postMessage({ command: 'workspaceSelected', path: uris[0].fsPath, agentId: message.agentId });
        }
        break;
      }
    }
  }

  getHtmlForWebview(webview) {
    const nonce = getNonce();
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>Trae Agent Team 配置</title>
  <style>
    :root {
      --bg: var(--vscode-editor-background);
      --fg: var(--vscode-editor-foreground);
      --accent: var(--vscode-button-background);
      --accent-fg: var(--vscode-button-foreground);
      --border: var(--vscode-panel-border);
      --muted: var(--vscode-descriptionForeground);
      --card: var(--vscode-editor-background);
      --success: #4caf50;
      --warning: #ff9800;
      --danger: #f44336;
      --input-bg: var(--vscode-input-background);
      --input-border: var(--vscode-input-border);
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: var(--vscode-font-family); color: var(--fg); background: var(--bg); padding: 20px; font-size: 13px; line-height: 1.6; }
    h1 { font-size: 20px; font-weight: 600; margin-bottom: 6px; }
    .subtitle { color: var(--muted); font-size: 12px; margin-bottom: 24px; }
    .section { margin-bottom: 24px; }
    .section-title { font-size: 14px; font-weight: 600; margin-bottom: 12px; padding-bottom: 6px; border-bottom: 1px solid var(--border); }
    .form-row { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
    .form-row label { min-width: 120px; font-size: 12px; color: var(--muted); }
    .form-row input, .form-row select { flex: 1; padding: 5px 8px; background: var(--input-bg); border: 1px solid var(--input-border); border-radius: 3px; color: var(--fg); font-family: inherit; font-size: 12px; }
    .form-row input:focus, .form-row select:focus { outline: 1px solid var(--accent); }
    .form-row .browse-btn { padding: 4px 10px; background: var(--accent); color: var(--accent-fg); border: none; border-radius: 3px; cursor: pointer; font-size: 11px; white-space: nowrap; }
    .form-row .browse-btn:hover { opacity: 0.9; }
    .btn { padding: 6px 14px; border: none; border-radius: 3px; cursor: pointer; font-size: 12px; font-family: inherit; }
    .btn-primary { background: var(--accent); color: var(--accent-fg); }
    .btn-primary:hover { opacity: 0.9; }
    .btn-secondary { background: transparent; color: var(--fg); border: 1px solid var(--border); }
    .btn-danger { background: var(--danger); color: #fff; }
    .btn-probe { background: #1565c0; color: #fff; }
    .btn-row { display: flex; gap: 8px; margin-top: 12px; }

    /* Agent 卡片 */
    .agent-card { background: var(--card); border: 1px solid var(--border); border-radius: 6px; padding: 14px; margin-bottom: 12px; }
    .agent-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
    .agent-name { font-weight: 600; font-size: 13px; }
    .agent-status { font-size: 11px; padding: 2px 8px; border-radius: 10px; }
    .agent-status.enabled { background: rgba(76,175,80,0.15); color: var(--success); }
    .agent-status.disabled { background: rgba(158,158,158,0.15); color: var(--muted); }
    .agent-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .agent-fields .full { grid-column: 1 / -1; }

    /* 探测结果 */
    .probe-result { background: var(--card); border: 1px solid var(--border); border-radius: 6px; padding: 14px; margin-top: 12px; }
    .probe-item { display: flex; justify-content: space-between; align-items: center; padding: 4px 0; border-bottom: 1px solid var(--border); }
    .probe-item:last-child { border-bottom: none; }
    .probe-status { font-size: 12px; font-weight: 600; }
    .probe-status.ok { color: var(--success); }
    .probe-status.fail { color: var(--danger); }
    .probe-detail { font-size: 11px; color: var(--muted); }

    /* 版本适配 */
    .version-badge { display: inline-block; padding: 2px 8px; border-radius: 3px; font-size: 11px; font-weight: 600; }
    .version-badge.compatible { background: rgba(76,175,80,0.15); color: var(--success); }
    .version-badge.incompatible { background: rgba(244,67,54,0.15); color: var(--danger); }
    .version-badge.unknown { background: rgba(158,158,158,0.15); color: var(--muted); }

    /* Toggle */
    .toggle { position: relative; width: 36px; height: 20px; cursor: pointer; }
    .toggle input { opacity: 0; width: 0; height: 0; }
    .toggle .slider { position: absolute; inset: 0; background: var(--input-border); border-radius: 10px; transition: 0.2s; }
    .toggle .slider::before { content: ''; position: absolute; width: 16px; height: 16px; left: 2px; bottom: 2px; background: #fff; border-radius: 50%; transition: 0.2s; }
    .toggle input:checked + .slider { background: var(--success); }
    .toggle input:checked + .slider::before { transform: translateX(16px); }

    /* Tabs */
    .tabs { display: flex; gap: 0; margin-bottom: 20px; border-bottom: 1px solid var(--border); }
    .tab { padding: 8px 16px; cursor: pointer; font-size: 13px; color: var(--muted); border-bottom: 2px solid transparent; }
    .tab.active { color: var(--fg); border-bottom-color: var(--accent); font-weight: 600; }
    .tab-content { display: none; }
    .tab-content.active { display: block; }
  </style>
</head>
<body>
  <h1>Trae Agent Team</h1>
  <p class="subtitle">飞书驱动的 Trae 多任务多智能体协作系统 — 配置面板</p>

  <div class="tabs">
    <div class="tab active" onclick="switchTab('agents')">Agent 配置</div>
    <div class="tab" onclick="switchTab('trae')">Trae 适配</div>
    <div class="tab" onclick="switchTab('lark')">飞书集成</div>
    <div class="tab" onclick="switchTab('approval')">审批策略</div>
  </div>

  <!-- Tab: Agent 配置 -->
  <div id="tab-agents" class="tab-content active">
    <div class="section">
      <div class="section-title">Trae IDE 路径</div>
      <div class="form-row">
        <label>可执行文件</label>
        <input type="text" id="traePath" placeholder="选择 Trae IDE 路径..." />
        <button class="browse-btn" onclick="browseTrae()">浏览</button>
      </div>
    </div>
    <div class="section">
      <div class="section-title">Agent 实例配置</div>
      <div id="agentCards"></div>
    </div>
    <div class="btn-row">
      <button class="btn btn-secondary" onclick="addAgent()">+ 添加 Agent</button>
      <button class="btn btn-primary" onclick="saveConfig()">保存配置</button>
    </div>
  </div>

  <!-- Tab: Trae 适配 -->
  <div id="tab-trae" class="tab-content">
    <div class="section">
      <div class="section-title">UI 自动探测</div>
      <p style="color:var(--muted);font-size:12px;margin-bottom:12px;">
        连接 Trae IDE 的 CDP 调试端口，自动探测关键 UI 元素并生成选择器配置。
        请先启动 Trae IDE 并添加 <code>--remote-debugging-port=9222</code> 参数。
      </p>
      <div id="probeResults"></div>
    </div>
    <div class="section">
      <div class="section-title">选择器覆盖（手动配置）</div>
      <p style="color:var(--muted);font-size:12px;margin-bottom:12px;">
        当自动探测失败时，可手动指定 CSS 选择器。
      </p>
      <div id="selectorOverrides"></div>
    </div>
    <div class="section">
      <div class="section-title">历史探测记录</div>
      <div id="fingerprintHistory"></div>
    </div>
  </div>

  <!-- Tab: 飞书集成 -->
  <div id="tab-lark" class="tab-content">
    <div class="section">
      <div class="section-title">飞书应用配置</div>
      <div class="form-row"><label>App ID</label><input type="text" id="larkAppId" placeholder="cli_xxx" /></div>
      <div class="form-row"><label>App Secret</label><input type="password" id="larkAppSecret" placeholder="••••••" /></div>
      <div class="form-row"><label>群聊 ID</label><input type="text" id="larkChatId" placeholder="oc_xxx" /></div>
    </div>
    <div class="section">
      <div class="section-title">多维表格</div>
      <div class="form-row"><label>App Token</label><input type="text" id="bitableAppToken" placeholder="bascnxxx" /></div>
      <div class="form-row"><label>数据表 ID</label><input type="text" id="bitableTableId" placeholder="tblxxx" /></div>
    </div>
    <div class="btn-row">
      <button class="btn btn-primary" onclick="saveConfig()">保存配置</button>
    </div>
  </div>

  <!-- Tab: 审批策略 -->
  <div id="tab-approval" class="tab-content">
    <div class="section">
      <div class="section-title">审批节点配置</div>
      <div class="form-row">
        <label>启用审批</label>
        <label class="toggle"><input type="checkbox" id="approvalEnabled" checked /><span class="slider"></span></label>
      </div>
    </div>
    <div class="section">
      <div class="section-title">任务启动审批</div>
      <div class="form-row"><label>需要审批的优先级</label><input type="text" id="taskStartPriorities" placeholder="P0" /></div>
      <div class="form-row"><label>超时时间(分钟)</label><input type="number" id="taskStartTimeout" value="60" /></div>
      <div class="form-row"><label>超时操作</label>
        <select id="taskStartTimeoutAction"><option value="approve">自动通过</option><option value="reject">自动拒绝</option></select>
      </div>
    </div>
    <div class="section">
      <div class="section-title">危险操作审批</div>
      <div class="form-row"><label>超时时间(分钟)</label><input type="number" id="dangerTimeout" value="5" /></div>
      <div class="form-row"><label>超时操作</label>
        <select id="dangerTimeoutAction"><option value="reject">自动拒绝</option><option value="approve">自动通过</option></select>
      </div>
    </div>
    <div class="section">
      <div class="section-title">代码合并审批</div>
      <div class="form-row"><label>超时时间(分钟)</label><input type="number" id="mergeTimeout" value="1440" /></div>
    </div>
    <div class="btn-row">
      <button class="btn btn-primary" onclick="saveConfig()">保存配置</button>
    </div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    // ========== Tab 切换 ==========
    function switchTab(tabId) {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
      document.querySelector('[data-tab="' + tabId + '"]').classList.add('active');
      document.getElementById('tab-' + tabId).classList.add('active');
    }

    // ========== 加载配置 ==========
    function loadConfig(config) {
      // Trae 路径
      document.getElementById('traePath').value = config.trae.path || '';

      // Agent 卡片
      renderAgentCards(config.trae.instances || []);

      // 飞书
      document.getElementById('larkAppId').value = config.lark.appId || '';
      document.getElementById('larkAppSecret').value = config.lark.appSecret || '';
      document.getElementById('larkChatId').value = config.lark.chatId || '';
      document.getElementById('bitableAppToken').value = config.lark.bitable?.appToken || '';
      document.getElementById('bitableTableId').value = config.lark.bitable?.tableId || '';

      // 审批
      document.getElementById('approvalEnabled').checked = config.approval?.enabled !== false;
      document.getElementById('taskStartPriorities').value = (config.approval?.gates?.taskStart?.requireFor?.priorities || ['P0']).join(', ');
      document.getElementById('taskStartTimeout').value = config.approval?.gates?.taskStart?.timeoutMinutes || 60;
      document.getElementById('taskStartTimeoutAction').value = config.approval?.gates?.taskStart?.timeoutAction || 'approve';
      document.getElementById('dangerTimeout').value = config.approval?.gates?.dangerousOperation?.timeoutMinutes || 5;
      document.getElementById('dangerTimeoutAction').value = config.approval?.gates?.dangerousOperation?.timeoutAction || 'reject';
      document.getElementById('mergeTimeout').value = config.approval?.gates?.codeMerge?.timeoutMinutes || 1440;

      // 选择器覆盖
      renderSelectorOverrides(config.uiRecognizer?.overrides || {});
    }

    // ========== Agent 卡片渲染 ==========
    function renderAgentCards(instances) {
      const container = document.getElementById('agentCards');
      container.innerHTML = instances.map((inst, i) => \`
        <div class="agent-card" data-index="\${i}">
          <div class="agent-header">
            <span class="agent-name">\${inst.id}</span>
            <span class="agent-status \${inst.enabled !== false ? 'enabled' : 'disabled'}">
              \${inst.enabled !== false ? '已启用' : '已禁用'}
            </span>
          </div>
          <div class="agent-fields">
            <div><label style="font-size:11px;color:var(--muted)">CDP 端口</label><input type="number" value="\${inst.port}" onchange="updateAgent(\${i},'port',this.value)" /></div>
            <div><label style="font-size:11px;color:var(--muted)">状态</label>
              <label class="toggle"><input type="checkbox" \${inst.enabled !== false ? 'checked' : ''} onchange="updateAgent(\${i},'enabled',this.checked)" /><span class="slider"></span></label>
            </div>
            <div class="full"><label style="font-size:11px;color:var(--muted)">工作区路径</label>
              <div style="display:flex;gap:6px">
                <input type="text" value="\${inst.workspace || ''}" onchange="updateAgent(\${i},'workspace',this.value)" style="flex:1" />
                <button class="browse-btn" onclick="browseWorkspace(\${i})">浏览</button>
              </div>
            </div>
          </div>
        </div>
      \`).join('');
    }

    function updateAgent(index, field, value) {
      const cards = document.querySelectorAll('.agent-card');
      const card = cards[index];
      if (!card) return;
      if (field === 'enabled') {
        const badge = card.querySelector('.agent-status');
        badge.className = 'agent-status ' + (value ? 'enabled' : 'disabled');
        badge.textContent = value ? '已启用' : '已禁用';
      }
    }

    function addAgent() {
      const cards = document.querySelectorAll('.agent-card');
      const count = cards.length + 1;
      const port = 9221 + count;
      const container = document.getElementById('agentCards');
      const div = document.createElement('div');
      div.className = 'agent-card';
      div.dataset.index = count - 1;
      div.innerHTML = \`
        <div class="agent-header">
          <span class="agent-name">agent-\${count}</span>
          <span class="agent-status enabled">已启用</span>
        </div>
        <div class="agent-fields">
          <div><label style="font-size:11px;color:var(--muted)">CDP 端口</label><input type="number" value="\${port}" /></div>
          <div><label style="font-size:11px;color:var(--muted)">状态</label>
            <label class="toggle"><input type="checkbox" checked /><span class="slider"></span></label>
          </div>
          <div class="full"><label style="font-size:11px;color:var(--muted)">工作区路径</label>
            <div style="display:flex;gap:6px">
              <input type="text" placeholder="选择工作区目录..." style="flex:1" />
              <button class="browse-btn" onclick="browseWorkspace(\${count - 1})">浏览</button>
            </div>
          </div>
        </div>\`;
      container.appendChild(div);
    }

    // ========== 选择器覆盖 ==========
    const SELECTOR_KEYS = [
      { key: 'chat_input', name: 'Chat 输入框' },
      { key: 'send_button', name: '发送按钮' },
      { key: 'status_indicator', name: 'AI 状态指示器' },
      { key: 'chat_list', name: 'Chat 会话列表' },
      { key: 'new_chat_button', name: '新建对话按钮' },
      { key: 'confirm_dialog', name: '确认弹窗' },
    ];

    function renderSelectorOverrides(overrides) {
      const container = document.getElementById('selectorOverrides');
      container.innerHTML = SELECTOR_KEYS.map(({ key, name }) => \`
        <div class="form-row">
          <label>\${name}</label>
          <input type="text" value="\${overrides[key] || ''}" placeholder="自动探测" data-selector-key="\${key}" />
        </div>
      \`).join('');
    }

    // ========== 探测 ==========
    function startProbe() {
      const port = parseInt(document.querySelector('#probePort')?.value || '9222');
      vscode.postMessage({ command: 'probeUI', port });
    }

    function renderProbeResults(port, results) {
      const container = document.getElementById('probeResults');
      const names = { chatInput: 'Chat 输入框', sendButton: '发送按钮', statusIndicator: 'AI 状态指示器', chatList: 'Chat 会话列表', newChatButton: '新建对话按钮', confirmDialog: '确认弹窗' };
      const matched = Object.values(results).filter(r => r.matched).length;
      const total = Object.keys(results).length;

      container.innerHTML = \`
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <span style="font-size:13px;font-weight:600">端口 \${port} 探测结果</span>
          <span class="version-badge \${matched === total ? 'compatible' : matched >= 3 ? 'unknown' : 'incompatible'}">
            \${matched}/\${total} 匹配
          </span>
        </div>
        \${Object.entries(results).map(([key, r]) => \`
          <div class="probe-item">
            <span>\${names[key] || key}</span>
            <span>
              <span class="probe-status \${r.matched ? 'ok' : 'fail'}">\${r.matched ? '✅ ' + r.strategy : '❌ 未匹配'}</span>
              \${r.matched ? '<span class="probe-detail">' + r.selector + '</span>' : ''}
            </span>
          </div>
        \`).join('')}
        <div style="margin-top:10px">
          <button class="btn btn-primary" onclick="applyProbeResults()">应用探测结果到选择器覆盖</button>
        </div>
      \`;
    }

    function applyProbeResults() {
      // 将探测结果应用到选择器覆盖
      const inputs = document.querySelectorAll('#selectorOverrides input[data-selector-key]');
      // 需要从最近的探测结果获取
      vscode.postMessage({ command: 'getConfig' });
    }

    // ========== 文件浏览 ==========
    function browseTrae() { vscode.postMessage({ command: 'browseTrae' }); }
    function browseWorkspace(agentId) { vscode.postMessage({ command: 'browseWorkspace', agentId }); }

    // ========== 保存 ==========
    function saveConfig() {
      const instances = [];
      document.querySelectorAll('.agent-card').forEach((card, i) => {
        const inputs = card.querySelectorAll('input[type="number"]');
        const pathInput = card.querySelector('input[type="text"]');
        const toggle = card.querySelector('input[type="checkbox"]');
        instances.push({
          id: card.querySelector('.agent-name').textContent,
          port: parseInt(inputs[0]?.value || (9221 + i + 1)),
          workspace: pathInput?.value || '',
          enabled: toggle?.checked !== false
        });
      });

      const overrides = {};
      document.querySelectorAll('#selectorOverrides input[data-selector-key]').forEach(input => {
        if (input.value) overrides[input.dataset.selectorKey] = input.value;
      });

      const config = {
        trae: {
          path: document.getElementById('traePath').value,
          instances
        },
        lark: {
          appId: document.getElementById('larkAppId').value,
          appSecret: document.getElementById('larkAppSecret').value,
          chatId: document.getElementById('larkChatId').value,
          bitable: {
            appToken: document.getElementById('bitableAppToken').value,
            tableId: document.getElementById('bitableTableId').value
          }
        },
        approval: {
          enabled: document.getElementById('approvalEnabled').checked,
          gates: {
            taskStart: {
              timeoutMinutes: parseInt(document.getElementById('taskStartTimeout').value),
              timeoutAction: document.getElementById('taskStartTimeoutAction').value
            },
            dangerousOperation: {
              timeoutMinutes: parseInt(document.getElementById('dangerTimeout').value),
              timeoutAction: document.getElementById('dangerTimeoutAction').value
            },
            codeMerge: {
              timeoutMinutes: parseInt(document.getElementById('mergeTimeout').value)
            }
          }
        },
        uiRecognizer: { overrides }
      };

      vscode.postMessage({ command: 'saveConfig', data: config });
    }

    // ========== 消息处理 ==========
    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.command === 'configLoaded') {
        loadConfig(msg.data);
      } else if (msg.command === 'probeStart') {
        const container = document.getElementById('probeResults');
        container.innerHTML = '<p style="color:var(--muted)">⏳ 正在探测端口 ' + msg.port + '...</p>';
      } else if (msg.command === 'probeResult') {
        renderProbeResults(msg.port, msg.results);
      } else if (msg.command === 'probeError') {
        const container = document.getElementById('probeResults');
        container.innerHTML = '<p style="color:var(--danger)">❌ 探测失败: ' + msg.error + '</p>';
      } else if (msg.command === 'traePathSelected') {
        document.getElementById('traePath').value = msg.path;
      } else if (msg.command === 'workspaceSelected') {
        const cards = document.querySelectorAll('.agent-card');
        const card = cards[msg.agentId];
        if (card) {
          const input = card.querySelector('input[type="text"]');
          if (input) input.value = msg.path;
        }
      }
    });

    // 初始化：请求配置
    vscode.postMessage({ command: 'getConfig' });
  </script>
</body>
</html>`;
  }
}

// ========== 状态栏 Webview ==========
class StatusWebviewProvider {
  constructor(context, configManager) {
    this.context = context;
    this.configManager = configManager;
  }

  resolveWebviewView(webviewView) {
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this.getHtml();
  }

  getHtml() {
    const config = this.configManager.get();
    const agents = (config.trae.instances || []).filter(i => i.enabled !== false);
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
  <style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-editor-foreground); padding: 12px; font-size: 12px; }
    h2 { font-size: 14px; font-weight: 600; margin-bottom: 12px; }
    .agent-item { padding: 8px; margin-bottom: 6px; background: var(--vscode-list-hoverBackground); border-radius: 4px; }
    .agent-name { font-weight: 600; }
    .agent-meta { color: var(--vscode-descriptionForeground); font-size: 11px; margin-top: 2px; }
    .status-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 4px; }
    .status-dot.idle { background: var(--success); }
    .status-dot.busy { background: var(--warning); }
    .status-dot.offline { background: var(--vscode-descriptionForeground); }
    .empty { color: var(--vscode-descriptionForeground); font-style: italic; }
  </style>
</head>
<body>
  <h2>Agent 状态</h2>
  ${agents.length === 0 ? '<p class="empty">暂无已启用的 Agent</p>' :
    agents.map(a => `
      <div class="agent-item">
        <div class="agent-name"><span class="status-dot idle"></span>${a.id}</div>
        <div class="agent-meta">端口: ${a.port} | ${a.workspace || '未配置工作区'}</div>
      </div>
    `).join('')}
</body>
</html>`;
  }
}

// ========== 工具函数 ==========
function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) text += possible.charAt(Math.floor(Math.random() * possible.length));
  return text;
}

// ========== 插件入口 ==========
function activate(context) {
  const configManager = new ConfigManager(context);
  const probeRunner = new UIProbeRunner();
  const configProvider = new ConfigWebviewProvider(context, configManager, probeRunner);
  const statusProvider = new StatusWebviewProvider(context, configManager);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('traeAgentTeamStatus', statusProvider),
    vscode.commands.registerCommand('traeAgentTeam.openConfig', async () => {
      await configManager.load();
      await configProvider.openInEditor();
    }),
    vscode.commands.registerCommand('traeAgentTeam.probeUI', async () => {
      await configManager.load();
      const config = configManager.get();
      const port = config.trae.instances[0]?.port || 9222;
      try {
        const results = await probeRunner.probe(port);
        const matched = Object.values(results).filter(r => r.matched).length;
        const total = Object.keys(results).length;
        vscode.window.showInformationMessage(`UI 探测完成: ${matched}/${total} 元素匹配`);
      } catch (err) {
        vscode.window.showErrorMessage(`UI 探测失败: ${err.message}`);
      }
    }),
    vscode.commands.registerCommand('traeAgentTeam.startTeam', async () => {
      vscode.window.showInformationMessage('Agent Team 启动功能需要配合 trae-agent-team CLI 使用');
    }),
    vscode.commands.registerCommand('traeAgentTeam.stopTeam', async () => {
      vscode.window.showInformationMessage('Agent Team 密止功能需要配合 trae-agent-team CLI 使用');
    })
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
