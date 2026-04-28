# LLM Wiki 自进化记忆系统架构设计 v2.0

**版本**: v2.0  
**日期**: 2026-04-28  
**状态**: 评审后更新  
**更新依据**: 
- `docs/TabAI会话_1777366382935.md`
- `docs/TabAI会话_1777366637181.md`

---

## 1. 架构概述（更新）

### 1.1 核心变更摘要

| 变更项 | v1.0 | v2.0 | 原因 |
|--------|------|------|------|
| **蒸馏时间** | 凌晨2点 | **凌晨4点** + 任务锁检测 | 避开长任务执行时段 |
| **压缩比** | 固定500字 | **动态上限**（200/400/500字） | 避免低执行量时的信息稀释 |
| **提炼维度** | 五维度 | **六维度**（新增性能基线） | 捕获性能异常信号 |
| **待办处理** | 在Layer 1中 | **独立文件** `wiki/todo.md` | 跨日状态不丢失 |
| **共享知识** | 未明确 | **shared目录** + 晋升机制 | 避免重复学习，版本统一 |
| **注入上限** | 固定1800字 | **相对比例15%** | 适配不同模型上下文窗口 |
| **LLM依赖** | Trae IDE | **独立API调用** | 定时任务不依赖IDE状态 |
| **ContextBuilder** | 同步读文件 | **内存缓存** + 文件监听 | 高频场景零I/O延迟 |

### 1.2 三层蒸馏架构（更新）

```
┌─────────────────────────────────────────────────────────────┐
│                      Layer 0: 原始层                         │
│  (Raw Records)                                               │
│  ├── runs/20260428/2026-04-28T10-00-00.md   (执行记录)      │
│  ├── runs/20260428/2026-04-28T11-30-00.md   (错误日志)      │
│  └── lark/messages/20260428.json            (飞书对话)      │
│                                                              │
│  保留: 7天后自动打包归档到 archive/YYYYMMDD.zip              │
└─────────────────────────────────────────────────────────────┘
                              ↓ 每日凌晨4点自动蒸馏（动态压缩）
┌─────────────────────────────────────────────────────────────┐
│                      Layer 1: 蒸馏层                         │
│  (Daily Memory)                                              │
│  └── wiki/daily/20260428.md                                │
│                                                              │
│  动态字数上限:                                                │
│  ├── 原始 < 3000字    → 上限200字                            │
│  ├── 原始 3000-10000字 → 上限400字                           │
│  └── 原始 > 10000字   → 上限500字                            │
│                                                              │
│  六维度提炼:                                                  │
│  ├── 新增知识: 今天学到了什么                                 │
│  ├── 失败模式: 出现了什么类型的失败、怎么修复                   │
│  ├── 用户偏好: 用户表现出什么习惯                             │
│  ├── 协议变更: DOM选择器或配置的变化                          │
│  ├── 性能基线: 关键指标均值与历史偏差（新增）                  │
│  └── [待办已移出，见 wiki/todo.md]                            │
│                                                              │
│  保留: 最近30天                                              │
└─────────────────────────────────────────────────────────────┘
                              ↓ 每周日凌晨3点合并（11:1压缩）
┌─────────────────────────────────────────────────────────────┐
│                      Layer 2: 核心层                         │
│  (Core Knowledge)                                            │
│  └── wiki/core/knowledge.md                                 │
│                                                              │
│  硬上限: 300字（超出时强制淘汰优先级最低条目）                 │
│                                                              │
│  淘汰机制:                                                    │
│  ├── 保留: 架构决策、反复验证的模式、稳定的用户偏好            │
│  └── 淘汰: 临时问题、一次性事件、已修复的bug                  │
│                                                              │
│  特性: 永久保留、最精炼、最高信息密度                          │
└─────────────────────────────────────────────────────────────┘
                              ↓ 在线注入（内存缓存）
┌─────────────────────────────────────────────────────────────┐
│                     ContextBuilder                          │
│                                                              │
│  注入策略（优先级: 私有L2 > shared > 私有L1）:                │
│  ├── 私有 Layer 2 Core:    ≤300字  (固定)                   │
│  ├── shared Core:          ≤200字  (兜底补充)               │
│  └── 私有 Layer 1 Recent:  动态计算 (总占比≤15%)             │
│                                                              │
│  效果: 根据模型上下文窗口自动调整，32K模型可注入4800字         │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. 工作区隔离与共享（更新）

### 2.1 完整目录结构

```
workspaces/
├── PMCLI/                          # PMCLI工作区
│   ├── wiki/
│   │   ├── core/
│   │   │   └── knowledge.md        # 私有核心知识（最高优先级）
│   │   ├── daily/                  # 每日记忆
│   │   │   ├── 20260425.md
│   │   │   ├── 20260426.md
│   │   │   └── 20260428.md
│   │   ├── todo.md                 # 待办清单（跨日状态）
│   │   └── archive/                # 原始记录归档
│   │       └── 20260420_20260426.zip
│   └── runs/                       # 原始执行记录
│       └── 20260428/
│           └── 2026-04-28T10-00-00.md
│
├── DEVCLI/                         # DEVCLI工作区（同上结构）
│   ├── wiki/
│   │   ├── core/knowledge.md
│   │   ├── daily/
│   │   ├── todo.md
│   │   └── archive/
│   └── runs/
│
└── shared/                         # 共享知识层
    └── wiki/
        ├── core/
        │   └── common-patterns.md  # 跨工作区通用知识
        └── promotion/              # 晋升候选池
            └── candidates.md       # 待晋升的知识条目
