# Day 0 MVP 验证 PRD — Trae CDP 自动化可行性

> **版本**: v0.10 Day 0 | **日期**: 2026-04-26 | **时间盒**: 2 天（16h）
> **核心问题**: Trae IDE 能否被 CDP 自动化操控完成一次完整的 Chat 提交循环？
> **判定**: 通过则 Phase 1 开工，不通过则整套 PRD 作废

> ⚠️ Day 0 期间：不写文档、不做工程化、不考虑拟人化和配额，只验证"能不能跑通"。

---

## 1. 总体目标与交付物

**2 天（16 小时）内，用不超过 300 行 Node.js 代码完成端到端验证。**

### 1.1 核心交付物

| 交付物 | 形式 | 用途 |
|--------|------|------|
| `probe-01~10.js` | 10 个独立脚本 | 每个 probe 验证一个技术假设 |
| `selectors.v<date>.json` | JSON | 当前 Trae 版本所有关键 DOM 选择器 |
| `e2e-demo.mp4` | 录屏 | 证明"切任务→填 Prompt→提交→收响应"物理可行 |
| `DAY0_GO_NOGO_REPORT.md` | 报告 | Go / 有条件 Go / No-Go 决策 |

### 1.2 Go/No-Go 硬性判定标准

| 验证项 | Go 条件 | No-Go 后果 |
|--------|---------|-----------|
| CDP 可连接 | `http://localhost:9222/json` 返回 Target 列表 | 评估 Electron IPC 注入替代 |
| DOM 可穿透 | `querySelector` 能找到 Chat 输入框 | 评估 OCR + 屏幕坐标路径 |
| 文本可注入 | 输入框显示填入的文字 | 评估 xdotool / RobotJS 兜底 |
| 提交可触发 | 回车后 Trae 产生 AI 响应 | 验证 Cmd/Ctrl+Enter 等变体 |
| 任务可切换 | 点击任务列表项能生效 | 简化为单任务模式 |
| 长时稳定 | 2 小时内循环成功率 > 90% | PRD 加强自愈机制 |

**任何一项硬性 No-Go 且无备选方案，整个 v0.10 PRD 作废。**

### 1.3 目录结构

```
day0/
├── start-trae-debug.sh          # Task 1.1: Trae 调试模式启动脚本
├── probe-01-connect.js          # Task 1.2: CDP 连接与 Target 定位
├── probe-02-locate-chat.js      # Task 1.3: Chat 输入框定位
├── probe-03-inject-submit.js    # Task 1.4: 文本注入与提交验证（生死点）
├── probe-04-wait-response.js    # Task 1.5: AI 响应完成检测
├── probe-05-task-list.js        # Task 2.1: 任务列表定位与点击切换
├── probe-06-e2e-single.js       # Task 2.2: 端到端完整循环
├── probe-07-loop-stability.js   # Task 2.3: 长时稳定性循环测试
├── probe-08-selectors-final.js  # Task 2.4: 选择器最终确认与输出
├── probe-09-submit-key-test.js  # Task 2.5: 提交键全量测试
├── probe-10-cleanup.js          # Task 2.6: 清理与归档
├── selectors.v<date>.json       # 选择器映射表
├── target.json                  # 主 Target 信息
├── inject-result.json           # 注入结果
├── task-switch-result.json      # 任务切换结果
├── e2e-result.json              # 端到端结果
├── loop-stability-result.json   # 稳定性测试结果
├── frames/                      # Page.startScreencast 截图帧
└── DAY0_GO_NOGO_REPORT.md       # 最终报告
```

---

## 2. Day 1（8h，5 个 Task）

### Task 1.1 — 环境准备与 Trae 调试模式启动（0.5h）

**目标**：把 Trae 以 CDP 调试模式启动，确认端口 9222 可达。

**给 AI 的提示词**：

