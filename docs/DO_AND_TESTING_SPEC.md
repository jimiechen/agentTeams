---
title: Trae Agent Team AI 开发与测试规范 (DoD & AI-Test Spec)
version: "1.0.0"
date: 2026-04-26
status: Review
tags:
  - dod
  - testing
  - ai-development
  - engineering-standard
related_prd: trae-agent-team-prd.md
---

# 📘 Trae Agent Team AI 开发与测试规范 (DoD & AI-Test Spec)

> 版本：v1.0.0 | 日期：2026-04-26 | 状态：**Review** 📋
> 配套文档：[[trae-agent-team-prd]] v2.5.0
> 评审驱动：v2.4.0 复核评审识别工程交付契约缺失，要求 Kickoff 前补充本规范

---

## 1. 文档定位与适用范围

### 1.1 为什么需要 DoD

当前 PRD v2.4.0 是优秀的架构与需求设计文档，但缺少**工程交付契约**。在 AI 辅助开发（Vibe Coding）场景下，若不定义 DoD，极易出现：

1. **AI 生成代码"能跑但不可测"**，后期重构成本指数上升
2. **核心模块缺乏并发/异常边界用例**，线上抖动难定位
3. **团队对"完成"的认知不一致**，CI/CD 无法自动化拦截低质量提交

### 1.2 适用范围

| 角色 | 适用内容 |
|------|---------|
| **AI 编码助手** | 代码生成时的质量约束、测试生成指令模板 |
| **人类开发者** | 代码审查标准、合并门禁、交付验收 |
| **CI/CD 流水线** | 自动化质量门禁配置 |
| **项目管理** | Sprint 验收标准、技术债务跟踪 |

### 1.3 与 PRD 的关系

```
PRD (做什么 + 怎么容错)
    │
    ├── 架构设计（第 1-9 章）
    ├── 异常处理（第 10 章）
    ├── 可观测性（第 11 章）
    └── 安全设计（第 12 章）
         │
         ▼
DoD (怎么验证 + 怎么交付)  ← 本文档
    │
    ├── 代码质量标准（第 2 章）
    ├── 测试策略分层（第 3 章）
    ├── CI/CD 质量门禁（第 4 章）
    ├── 关键测试用例（第 5 章）
    └── 维护与演进规则（第 6 章）
```

---

## 2. Definition of Done (DoD) 标准

### 2.1 通用 DoD（所有模块必须满足）

> [!important] 以下条件**全部满足**才可标记任务/PR 为"完成"

| # | 条件 | 验证方式 | 工具 |
|---|------|---------|------|
| 1 | **代码通过 ESLint 检查** | `npm run lint` 零 error | ESLint |
| 2 | **所有测试通过** | `npm test` 全绿 | Vitest |
| 3 | **测试覆盖率达标** | 按模块要求（见 3.1） | c8 / istanbul |
| 4 | **类型安全**（TypeScript 模块） | `tsc --noEmit` 零 error | TypeScript |
| 5 | **无新增 TODO/FIXME** | `grep -r "TODO\|FIXME" src/` 无新增 | Shell |
| 6 | **关键路径有测试覆盖** | 状态机、降级策略、异常路径均有测试 | 人工审查 |
| 7 | **AI 生成代码已审查** | 人类开发者 Code Review 通过 | GitHub PR |
| 8 | **文档同步更新** | API 变更/配置变更已更新到 PRD 或 CONFIGURATION.md | 人工审查 |
| 9 | **结构化日志输出** | 关键操作有 JSON 日志，包含 taskId/agent/action | 人工审查 |
| 10 | **错误路径有告警** | 异常场景触发飞书告警或 ERROR 级别日志 | 测试验证 |

### 2.2 AI 编码专项 DoD

> [!warning] AI 辅助生成的代码，除满足通用 DoD 外，还需满足以下条件

| # | 条件 | 说明 |
|---|------|------|
| A1 | **AI Prompt 可追溯** | 每个代码块标注对应的 AI 提示词摘要（注释中） |
| A2 | **测试先行** | AI 生成功能代码时，必须同时生成对应测试用例 |
| A3 | **边界用例覆盖** | 空输入、超长输入、并发冲突、网络超时等边界场景 |
| A4 | **无"魔法数字"** | 超时时间、重试次数等常量必须提取为可配置项 |
| A5 | **降级路径可测试** | 每个 fallback/降级策略可通过 mock 触发验证 |
| A6 | **禁止硬编码凭证** | App Secret、Token 等必须通过 `secret-manager.ts` 加载 |

