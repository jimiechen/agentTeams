# LLM Wiki 自进化记忆系统架构设计

**版本**: v1.0  
**日期**: 2026-04-28  
**状态**: 设计评审  

---

## 1. 架构概述

### 1.1 核心理念

LLM Wiki 是一套**自进化记忆蒸馏架构**，解决长期运行AI系统的核心矛盾：

> **如何让AI"越来越懂项目"，同时不让提示词越来越膨胀？**

答案是通过**三层蒸馏塔**将原始执行记录逐步提炼为高密度核心知识，实现"提示词越用越小，但信息密度越来越高"。

### 1.2 与RAG的根本区别

| 维度 | RAG | LLM Wiki |
|------|-----|----------|
| 知识来源 | 外部静态文档 | 自身执行历史 |
| 检索方式 | 实时向量检索 | 离线蒸馏注入 |
| 提示词变化 | 随文档库增大 | 固定2000字以内 |
| 遗忘机制 | 无 | 7天自动淘汰 |
| 进化能力 | 静态 | 每日自动进化 |

**一句话定位**: RAG给AI知识广度，LLM Wiki给AI项目深度。

### 1.3 三层蒸馏架构

```
┌─────────────────────────────────────────────────────────────┐
│                      Layer 0: 原始层                         │
│  (Raw Records)                                               │
│  ├── runs/2026-04-28T10-00-00.md        (执行记录)          │
│  ├── runs/2026-04-28T11-30-00.md        (错误日志)          │
│  └── lark/messages/2026-04-28.json      (飞书对话)          │
│                                                              │
│  特性: 完整、真实、冗余、不直接注入prompt                      │
│  保留: 7天后自动归档                                          │
└─────────────────────────────────────────────────────────────┘
                              ↓ 每日凌晨2点自动蒸馏 (24:1压缩)
┌─────────────────────────────────────────────────────────────┐
│                      Layer 1: 蒸馏层                         │
│  (Daily Memory)                                              │
│  └── wiki/daily/2026-04-28.md             (今日记忆500字)   │
│                                                              │
│  五维度提炼:                                                  │
│  ├── 新增知识: 今天学到了什么                                 │
│  ├── 失败模式: 出现了什么类型的失败、怎么修复                   │
│  ├── 用户偏好: 用户表现出什么习惯                             │
│  ├── 协议变更: DOM选择器或配置的变化                          │
│  └── 待办: 明天需要继续关注什么                               │
│                                                              │
│  保留: 最近30天                                              │
└─────────────────────────────────────────────────────────────┘
                              ↓ 每周日凌晨3点合并 (11:1压缩)
┌─────────────────────────────────────────────────────────────┐
│                      Layer 2: 核心层                         │
│  (Core Knowledge)                                            │
│  └── wiki/core/knowledge.md               (核心知识300字)   │
│                                                              │
│  淘汰机制:                                                    │
│  ├── 保留: 架构决策、反复验证的模式、稳定的用户偏好            │
│  └── 淘汰: 临时问题、一次性事件、已修复的bug                  │
│                                                              │
│  特性: 永久保留、最精炼、最高信息密度                          │
└─────────────────────────────────────────────────────────────┘
                              ↓ 在线注入
┌─────────────────────────────────────────────────────────────┐
│                     ContextBuilder                          │
│                                                              │
│  注入策略:                                                    │
│  ├── Layer 2 Core:        300字  (固定)                     │
│  ├── Layer 1 Recent(3d): 1500字 (最近3天)                    │
│  └── 总计:                ≤1800字 (固定上限)                 │
│                                                              │
│  效果: 无论运行多少天，注入量永远稳定                          │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. 工作区隔离设计

### 2.1 核心原则

**每个工作区拥有完全独立的记忆系统**，确保：
- PMCLI的工作记忆不影响DEVCLI
- 不同项目的知识不互相污染
- 可以独立进化、独立归档

### 2.2 目录结构

```
workspaces/
├── PMCLI/                          # PMCLI工作区
│   ├── wiki/                       # LLM Wiki根目录
│   │   ├── core/                   # Layer 2: 核心知识
│   │   │   └── knowledge.md        # 300字核心记忆
│   │   ├── daily/                  # Layer 1: 每日记忆
│   │   │   ├── 2026-04-25.md
│   │   │   ├── 2026-04-26.md
│   │   │   ├── 2026-04-27.md
│   │   │   └── 2026-04-28.md       # 最近30天保留
│   │   └── archive/                # Layer 0: 原始记录归档
│   │       └── 2026-04-20_to_2026-04-26.zip
│   └── runs/                       # 原始执行记录(Layer 0活跃区)
│       ├── 2026-04-28T10-00-00.md
│       └── ...
│
├── DEVCLI/                         # DEVCLI工作区
│   ├── wiki/                       # 完全独立的Wiki系统
│   │   ├── core/knowledge.md
│   │   ├── daily/
│   │   └── archive/
│   └── runs/
│
└── shared/                         # 可选: 跨工作区共享知识
    └── wiki/
        └── core/common-patterns.md
