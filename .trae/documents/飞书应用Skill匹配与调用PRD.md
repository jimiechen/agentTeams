# 飞书应用 Skill 匹配与调用系统 PRD

> **版本**: v1.0  
> **日期**: 2026-04-29  
> **作者**: PMCLI  
> **状态**: 规划待审  

---

## 1. 项目背景

### 1.1 现状概述

当前 `agentTeams` 项目已迁移 6 个 Skill 至 `d:\TraeProject\agentTeams\.trae\skills\`，并在 `workspaces/` 下配置了 4 个飞书应用（DEVCLI / PMCLI / TESTCLI / WikiBot）。各应用通过 `@提及关键字` 接收群聊指令，但 **Skill 的调用仍依赖人工判断**，缺乏系统化的关键字匹配路由机制。

### 1.2 核心痛点

| 痛点 | 说明 |
|------|------|
| **调用入口分散** | 用户需记忆各 Skill 的调用方式，无法通过统一的自然语言指令触发 |
| **应用与 Skill 割裂** | DEVCLI/PMCLI/TESTCLI/WikiBot 各自独立，未与底层 Skill 能力打通 |
| **执行结果无反馈** | Skill 执行结果（如选股完成、监控告警）无法自动回传飞书群聊 |
| **缺乏调度中枢** | 无统一的指令解析、Skill 路由、结果汇报机制 |

### 1.3 目标愿景

构建 **"飞书群聊 → 智能路由 → Skill 执行 → 结果汇报"** 的闭环系统，实现：
- 用户在飞书群聊 `@应用` 发送自然语言指令
- 系统自动匹配并调用相关 Skill
- Skill 执行结果自动格式化并回复到群聊

---

## 2. 现有资产梳理

### 2.1 Skill 目录（6个）

| # | Skill 名称 | 路径 | 核心功能 | 调用方式 |
|---|-----------|------|----------|----------|
| 1 | **feishu-bitable-manager** | `.trae\skills\feishu-bitable-manager\` | 创建多维表格、盘后提醒、每日复盘、突破告警 | Python 脚本 + 飞书 API |
| 2 | **tdx-3bl-updater** | `.trae\skills\tdx-3bl-updater\` | 从通达信获取 3BL 板块数据，计算地量，更新飞书表格 | Python 脚本 + tqcenter |
| 3 | **tdx-realtime-monitor** | `.trae\skills\tdx-realtime-monitor\` | 盘中实时监控板块股价，涨幅超阈值预警 | Python CLI + 飞书 webhook |
| 4 | **tdx-test-screenshot** | `.trae\skills\tdx-test-screenshot\` | 自动化操作通达信测试版截图 | Python GUI 自动化 |
| 5 | **tlby-automation** | `.trae\skills\tlby-automation\` | 自动化操作天龙博弈软件截图并生成分析报告 | Python GUI 自动化 |
| 6 | **triple-volume-picker** | `.trae\skills\triple-volume-picker\` | 每日 3 倍量选股，自动创建通达信自定义板块 | Python 脚本 + tqcenter |

### 2.2 飞书应用配置（4个）

| 应用 | 环境文件 | LARK_APP_ID | LARK_MENTION_KEYWORD | 当前职责 |
|------|----------|-------------|---------------------|----------|
| **DEVCLI** | `workspaces\DEVCLI\.env.devcli` | cli_a965c93882f81bc8 | DEVCLI | 技术实现、代码开发 |
| **PMCLI** | `workspaces\PMCLI\.env.pmcli` | cli_a9645d1646a31bc9 | PMCLI | 需求梳理、PRD 输出 |
| **TESTCLI** | `workspaces\TESTCLI\.env.testcli` | cli_a97e256451b89cb3 | TESTCLI | 测试验证、缺陷报告 |
| **WikiBot** | `workspaces\Wikibot\.env.wikibot` | cli_a97a2dc1d0ba9bd3 | Wikibot | 知识蒸馏、记忆管理 |

> **注**: 4 个应用共享同一个飞书群聊 `oc_9f741c1f2d5b1fc1e98a0b42c04283c5`

### 2.3 历史文档资产

| 文档 | 路径 | 内容摘要 |
|------|------|----------|
| Skill 签约目录大纲 | `.trae\skills+doc\Skill签约目录大纲.md` | 10 个 Skill/服务的完整目录、依赖关系图、签约状态 |
| 分析文档并输出 Skill 方案 | `.trae\skills+doc\分析文档并输出Skill方案.md` | triple-volume-picker、tdx-realtime-monitor 的设计过程 |
| 改造股票监控系统 | `.trae\skills+doc\改造股票监控系统，整合通达信数据.md` | 8000 端口 API 服务、ScreenshotService、VolumeAnalysisService |
| 检查系统定时任务配置 | `.trae\skills+doc\检查系统定时任务配置.md` | Windows 定时任务、数据同步检查、复盘流程 |
| 通达信截图保存 Skill | `.trae\skills+doc\通达信截图保存Skill.md` | tdx-test-screenshot、tlby-automation 的开发记录 |
| 通达信监控地量公式 | `.trae\skills+doc\通达信监控地量公式.md` | 5/10/20/30/60 日地量公式、预警公式合集 |

---

## 3. 需求分析

### 3.1 用户故事

#### US-1: 自然语言触发 Skill
> **作为** 飞书群聊用户  
> **我希望** 通过 `@应用 指令` 的自然语言方式触发 Skill  
> **以便** 无需记忆复杂的命令行参数，降低使用门槛

**示例**:
- `@DEVCLI 执行今天的3倍量选股` → 触发 triple-volume-picker
- `@PMCLI 监控3倍量板块实时涨幅` → 触发 tdx-realtime-monitor
- `@TESTCLI 检查通达信数据是否同步` → 触发数据同步检查
- `@WikiBot 总结一下本周的项目知识` → 触发知识蒸馏

#### US-2: 执行结果自动汇报
> **作为** 飞书群聊用户  
> **我希望** Skill 执行完成后，结果自动发送到群聊  
> **以便** 无需手动查看日志或文件，实时掌握执行状态

**示例**:
- 选股完成后，自动发送 TOP10 股票列表、板块代码、文件路径
- 监控触发告警时，自动发送股票代码、当前价格、涨幅
- 复盘完成后，自动发送突破告警、形态分析结果

#### US-3: 多应用协同调度
> **作为** 系统管理员  
> **我希望** 不同应用负责不同类型的 Skill 调用  
> **以便** 职责分离，避免单点过载

**示例**:
- DEVCLI 负责技术类 Skill（选股、监控、截图）
- PMCLI 负责管理类 Skill（复盘、提醒、报告）
- TESTCLI 负责验证类 Skill（数据检查、测试执行）
- WikiBot 负责知识类 Skill（蒸馏、汇总、归档）

### 3.2 功能需求

| 需求ID | 需求描述 | 优先级 | 关联用户故事 |
|--------|----------|--------|-------------|
| FR-1 | 指令解析：从自然语言中提取意图、参数、目标 Skill | P0 | US-1 |
| FR-2 | Skill 路由：根据解析结果匹配并路由到对应 Skill | P0 | US-1 |
| FR-3 | 参数映射：将自然语言参数转换为 Skill 所需的 CLI 参数 | P0 | US-1 |
| FR-4 | 执行调度：异步执行 Skill，支持超时和取消 | P0 | US-1 |
| FR-5 | 结果格式化：将 Skill 输出（文本/JSON/图片）格式化为飞书消息 | P0 | US-2 |
| FR-6 | 消息推送：通过飞书 Bot API 发送结果到群聊 | P0 | US-2 |
| FR-7 | 应用隔离：各应用仅处理匹配其职责的指令 | P1 | US-3 |
| FR-8 | 执行日志：记录指令→Skill→结果的完整链路 | P1 | US-3 |
| FR-9 | 异常处理：Skill 执行失败时发送错误提示 | P1 | US-2 |
| FR-10 | 定时触发：支持定时任务（如每日 15:30 自动选股） | P2 | US-1 |

### 3.3 非功能需求

| 需求ID | 需求描述 | 指标 |
|--------|----------|------|
| NFR-1 | 响应时间 | 指令解析 < 500ms，Skill 启动 < 2s |
| NFR-2 | 并发处理 | 支持同时处理 3 个 Skill 执行 |
| NFR-3 | 可靠性 | Skill 执行成功率 > 95% |
| NFR-4 | 可扩展性 | 新增 Skill 无需修改核心路由代码 |
| NFR-5 | 安全性 | 飞书密钥不硬编码，通过环境变量注入 |

---

## 4. 系统架构设计

### 4.1 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        飞书群聊 (Lark)                           │
│  @DEVCLI 执行今天的3倍量选股                                     │
│  @PMCLI 监控3倍量板块实时涨幅                                    │
│  @WikiBot 总结本周知识                                          │
└──────────────────────────┬──────────────────────────────────────┘
                           │ 飞书 Bot Webhook
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    指令解析层 (Intent Parser)                     │
│  - 提取 @提及的应用 (DEVCLI/PMCLI/TESTCLI/WikiBot)               │
│  - 提取用户意图 (选股/监控/截图/复盘/蒸馏)                        │
│  - 提取参数 (日期/板块/阈值/股票代码)                             │
└──────────────────────────┬──────────────────────────────────────┘
                           │ 解析结果 (JSON)
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Skill 路由层 (Skill Router)                    │
│  - 应用职责过滤 (DEVCLI→技术类, PMCLI→管理类...)                 │
│  - 意图→Skill 映射表                                            │
│  - 参数转换 (自然语言 → CLI 参数)                                │
└──────────────────────────┬──────────────────────────────────────┘
                           │ 路由结果 (Skill + 参数)
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Skill 执行层 (Skill Executor)                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │ triple-volume   │  │ tdx-realtime    │  │ feishu-bitable  │  │
│  │    -picker      │  │    -monitor     │  │    -manager     │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │ tdx-3bl-updater │  │ tdx-test        │  │ tlby-automation │  │
│  │                 │  │   -screenshot   │  │                 │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
└──────────────────────────┬──────────────────────────────────────┘
                           │ 执行结果 (文本/JSON/图片路径)
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    结果汇报层 (Result Reporter)                   │
│  - 格式化结果为飞书消息卡片 (Markdown/图片)                       │
│  - 调用飞书 Bot API 发送消息                                     │
│  - 记录执行日志                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 数据流

```
用户消息 → 解析意图 → 匹配 Skill → 转换参数 → 执行 Skill → 捕获输出
                                                                    ↓