### 2.3 AI 测试生成指令模板

> [!tip] 在让 AI 生成代码时，附加以下指令确保测试质量

```markdown
## 任务：为 [模块名] 生成测试用例

### 要求
1. 使用 Vitest 框架，遵循 Given-When-Then 模式
2. 覆盖以下场景：
   - ✅ 正常路径（happy path）
   - ✅ 边界条件（空输入、超长输入、零值）
   - ✅ 异常路径（网络超时、进程崩溃、配置缺失）
   - ✅ 降级策略（P0 失败 → P1 → P2 → ...）
   - ✅ 并发场景（多任务同时操作）
3. Mock 外部依赖（CDP、lark-cli、Git），不依赖真实环境
4. 每个测试用例命名格式：`should [预期行为] when [条件]`
5. 测试覆盖率目标：[模块覆盖率要求]%
```

---

## 3. 核心模块测试策略分层

### 3.1 测试分层策略

```
┌─────────────────────────────────────────────────────┐
│  E2E 冒烟测试（Playwright）                          │
│  验证：完整链路 飞书→CDP→Trae→Git→飞书              │
│  频率：每次发版前                                    │
├─────────────────────────────────────────────────────┤
│  集成测试（Vitest + Mock）                           │
│  验证：模块间交互（Dispatcher↔Mutex↔Filler）         │
│  频率：每次 PR 合并                                  │
├─────────────────────────────────────────────────────┤
│  单元测试（Vitest）                                  │
│  验证：单个函数/类的行为正确性                        │
│  频率：每次提交                                      │
└─────────────────────────────────────────────────────┘
```

### 3.2 模块测试矩阵

| 模块 | 测试类型 | 工具链 | 验证重点 | 覆盖率要求 |
|------|---------|--------|---------|-----------|
| **ChatMutex** | 单元测试 | Vitest + FakeTimers | 锁获取/释放/超时/队列推进/崩溃残留清理 | ≥90% |
| **UIRecognizer** | 集成测试 | CDP Mock + JSDOM | P0-P5 匹配降级、缓存加载/失效、版本校验 | ≥85% |
| **ChatFiller** | E2E 冒烟 | Playwright + Lexical Mock | 3 级降级策略、内容比对、发送按钮触发 | ≥80% |
| **LarkTerminal** | 集成测试 | child_process Mock + NDJSON Parser | WebSocket 心跳、消息去重、断连重连、指令解析 | ≥85% |
| **BitableSync** | 契约测试 | lark-cli CLI Mock + Schema Validator | 字段映射、轮询逻辑、双向同步冲突处理 | ≥80% |
| **TaskManager** | 单元测试 | Vitest + Git Mock | 任务状态流转、MD 文档读写、Git 分支管理 | ≥90% |
| **ConfigManager** | 单元测试 | Vitest + fs Mock | 配置加载/保存/合并/校验/加密解密 | ≥90% |
| **Dispatcher** | 集成测试 | Vitest + 全模块 Mock | 任务分配、实例选择、失败重试、并发控制 | ≥85% |
| **SecretManager** | 单元测试 | Vitest + crypto Mock | 加密/解密/优先级加载/密钥轮换 | ≥95% |

### 3.3 测试文件命名与组织

```
src/
├── core/
│   ├── dispatcher.ts
│   └── __tests__/
│       ├── dispatcher.test.ts
│       └── task-manager.test.ts
├── cdp/
│   ├── chat-filler.ts
│   └── __tests__/
│       ├── chat-filler.test.ts
│       ├── ui-recognizer.test.ts
│       └── chat-mutex.test.ts
├── lark/
│   ├── terminal.ts
│   └── __tests__/
│       ├── terminal.test.ts
│       └── bitable-sync.test.ts
├── config/
│   ├── loader.ts
│   └── __tests__/
│       ├── config-manager.test.ts
│       └── secret-manager.test.ts
└── utils/
    ├── mutex.ts
    └── __tests__/
        ├── mutex.test.ts
        ├── logger.test.ts
        └── metrics.test.ts
```

---

## 4. CI/CD 质量门禁配置

### 4.1 GitHub Actions 工作流