```

### 2.3 工作区配置

每个工作区通过 `.trae/rules/project_rules.md` 声明自己的记忆空间：

```yaml
# workspaces/PMCLI/.trae/rules/project_rules.md
---
wiki_config:
  workspace_id: "PMCLI"
  layer0_path: "./runs"                    # 原始记录路径
  layer1_path: "./wiki/daily"              # 每日记忆路径
  layer2_path: "./wiki/core/knowledge.md"  # 核心知识路径
  
  # 蒸馏配置
  distill_schedule: "0 2 * * *"           # 每天凌晨2点
  merge_schedule: "0 3 * * 0"             # 每周日凌晨3点
  
  # 注入配置
  context_builder:
    layer2_max_chars: 300
    layer1_days: 3
    layer1_max_chars: 1500
    total_max_chars: 1800
  
  # 淘汰策略
  retention:
    layer0_days: 7          # 原始记录保留7天
    layer1_days: 30         # 每日记忆保留30天
    layer2_max_items: 50    # 核心知识最多50条
---
```

---

## 3. Trae Skills集成方案

### 3.1 Skill: `wiki-distill`

**功能**: 执行每日记忆蒸馏（Layer 0 → Layer 1）

```typescript
// .trae/skills/wiki-distill/skill.ts
import { Skill } from '@trae/core';
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

export default class WikiDistillSkill implements Skill {
  name = 'wiki-distill';
  
  async execute(context: SkillContext) {
    const { workspacePath, date } = context.params;
    
    // 1. 读取Layer 0: 当天的原始记录
    const layer0Path = join(workspacePath, 'runs');
    const rawFiles = readdirSync(layer0Path)
      .filter(f => f.startsWith(date))
      .sort();
    
    // 2. 合并原始内容
    const rawContent = rawFiles.map(f => 
      readFileSync(join(layer0Path, f), 'utf-8')
    ).join('\n---\n');
    
    // 3. 调用AI进行五维度蒸馏
    const prompt = this.buildDistillPrompt(rawContent, date);
    const distilled = await context.llm.generate(prompt, {
      maxTokens: 800,  // 500字正文 + 格式
      temperature: 0.3
    });
    
    // 4. 写入Layer 1
    const layer1Path = join(workspacePath, 'wiki', 'daily', `${date}.md`);
    writeFileSync(layer1Path, distilled);
    
    return {
      success: true,
      outputPath: layer1Path,
      compressionRatio: rawContent.length / distilled.length
    };
  }
  
  private buildDistillPrompt(rawContent: string, date: string): string {
    return `## 角色
你是项目记忆蒸馏专家，负责将原始执行记录提炼为结构化知识。

## 任务
将以下 ${date} 的执行记录，按五维度提炼为500字以内的"今日记忆"。

## 原始记录
${rawContent.slice(0, 10000)}  // 截断防止token超限

## 输出格式 (Markdown)
# ${date} 今日记忆

## 新增知识
- (今天学到了什么关键知识)

## 失败模式
- (出现了什么类型的失败、怎么修复的)

## 用户偏好
- (用户表现出什么习惯、偏好)

## 协议变更
- (DOM选择器、配置的变化)

## 待办
- (明天需要继续关注什么)

## 要求
1. 只保留有价值的信息，删除一次性事件
2. 用项目内部术语，假设读者熟悉上下文
3. 总字数控制在500字以内
4. 用中文输出`;
  }
}
```

### 3.2 Skill: `wiki-merge`

**功能**: 执行核心知识合并（Layer 1 → Layer 2）

```typescript
// .trae/skills/wiki-merge/skill.ts
export default class WikiMergeSkill implements Skill {
  name = 'wiki-merge';
  
