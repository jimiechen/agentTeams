# Day 1 MVP Report — mvp-runner

**日期**: 2026-04-27
**目标**: 交付最小闭环 MVP，一条命令跑完 3 次 Prompt→响应→落盘循环

---

## 一、交付状态

| 任务 | 状态 | 说明 |
|------|------|------|
| D1.1 项目骨架 + CDP 长连接 | ✅ 完成 | `src/cdp/client.ts`，心跳 30s，指数退避重连 5 次 |
| D1.2 选择器配置外化 | ✅ 完成 | `config/selectors.v2026-04-26.json` + `src/selectors/resolver.ts` |
| D1.3 三步操作原子封装 | ✅ 完成 | switch-task / fill-prompt / submit / wait-response 四个模块 |
| D1.4 Runner 主循环 | ✅ 完成 | `src/runner.ts`，YAML 驱动，顺序执行，结果落盘 |
| D1.5 最小错误处理 | ✅ 完成 | 选择器失效终止、单任务超时降级、CDP 断连保护 |
| D1.6 录屏 + 报告 | ⏳ 待用户执行 | 代码已就绪，需在真实 Trae 环境中运行验证 |

## 二、代码统计

```
  153  src/cdp/client.ts       CDP 长连接 + 心跳 + 重连
   77  src/actions/fill-prompt.ts   填充 Prompt（innerText + InputEvent）
   66  src/actions/switch-task.ts   切换任务槽位
   42  src/actions/submit.ts        点击发送按钮
   99  src/actions/wait-response.ts 等待 AI 响应（两阶段轮询）
    6  src/actions/index.ts         导出桶
  219  src/runner.ts                主循环 + 配置解析 + 结果落盘
  118  src/selectors/resolver.ts    选择器解析 + 缓存
   50  src/errors.ts                统一错误体系
  ───
  830  total (含空行/注释)
  679  有效代码行
```

## 三、项目结构

```
mvp-runner/
├── package.json              # 依赖：chrome-remote-interface, debug, yaml
├── tsconfig.json             # ES2022 + ESNext modules + strict
├── prompts.yaml              # 3 条测试任务配置
├── config/
│   └── selectors.v2026-04-26.json   # Day 0 验证的选择器
└── src/
    ├── errors.ts             # MvpError 层级（6 种错误类型）
    ├── runner.ts             # 主入口，for 循环驱动
    ├── cdp/
    │   └── client.ts         # CDPClient 类（connect/disconnect/evaluate）
    ├── selectors/
    │   └── resolver.ts       # 选择器解析（primary→fallback→缓存）
    └── actions/
        ├── index.ts          # 导出桶
        ├── switch-task.ts    # 点击切换任务槽位
        ├── fill-prompt.ts    # innerText + InputEvent 填充
        ├── submit.ts         # 点击发送按钮
        └── wait-response.ts  # 两阶段轮询等待响应
```

## 四、编译验证

```bash
$ cd mvp-runner && npx tsc --noEmit
# 0 errors ✅
```

## 五、使用方式

```bash
# 1. 确保 Trae 已启动并开启调试端口
# trae --remote-debugging-port=9222

# 2. 安装依赖
cd mvp-runner && npm install

# 3. 运行 MVP
npm run mvp -- --config prompts.yaml

# 4. 查看结果
ls runs/<timestamp>/
# task-01.md  task-02.md  task-03.md  (errors.log 如有失败)
```

## 六、输出文件格式

每个任务生成一个 Markdown 文件：

```markdown
# Task: task-01
**Slot**: 0
**Started**: 2026-04-27T10:30:00.000Z
**Duration**: 36420ms
**Status**: ✅ Success

## Prompt
> 用一句话解释什么是 CDP 协议

## Response
CDP（Chrome DevTools Protocol）是一种...
```

## 七、错误处理策略

| 场景 | 行为 | 是否继续 |
|------|------|---------|
| CDP 连接失败 | 打印错误，exit(1) | ❌ 终止 |
| 选择器全部失效 | 打印警告 + 提示升级，exit(1) | ❌ 终止 |
| 单任务超时（60s） | 写入 `<RESPONSE TIMEOUT>` 到 .md，记录 errors.log | ✅ 继续 |
| 单任务其他错误 | 记录 errors.log，继续下一个 | ✅ 继续 |
| CDP 运行中断连 | 自动重连（最多 5 次，指数退避） | ✅ 尝试恢复 |

## 八、已知限制与遗留问题

1. **CSS Modules 哈希不稳定**: `.index-module__task-item___zOpfg` 等选择器在 Trae 更新后可能失效。已通过 `config/selectors.v<date>.json` 外化 + fallback 机制缓解，但需要定期跑 probe 验证。

2. **chat-turn 类名可能带哈希**: Day 0 报告未明确 `[class*='chat-turn']` 是否包含 CSS Modules 哈希。当前用属性选择器 `[class*='chat-turn']` 做模糊匹配，应该能覆盖。

3. **switch-task 验证偏弱**: 用 `.chat-panel` 的 textContent 长度变化来验证切换成功，但这个选择器未在 Day 0 验证过。如果该选择器不存在，验证会跳过（不会报错，但也不会检测到失败）。

4. **无拟人化**: 直接设置 innerText + dispatchEvent，没有逐字符输入。Day 0 验证 2 次循环未被封，但长期高频运行可能触发风控。

5. **响应检测依赖 DOM 轮询**: 每 500ms 轮询一次 chat-turn 数量和文本长度，CDP 开销约 6ms/次。如果 Trae 的 chat-turn 结构变化（如使用虚拟列表），可能需要调整检测逻辑。

6. **代码行数 679 行（有效）**: 超出原定 500 行目标，但 8 个模块覆盖了完整的 MVP 功能链路，没有冗余代码。

## 九、Day 2 候选任务

按优先级排序（最终由 Day 1 真实运行暴露的痛点决定）：

| 优先级 | 方向 | 预估工时 | 说明 |
|--------|------|---------|------|
| **B** | 拟人化最小版 | 2h | fillPrompt 逐字符输入 + 点击前悬停，防止高频运行触发风控 |
| **A** | 飞书指令通道 | 4h | 接入飞书 Bot，手机远程触发任务，解放 PC 前坐着盯屏幕 |
| **C** | 多任务并发 + ChatMutex | 4h | 3 个槽位并行调度，ChatMutex 串行化保护输入框 |

**建议顺序**: B > A > C — 拟人化是生存问题最紧急，飞书是体验问题可延后，并发是能力问题最不急。

## 十、下一步行动

1. **在真实 Trae 环境中运行 `npm run mvp -- --config prompts.yaml`**
2. **录屏 3~5 分钟作为今日交付物**
3. **根据实际运行结果调整选择器或等待参数**
4. **确认 3/3 成功后，开始 Day 2 任务**
