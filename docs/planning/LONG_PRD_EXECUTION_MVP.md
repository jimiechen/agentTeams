# 超长 PRD 文档执行 MVP 方案

- **文档版本**: v1.0
- **创建日期**: 2026-04-30
- **作者**: AI Assistant
- **状态**: 待评审
- **关联文档**:
  - `docs/BACKGROUND_TIMEOUT_RECOVERY_SIMPLIFIED.md`
  - `docs/INCIDENT_REPORT_HEARTBEAT_P0_20260430.md`
  - `docs/planning/claude-code-harness-introduction-plan.md`
  - `docs/planning/claude-code-vs-ralph-task-management-comparison.md`

---

## 目录

1. [方案定位与背景](#1-方案定位与背景)
2. [核心痛点与根因分析](#2-核心痛点与根因分析)
3. [基础机制：章节切片 + 文件系统接力](#3-基础机制章节切片--文件系统接力)
4. [Prompt 模板设计](#4-prompt-模板设计)
5. [多 CLI 分工协作](#5-多-cli-分工协作)
6. [中断恢复机制](#6-中断恢复机制)
7. [落地计划（Day 1-5）](#7-落地计划day-1-5)
8. [验收标准](#8-验收标准)
9. [设计边界与局限](#9-设计边界与局限)
10. [与现有架构的关系定位](#10-与现有架构的关系定位)

---

## 1. 方案定位与背景

### 1.1 解决的问题

当前 mvp-runner 在执行超长 PRD 文档任务时面临三类具体问题：

**问题一：单轮输出长度硬上限**。无论何种模型，单次 response 输出存在物理上限（约 4k~8k token，对应 Markdown 约 2000~4000 字）。一份完整 PRD 远超单轮输出范围。

**问题二：早期章节决策被遗忘**。分多轮执行时，写第 5 章时已看不清第 1 章的核心约束，导致"局部最优但整体不一致"。

**问题三：中断后恢复代价高**。心跳事故、编辑器重启、token 预算耗尽后，没有机制从"第 4 章已完成"的断点继续，往往只能整个重来。

### 1.2 方案本质

> **用文件系统替代对话历史作为唯一记忆载体**

把 AI 的"长程记忆"从脆弱的 context window 搬到磁盘，通过严格的目录结构约定、分层上下文注入、progress.jsonl 断点记录，实现任意时刻可中断、可恢复、可审计的超长文档生成能力。

### 1.3 方案边界

本方案是 **MVP 级别**，不依赖以下高成本改造：

- Claude Code Harness / Shadow History
- Coordinator-Worker 多 session 并行调度
- TokenBudgetTracker / Compaction 机制

这些属于 V2+ 能力，本方案是其前置基础。

---

## 2. 核心痛点与根因分析

三个痛点共同指向同一根因：

```
对话历史是唯一的"记忆载体"
      ↓
这个载体脆弱（易被事故清空）
      ↓
容量有限（context window 硬上限）
      ↓
且不可持久化（session 结束即消失）
```

**解法方向**：把"记忆"从 context window 下放到磁盘。磁盘容量无限、可持久化、可版本化、可被任意 CLI 独立读取。

---

## 3. 基础机制：章节切片 + 文件系统接力

### 3.1 目录结构

每个 PRD 任务对应独立工作目录：

```
docs/prd/{prd-id}/
├── meta.json                  # PRD 全局元数据
├── outline.md                 # 章节大纲 + 各章 200 字摘要
├── chapters/
│   ├── 01-overview.md
│   ├── 02-users.md
│   ├── 03-user-stories.md
│   ├── 04-functional-spec.md
│   ├── 05-data-model.md
│   ├── 06-api-spec.md
│   ├── 07-non-functional.md
│   ├── 08-acceptance-criteria.md
│   ├── 09-test-scenarios.md
│   ├── 10-risk-assessment.md
│   └── 11-appendix.md
├── glossary.md                # 跨章节术语锚点
├── progress.jsonl             # 执行状态 + 交接记录
└── final-prd.md               # 最终合并产物
```

### 3.2 四阶段执行流程

**阶段 A：大纲生成（1 次交互）**

产出 meta.json + outline.md + 空 glossary.md。
不写任何正文，只输出结构化计划，token 消耗 < 2000。

**阶段 B：章节批量撰写（N 次交互，一章一次）**

按 outline 顺序逐章写。每次交互注入分层上下文（见第 4 章），产出"正文 + 200 字摘要 + 新增术语"三样。

**阶段 C：一致性审校（1 次交互）**

读取所有章节 200 字摘要 + glossary.md，输出不一致问题列表。不重写内容，只产出差异报告。

**阶段 D：合并（程序化）**

按顺序拼接 chapters/*.md → final-prd.md，添加目录和格式化。不需要 AI 参与。

### 3.3 章节切片粒度

| 指标 | 推荐值 |
|------|--------|
| 每章字数 | 3000~5000 字 |
| 标准 PRD 总章节数 | 8~12 章 |
| 总交互次数 | 10~14 次 |
| 预计总耗时 | 40 分钟~1 小时 |

### 3.4 meta.json 字段定义

```json
{
  "prd_id": "PRD-20260430-001",
  "title": "任务拆解系统 PRD",
  "target_users": ["插件架构师", "前端自动化工程师"],
  "core_value": "让用户输入一句话长任务，自动拆解为可执行子任务序列",
  "core_constraints": [
    "V1 不做并行调度",
    "V1 不改底层 fillPrompt/waitResponse",
    "子任务顺序执行，不抢占"
  ],
  "estimated_chapters": 11,
  "estimated_total_words": 35000
}
```

---

## 4. Prompt 模板设计

### 4.1 阶段 A：大纲生成 Prompt

```
你是一个 PRD 架构师，现在需要为以下需求生成 PRD 大纲。

【需求描述】
{用户原始输入}

【任务】
请依次输出以下三份文件内容，每份用 ``` 代码块包裹并标注文件名：

1. meta.json
包含字段：prd_id / title / target_users / core_value /
          core_constraints（≤5条）/ estimated_chapters / estimated_total_words

2. outline.md
每章包含：标题 / 内容范围 / 预估字数 / 完成摘要（占位符：[待填写]）

3. glossary.md
初版可为空，注明"待各章节补充"

【约束】
- 章节数不超过 12
- 每章预估字数 3000~5000 字
- 章节顺序符合 PRD 规范（概述在前，附录在后）
- 混合章节（如非功能需求）必须拆为 Xa / Xb 子章节
```

---

### 4.2 阶段 B：章节撰写 Prompt（核心模板）

```
你是一个 PRD 作者，现在需要撰写第 {K} 章内容。

【全局上下文】
```json
{meta.json 完整内容}
```

【PRD 大纲（含前序章节摘要）】
```markdown
{outline.md 完整内容}
```

【术语表】
```markdown
{glossary.md 完整内容}
```

【已完成章节摘要】
{第 1 章摘要}
{第 2 章摘要}
...
{第 K-1 章摘要}

【本章要求】
- 章节标题：{第 K 章标题}
- 内容范围：{outline 中定义的范围}
- 预估字数：{outline 中定义的字数}

【撰写规则】
1. 严格遵循 meta.json 中的 core_constraints
2. 与前序章节摘要保持一致，不得出现矛盾
3. 引入新术语时同步更新 glossary.md
4. 引用前序章节用"见第 X 章"格式，不重复内容
5. 章节结构清晰，使用 ### 二级标题组织子节

【输出要求】
按顺序输出以下三份内容，每份用 ``` 代码块包裹并标注文件名：

1. 章节正文（保存为 chapters/{K}-{slug}.md）
2. 本章 200 字摘要（更新到 outline.md 对应位置）
3. 新增术语列表（合并到 glossary.md，若无则输出"无新增"）
```

---

### 4.3 阶段 C：审校 Prompt

```
你是一个 PRD 审校员，检查以下 PRD 的内部一致性。

【全局约束】
{meta.json 内容}

【各章摘要】
{第 1~N 章摘要}

【术语表】
{glossary.md 内容}

【审校规则】
请检查以下 5 类问题：
1. 目标用户一致性：各章对目标用户的假设是否一致
2. 核心约束遵守：各章是否违反 core_constraints
3. 术语使用：是否存在同义词混用
4. 引用正确性：章节间引用是否准确
5. 覆盖完整性：outline 定义的内容范围是否全部写到

【输出格式】
```markdown
# PRD 一致性审校报告

## 1. 目标用户一致性
- 状态：[通过/有问题]
- 问题描述：...
- 影响章节：第 X、Y 章
- 建议：...

（其余 4 类同上格式）

## 汇总
- 需修改章节：[第 X 章、第 Y 章]
- 严重程度：[高/中/低]
```
```

---

### 4.4 TESTCLI 临时替代 Prompt（TESTCLI 未就绪时）

```
你现在扮演 QA 工程师角色，用测试思维撰写第 {K} 章验收标准。

【注入内容】
{meta.json} + {user-stories.md 全文} + {data-model.md 全文} + {api-spec.md 全文}

【撰写规则】
1. 每个 Story 必须有至少 1 条正常路径 AC、1 条异常路径 AC
2. AC 格式：Given / When / Then
3. 数值型约束必须量化（如"响应时间 < 200ms"）
4. 覆盖边界条件（空值、最大值、并发）
```

---

## 5. 多 CLI 分工协作

### 5.1 设计目标

在不引入 Claude Code Coordinator / Harness 的前提下，实现 **PMCLI、DEVCLI、TESTCLI 在同一份超大 PRD 任务中的稳定协作**，满足以下目标：

1. **职责清晰**：每个 CLI 只产出自己最擅长的内容
2. **上下文隔离**：不同 CLI 不共享对话历史，只通过文件交接
3. **可中断可恢复**：任意 CLI 中断后可从章节级继续
4. **MVP 可实现**：不新增底层基础设施，仅通过调度和 prompt 约定实现

---

### 5.2 分工核心原则：按产出物类型路由

> **谁的 system prompt 决定了它"稳定擅长产出什么"，就让它只做这类事情**

#### 文档性产出（PMCLI）

偏业务、偏用户视角、偏产品决策。  
质量标准：产品/业务方可直接评审。

#### 技术性产出（DEVCLI）

偏实现、偏工程、偏技术约束。  
质量标准：开发者可直接依据编写代码。

#### 验证性产出（TESTCLI）

偏反向验证、偏覆盖性、偏边界条件。  
质量标准：QA 可据此判断功能是否"完成"。

---

### 5.3 标准 PRD 章节 → CLI 路由表

| 章节 | 内容 | 执行 CLI | 强依赖前置章节 |
|-----|-----|---------|----------------|
| 第 1 章 | 产品概述 | PMCLI | 无 |
| 第 2 章 | 目标用户 | PMCLI | 第 1 章 |
| 第 3 章 | 用户故事 | PMCLI | 第 1–2 章 |
| 第 4 章 | 功能规格 | PMCLI | 第 2–3 章 |
| 第 5 章 | 数据模型 | **DEVCLI** | 第 3–4 章（全文） |
| 第 6 章 | 接口规格 | **DEVCLI** | 第 4–5 章（全文） |
| 第 7a 章 | 非功能需求（体验） | PMCLI | 第 4 章 |
| 第 7b 章 | 非功能需求（技术） | **DEVCLI** | 第 7a 章 |
| 第 8 章 | 验收标准 | **TESTCLI** | 第 3–4 章（全文） |
| 第 9 章 | 测试场景 | **TESTCLI** | 第 5–6–8 章（全文） |
| 第 10 章 | 风险评估 | PMCLI | 全章摘要 |
| 第 11 章 | 附录 / 术语 | 程序化 | glossary.md |

> ⚠️ 混合章节（第 7 章）**必须拆成子任务**，不允许单 CLI 强行完成

---

### 5.4 CLI 之间的交接机制

#### 交接载体（无对话、纯文件）

| 文件 | 作用 |
|------|------|
| `meta.json` | 全局约束，所有 CLI 必读 |
| `outline.md` | 章节结构 + 摘要，所有 CLI 必读 |
| `chapters/*.md` | 已完成章节正文，按需读取 |
| `glossary.md` | 跨章节术语锚点，所有 CLI 必读 |
| `progress.jsonl` | 执行状态与交接记录，Coordinator 读写 |

#### 交接状态记录（progress.jsonl 格式）

```jsonl
{"ts":"...","event":"outline_generated","chapters":11}
{"ts":"...","event":"chapter_completed","chapter":4,"cli":"PMCLI","handoff_to":"DEVCLI"}
{"ts":"...","event":"handoff_accepted","from":4,"to":5,"cli":"DEVCLI"}
{"ts":"...","event":"handoff_rejected","from":4,"cli":"DEVCLI","reason":"功能描述无法推导数据模型，需补充字段约束"}
{"ts":"...","event":"chapter_completed","chapter":5,"cli":"DEVCLI","handoff_to":"TESTCLI"}
{"ts":"...","event":"chapter_failed","chapter":6,"cli":"DEVCLI","reason":"editor-crashed"}
{"ts":"...","event":"chapter_completed","chapter":6,"cli":"DEVCLI"}
{"ts":"...","event":"review_completed","issues":2,"chapters_to_fix":[3,7]}
{"ts":"...","event":"prd_merged","output":"final-prd.md","total_words":34200}
```

> `handoff_rejected` 是 MVP 级**关键设计**，允许下游"反向打回"上游，而不是硬着头皮继续

---

### 5.5 不同 CLI 的上下文注入策略

#### PMCLI 注入（精简上下文）

```
meta.json + outline.md + glossary.md + 前序章节摘要
```
不注入技术全文，保持业务视角，token 消耗低。

---

#### DEVCLI 注入（⚠️ 强依赖全文）

```
meta.json
+ outline.md
+ chapters/03-user-stories.md（全文）
+ chapters/04-functional-spec.md（全文）
+ glossary.md
+ 前序 DEVCLI 章节摘要
```

DEVCLI 必须从原始需求全文推导数据结构，摘要信息量不足。

---

#### TESTCLI 注入（最贪婪）

```
meta.json
+ outline.md
+ chapters/03-user-stories.md（全文）
+ chapters/05-data-model.md（全文）
+ chapters/06-api-spec.md（全文）
+ glossary.md
```

TESTCLI 需要针对字段约束和接口参数设计测试用例，必须读全文。

---

### 5.6 Coordinator 最小职责（MVP）

Coordinator **不是智能体**，只是**确定性调度器**，只做 5 件事：

1. 读取 `progress.jsonl`
2. 判断下一个未完成章节
3. 根据路由表选择 CLI
4. 构造对应 CLI 的章节 prompt
5. 等待执行完成并 post-hook 写文件

```typescript
// 核心路由逻辑（约 20 行）
route(chapter: Chapter): CliType {
  const routeTable: Record<string, CliType> = {
    'data-model':           'DEVCLI',
    'api-spec':             'DEVCLI',
    'non-functional-tech':  'DEVCLI',
    'acceptance-criteria':  'TESTCLI',
    'test-scenarios':       'TESTCLI',
    'appendix':             'PROGRAM',
  };
  return routeTable[chapter.type] ?? 'PMCLI';
}
```

全部**串行执行**，不涉及并行、抢占、动态重排。

---

### 5.7 混合章节处理（以第 7 章为例）

```
子任务 7a（PMCLI）
  → 写体验类非功能需求（可用性、可访问性、本地化）
  → 产出框架文本

子任务 7b（DEVCLI）
  → 读取 7a 全文
  → 填充技术指标（P99 响应时间、SLA、安全标准）
  → 不重写文字，只补充数字和技术规范

post-hook 合并 → chapters/07-non-functional.md
```

```jsonl
{"event":"chapter_completed","chapter":"7a","cli":"PMCLI","handoff_to":"DEVCLI"}
{"event":"chapter_completed","chapter":"7b","cli":"DEVCLI","merge_into":7}
```

---

### 5.8 MVP 分阶段落地顺序

| 阶段 | 内容 | 目标 |
|------|------|------|
| **Step 1** | 仅 PMCLI，跑通章节切片 + 恢复机制 | 验证基础机制 |
| **Step 2** | 引入 DEVCLI（第 5、6、7b 章） | 验证交接机制 |
| **Step 3** | 引入 TESTCLI（第 8、9 章） | 验证验证性产出质量 |

> ⚠️ 永远不要一开始就三 CLI 全开

---

## 6. 中断恢复机制

### 6.1 恢复三步法

中断后恢复只需三步，不需要任何历史对话：

```
Step 1: 读取 progress.jsonl 最后一条 chapter_completed
        → 确定"已完成到第 K-1 章"

Step 2: 读取 outline.md
        → 找到第 K 章的内容范围定义

Step 3: 构造阶段 B 的 prompt
        → 注入所有已完成章节摘要
        → 发给对应 CLI 继续写第 K 章
```

### 6.2 与 runs/*.md 的结合

每次章节撰写对应一个 run，run 文件记录 prompt、response、完成状态（现有机制直接复用）。

新增的只是 **post-hook 脚本**（约 100 行）：

```
输入：Trae chat 一次 response 的完整输出
解析：按 Markdown 代码块提取"正文 / 摘要 / 术语更新"
写入：chapters/{K}.md + 更新 outline.md 摘要 + 合并 glossary.md
追加：一行 progress.jsonl
```

### 6.3 失败场景处理

| 失败场景 | 恢复策略 |
|---------|---------|
| 编辑器崩溃 | 读 progress.jsonl，从最后完成章节续写 |
| 章节输出不完整 | 重新触发该章节，prompt 不变 |
| handoff_rejected | PMCLI 重写被拒章节的指定段落 |
| 审校发现严重不一致 | 只重写受影响章节，不重写全文 |
| glossary 冲突 | 以最新章节定义为准，更新前序摘要 |

---

## 7. 落地计划（Day 1-5）

### Day 1：人工演练（不写代码）

目标：验证 prompt 模板有效性

- 选一份真实中等复杂度需求（如"任务拆解系统"）
- 人工扮演 Coordinator，手动把三个 prompt 依次发给 Trae
- 手动管理 chapters/*.md 和 progress.jsonl
- 记录：哪些字段不够精准、哪些约束需要调整

---

### Day 2：post-hook 脚本实现

目标：自动化"输出 → 写文件 → 更新进度"

```typescript
// post-hook 核心逻辑（约 100 行）
async function processChapterResponse(
  prdId: string,
  chapterId: number,
  rawResponse: string
): Promise<void> {
  const blocks = parseCodeBlocks(rawResponse);

  // 写章节正文
  await writeFile(`docs/prd/${prdId}/chapters/${chapterId}.md`, blocks.body);

  // 更新 outline.md 摘要
  await updateOutlineSummary(prdId, chapterId, blocks.summary);

  // 合并 glossary.md
  if (blocks.glossary !== '无新增') {
    await mergeGlossary(prdId, blocks.glossary);
  }

  // 追加 progress.jsonl
  await appendProgress(prdId, {
    event: 'chapter_completed',
    chapter: chapterId,
    cli: getCurrentCli(),
    word_count: countWords(blocks.body),
    summary: blocks.summary,
  });
}
```

---

### Day 3：Coordinator 骨架实现

目标：自动调度章节执行

- 实现路由表（约 20 行）
- 实现循环调度（读 progress → 路由 → 执行 → post-hook）
- 实现 handoff_rejected 处理（打回上游重写）

---

### Day 4：端到端验证

目标：用真实 PRD 需求跑通完整流程

验证内容：
- [ ] 阶段 A 大纲生成（1 次交互）
- [ ] 阶段 B 循环章节撰写（8~12 次交互）
- [ ] 手动中断一次，验证恢复能力
- [ ] 阶段 C 审校（1 次交互）
- [ ] 阶段 D 合并（程序化）
- [ ] 最终 final-prd.md 内容完整性人工评审

---

### Day 5：引入 DEVCLI 分工验证

目标：验证 PMCLI → DEVCLI 交接机制

- 把第 5 章（数据模型）切换给 DEVCLI 执行
- 验证 DEVCLI 读取 user-stories.md 全文后，数据模型质量是否合格
- 验证 handoff_accepted / handoff_rejected 流程

---

## 8. 验收标准

### 8.1 功能验收

| 编号 | 验收项 | 标准 |
|------|--------|------|
| AC-1 | 大纲生成 | meta.json + outline.md 字段完整，章节数 8~12 |
| AC-2 | 章节撰写 | 每章字数 3000~5000，输出包含正文 + 摘要 + 术语 |
| AC-3 | 摘要质量 | 200 字摘要包含关键决策、关键数字、章节间依赖 |
| AC-4 | 中断恢复 | 任意章节中断后，3 步内恢复续写，无需重头开始 |
| AC-5 | 交接机制 | DEVCLI 拒绝时写入 handoff_rejected 并触发上游重写 |
| AC-6 | 一致性审校 | 审校报告覆盖 5 类问题，发现问题率 > 0（证明审校有效） |
| AC-7 | 合并产物 | final-prd.md 字数符合预期，目录与内容一一对应 |

### 8.2 性能验收

- 单章撰写耗时 < 5 分钟
- post-hook 执行耗时 < 5 秒
- 完整 PRD（11 章）总耗时 < 70 分钟

### 8.3 稳定性验收

- 连续完成 3 份不同主题的 PRD，无异常中断
- 每份 PRD 至少验证一次中断恢复能力

---

## 9. 设计边界与局限

### 9.1 已知局限

**局限一：不适合强迭代型任务**  
写到第 5 章发现第 2 章核心约束需要大改，则第 2 章之后的所有章节需重写。建议：大纲评审阶段充分讨论，outline 定稿后不允许大改。

**局限二：章节摘要质量决定一致性上限**  
如果 200 字摘要不够精准，后续章节注入时会丢失关键信息。建议：在 prompt 里强制要求摘要包含"关键决策 / 关键数字 / 与其他章节的依赖关系"三个字段。

**局限三：强依赖章节的 token 成本**  
DEVCLI 和 TESTCLI 需要注入前置章节全文，单次 token 消耗是 PMCLI 的 2~3 倍。这是为保证质量必须付出的代价。

### 9.2 明确不在 V1 范围

- CLI 并行执行
- 自动冲突合并
- 动态章节重排
- Claude Code Harness / Shadow History
- 多 session 协调

---

## 10. 与现有架构的关系定位

| 当前机制 | 本方案的关系 |
|---------|-------------|
| `runs/*.md` | 直接复用，每章对应一个 run |
| `progress.jsonl` | 新增，但格式与现有 metrics.jsonl 兼容 |
| `runner-multi.ts` | 不改，Coordinator 在其之上调度 |
| `task-machine.ts` | 不改，每章任务走现有状态机 |
| `waitResponse()` | 不改，章节执行复用现有流式监听 |
| 心跳检测 | 不改，background 超时恢复方案独立处理 |
| Harness Phase 1-4 | 本方案是 Harness 的前置基础，跑通后可平滑升级 |

> **一句话定位**：本方案是 Harness / Coordinator 架构的"零成本前置验证"——跑通文件系统接力机制后，未来升级只是把"文件读写"替换为"内存 Shadow History"，业务逻辑完全兼容。

---

## 附录：整体架构图

```
用户输入: "为 XX 功能撰写完整 PRD"
          ↓
    PrdCoordinator
    （读 progress.jsonl → 路由 → 调度 → post-hook）
          ↓
    ┌─────────────────────────────────────┐
    │         progress.jsonl              │
    │  章节状态 / 交接记录 / 错误日志       │
    └─────────────────────────────────────┘
          ↓ 按路由表调度（串行）
    ┌──────────┬───────────┬────────────┐
    │  PMCLI   │  DEVCLI   │  TESTCLI   │
    │          │           │            │
    │ 第1章    │ 第5章     │ 第8章      │
    │ 第2章    │ 第6章     │ 第9章      │
    │ 第3章    │ 第7b章    │            │
    │ 第4章    │           │            │
    │ 第7a章   │           │            │
    │ 第10章   │           │            │
    └────┬─────┴─────┬─────┴──────┬─────┘
         │           │            │
         └──────────►│◄───────────┘
                     ↓
         docs/prd/{prd-id}/chapters/*.md
                     ↓
         glossary.md + outline.md（持续更新）
                     ↓
              审校（PMCLI）
                     ↓
              合并（程序化）
                     ↓
              final-prd.md ✅
```

---

**文档结束（v1.0）**

- **下一步**：Day 1 人工演练 → 验证 prompt 模板
- **评审人建议**：技术负责人 + PMCLI 代表 + DEVCLI 代表
- **预计评审时间**：60 分钟