```

### 2.2 共享知识晋升机制

**晋升条件**（必须同时满足）:
1. 在**两个或以上工作区**的 Layer 2 里同时出现相同模式
2. 持续超过**两个合并周期**（即两周）
3. 或由 `wiki-promote` 命令**手动触发**

**晋升流程**:
```
Week 1: PMCLI Layer 2 记录 "CDP选择器v2.1"
Week 1: DEVCLI Layer 2 记录 "CDP选择器v2.1"
Week 2: 模式持续存在
Week 3: 自动触发晋升检查
       ↓
    [wiki-promote skill]
       ↓
   写入 shared/wiki/core/common-patterns.md
       ↓
   标记为 [已晋升]
```

**更新规则**:
- shared层**不走自动蒸馏**
- 只能由人工确认或显式命令触发更新
- 避免一个工作区的错误记忆自动污染全局

### 2.3 知识优先级规则

当知识冲突时的决策顺序:

```
优先级（从高到低）:
1. 私有 Layer 2 Core     ← 工作区自己的核心知识
2. shared Core           ← 跨工作区通用知识  
3. 私有 Layer 1 Recent   ← 最近3天的每日记忆
4. 模型训练知识          ← 基础常识
```

**冲突示例处理**:
```
场景: 
- shared: "删除弹窗选择器 = .icd-delete-files-command-card-v2-actions-delete"
- PMCLI私有: "PMCLI场景下该弹窗不出现（保守策略）"

决策: 优先使用PMCLI私有知识（第1优先级）
结果: AI在PMCLI场景下知道不触发删除操作
```

---

## 3. 六维度提炼（更新）

### 3.1 新维度定义

| 维度 | 说明 | 示例 |
|------|------|------|
| **新增知识** | 今天学到了什么关键知识 | "发现CDP v2.1选择器更稳定" |
| **失败模式** | 出现了什么类型的失败、怎么修复 | "终端卡死→点击后台运行恢复" |
| **用户偏好** | 用户表现出什么习惯 | "用户喜欢简洁的回答" |
| **协议变更** | DOM选择器或配置的变化 | "选择器从v2.0升级到v2.1" |
| **性能基线** | 关键指标均值与历史偏差（新增） | "waitResponse: 28s→35s (+25%)" |
| **待办** | ~~已移出，见 wiki/todo.md~~ | ~~"明天验证新选择器"~~ |

### 3.2 性能基线维度详解

```typescript
// 记录的性能指标
interface PerformanceBaseline {
  metrics: {
    switchTask: { avg: number; peak: number; baseline: number; deviation: string };
    fillPrompt: { avg: number; peak: number; baseline: number; deviation: string };
    waitResponse: { avg: number; peak: number; baseline: number; deviation: string };
    total: { avg: number; peak: number; baseline: number; deviation: string };
  };
  alert: boolean;  // 是否有显著异常（偏差>20%）
}

// Layer 1 输出示例
## 性能基线
- switchTask: 150ms avg, 200ms peak (+5% vs baseline)
- waitResponse: 35s avg, 45s peak (+25% vs baseline) ⚠️
- 告警: waitResponse显著变慢，需关注
```

### 3.3 待办独立文件

```markdown
<!-- wiki/todo.md -->
# 待办清单

## 活跃待办（未处理）
- [ ] 2026-04-28: 验证新CDP选择器稳定性（来源: PMCLI Layer 1）
- [ ] 2026-04-27: 优化终端卡死恢复逻辑（来源: DEVCLI Layer 1）