飞书群聊 ← 发送消息 ← 格式化结果 ← 处理异常 ← 解析结果 ←───────┘
```

### 4.3 模块职责

| 模块 | 职责 | 输入 | 输出 |
|------|------|------|------|
| **Intent Parser** | 解析自然语言指令 | 用户消息文本 | `{app, intent, params}` |
| **Skill Router** | 匹配 Skill 并转换参数 | 解析结果 | `{skill_path, cli_args}` |
| **Skill Executor** | 异步执行 Skill 脚本 | CLI 命令 | `{stdout, stderr, exit_code}` |
| **Result Reporter** | 格式化并发送结果 | 执行结果 | 飞书消息卡片 |
| **Logger** | 记录完整执行链路 | 各阶段数据 | 日志文件 |

---

## 5. Skill 与应用匹配矩阵

### 5.1 匹配规则

| 应用 | 职责域 | 匹配关键字 | 可调用 Skill |
|------|--------|-----------|-------------|
| **DEVCLI** | 技术实现、数据获取 | `选股`、`截图`、`通达信`、`天龙博弈`、`数据更新` | triple-volume-picker, tdx-3bl-updater, tdx-test-screenshot, tlby-automation |
| **PMCLI** | 项目管理、复盘监控 | `复盘`、`监控`、`告警`、`提醒`、`板块`、`地量` | feishu-bitable-manager, tdx-realtime-monitor |
| **TESTCLI** | 测试验证、质量检查 | `测试`、`检查`、`验证`、`同步` | 数据同步检查脚本、各 Skill 的 test 脚本 |
| **WikiBot** | 知识管理、文档蒸馏 | `总结`、`蒸馏`、`知识`、`记忆`、`归档` | WikiBot 知识蒸馏流程 (Layer 1 / Layer 2) |

### 5.2 意图→Skill 映射表

| 用户意图 | 关键词示例 | 匹配 Skill | 示例指令 |
|----------|-----------|-----------|----------|
| **执行3倍量选股** | `选股`、`3倍量`、`今日选股` | triple-volume-picker | `@DEVCLI 执行今天的3倍量选股` |
| **监控板块涨幅** | `监控`、`实时`、`涨幅`、`预警` | tdx-realtime-monitor | `@PMCLI 监控3倍量板块实时涨幅` |
| **盘后复盘** | `复盘`、`每日复盘`、`突破检查` | feishu-bitable-manager | `@PMCLI 执行每日复盘` |
| **截图分析** | `截图`、`通达信截图`、`天龙博弈` | tdx-test-screenshot / tlby-automation | `@DEVCLI 截图000001` |
| **更新板块数据** | `更新数据`、`同步飞书`、`地量计算` | tdx-3bl-updater | `@DEVCLI 更新3BL板块数据到飞书` |
| **知识蒸馏** | `总结`、`蒸馏`、`本周知识` | WikiBot 内部流程 | `@WikiBot 总结本周项目知识` |
| **数据同步检查** | `检查同步`、`数据检查` | check_tdx_data_sync | `@TESTCLI 检查通达信数据同步` |
| **创建追踪表格** | `创建表格`、`多维表格` | feishu-bitable-manager | `@PMCLI 创建3倍量追踪表格` |

---

## 6. 接口设计

### 6.1 指令解析接口

```python
# intent_parser.py
class IntentParser:
    def parse(self, message: str) -> ParsedIntent:
        """
        解析用户消息
        
        Args:
            message: 用户原始消息，如 "@DEVCLI 执行今天的3倍量选股"
            
        Returns:
            ParsedIntent:
                app: str          # "DEVCLI"
                intent: str       # "triple_volume_picking"
                params: dict      # {"date": "today"}
                raw_text: str     # 原始消息
        """
        pass