  async execute(context: SkillContext) {
    const { workspacePath, weekStart, weekEnd } = context.params;
    
    // 1. 读取本周7天的Layer 1
    const dailyPath = join(workspacePath, 'wiki', 'daily');
    const weekFiles = this.getWeekFiles(dailyPath, weekStart, weekEnd);
    
    // 2. 合并本周记忆
    const weekContent = weekFiles.map(f => 
      readFileSync(join(dailyPath, f), 'utf-8')
    ).join('\n---\n');
    
    // 3. 读取现有Layer 2
    const corePath = join(workspacePath, 'wiki', 'core', 'knowledge.md');
    const existingCore = existsSync(corePath) 
      ? readFileSync(corePath, 'utf-8') 
      : '';
    
    // 4. 调用AI进行合并与淘汰
    const prompt = this.buildMergePrompt(weekContent, existingCore);
    const merged = await context.llm.generate(prompt, {
      maxTokens: 600,
      temperature: 0.2
    });
    
    // 5. 写入Layer 2
    writeFileSync(corePath, merged);
    
    return {
      success: true,
      outputPath: corePath,
      itemsCount: this.extractItemsCount(merged)
    };
  }
  
  private buildMergePrompt(weekContent: string, existingCore: string): string {
    return `## 角色
你是项目知识策展人，负责维护最核心的项目知识。

## 任务
将本周的每日记忆与现有核心知识合并，输出300字以内的精炼版本。

## 本周记忆
${weekContent}

## 现有核心知识
${existingCore}

## 淘汰规则 (严格遵循)
1. 保留: 架构决策、反复验证的模式、稳定的用户偏好
2. 淘汰: 临时问题、一次性事件、已修复的bug、7天前的细节

## 输出格式 (Markdown)
# 项目核心知识 (更新时间: ${new Date().toISOString()})

## 架构决策
- (项目的核心架构选择和原因)

## 稳定模式
- (反复验证有效的处理模式)

## 用户偏好
- (长期稳定的用户习惯)

## 已知陷阱
- (需要永久避免的问题)

## 要求
1. 总字数控制在300字以内
2. 只保留"一个月后再看仍然有价值"的信息
3. 用中文输出`;
  }
}
```

### 3.3 Skill: `wiki-inject`

**功能**: 构建Prompt时注入记忆

```typescript
// .trae/skills/wiki-inject/skill.ts
export default class WikiInjectSkill implements Skill {
  name = 'wiki-inject';
  
  async execute(context: SkillContext) {
    const { workspacePath, currentTask } = context.params;
    const config = this.loadWikiConfig(workspacePath);
    
    // 1. 读取Layer 2 Core
    const corePath = join(workspacePath, config.layer2_path);
    const coreKnowledge = existsSync(corePath) 
      ? readFileSync(corePath, 'utf-8') 
      : '';
    
    // 2. 读取最近3天的Layer 1
    const dailyPath = join(workspacePath, config.layer1_path);
    const recentDaily = this.getRecentDaily(dailyPath, config.context_builder.layer1_days);
    
    // 3. 构建Context
    const contextBlock = this.buildContextBlock(coreKnowledge, recentDaily);
    
    return {
      context: contextBlock,
      stats: {
        coreChars: coreKnowledge.length,
        dailyChars: recentDaily.length,
        totalChars: contextBlock.length
      }
    };
  }
  
  private buildContextBlock(core: string, daily: string[]): string {
    return `## 项目背景知识 (自动注入)

### 核心知识 (长期有效)
${core}

### 最近动态 (最近3天)
${daily.join('\n---\n')}

---
现在请基于以上背景知识，处理当前任务。
`;
  }
}
```

---

## 4. 项目规则Rules实现

### 4.1 自动蒸馏规则

```yaml
# .trae/rules/wiki-auto-distill.md
---
name: wiki-auto-distill
trigger: schedule
cron: "0 2 * * *"  # 每天凌晨2点
action: skill
skill: wiki-distill
params:
  workspacePath: "${workspace.root}"
  date: "${date.yyyy-mm-dd}"
---
```

### 4.2 自动合并规则

```yaml
# .trae/rules/wiki-auto-merge.md
---
name: wiki-auto-merge
trigger: schedule
cron: "0 3 * * 0"  # 每周日凌晨3点
action: skill
skill: wiki-merge
params:
  workspacePath: "${workspace.root}"
  weekStart: "${date.weekStart}"
  weekEnd: "${date.weekEnd}"
---
```

### 4.3 上下文注入规则

```yaml
# .trae/rules/wiki-context-inject.md
---
name: wiki-context-inject
trigger: before_prompt  # 每次发送prompt前
action: skill
skill: wiki-inject
params:
  workspacePath: "${workspace.root}"
  
# 注入位置控制
inject_position: "system"  # system / user / prefix
inject_template: |
  ## 项目背景知识
  
  {{context}}
  
  当前任务: {{user_prompt}}