```yaml
# .github/workflows/ci.yml
name: CI Quality Gate

on:
  pull_request:
    branches: [main, develop]
  push:
    branches: [main]

jobs:
  quality-gate:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18, 20]

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}

      - name: Install dependencies
        run: npm ci

      # 门禁 1：代码风格
      - name: ESLint
        run: npm run lint
        continue-on-error: false

      # 门禁 2：类型检查
      - name: TypeScript
        run: npx tsc --noEmit
        continue-on-error: false

      # 门禁 3：单元测试 + 覆盖率
      - name: Unit Tests
        run: npm run test:coverage

      # 门禁 4：覆盖率阈值检查
      - name: Coverage Threshold
        run: |
          npx vitest run --coverage
          # 检查各模块覆盖率是否达标
          node scripts/check-coverage.js

      # 门禁 5：无新增 TODO/FIXME
      - name: No New TODOs
        run: |
          if git diff origin/main --name-only | grep -q 'src/'; then
            NEW_TODOS=$(git diff origin/main -- 'src/**/*.ts' | grep -c '^+.*TODO\|^+.*FIXME' || true)
            if [ "$NEW_TODOS" -gt 0 ]; then
              echo "::error::发现 $NEW_TODOS 个新增 TODO/FIXME，请处理后再合并"
              exit 1
            fi
          fi

      # 门禁 6：结构化日志检查
      - name: Log Format Check
        run: |
          # 确保关键模块使用 logger 而非 console.log
          ILLEGAL=$(grep -rn 'console\.log\|console\.error' src/ --include='*.ts' | grep -v '__tests__' | grep -v 'node_modules' || true)
          if [ -n "$ILLEGAL" ]; then
            echo "::warning::发现 console.log/error，建议使用 logger"
          fi
```

### 4.2 覆盖率阈值配置

> **评审驱动**：Claude 最终评审建议分层设定覆盖率，核心状态机要求更高，避免被边缘代码稀释。

```javascript
// scripts/check-coverage.js
const THRESHOLDS = {
  // 核心状态机 — 最高覆盖率要求
  'src/core/states/task-machine.ts': { statements: 90, branches: 85, functions: 90, lines: 90 },
  'src/cdp/chat-mutex-machine.ts': { statements: 90, branches: 85, functions: 90, lines: 90 },

  // CDP 核心模块
  'src/cdp/': { statements: 85, branches: 80, functions: 85, lines: 85 },

  // 飞书集成模块
  'src/lark/': { statements: 80, branches: 75, functions: 80, lines: 80 },

  // 配置与安全模块
  'src/config/': { statements: 90, branches: 85, functions: 90, lines: 90 },

  // 工具模块
  'src/utils/': { statements: 90, branches: 85, functions: 90, lines: 90 },

  // 全局兜底
  'global': { statements: 80, branches: 75, functions: 80, lines: 80 }
};
```

### 4.3 PR 合并检查清单

> [!check] PR 合并前必须通过以下检查

- [ ] CI 全部门禁通过（绿色 ✅）
- [ ] 至少 1 位人类开发者 Code Review 通过
- [ ] AI 生成代码已标注来源 Prompt
- [ ] 新增模块有对应测试文件
- [ ] 配置变更已同步到 PRD 第 6 章
- [ ] 无新增 `console.log` / `TODO` / `FIXME`
- [ ] 关键操作有结构化日志输出
- [ ] 错误路径有告警机制

---

## 5. 关键测试用例（Given-When-Then）

### 5.1 ChatMutex 超时释放

```gherkin
Feature: ChatMutex 异常保护

  Scenario: 锁超时自动释放并告警
    Given 一个 ChatMutex 实例（端口 9222，超时 30s）
    And 任务 T-001 已获取锁
    When 30 秒内未调用 release()
    Then 锁自动释放
    And 等待队列中的下一个任务 T-002 获取锁
    And 触发 'mutex:timeout' 事件
    And 输出 WARN 级别日志（包含 port 和 taskId）

  Scenario: 进程崩溃后残留锁清理
    Given ChatMutex 锁状态已写入临时文件
    And 临时文件时间戳超过 60 秒
    When 主控进程启动并扫描残留锁文件
    Then 自动清理残留锁文件
    And 发送飞书告警："Agent-{id} 锁异常释放"

  Scenario: 多任务排队按 FIFO 顺序获取锁
    Given ChatMutex 当前被 T-001 占用
    And T-002、T-003 依次加入等待队列
    When T-001 释放锁
    Then T-002 获取锁（FIFO 顺序）
    When T-002 释放锁
    Then T-003 获取锁
```

### 5.2 UIRecognizer 降级匹配