```
我需要在 macOS/Windows/Linux 三平台上以 --remote-debugging-port=9222
参数启动 Trae IDE。帮我写一个 start-trae-debug.sh 脚本，要求：
1. 自动检测操作系统（uname -s）
2. 定位 Trae 安装路径：
   - macOS: /Applications/Trae.app/Contents/MacOS/Trae
   - Windows: "C:\Program Files\Trae\Trae.exe"
   - Linux: $(which trae) 或 /usr/bin/trae
3. 启动前用 lsof -i :9222（或 netstat）检测端口是否被占用，占用则退出
4. 后台启动 Trae 并传入 --remote-debugging-port=9222 --remote-allow-origins=*
5. 等待 5 秒后 curl -s http://localhost:9222/json，解析返回的 Target 数量
6. 如果返回 0 个或 curl 失败，输出三条备选排查指令：
   a) 尝试加 --inspect=9222
   b) 检查 Trae 是否已在后台运行占用了 debug 端口
   c) 检查防火墙设置
7. 成功后打印第一个 Target 的 title 和 webSocketDebuggerUrl

输出一个可直接 chmod +x 执行的 bash 脚本。
```

**执行命令**：

```bash
chmod +x start-trae-debug.sh
./start-trae-debug.sh
curl -s http://localhost:9222/json | head -c 500
```

**验收标准**：`curl` 返回至少一个 Target 对象包含 `webSocketDebuggerUrl`。

> ⚠️ **如果返回空数组或 ECONNREFUSED，立即暂停后续任务**，先穷尽启动参数组合（`--inspect`、`--remote-debugging-pipe`、`ELECTRON_ENABLE_LOGGING=1` 等），所有参数都失败则 **Day 0 直接 No-Go**。

---

### Task 1.2 — CDP 连接与 Target 定位（1h）

**目标**：用 `chrome-remote-interface` 连上 Trae，找到承载 Chat 的主 WebView Target。

**给 AI 的提示词**：

```
帮我写 probe-01-connect.js，功能：
1. npm init -y && npm i chrome-remote-interface 已完成，直接 require 即可
2. 调用 CDP.List({ port: 9222 }) 列出所有 Target
3. 对每个 type === 'page' 的 Target，打印：
   { id, title, url 前 80 字符, type, webSocketDebuggerUrl 前 40 字符 }
4. 尝试连接每个 page Target，连上后执行：
   Runtime.evaluate({ expression: 'document.body.innerText.substring(0, 300)' })
   记录哪些 Target 的 innerText 包含关键词：
   'Chat'、'任务'、'MTCCode'、'新建任务'、'Trae'
5. 输出一个推荐列表：按关键词匹配数从高到低排序
6. 把最高匹配的 Target 的 webSocketDebuggerUrl 写入 target.json 供后续脚本复用
7. 所有 try-catch 打印完整堆栈，不允许静默失败
8. 如果所有 Target 的 innerText 都为空——这是 Shadow DOM 隔离信号，
   单独打印 WARNING 标记，并尝试 Runtime.evaluate 执行：
   document.querySelectorAll('*').length
   如果返回 > 100 但 innerText 为空，确认 Shadow DOM 隔离存在
```

**执行命令**：

```bash
node probe-01-connect.js > targets.log 2>&1
cat targets.log | grep -E "匹配|WARNING|Target"
cat target.json
```

**验收标准**：`target.json` 生成成功，包含一个 `webSocketDebuggerUrl`，且该 Target 的 innerText 至少匹配 2 个关键词。

> ⚠️ **如果出现 Shadow DOM WARNING**，记录为"中度风险"，Task 1.3 必须验证 Shadow DOM 穿透能力。

---

### Task 1.3 — Chat 输入框定位（1.5h）

**目标**：找到 Chat 输入框的 DOM 节点，记录稳定选择器。

**给 AI 的提示词**：

```
帮我写 probe-02-locate-chat.js，从 target.json 读取 webSocketDebuggerUrl 连接。

探测分为三层，逐层尝试：

第一层 - 直接 DOM 查询：
  const selectors = [
    'textarea',
    '[contenteditable="true"]',
    'input[type="text"]',
    '[role="textbox"]',
    '[data-testid*="chat"]',
    '[data-testid*="input"]',
    '[aria-label*="Chat" i]',
    '[aria-label*="消息" i]',
    '[placeholder*="问题" i]',
    '[placeholder*="message" i]'
  ];
  对每个 selector 执行 document.querySelectorAll 打印命中数

第二层 - iframe 穿透：
  遍历 document.querySelectorAll('iframe')，在每个 iframe.contentDocument
  里重复第一层所有 selector

第三层 - Shadow DOM 穿透：
  写一个递归函数 deepQuery(root, selector)：
  1. root.querySelectorAll(selector) 收集结果
  2. root.querySelectorAll('*') 遍历所有元素
  3. 如果元素有 shadowRoot，对 shadowRoot 递归调用 deepQuery
  用这个函数重新跑一遍所有 selector

对每个命中的候选节点，打印：
{
  layer: 1|2|3,
  selector: '...',
  tagName, id, className,
  placeholder, ariaLabel,
  testid: closest('[data-testid]')?.dataset.testid,
  rect: getBoundingClientRect(),
  visible: rect.width > 0 && rect.height > 0
}

最后在每个候选节点上加视觉标记：
  el.style.outline = '3px solid red';
  el.style.outlineOffset = '2px';

保持脚本运行 60 秒（setTimeout），让人肉眼确认红框标记是否对应真实 Chat 输入框。

把所有候选节点 JSON 输出到 chat-candidates.json。
```