## 已完成
- [x] 2026-04-26: 更新飞书Bot配置（完成于 2026-04-27）

## 已过期（>7天未处理）
- [abandoned] 2026-04-20: 调研新模型API（已过期，自动归档）
```

**更新机制**:
- 每日蒸馏时，从Layer 1提取待办事项，追加到wiki/todo.md
- Layer 2合并时，检查是否有超过7天未处理的待办，标记为[abandoned]
- 支持 `wiki-todo` 命令增删改查

---

## 4. 蒸馏调度（更新）

### 4.1 调度时间

```yaml
# wiki_config.yaml
distill_schedule: "0 4 * * *"      # 凌晨4点（避开长任务时段）
merge_schedule: "0 3 * * 0"        # 每周日凌晨3点

task_lock:
  check_recent_files_minutes: 10   # 检查最近10分钟内修改的文件
  retry_delay_minutes: 15          # 延迟15分钟重试
  max_retries: 3                   # 最多重试3次
```

### 4.2 任务锁检测逻辑

```typescript
// wiki-distill.ts
async function runDistillWithLockCheck(): Promise<void> {
  const workspacePath = getWorkspacePath();
  const runsDir = join(workspacePath, 'runs', getDateString());
  
  // 检查是否有最近10分钟内修改的文件
  const recentFiles = await findRecentlyModifiedFiles(runsDir, 10);
  
  if (recentFiles.length > 0) {
    log('检测到活跃任务，延迟蒸馏...', { recentFiles });
    
    // 延迟15分钟重试，最多3次
    for (let retry = 1; retry <= 3; retry++) {
      await sleep(15 * 60 * 1000);  // 15分钟
      
      const stillRecent = await findRecentlyModifiedFiles(runsDir, 10);
      if (stillRecent.length === 0) {
        log('任务已结束，开始蒸馏');
        break;
      }
      
      if (retry === 3) {
        log('重试次数耗尽，标记为pending');
        await markAsPending(workspacePath);
        return;
      }
    }
  }
  
  // 执行蒸馏
  await runDistill();
}
```

---

## 5. 蒸馏失败处理策略（三级）

### 5.1 第一级：蒸馏服务不可用

**场景**: LLM API不可用、网络中断

**处理**:
```typescript
// 标记为pending，次日合并处理
await fs.writeFile(
  'wiki/pending/2026-04-28.flag',
  JSON.stringify({ reason: 'service_unavailable', timestamp: Date.now() })
);

// 次日处理：合并昨天和今天的记录
// 生成: wiki/daily/2026-04-28_2026-04-29.md
```

### 5.2 第二级：蒸馏质量差

**判定标准**（满足任一）:
- 输出字数 < 50字
- 缺少六维度中的四个以上
- 格式崩坏（无法解析JSON）

**处理**: 降级为"原始摘要模式"
```typescript
// 直接截取当天所有runs文件的Prompt行
const fallbackContent = rawFiles
  .map(f => f.split('\n')[0])  // 取第一行（Prompt）
  .join('\n---\n');

// 保存为低质量版本
await fs.writeFile(
  'wiki/daily/2026-04-28.md',
  `# 2026-04-28 今日记忆 [低质量]\n\n${fallbackContent}`
);
```

### 5.3 第三级：连续3天失败

**触发**: 连续3天都出现第一级或第二级失败

**处理**:
```typescript
// 发送飞书告警
await larkBot.sendAlert({
  title: 'LLM Wiki蒸馏连续失败',
  content: '已连续3天无法正常蒸馏，请人工介入检查',
  pendingFiles: await fs.readdir('wiki/pending'),
});
```

---

## 6. ContextBuilder（更新）

### 6.1 内存缓存机制

```typescript
// context-builder.ts
class ContextBuilder {
  private cache = {
    layer2Core: null as string | null,      // 进程启动时加载
    layer2CoreLoadedAt: 0,
    layer1Recent: [] as string[],           // 最近3天
    layer1LoadedAt: 0,
    sharedCore: null as string | null,      // shared层
  };

  constructor(private workspacePath: string) {
    // 进程启动时预加载Layer 2
    this.loadLayer2Core();
    this.loadSharedCore();
    
    // 设置每日刷新定时器
    this.scheduleDailyRefresh();
  }

  async buildContext(): Promise<string> {
    // 内存读取，零I/O延迟
    const parts = [
      this.cache.layer2Core,      // 私有核心
      this.cache.sharedCore,      // 共享知识
      this.cache.layer1Recent.join('\n---\n'),  // 最近记忆
    ].filter(Boolean);

    return parts.join('\n\n');
  }