```gherkin
Feature: UIRecognizer 多策略匹配

  Scenario: data-testid 失效时降级至 role+contenteditable
    Given Trae IDE 最新版本移除了 data-testid 属性
    When UIRecognizer 执行探测
    Then P0 策略匹配失败
    And P1 策略通过 role="textbox" + contentEditable="true" 匹配成功
    And 返回结果标记 strategy="P1"

  Scenario: 所有自动策略失败时使用缓存
    Given UIRecognizer P0-P4 策略全部失败
    And 指纹缓存中有上一次成功的匹配记录
    When UIRecognizer 执行探测
    Then 使用缓存中的选择器
    And 输出 WARN 日志："使用缓存选择器，建议手动验证"

  Scenario: 手动覆盖优先于自动探测
    Given 用户在 team.yaml 中配置了 uiRecognizer.overrides.chat_input
    When UIRecognizer 执行探测
    Then chatInput 使用手动覆盖的选择器
    And 不执行自动匹配
```

### 5.3 ChatFiller Lexical 降级

```gherkin
Feature: ChatFiller 三级降级策略

  Scenario: execCommand 成功（P0）
    Given Chat 输入框为空
    When 使用 execCommand('insertText') 填充 "实现登录 API"
    Then 输入框内容为 "实现登录 API"
    And 策略标记为 P0

  Scenario: execCommand 失败时触发 Lexical 直接操作（P1）
    Given execCommand 返回错误（Lexical 拦截）
    When ChatFiller 检测到 P0 失败
    Then 清除所有 span[data-lexical-text] 子元素
    And 使用 execCommand('insertText') 重新填充
    And 策略标记为 P1

  Scenario: P0 和 P1 均失败时触发剪贴板降级（P2）
    Given execCommand 和 Lexical 操作均失败
    When ChatFiller 检测到 P0、P1 失败
    Then 使用 navigator.clipboard.writeText + execCommand('paste')
    And 策略标记为 P2
    And 输出 WARN 日志："Chat 填充降级至剪贴板策略"

  Scenario: 填充后内容比对校验
    Given Chat 填充操作已完成
    When 读取输入框实际内容
    Then 与预期内容比对
    And 不一致时触发重试（最多 3 次）
    And 重试全部失败时发送飞书告警
```

### 5.4 LarkTerminal 稳定性

```gherkin
Feature: lark-cli 终端稳定性

  Scenario: WebSocket 断连自动重连
    Given lark-cli 终端正在运行
    When WebSocket 连接断开
    Then 3 秒后自动尝试重连
    And 重连成功后重置心跳计时器
    And 重连失败则按指数退避重试（3s/6s/12s/24s）

  Scenario: 消息去重
    Given lark-cli 收到消息（message_id: "msg_001"）
    When 再次收到相同 message_id 的消息
    Then 第二条消息被丢弃
    And 不创建重复任务

  Scenario: 心跳超时触发重连
    Given lark-cli 终端 2 分钟内未收到任何消息
    When 心跳检测触发
    Then 自动重启 lark-cli 进程
    And 发送飞书告警："lark-cli 心跳超时，已重连"
```

### 5.5 Git 冲突处理

```gherkin
Feature: Git 自动提交冲突处理

  Scenario: 同文件并发修改
    Given Agent-1 和 Agent-2 同时修改 src/api/auth.ts
    When Agent-1 先完成 Git 提交
    Then Agent-2 的提交等待 Agent-1 完成
    And Agent-2 重新执行 git add + commit

  Scenario: 合并冲突飞书告警
    Given 任务 T-001 和 T-002 的分支存在文件冲突
    When 执行 git merge 时检测到冲突
    Then 暂停合并操作
    And 发送飞书告警（@相关人）："Git 冲突：T-001 与 T-002"
    And 等待人工通过 /git resolve 指令处理
```

### 5.6 SecretManager 加密存储

```gherkin
Feature: 敏感信息加密管理

  Scenario: 优先使用环境变量
    Given 环境变量 TRAE_TEAM_LARK_APP_SECRET 存在
    When 调用 loadSecret('lark.appSecret')
    Then 返回环境变量的值
    And 不读取配置文件

  Scenario: 环境变量不存在时使用 SecretStorage
    Given 环境变量不存在
    And VS Code SecretStorage 中存储了 'lark.appSecret'
    When 调用 loadSecret('lark.appSecret')
    Then 返回 SecretStorage 中的值

  Scenario: 明文配置告警
    Given 环境变量和 SecretStorage 均不存在
    And team.yaml 中 lark.appSecret 为明文字符串
    When 调用 loadSecret('lark.appSecret')
    Then 返回明文值
    And 输出 WARN 日志："敏感配置使用明文存储，建议启用加密"
```