**执行命令**：

```bash
node probe-02-locate-chat.js > chat-locate.log &
# 60 秒内肉眼观察 Trae 窗口，记录哪个红框是 Chat 输入框
cat chat-candidates.json | jq '.[] | {layer, selector, testid, visible}'
```

**人工验证**：打开 Trae，观察红框标记的位置，找出真正的 Chat 输入框。把它的特征写入 `selectors.v<date>.json`：

```json
{
  "trae_version": "x.x.x",
  "date": "2026-04-26",
  "chat_input": {
    "primary": "[data-testid=\"xxx\"]",
    "fallback": "textarea[placeholder*=\"...\"]",
    "last_resort": "iframe#xxx >>> textarea"
  }
}
```

**验收标准**：至少一个候选节点被人工确认为 Chat 输入框，且其层级是第一层或第二层（第三层 Shadow DOM 仍可行但复杂度上升 50%）。

---

### Task 1.4 — 文本注入与提交验证（2h）🔴 生死验证点

**目标**：把 "hello trae" 填入 Chat 输入框，按回车，看 Trae 是否发起 AI 请求。

**给 AI 的提示词**：

```
帮我写 probe-03-inject-submit.js，这是整个 Day 0 最关键的脚本。

流程：
1. 从 target.json 读取 URL 连接
2. 从 selectors.v<date>.json 读取 chat_input.primary
3. 启用三个 Domain：Runtime、Input、Network
4. 订阅 Network.requestWillBeSent，过滤条件：
   - URL 不包含 localhost/127.0.0.1
   - URL 不以 file:// devtools:// chrome-extension:// 开头
   - 记录 URL、method、requestId、postData 前 500 字节
5. 执行以下步骤，每步打印"[STEP X] 执行 / 结果"：

   STEP 1 - 定位并获取坐标：
   Runtime.evaluate 获取 chat_input 的 getBoundingClientRect 中心点 (x, y)
   如果找不到节点，直接 exit 1

   STEP 2 - 点击聚焦：
   Input.dispatchMouseEvent type='mousePressed' x y button='left' clickCount=1
   sleep 80ms
   Input.dispatchMouseEvent type='mouseReleased' x y button='left' clickCount=1
   sleep 300ms

   STEP 3 - 验证聚焦：
   Runtime.evaluate 查询 document.activeElement 的 tagName 和 testid
   打印结果，不匹配则 WARNING

   STEP 4 - 插入文本：
   const PROMPT = 'hello trae, 请输出当前北京时间';
   Input.insertText({ text: PROMPT })
   sleep 500ms

   STEP 5 - 验证文本已填入：
   Runtime.evaluate 查询 chat_input 的 value 或 innerText
   如果不等于 PROMPT，WARNING（说明 insertText 不生效）

   STEP 6 - 回车提交：
   sleep 1000ms
   Input.dispatchKeyEvent type='keyDown' key='Enter' code='Enter'
     windowsVirtualKeyCode=13 nativeVirtualKeyCode=13
   Input.dispatchKeyEvent type='keyUp' key='Enter' code='Enter' ...

   STEP 7 - 等待 5 秒看 Network 捕获：
   如果捕获到外部 API 请求，打印 SUCCESS，记录请求 URL/method/postData
   如果没捕获到，进入 STEP 8

   STEP 8 - 尝试 Cmd+Enter / Ctrl+Enter：
   平台判断后分别尝试 Meta+Enter 和 Ctrl+Enter
   每次等 3 秒看 Network

   STEP 9 - 最终判定：
   { submit_key: 'Enter' | 'Cmd+Enter' | 'Ctrl+Enter' | 'FAILED',
     api_captured: true | false,
     api_url: '...',
     total_duration_ms: ... }

输出 inject-result.json 记录最终结果。

⚠️ 录屏要求：
手动用系统录屏工具（macOS Cmd+Shift+5 / Windows Win+G）录制这个脚本执行的全过程，
保存为 Task1.4-inject.mp4。
```