  private loadLayer2Core(): void {
    const file = join(this.workspacePath, 'wiki/core/knowledge.md');
    this.cache.layer2Core = fs.readFileSync(file, 'utf-8');
    this.cache.layer2CoreLoadedAt = Date.now();
  }

  private scheduleDailyRefresh(): void {
    // 每天00:00刷新缓存
    setInterval(() => {
      const now = new Date();
      if (now.getHours() === 0 && now.getMinutes() === 0) {
        this.loadLayer2Core();
        this.loadLayer1Recent();
      }
    }, 60 * 1000);  // 每分钟检查
  }
}
```

### 6.2 相对比例注入

```yaml
# wiki_config.yaml
context_injection:
  max_context_ratio: 0.15      # 最多占上下文窗口的15%
  layer2_max_chars: 300        # Layer 2 固定300字
  shared_max_chars: 200        # shared 固定200字
  layer1_days: 3               # 最近3天
  
# 动态计算示例:
# 32K模型: 32000 * 0.15 = 4800字上限
#   - Layer 2: 300字
#   - shared: 200字  
#   - Layer 1: 4300字（约最近3天全部）
#
# 8K模型: 8000 * 0.15 = 1200字上限
#   - Layer 2: 300字
#   - shared: 200字
#   - Layer 1: 700字（需截断）
```

---

## 7. Trae选项卡执行蒸馏

### 7.1 设计原则

当前版本**不引入独立API**，而是利用Trae IDE的AI能力执行蒸馏：

- 在Trae中创建专门的 **"Wiki任务"** 选项卡
- 通过CDP控制该选项卡执行蒸馏prompt
- 复用现有的`fillPrompt` + `waitResponse`机制
- 与主任务执行完全隔离，避免互相干扰

### 7.2 Wiki任务选项卡架构

```
┌─────────────────────────────────────────────────────────────────┐
│                     Trae IDE                                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ PMCLI任务    │  │ DEVCLI任务   │  │ Wiki蒸馏任务(专用)   │  │
│  │  Slot 0      │  │  Slot 1      │  │  Slot 2 (或独立窗口) │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
│         ↑                                   ↑                   │
│         │                                   │                   │
│    飞书消息触发                     定时任务触发(凌晨4点)        │
│    (高优先级)                       (后台低优先级)               │
└─────────────────────────────────────────────────────────────────┘
```

### 7.3 蒸馏执行流程

```typescript
// wiki-distill.ts
// 通过CDP控制Wiki专用选项卡执行蒸馏

async function distillWithTrae(
  rawContent: string, 
  targetDate: string
): Promise<string> {
  // 1. 切换到Wiki专用选项卡（或创建新窗口）
  await switchToWikiSlot(cdp);
  
  // 2. 构建蒸馏prompt
  const prompt = buildDistillPrompt(rawContent, targetDate);
  
  // 3. 使用现有机制提交（复用fillPrompt + waitResponse）
  await fillPrompt(cdp, prompt);
  await submit(cdp);
  
  // 4. 等待响应（使用更长的超时，蒸馏是后台任务）
  const response = await waitResponse(cdp, {
    timeoutMs: 600_000,  // 10分钟，蒸馏可能较慢
    taskName: 'WikiDistill',
    logger,  // 记录心跳
  });
  
  // 5. 解析并保存到Layer 1
  const distilled = parseDistillOutput(response);
  await saveToLayer1(targetDate, distilled);
  
  return distilled;
}
```

### 7.4 配置选项

```yaml
# wiki_config.yaml
distill:
  # 使用Trae选项卡执行，非独立API
  mode: trae_slot        # 选项: trae_slot | trae_window
  slot_index: 2          # Wiki专用slot编号（避开PMCLI/DEVCLI）
  timeout_ms: 600000     # 蒸馏任务超时：10分钟
  
  # 定时调度
  schedule: "0 4 * * *"  # 凌晨4点
  retry_delay_min: 15    # 失败重试间隔
  max_retries: 3         # 最大重试次数
  
  # 质量检查
  min_output_length: 50  # 最小输出字数
  required_dimensions: 4 # 最少需要包含的维度数