```

### 6.2 Skill 路由接口

```python
# skill_router.py
class SkillRouter:
    def route(self, intent: ParsedIntent) -> SkillCommand:
        """
        将解析结果路由到对应 Skill
        
        Args:
            intent: 解析后的意图
            
        Returns:
            SkillCommand:
                skill_name: str   # "triple-volume-picker"
                script_path: str  # ".trae\skills\triple-volume-picker\scripts\tdx_triple_volume.py"
                args: list        # ["--date", "2026-04-29"]
                env: dict         # 环境变量
        """
        pass
```

### 6.3 Skill 执行接口

```python
# skill_executor.py
class SkillExecutor:
    async def execute(self, command: SkillCommand) -> ExecutionResult:
        """
        异步执行 Skill
        
        Args:
            command: Skill 命令
            
        Returns:
            ExecutionResult:
                success: bool
                stdout: str
                stderr: str
                exit_code: int
                output_files: list  # 生成的文件路径
        """
        pass
```

### 6.4 结果汇报接口

```python
# result_reporter.py
class ResultReporter:
    async def report(self, result: ExecutionResult, chat_id: str) -> None:
        """
        发送执行结果到飞书群聊
        
        Args:
            result: 执行结果
            chat_id: 飞书群聊 ID
        """
        pass