**执行命令**：

```bash
# 先开始屏幕录制
node probe-03-inject-submit.js 2>&1 | tee inject.log
cat inject-result.json
```

**验收标准（Day 0 最关键判定）**：

| # | 条件 | 状态 |
|---|------|:----:|
| 1 | `inject-result.json` 中 `submit_key` ≠ `'FAILED'` | ✅ |
| 2 | `api_captured: true` | ✅ |
| 3 | Trae Chat 面板肉眼可见"用户消息 + AI 响应开始生成" | ✅ |
| 4 | `Task1.4-inject.mp4` 录屏完整还原过程 | ✅ |

**失败降级路径**：

| 失败点 | 降级方案 |
|--------|---------|
| STEP 5 insertText 无效 | 改用 `Input.dispatchKeyEvent` 逐字符 `charCode` 模拟键盘输入 |
| STEP 6-8 所有提交键失败 | 定位"发送按钮" DOM 并模拟 `Input.dispatchMouseEvent` 点击 |
| STEP 1 找不到节点 | 回到 Task 1.3 重新探测，严重风险记入报告 |

---

### Task 1.5 — AI 响应完成检测（1h）

**目标**：验证三种"AI 响应结束"的判定信号，选最稳定的作为后续生产代码依据。

**给 AI 的提示词**：

```
帮我写 probe-04-wait-response.js，基于 probe-03 成功的流程。

发送一个能产生较长响应的 Prompt："详细列出 Python 的 10 个内置函数及用法"

提交后，并行启动三个监测线：

信号 A - Network 事件：
  订阅 Network.responseReceived 和 Network.loadingFinished
  对每个流式响应（content-type 含 stream 或 event-stream）：
    记录 requestId、开始时间、结束时间
  当所有相关流式请求都 loadingFinished 时，触发"信号 A 完成"

信号 B - DOM spinner 消失：
  每 500ms Runtime.evaluate 查询：
  document.querySelectorAll('[class*="loading"], [class*="typing"],
    [class*="generating"], [aria-busy="true"]').length
  当连续 3 次返回 0 时，触发"信号 B 完成"

信号 C - 文本稳定：
  每 500ms Runtime.evaluate 查询 Chat 响应区的最后一条 assistant 消息：
  document.querySelector('[class*="assistant"]:last-of-type, [class*="ai"]:last-of-type')?.textContent
  记录文本长度，当连续 3 次（1.5 秒）长度不变时，触发"信号 C 完成"

三个信号都触发后，打印时间差：
{
  signal_A_ms: 提交到信号A完成的毫秒数,
  signal_B_ms: ...,
  signal_C_ms: ...,
  A_to_C_delta: C-A 时间差（通常 A 最早，C 最晚）,
  recommended: 'A' | 'B' | 'C'
}

推荐策略：
- 如果 A 正常触发，推荐 A（最精准）
- 如果 A 因为 CSP 拿不到请求内容，降级推荐 C
- B 仅作辅助
```

**执行命令**：

```bash
node probe-04-wait-response.js > response-detection.log
cat response-detection.log | tail -20
```

**验收标准**：三个信号中至少 2 个能稳定触发，且时间差合理（A 最早、C 最晚，相差 < 5 秒）。

---

### Day 1 收尾 — 中期 Go/No-Go 检查（0.5h）

| 项 | 结果 | 风险 |
|----|------|------|
| Trae 调试模式启动 | Go / No-Go | |
| CDP 连接与 Target 定位 | Go / No-Go | |
| Chat 输入框定位 | Go / 中度 / No-Go | 第几层穿透？ |
| 文本注入 + 回车提交 | Go / 需特殊键 / No-Go | 提交键是什么？ |
| AI 响应完成检测 | Go / 降级 / No-Go | 推荐信号？ |

> **如果 Task 1.4 No-Go，Day 2 所有任务取消**，直接进入方案重估：
> - 备选 1：OCR + 屏幕坐标点击（Tesseract + RobotJS）
> - 备选 2：Electron IPC 注入（修改 Trae 本体启动脚本）
> - 备选 3：转向其他免费 AI IDE（Windsurf、Cursor 免费额度）