```

### 7.5 与主任务的隔离机制

| 维度 | 主任务 (PMCLI/DEVCLI) | Wiki蒸馏任务 |
|------|----------------------|--------------|
| **触发方式** | 飞书消息（外部触发） | 定时任务（内部触发） |
| **优先级** | 高（立即响应） | 低（后台运行） |
| **Slot** | Slot 0/1 | Slot 2（独立） |
| **超时** | 5分钟 | 10分钟 |
| **失败处理** | 立即报错 | 标记pending，次日重试 |
| **用户可见** | 是（回复飞书） | 否（仅记录日志） |

### 7.6 失败降级策略

当Trae选项卡不可用时（如IDE关闭）：

```typescript
// 检测Trae状态
const isTraeAvailable = await checkTraeStatus(cdp);

if (!isTraeAvailable) {
  log('Trae不可用，标记为pending');
  await markAsPending(targetDate);
  
  // 发送通知（可选）
  await sendNotification({
    type: 'distill_pending',
    message: `Wiki蒸馏任务${targetDate}已标记为pending，待Trae恢复后自动执行`,
  });
  
  return;
}

// 次日重试时合并处理
// 生成: wiki/daily/2026-04-28_2026-04-29.md
```

---

## 8. 实施路线图（更新）

### Phase 1: 基础设施 (Week 1-2)
- [x] 创建目录结构（已完成）
- [ ] 实现文件日志系统（T+1）
- [ ] 实现内存缓存ContextBuilder（T+3）
- [ ] 配置Trae选项卡（Slot 2或独立窗口）（T+5）

### Phase 2: 核心Skills (Week 3-4)  
- [ ] **wiki-distill skill**（T+7，预留Prompt调优时间）
  - 在T+5先手动跑一轮，评估输出质量
  - 根据评估调整六维度描述粒度
- [ ] **wiki-merge skill**（T+9）
- [ ] **wiki-inject skill**（T+10）
- [ ] **wiki-promote skill**（共享知识晋升）（T+11）

### Phase 3: 自动化 (Week 5)
- [ ] 配置自动蒸馏规则（凌晨4点+任务锁）
- [ ] 配置自动合并规则（每周日3点）
- [ ] 配置失败告警（连续3天失败）

### Phase 4: 飞书集成 (Week 6)
- [ ] 飞书Bot查询接口（"上次/上周/之前"关键词识别）
- [ ] 待办管理命令（`/wiki todo`）
- [ ] 晋升触发命令（`/wiki promote`）

### Phase 5: 优化 (Week 7-8)
- [ ] 7天试运行并验证压缩比
- [ ] 监控Layer 2质量，调整硬上限
- [ ] 评估是否需要Web Dashboard

---

## 9. 评审问题回复

### 回复问题1: 蒸馏调度时机
**决策**: 采用凌晨4点 + 任务锁检测（选项C）
- 避开大多数长任务执行时段
- 任务锁检测覆盖冲突场景

### 回复问题2: 多工作区共享知识
**决策**: 增加shared/目录 + 严格晋升门槛（选项B）
- 晋升条件: 2+工作区 × 2+周持续
- 优先级: 私有L2 > shared > 私有L1

### 回复问题3: 记忆查询接口
**决策**: 现阶段命令行（选项A），Phase 2实现飞书Bot查询
- 关键词识别: "上次/上周/之前/历史"
- Web Dashboard推迟到Phase 4评估

### 回复问题4: 压缩比
**修正**: 动态字数上限替代固定500字
- <3000字 → 200字上限
- 3000-10000字 → 400字上限
- >10000字 → 500字上限

### 回复问题5: 五维度
**修正**: 六维度（增加性能基线），待办移出到独立文件

### 回复问题4: 蒸馏失败处理
**修正**: 三级处理策略（服务不可用→质量差→连续3天失败）

### 回复问题5: LLM执行方式
**决策**: 使用Trae选项卡执行蒸馏（非独立API）
- 创建Wiki专用选项卡（Slot 2或独立窗口）
- 复用现有`fillPrompt` + `waitResponse`机制
- 与主任务完全隔离，避免干扰

---

## 10. 评审结论签署

**结论**: ✅ **有条件通过**

**Phase 1启动前必须完成**:
1. ✅ 确认Trae选项卡配置方案（Slot 2或独立窗口）
2. ✅ 把待办维度从Layer 1移出，改为独立`wiki/todo.md`
3. ✅ 补充蒸馏失败的三级处理策略（本文档第5节）

**优先级排序**:
1. 🔴 最高: Trae选项卡配置 + 隔离机制（影响自动化闭环）
2. 🟡 高: Layer 2硬上限约束 + 待办独立文件（影响内容质量）
3. 🟢 中: ContextBuilder内存缓存（影响性能，可延后）

---

**文档版本**: v2.0  
**更新日期**: 2026-04-28  
**评审状态**: 已根据两份评审意见更新，待最终确认