```

---

## 7. 消息格式设计

### 7.1 选股结果消息卡片

```markdown
## 📊 3倍量选股结果 (2026-04-29)

| 指标 | 数值 |
|------|------|
| **选股日期** | 2026-04-29 |
| **3倍量股票数** | **32只** |
| **平均放量倍数** | 4.42x |
| **上涨股票数** | 27只 (84.4%) |

### 🏆 TOP 5 股票

| 排名 | 代码 | 名称 | 放量倍数 | 涨跌幅 |
|:----:|:----:|:----:|:--------:|:------:|
| 1 | 600476.SH | 湘邮科技 | **8.59x** | -9.44% |
| 2 | 600643.SH | 爱建集团 | **7.98x** | +10.11% |
| ... | ... | ... | ... | ... |

### 📁 输出文件
- CSV: `output/20260429/tdx_triple_volume_20260429.csv`
- JSON: `output/20260429/tdx_triple_volume_20260429.json`

### 📈 通达信板块
已创建板块 `3倍量20260429` (代码: 3BL0429)
```

### 7.2 监控告警消息卡片

```markdown
## 🚨 涨幅预警

| 项目 | 内容 |
|------|------|
| **股票代码** | 600643.SH |
| **股票名称** | 爱建集团 |
| **当前价格** | 12.50 |
| **涨幅** | **+5.2%** |
| **触发时间** | 2026-04-29 10:35:22 |
| **所属板块** | 3倍量20260429 |

### ⚠️ 预警规则
- 阈值: 5.0%
- 类型: 价格涨幅突破
```

### 7.3 错误消息卡片

```markdown
## ❌ Skill 执行失败