---

## 3. Day 2（8h，5 个 Task + 报告）

### Task 2.1 — 任务列表定位与点击切换（1h）

**目标**：找到任务列表 DOM，点击某一项能切换到对应任务。

**给 AI 的提示词**：

```
帮我写 probe-05-task-list.js。

探测 Trae 左侧"项目列表"区域的任务项 DOM。

探测策略：
  const containerSelectors = [
    '[role="tree"]',
    '[role="listbox"]',
    '[class*="task-list"]',
    '[class*="TaskList"]',
    '[data-testid*="task"]',
    '[data-testid*="project"]',
    'aside nav ul',
    '.sidebar ul[role="list"]'
  ];

  对每个 selector 执行 querySelectorAll，记录命中数和首个元素的结构

找到容器后，枚举其所有子项（itemSelectors = ['[role="treeitem"]', 'li', '[class*="item"]']），对每个任务项打印：
{
  index,
  text: textContent.trim().slice(0, 50),
  isActive: class 含 'active|selected|focused' 或 aria-selected='true',
  rect: getBoundingClientRect(),
  testid,
  href: closest('a')?.href
}

在每个任务项上加视觉标记（outline: 2px dashed blue）。

切换测试：
  1. 记录当前激活项索引 currentIndex
  2. 选择一个非激活项 targetIndex（优先选第二项）
  3. 记录 Chat 面板 textContent hash 作为 beforeHash
  4. Input.dispatchMouseEvent 点击 targetIndex 的坐标中心
  5. sleep 1500ms
  6. 记录 Chat 面板 textContent hash 作为 afterHash
  7. 如果 beforeHash !== afterHash，切换成功
  8. 重复上述切换 3 次（切到不同任务），统计成功率和平均耗时

输出 task-switch-result.json：
{
  container_selector: '...',
  item_count: N,
  switches: [{from, to, success, duration_ms}...],
  success_rate: 0.N,
  avg_duration_ms: ...
}
```

**执行命令**：

```bash
node probe-05-task-list.js > task-switch.log
cat task-switch-result.json
```

**验收标准**：至少 3 次切换、成功率 100%、平均耗时 < 2 秒。

---

### Task 2.2 — 端到端完整循环 + 录屏（1.5h）

**目标**：串起 Task 1.4 + 1.5 + 2.1，完成"切任务 → 填 Prompt → 提交 → 等响应 → 抓取结果"完整循环。

**给 AI 的提示词**：

```
帮我写 probe-06-e2e-single.js。

命令行参数：
  --task-index 1   # 切换到哪个任务（列表索引）
  --prompt "请输出 Hello Day 0"

流程：
STEP 1: 连接 CDP（单例，复用）
STEP 2: 执行 probe-05 的任务切换逻辑，切到 task-index 对应任务
STEP 3: 等待 800ms 让 Chat 面板稳定
STEP 4: 执行 probe-03 的 insertText 填充 prompt
STEP 5: 执行 probe-03 的回车/Cmd+Enter 提交
STEP 6: 执行 probe-04 的响应完成检测（用推荐信号）
STEP 7: 抓取最终 AI 响应文本：
  document.querySelector('[class*="assistant"]:last-of-type').textContent
STEP 8: 打印时间线：
  {
    step: 'task_switch', duration: ...,
    step: 'focus',       duration: ...,
    step: 'fill',        duration: ...,
    step: 'submit',      duration: ...,
    step: 'wait_response', duration: ...,
    total_ms: ...,
    response_text: '...' 前 500 字符
  }

全程启用 Page.startScreencast 截图：
  Page.startScreencast({ format: 'jpeg', quality: 60, everyNthFrame: 1 })
  每收到 Page.screencastFrame 事件，保存为 frames/frame-<seq>.jpg
  结束时 Page.stopScreencast

结束后 shell 命令合成视频：
  ffmpeg -framerate 2 -i frames/frame-%04d.jpg -pix_fmt yuv420p \
    -movflags +faststart e2e-demo.mp4

输出 e2e-result.json。
```

**执行命令**：

```bash
# 开始屏幕录制（系统录屏工具）
node probe-06-e2e-single.js --task-index 1 --prompt "请输出 Hello Day 0" 2>&1 | tee e2e.log
cat e2e-result.json
ffmpeg -framerate 2 -i frames/frame-%04d.jpg -pix_fmt yuv420p -movflags +faststart e2e-demo.mp4
```