---

## 6. 混沌测试规范

### 6.1 混沌测试场景

> [!danger] 混沌测试分两级执行：PR 合并后触发轻量混沌（网络抖动/进程重启），主分支每日定时全量混沌

#### 6.1.1 轻量混沌（PR 级别）

> **评审驱动**：Claude 最终评审指出 PR 级混沌可能影响 CI 其他并发流水线，需沙箱隔离 + 严格超时。

| 约束 | 值 | 说明 |
|------|-----|------|
| **执行环境** | Docker 沙箱容器 | 与 CI 主流水线隔离，不影响其他 Job |
| **超时熔断** | 3 分钟（硬限制） | 超时自动终止，标记为 WARN（非 ERROR） |
| **注入场景** | 网络延迟 200ms + 进程重启 | 仅 2 个轻量场景，避免资源争抢 |
| **触发条件** | PR 合并到 develop 后自动触发 | 不在 PR 检查阶段运行 |

```yaml
# .github/workflows/chaos-lite.yml
name: Chaos Lite (PR)
on:
  push:
    branches: [develop]
jobs:
  chaos-lite:
    runs-on: ubuntu-latest
    timeout-minutes: 3                   # 硬性 3 分钟熔断
    container:
      image: node:20-alpine              # 沙箱容器隔离
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - name: Chaos Lite Tests
        run: npm run test:chaos:lite     # 仅 2 个轻量场景
        timeout-minutes: 2               # 脚本级 2 分钟熔断
```

#### 6.1.2 全量混沌（每日）

| 约束 | 值 | 说明 |
|------|-----|------|
| **执行环境** | 独立 EC2/自托管 Runner | 不占用 CI 资源 |
| **超时熔断** | 30 分钟 | 超时自动终止 + 输出报告 |
| **注入场景** | 全部 7 个场景（见下表） | 完整混沌覆盖 |
| **触发条件** | 每日 UTC 02:00 定时触发 | 低峰期执行 |

### 6.2 混沌测试场景

| # | 注入场景 | 注入方式 | 预期行为 | 验证指标 | 级别 |
|---|---------|---------|---------|---------|------|
| 1 | **网络抖动** | `tc netem` 模拟 500ms 延迟 + 10% 丢包 | CDP 重连 + 飞书告警 | 重连成功率 100%，告警延迟 < 10s | 轻量+全量 |
| 2 | **进程崩溃** | `kill -9` 杀死 lark-cli 进程 | 自动重启 + 消息不丢失 | 重启时间 < 5s，无消息丢失 | 轻量+全量 |
| 3 | **DOM 结构突变** | CDP 注入脚本随机修改 class/id | UIRecognizer 降级 + 缓存兜底 | 降级成功率 > 80% | 全量 |
| 4 | **磁盘满** | `dd` 填充磁盘至 100% | Git 提交失败 → 飞书告警 → 任务暂停 | 告警延迟 < 5s | 全量 |
| 5 | **CDP 端口占用** | 占用 9222 端口 | 实例启动失败 → 飞书告警 | 告警延迟 < 5s | 全量 |
| 6 | **飞书 API 限流** | Mock 返回 429 | 退避重试 + 速率控制 | 无消息丢失，重试间隔符合退避策略 | 全量 |
| 7 | **配置文件损坏** | 写入非法 JSON 到 team-config.json | 启动失败 → 使用默认配置 + 告警 | 系统可用，告警及时 | 全量 |

### 6.3 混沌测试执行流程

```
1. 准备：备份当前配置和状态
2. 注入：按场景表执行故障注入
3. 观察：记录系统行为（日志、告警、恢复时间）
4. 验证：对照预期行为检查
5. 恢复：清理注入，恢复原始状态
6. 报告：输出混沌测试报告，更新告警阈值
```

---

## 7. AI 协作开发工作流

### 7.1 Prompt → 代码 → 测试 → 验证 循环