| 项目 | 内容 |
|------|------|
| **Skill** | triple-volume-picker |
| **错误类型** | 通达信未启动 |
| **错误信息** | tqcenter 初始化失败，请检查通达信客户端是否已运行 |

### 🔧 建议操作
1. 启动通达信金融终端
2. 确认已登录量化平台
3. 重新执行指令
```

---

## 8. 定时任务设计

### 8.1 现有定时任务迁移

| 任务 | 原执行方式 | 新执行方式 | 触发时间 |
|------|-----------|-----------|----------|
| 盘后维护提醒 | Windows 任务计划程序 | PMCLI 定时触发 | 每日 15:00 |
| 每日复盘 | Windows 任务计划程序 | PMCLI 定时触发 | 每日 15:30 |
| 3倍量选股 | Windows 任务计划程序 | DEVCLI 定时触发 | 每日 15:30 |
| 数据同步检查 | PowerShell 脚本前置 | TESTCLI 定时触发 | 每日 15:25 |

### 8.2 定时任务配置

```json
{
  "scheduled_tasks": [
    {
      "id": "postmarket_reminder",
      "app": "PMCLI",
      "skill": "feishu-bitable-manager",
      "script": "scripts/send_postmarket_reminder.py",
      "schedule": "0 15 * * 1-5",
      "description": "每日15:00发送盘后维护提醒"
    },
    {
      "id": "daily_review",
      "app": "PMCLI",
      "skill": "feishu-bitable-manager",
      "script": "scripts/daily_review.py",
      "schedule": "30 15 * * 1-5",
      "description": "每日15:30执行复盘"
    },
    {
      "id": "triple_volume_picking",
      "app": "DEVCLI",
      "skill": "triple-volume-picker",
      "script": "scripts/tdx_triple_volume.py",
      "schedule": "30 15 * * 1-5",
      "description": "每日15:30执行3倍量选股"
    },
    {
      "id": "data_sync_check",
      "app": "TESTCLI",
      "skill": "check_tdx_data_sync",
      "script": "scripts/check_tdx_data_sync.py",
      "schedule": "25 15 * * 1-5",
      "description": "每日15:25检查数据同步"
    }
  ]
}
```

---

## 9. 异常处理设计

### 9.1 异常分类

| 异常类型 | 说明 | 处理策略 |
|----------|------|----------|
| **解析异常** | 无法识别用户意图 | 回复帮助信息，列出可用指令 |
| **路由异常** | 无匹配 Skill | 回复建议，提示使用其他应用 |
| **执行异常** | Skill 执行失败 | 发送错误详情 + 修复建议 |
| **超时异常** | Skill 执行超时 | 发送超时提示，提供手动执行命令 |
| **权限异常** | 飞书 API 调用失败 | 记录日志，提示检查应用权限 |

### 9.2 错误码定义

| 错误码 | 含义 | 示例 |
|--------|------|------|
| E001 | 意图解析失败 | "无法理解指令，请尝试：@DEVCLI 执行选股" |
| E002 | Skill 未找到 | "未找到匹配的 Skill，DEVCLI 可用指令：选股、截图..." |
| E003 | 参数无效 | "日期格式错误，请使用 YYYY-MM-DD 格式" |
| E004 | Skill 执行失败 | "通达信未启动，请先启动通达信客户端" |
| E005 | 执行超时 | "选股任务超时（>300s），请手动执行..." |
| E006 | 飞书发送失败 | "消息发送失败，请检查网络连接" |

---

## 10. 实施计划

### 10.1 里程碑

| 阶段 | 目标 | 交付物 | 预计工期 |
|------|------|--------|----------|
| **M1** | 核心框架搭建 | 指令解析、Skill 路由、执行器、汇报器 | 3天 |
| **M2** | Skill 接入 | 接入 6 个 Skill，完成参数映射 | 2天 |
| **M3** | 飞书集成 | 完成 4 个应用的 Bot 接入 | 2天 |
| **M4** | 定时任务 | 迁移 4 个定时任务 | 1天 |
| **M5** | 测试验证 | 端到端测试、异常场景测试 | 2天 |

### 10.2 任务分解

```
M1: 核心框架搭建 (3天)
├── T1.1: 实现 IntentParser 模块
├── T1.2: 实现 SkillRouter 模块
├── T1.3: 实现 SkillExecutor 模块（异步执行、超时控制）
├── T1.4: 实现 ResultReporter 模块（飞书消息格式化）
└── T1.5: 实现 Logger 模块