**验收标准**：
1. `e2e-result.json` 中所有 step 都有 duration 值（无 FAILED）
2. `response_text` 非空且包含 AI 生成的内容
3. `e2e-demo.mp4` 录屏完整还原全过程
4. `total_ms` < 60000（1 分钟内完成）

---

### Task 2.3 — 长时稳定性循环测试（2h）

**目标**：连续循环执行 20 次端到端操作，验证 2 小时内成功率 > 90%。

**给 AI 的提示词**：

```
帮我写 probe-07-loop-stability.js。

基于 probe-06 的逻辑，循环执行 N 次（默认 20，可通过 --loops 参数调整）。

每次循环：
  1. 切换到随机任务（task-index 在 0~item_count-1 之间随机）
  2. 填入简短 Prompt："Day 0 stability test #<i>, 输出数字 <i>"
  3. 提交并等待响应完成
  4. 记录结果

每次循环之间 sleep 3000ms（避免触发限流）。

统计并输出：
{
  total_loops: 20,
  success_count: N,
  fail_count: N,
  success_rate: 0.N,
  failures: [{loop: i, step: '...', error: '...'}...],
  avg_duration_ms: ...,
  min_duration_ms: ...,
  max_duration_ms: ...,
  p95_duration_ms: ...,
  start_time: '...',
  end_time: '...',
  total_elapsed_ms: ...
}

如果某次循环失败：
  - 打印完整错误堆栈
  - 尝试重新连接 CDP（一次）
  - 如果重连失败，终止循环并输出报告

每 5 次循环打印一次进度：
  [5/20] success_rate=100% avg=12.3s
  [10/20] success_rate=90% avg=13.1s
  ...
```

**执行命令**：

```bash
node probe-07-loop-stability.js --loops 20 2>&1 | tee stability.log
cat loop-stability-result.json
```

**验收标准**：
- 成功率 ≥ 90%（20 次中至少 18 次成功）
- 无连续 3 次失败
- P95 耗时 < 30 秒

---

### Task 2.4 — 选择器最终确认与输出（0.5h）

**目标**：汇总所有 probe 的选择器发现，输出最终的 `selectors.v<date>.json`。

**给 AI 的提示词**：

```
帮我写 probe-08-selectors-final.js。

读取之前所有 probe 的结果文件：
  - chat-candidates.json（Task 1.3）
  - inject-result.json（Task 1.4）
  - task-switch-result.json（Task 2.1）

对每个关键 UI 元素，输出确认过的选择器：

{
  "trae_version": "从 Trae 关于页面获取",
  "probe_date": "2026-04-26",
  "selectors": {
    "chat_input": {
      "primary": "...",
      "fallback": "...",
      "layer": 1|2|3,
      "verified_by": "probe-02 + probe-03"
    },
    "send_button": {
      "primary": "...",
      "fallback": null,
      "verified_by": "probe-03 (if Enter failed)"
    },
    "task_list_container": {
      "primary": "...",
      "item_selector": "...",
      "verified_by": "probe-05"
    },
    "assistant_message": {
      "primary": "...",
      "verified_by": "probe-04"
    },
    "loading_indicator": {
      "primary": "...",
      "verified_by": "probe-04 signal B"
    }
  },
  "submit_key": "Enter | Cmd+Enter | Ctrl+Enter",
  "response_detection": "A | B | C",
  "notes": "..."
}

同时输出一个 selectors-report.md，包含：
- 每个 selector 的发现过程
- 哪些 selector 失效了、用了什么降级
- 对 Trae 版本更新的风险评估
```

**执行命令**：

```bash
node probe-08-selectors-final.js
cat selectors.v2026-04-26.json
```

---

### Task 2.5 — 提交键全量测试（1h）

**目标**：系统测试所有可能的提交键组合，确认最可靠的提交方式。

**给 AI 的提示词**：