---
```

### 4.4 记忆查询规则

```yaml
# .trae/rules/wiki-query.md
---
name: wiki-query
trigger: command
command: "/wiki query <keywords>"
action: skill
skill: wiki-query

# 示例用法:
# /wiki query 终端卡死    → 查询相关知识
# /wiki query 选择器变更   → 查询协议变更
# /wiki query 用户偏好     → 查询用户习惯
---
```

---

## 5. 核心数据流

### 5.1 每日进化流程

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  凌晨2:00   │────▶│  读取runs/  │────▶│  AI蒸馏     │
│  定时触发   │     │  原始记录   │     │  五维度提炼 │
└─────────────┘     └─────────────┘     └──────┬──────┘
                                                │
                                                ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Context    │◀────│  写入wiki/  │◀────│  生成500字  │
│  Builder    │     │  daily/     │     │  今日记忆   │
└─────────────┘     └─────────────┘     └─────────────┘
```

### 5.2 每周进化流程

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  周日凌晨   │────▶│  读取7天    │────▶│  AI合并     │
│  3:00触发   │     │  daily/     │     │  淘汰筛选   │
└─────────────┘     └─────────────┘     └──────┬──────┘
                                                │
                                                ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  次日任务   │◀────│  写入wiki/  │◀────│  生成300字  │
│  自动注入   │     │  core/      │     │  核心知识   │
└─────────────┘     └─────────────┘     └─────────────┘
```

### 5.3 在线注入流程

```
用户发送Prompt
      │
      ▼
┌─────────────┐
│ Context     │
│ Builder     │
│ 1. 读取core │
│ 2. 读取daily│
│ 3. 合并注入 │
└──────┬──────┘
       │
       ▼
[系统消息] + [背景知识1800字] + [用户Prompt]
       │
       ▼
    LLM处理
```

---

## 6. 效果度量

### 6.1 核心指标

| 指标 | 目标 | 说明 |
|------|------|------|
| Layer0→Layer1压缩比 | ≥20:1 | 原始记录到每日记忆 |
| Layer1→Layer2压缩比 | ≥10:1 | 每日记忆到核心知识 |
| 提示词稳定性 | ≤2000字 | 无论运行多少天 |
| 信息密度增长率 | 单调递增 | 第30天 > 第1天 |
| 蒸馏自动化率 | 100% | 零人工干预 |

### 6.2 30天演进示例

```
天数    Layer0      Layer1      Layer2      注入量      信息密度
─────────────────────────────────────────────────────────────────
Day 1   8,000字    500字       200字       700字       基准
Day 7   56,000字   3,500字     400字       1,900字     2.7x
Day 14  112,000字  7,000字     450字       1,950字     2.8x
Day 30  240,000字  15,000字    300字       1,800字     2.6x
─────────────────────────────────────────────────────────────────
趋势    线性增长    线性增长    收敛稳定    固定上限    先增后稳
```

---

## 7. 实施路线图

### Phase 1: 基础设施 (Week 1)
- [ ] 创建工作区目录结构
- [ ] 实现Layer 0记录规范
- [ ] 部署Skills: wiki-distill, wiki-merge, wiki-inject

### Phase 2: 自动化 (Week 2)
- [ ] 配置自动蒸馏规则 (每日2:00)
- [ ] 配置自动合并规则 (每周日3:00)
- [ ] 配置上下文注入规则

### Phase 3: 验证 (Week 3)
- [ ] 跑通7天蒸馏周期
- [ ] 验证压缩比达标
- [ ] 验证提示词稳定性

### Phase 4: 优化 (Week 4)
- [ ] 调整五维度权重
- [ ] 优化淘汰策略
- [ ] 文档化最佳实践

---

## 8. 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 蒸馏质量不稳定 | 记忆价值下降 | 固定五维度模板 + temperature=0.3 |
| 核心知识过度淘汰 | 丢失重要信息 | 设置"重要"标记保护机制 |
| 工作区记忆污染 | 知识交叉影响 | 严格的目录隔离 + 独立的skill实例 |
| 存储无限增长 | 磁盘耗尽 | Layer 0自动归档 + Layer 1 30天保留 |

---

## 9. 评审要点

请评审以下设计决策：

1. **三层压缩比设置** (24:1 → 11:1) 是否合理？
2. **工作区完全隔离** vs **允许共享common知识** 的选择？
3. **五维度提炼** 是否覆盖所有关键信息类型？
4. **Trae Skills + Rules** 的实现方式是否最优？
5. **1800字注入上限** 对你们的场景是否合适？

---

**文档版本**: v1.0  
**作者**: AI Architect  
**评审状态**: 待评审