M2: Skill 接入 (2天)
├── T2.1: 接入 triple-volume-picker
├── T2.2: 接入 tdx-realtime-monitor
├── T2.3: 接入 feishu-bitable-manager
├── T2.4: 接入 tdx-3bl-updater
├── T2.5: 接入 tdx-test-screenshot
└── T2.6: 接入 tlby-automation

M3: 飞书集成 (2天)
├── T3.1: 配置 DEVCLI Bot 事件监听
├── T3.2: 配置 PMCLI Bot 事件监听
├── T3.3: 配置 TESTCLI Bot 事件监听
├── T3.4: 配置 WikiBot Bot 事件监听
└── T3.5: 实现消息接收与回复

M4: 定时任务 (1天)
├── T4.1: 实现定时任务调度器
├── T4.2: 迁移盘后提醒任务
├── T4.3: 迁移每日复盘任务
├── T4.4: 迁移选股任务
└── T4.5: 迁移数据同步检查任务

M5: 测试验证 (2天)
├── T5.1: 编写单元测试
├── T5.2: 执行端到端测试
├── T5.3: 异常场景测试
└── T5.4: 性能测试
```

---

## 11. 风险与应对

| 风险 | 影响 | 概率 | 应对策略 |
|------|------|------|----------|
| **通达信未启动** | 选股/监控失败 | 高 | 执行前检查，失败时发送提醒 |
| **飞书 API 限流** | 消息发送失败 | 中 | 实现重试机制 + 指数退避 |
| **Skill 执行超时** | 任务挂起 | 中 | 设置超时时间，超时后强制终止 |
| **多任务并发冲突** | 资源竞争 | 中 | 使用文件锁/进程锁控制并发 |
| **意图解析不准确** | 错误触发 Skill | 中 | 增加确认机制，模糊时提示用户 |
| **Windows 定时任务冲突** | 重复执行 | 低 | 迁移后禁用旧定时任务 |

---

## 12. 附录

### 12.1 参考文档

| 文档 | 路径 |
|------|------|
| Skill 签约目录大纲 | `.trae\skills+doc\Skill签约目录大纲.md` |
| 分析文档并输出 Skill 方案 | `.trae\skills+doc\分析文档并输出Skill方案.md` |
| 改造股票监控系统 | `.trae\skills+doc\改造股票监控系统，整合通达信数据.md` |
| 检查系统定时任务配置 | `.trae\skills+doc\检查系统定时任务配置.md` |
| 通达信截图保存 Skill | `.trae\skills+doc\通达信截图保存Skill.md` |
| 通达信监控地量公式 | `.trae\skills+doc\通达信监控地量公式.md` |

### 12.2 环境变量清单

| 变量名 | 说明 | 应用 |
|--------|------|------|
| `LARK_APP_ID` | 飞书应用 ID | 所有应用 |
| `LARK_APP_SECRET` | 飞书应用密钥 | 所有应用 |
| `LARK_CHAT_ID` | 飞书群聊 ID | 所有应用 |
| `LARK_MENTION_KEYWORD` | 提及关键字 | 所有应用 |
| `FEISHU_APP_ID` | 飞书多维表格应用 ID | feishu-bitable-manager |
| `FEISHU_APP_SECRET` | 飞书多维表格应用密钥 | feishu-bitable-manager |
| `OPENAI_API_KEY` | LLM API 密钥 | WikiBot |
| `OPENAI_BASE_URL` | LLM API 地址 | WikiBot |

### 12.3 术语表

| 术语 | 说明 |
|------|------|
| **Skill** | 可复用的自动化能力单元，如选股、监控、截图 |
| **3BL** | 3倍量板块（Triple Volume Block），通达信自定义板块 |
| **地量** | 成交量低于 N 日均量 80% 的状态 |
| **复盘** | 盘后检查股票突破状态、形态分析 |
| **tqcenter** | 通达信量化平台 Python 接口 |
| **飞书多维表格** | 飞书 Bitable，用于股票数据追踪 |

---

*本文档由 PMCLI 生成，待评审确认后进入实施阶段。*