```
帮我写 probe-09-submit-key-test.js。

测试以下提交键组合，每种执行 3 次：
  1. Enter
  2. Cmd+Enter (macOS) / Ctrl+Enter (Windows/Linux)
  3. Ctrl+Enter (macOS 也测)
  4. 点击发送按钮（如果 selectors 中有 send_button）

每种组合的测试流程：
  1. 填入 Prompt："submit key test: <key_name>"
  2. 用对应的键组合提交
  3. 等待 5 秒检测 Network 是否有 API 请求
  4. 记录结果

输出：
{
  tests: [
    { key: 'Enter', attempts: 3, success: 3, notes: '...' },
    { key: 'Cmd+Enter', attempts: 3, success: 0, notes: '...' },
    ...
  ],
  recommended: 'Enter',
  reason: '...'
}
```

**执行命令**：

```bash
node probe-09-submit-key-test.js
```

---

### Task 2.6 — Go/No-Go 决策报告（2h）

**目标**：汇总所有 probe 结果，输出 `DAY0_GO_NOGO_REPORT.md`。

**报告模板**：

```markdown
# Day 0 Go/No-Go 决策报告

**日期**: 2026-04-26
**Trae 版本**: x.x.x
**操作系统**: macOS / Windows / Linux
**执行人**: ...

## 1. 总体结论

**决策**: ✅ Go / ⚠️ 有条件 Go / ❌ No-Go

**一句话总结**: ...

## 2. 验证结果矩阵

| # | 验证项 | 结果 | 详情 |
|---|--------|------|------|
| 1 | CDP 可连接 | Go/No-Go | ... |
| 2 | DOM 可穿透 | Go/中度/No-Go | 第几层？ |
| 3 | 文本可注入 | Go/No-Go | insertText 还是 dispatchKeyEvent？ |
| 4 | 提交可触发 | Go/需特殊键/No-Go | 哪个键？ |
| 5 | 任务可切换 | Go/No-Go | 成功率？ |
| 6 | 长时稳定 | Go/No-Go | 20 次成功率？ |

## 3. 关键发现

### 3.1 选择器稳定性
- Chat 输入框: primary=..., fallback=...
- 任务列表: ...
- 发送按钮: ...

### 3.2 提交键
- 推荐键: ...
- 备选键: ...

### 3.3 响应检测
- 推荐信号: ...
- 降级信号: ...

### 3.4 已知风险
1. ...
2. ...

## 4. 录屏证据

- Task1.4-inject.mp4: 文本注入+提交
- e2e-demo.mp4: 端到端完整循环

## 5. Phase 1 建议

如果 Go：
- 建议的 MVP 技术路径: ...
- 预估 MVP 工期: ...
- 需要特别关注的点: ...

如果有条件 Go：
- 前置条件: ...
- 风险缓解: ...

如果 No-Go：
- 推荐的替代方案: ...
- 替代方案的可行性评估: ...
```

---

## 4. 时间线总览

```
Day 1 (8h)
├── 0.5h  Task 1.1  环境准备与 Trae 调试模式启动
├── 1.0h  Task 1.2  CDP 连接与 Target 定位
├── 1.5h  Task 1.3  Chat 输入框定位
├── 2.0h  Task 1.4  文本注入与提交验证 🔴 生死点
├── 1.0h  Task 1.5  AI 响应完成检测
└── 0.5h  Day 1 收尾  中期 Go/No-Go 检查
         ↓
    [如果 Task 1.4 No-Go → Day 2 取消，方案重估]
         ↓
Day 2 (8h)
├── 1.0h  Task 2.1  任务列表定位与点击切换
├── 1.5h  Task 2.2  端到端完整循环 + 录屏
├── 2.0h  Task 2.3  长时稳定性循环测试（20 次）
├── 0.5h  Task 2.4  选择器最终确认与输出
├── 1.0h  Task 2.5  提交键全量测试
└── 2.0h  Task 2.6  Go/No-Go 决策报告
```

## 5. 失败降级路径

```
CDP 连不上
  ├── 尝试 --inspect=9222
  ├── 尝试 --remote-debugging-pipe
  └── 评估 Electron IPC 注入

DOM 穿不透（Shadow DOM）
  ├── 递归 deepQuery 穿透
  └── 评估 OCR + 屏幕坐标路径

insertText 不生效
  ├── Input.dispatchKeyEvent 逐字符输入
  └── 评估 RobotJS / xdotool 系统级模拟

回车提交不触发
  ├── Cmd+Enter / Ctrl+Enter
  ├── 定位发送按钮 DOM 点击
  └── 评估其他提交方式

任务切换失败
  └── 简化为单任务模式（不切换，始终用第一个任务）
```