```
┌──────────────────────────────────────────────────────┐
│  1. 需求理解                                          │
│     人类: 提供 PRD 章节 + DoD 约束 + 上下文           │
│     AI: 复述需求，确认理解正确                          │
├──────────────────────────────────────────────────────┤
│  2. 测试先行                                          │
│     AI: 根据 DoD 第 5 章模板生成测试用例               │
│     人类: 审查测试用例是否覆盖关键路径                  │
├──────────────────────────────────────────────────────┤
│  3. 代码生成                                          │
│     AI: 生成功能代码（满足测试用例 + DoD 第 2 章）     │
│     人类: Code Review + AI 生成代码审查                │
├──────────────────────────────────────────────────────┤
│  4. 自动验证                                          │
│     CI: lint + type-check + test + coverage           │
│     人工: 边界场景手动验证                              │
├──────────────────────────────────────────────────────┤
│  5. 重构优化                                          │
│     AI: 识别重复代码、提取公共模块、优化性能            │
│     人类: 审查重构是否引入回归                          │
├──────────────────────────────────────────────────────┤
│  6. 交付                                              │
│     PR 合并 → CI 门禁通过 → 文档同步 → 发布            │
└──────────────────────────────────────────────────────┘
```

### 7.2 AI 代码审查检查点

| 检查点 | 审查内容 |
|--------|---------|
| **安全性** | 是否存在硬编码凭证、SQL 注入、命令注入风险 |
| **可测试性** | 外部依赖是否通过依赖注入/Mock 解耦 |
| **异常处理** | 是否覆盖所有错误路径，是否有降级策略 |
| **日志规范** | 是否使用结构化 JSON 日志，是否包含上下文信息 |
| **配置化** | 超时、重试次数等是否为可配置项 |
| **命名规范** | 函数/变量命名是否清晰表达意图 |
| **复杂度** | 单函数是否超过 50 行，圈复杂度是否 > 10 |

---

## 8. 维护与演进规则

### 8.1 核心原则

1. **测试即文档**：核心状态机、异常路径、降级策略必须通过测试用例表达，PRD 仅保留设计意图
2. **AI 生成代码必须伴随测试**：禁止"纯代码无测试"合并，AI 提示词需显式要求测试生成
3. **预研驱动架构**：Phase 0 验证结果若未达标，禁止进入 Phase 1 开发，需调整设计或降级目标
4. **混沌测试常态化**：PR 合并后触发轻量混沌（网络抖动/进程重启），主分支每日定时全量混沌，输出自动化趋势报告
5. **DoD 随版本迭代**：每季度回顾覆盖率/告警率/MTTR，动态调整门禁阈值

### 8.2 技术债务管理

| 债务类型 | 记录方式 | 清理周期 |
|---------|---------|---------|
| 临时 TODO/FIXME | GitHub Issue 标签 `tech-debt` | 每个 Sprint 清理 ≥ 30% |
| 测试覆盖率缺口 | CI 报告 + 覆盖率趋势图 | 连续 2 周下降则暂停新功能 |
| 降级策略未覆盖 | 混沌测试报告 | 下一次混沌测试前补充 |
| 文档与代码不同步 | PR Review 检查 | 每个 PR 必须同步 |

### 8.3 版本演进路线

| 阶段 | DoD 重点 | 门禁阈值 |
|------|---------|---------|
| **Phase 0 预研** | 预研验收报告 + 技术可行性结论 | 4 项预研全部达标 |
| **Phase 1 MVP** | 核心链路 E2E 测试 + 单元测试覆盖率 | 全局 ≥ 70%，核心模块 ≥ 85% |
| **Phase 2 飞书集成** | 集成测试 + 契约测试 | 全局 ≥ 75%，飞书模块 ≥ 80% |
| **Phase 3 多任务编排** | 并发测试 + 混沌测试 | 全局 ≥ 80%，全部模块达标 |
| **正式发布** | 全量测试 + 安全审计 + 性能基准 | 全局 ≥ 85%，零 Critical 缺陷 |

---

## 附录 A：测试工具链版本

| 工具 | 版本 | 用途 |
|------|------|------|
| Vitest | ^1.6.0 | 单元测试 + 集成测试框架 |
| c8 | ^9.0.0 | 测试覆盖率 |
| Playwright | ^1.44.0 | E2E 测试 |
| ESLint | ^8.56.0 | 代码风格检查 |
| TypeScript | ^5.4.0 | 类型检查 |
| @types/node | ^20.0.0 | Node.js 类型定义 |
| fake-timers | ^13.0.0 | 时间模拟（ChatMutex 超时测试） |

## 附录 B：测试命令速查

```bash
# 运行所有测试
npm test

# 运行特定模块测试
npx vitest run src/cdp/__tests__/chat-mutex.test.ts

# 运行测试并生成覆盖率报告
npm run test:coverage

# 监听模式（开发时使用）
npx vitest watch

# 运行 E2E 测试
npm run test:e2e

# 运行混沌测试
npm run test:chaos

# 检查覆盖率阈值
node scripts/check-coverage.js
```
