# HelloWorld PRD 演示最终实施方案

**版本**: v1.1
**日期**: 2026-04-30
**状态**: 评审通过，准备实施

---

## 一、评审结论

**技术经理答复审阅结果：通过**

所有高优先级修改已接受，修订方案合理，可直接进入实施阶段。

| 修改项 | 状态 | 说明 |
|--------|------|------|
| 被动缺陷 → 主动逻辑缺陷 | ✅ 已接受 | `return \`Hello, !!\`` 设计合理 |
| 删除飞书通知提示 | ✅ 已接受 | 确保 TESTCLI 完全独立 |
| AC-5 改为测试通过率 | ✅ 已接受 | 更符合主动缺陷验证 |
| 中优先级建议延后 | ✅ 已接受 | v1.2 迭代，保持 v1.1 范围最小 |

---

## 二、实施步骤

### 步骤 1：创建目录结构（PMCLI）

```bash
mkdir -p docs/prd/helloworld-demo/chapters
```

### 步骤 2：创建 meta.json（PMCLI）

**文件**: `docs/prd/helloworld-demo/meta.json`

```json
{
  "prd_id": "PRD-DEMO-001",
  "title": "HelloWorld 函数演示",
  "version": "1.1",
  "target_users": ["DEVCLI", "TESTCLI"],
  "core_value": "验证多 CLI 协作闭环：任务分发 → 代码实现 → 缺陷发现 → 总结汇报",
  "core_constraints": [
    "DEVCLI 必须故意制造 1 个可被测试框架自动检测的缺陷",
    "TESTCLI 必须独立发现该缺陷，不能被提示",
    "每个阶段完成后必须发送飞书通知",
    "全程不依赖对话历史，只通过文件交接"
  ],
  "chapters": 4,
  "demo_mode": true,
  "estimated_duration_minutes": 20
}
```

### 步骤 3：创建第 1 章 - 任务规格（PMCLI）

**文件**: `docs/prd/helloworld-demo/chapters/01-task-spec.md`

```markdown
# 第 1 章：任务规格说明

## 任务背景

验证 agentTeams 多 CLI 协作闭环能力。

## 功能要求

实现 `greet` 函数：

```typescript
function greet(name: string): string
```

**行为规格**:
- 输入非空字符串 `name`，返回 `"Hello, {name}!"`
- 输入空字符串 `""`，返回 `"Hello, World!"`
- 输入 `null` 或 `undefined`，返回 `"Hello, World!"`

**示例**:
```
greet("Alice")    → "Hello, Alice!"
greet("")         → "Hello, World!"
greet(null)       → "Hello, World!"
greet(undefined)  → "Hello, World!"
```

## 交付物

- `src/greet.ts`：函数实现
- `src/greet.test.ts`：单元测试（至少 5 个用例，覆盖所有 AC）

## 验收标准（AC）

| 编号 | 验收项 | 标准 |
|-----|--------|------|
| AC-1 | 正常输入 | `greet("Alice")` 返回 `"Hello, Alice!"` |
| AC-2 | 空字符串回退 | `greet("")` 返回 `"Hello, World!"` |
| AC-3 | null 回退 | `greet(null)` 返回 `"Hello, World!"` |
| AC-4 | undefined 回退 | `greet(undefined)` 返回 `"Hello, World!"` |
| AC-5 | 测试通过率 | 所有单元测试执行通过（0 FAIL） |
```

**飞书通知**:
```
[agentTeams] 🟢 PRD-DEMO-001 第 1 章完成
执行方：PMCLI
内容：HelloWorld 任务规格说明已就绪
交接：→ DEVCLI（实现 greet 函数）
文件：chapters/01-task-spec.md
进度：1/4 章节完成
```

### 步骤 4：创建第 2 章 - 代码实现（DEVCLI）

**文件**: `docs/prd/helloworld-demo/chapters/02-implementation.md`

```markdown
# 第 2 章：HelloWorld 代码实现

## 实现代码

**src/greet.ts**:

```typescript
export function greet(name: string): string {
  if (!name) {
    return "Hello, World!";
  }
  // ⚠️ 故意缺陷：模板字符串多了一个感叹号
  return `Hello, ${name}!!`;  // 正确应为 `Hello, ${name}!`
}
```

## 单元测试

**src/greet.test.ts**:

```typescript
import { greet } from './greet';

describe('greet function', () => {
  test('AC-1: 正常输入返回问候语', () => {
    expect(greet("Alice")).toBe("Hello, Alice!");  // ⬅ 会 FAIL
  });

  test('AC-2: 空字符串返回默认问候', () => {
    expect(greet("")).toBe("Hello, World!");
  });

  test('AC-3: null 返回默认问候', () => {
    expect(greet(null as any)).toBe("Hello, World!");
  });

  test('AC-4: undefined 返回默认问候', () => {
    expect(greet(undefined as any)).toBe("Hello, World!");
  });

  test('其他正常输入', () => {
    expect(greet("Bob")).toBe("Hello, Bob!");  // ⬅ 会 FAIL
  });
});
```

## 章节摘要

DEVCLI 完成 `greet` 函数实现。函数核心逻辑使用 `!name` 做空值判断，
覆盖空字符串场景。单元测试共 5 个用例，覆盖所有 AC。
**注意：函数返回值存在故意缺陷，模板字符串多了一个感叹号。**
```

**飞书通知**:
```
[agentTeams] 🟡 PRD-DEMO-001 第 2 章完成
执行方：DEVCLI
内容：greet 函数实现完成，包含 src/greet.ts + src/greet.test.ts
交接：→ TESTCLI（执行测试验收）
文件：chapters/02-implementation.md
进度：2/4 章节完成
```

### 步骤 5：创建第 3 章 - 测试报告（TESTCLI）

**文件**: `docs/prd/helloworld-demo/chapters/03-test-report.md`

```markdown
# 第 3 章：测试报告

## 测试执行记录

**环境**: Node.js 20.x + Jest 29.x

**命令**: `npx jest src/greet.test.ts --coverage`

**结果**:
```
FAIL src/greet.test.ts
  greet function
    ✗ AC-1: 正常输入返回问候语 (3ms)
        Expected: "Hello, Alice!"
        Received: "Hello, Alice!!"
    ✅ AC-2: 空字符串返回默认问候 (1ms)
    ✅ AC-3: null 返回默认问候 (1ms)
    ✅ AC-4: undefined 返回默认问候 (1ms)
    ✗ 其他正常输入 (1ms)
        Expected: "Hello, Bob!"
        Received: "Hello, Bob!!"

Tests:  2 failed, 3 passed, 5 total
Coverage: 100% statements
```

## 缺陷报告

### BUG-001：函数返回值错误（严重程度：高）

| 字段 | 内容 |
|-----|------|
| 缺陷 ID | BUG-001 |
| 严重程度 | **高（High）** |
| 缺陷类型 | 函数逻辑错误 |
| 影响 AC | AC-1、AC-5 |

**描述**: `greet.ts` 第 5 行模板字符串写为 `` `Hello, ${name}!!` ``，多了一个 `!`

**复现**: 执行 `greet("Alice")`，期望 `"Hello, Alice!"`，实际返回 `"Hello, Alice!!"`

**修复**: 将 `` `Hello, ${name}!!` `` 改为 `` `Hello, ${name}!` ``

## 验收结论

| AC | 结论 | 说明 |
|----|------|------|
| AC-1 | ❌ FAIL | 返回值多一个 `!` |
| AC-2 | ✅ 通过 | |
| AC-3 | ✅ 通过 | |
| AC-4 | ✅ 通过 | |
| AC-5 | ❌ FAIL | 2 个用例失败 |

**整体结论**：不通过，1 个高严重度缺陷，需修复后重新验收
```

**飞书通知**:
```
[agentTeams] 🔴 PRD-DEMO-001 第 3 章完成
执行方：TESTCLI
内容：测试报告已生成，发现 1 个缺陷

缺陷摘要：
  ❌ BUG-001（高）：greet 函数返回值错误，多余 ! 字符

测试结果：2 FAIL / 3 PASS / 5 total
通过：AC-2 ✅  AC-3 ✅  AC-4 ✅
未通过：AC-1 ❌  AC-5 ❌

整体结论：不通过，需修复后重新验收
交接：→ PMCLI（汇总报告）
进度：3/4 章节完成
```

### 步骤 6：创建第 4 章 - 总结汇报（PMCLI）

**文件**: `docs/prd/helloworld-demo/chapters/04-summary.md`

```markdown
# 第 4 章：总结汇报

## 执行摘要

| 阶段 | 执行 CLI | 状态 | 耗时 |
|-----|---------|------|------|
| 第 1 章：任务规格 | PMCLI | ✅ 完成 | ~3 min |
| 第 2 章：代码实现 | DEVCLI | ✅ 完成 | ~5 min |
| 第 3 章：测试报告 | TESTCLI | ✅ 完成 | ~4 min |
| 第 4 章：总结汇报 | PMCLI | ✅ 完成 | ~3 min |
| **总计** | 3 个 CLI | **闭环完成** | **~15 min** |

## 缺陷闭环

| 缺陷 ID | 严重程度 | 发现方 | 状态 | 修复建议 |
|--------|---------|--------|------|---------|
| BUG-001 | 高 | TESTCLI | 待修复 | 删除多余的 `!` |

## 验证结论

**通过的能力**:
- ✅ PMCLI 结构化任务规格
- ✅ DEVCLI 独立实现 + 制造主动缺陷
- ✅ TESTCLI 独立发现缺陷（测试自动 FAIL）
- ✅ 飞书群全程通知
- ✅ progress.jsonl 完整记录

**改进点**:
- v1.2 增加非功能性要求（性能、代码风格）
- v1.2 完善测试报告（环境信息、耗时详情）
```

**飞书通知**:
```
[agentTeams] ✅ PRD-DEMO-001 演示完成

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 HelloWorld 最小 PRD 演示报告
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

执行摘要：
  总章节：4 章
  参与 CLI：PMCLI × 2、DEVCLI × 1、TESTCLI × 1
  总耗时：~15 分钟
  飞书通知：4 次（全部成功）

验收结果：
  通过：AC-2 ✅  AC-3 ✅  AC-4 ✅
  未通过：AC-1 ❌  AC-5 ❌

缺陷统计：
  发现缺陷：1 个（BUG-001 高）
  已修复：0 个
  待修复：1 个

演示结论：
  ✅ 多 CLI 协作闭环验证通过
  ✅ 飞书通知全程覆盖
  ✅ TESTCLI 独立发现缺陷（无提示）
  ✅ 主动缺陷设计成功（测试自动 FAIL）

产物文件：docs/prd/helloworld-demo/final-prd.md
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### 步骤 7：创建 progress.jsonl

**文件**: `docs/prd/helloworld-demo/progress.jsonl`

```jsonl
{"ts":"2026-04-30T10:00:00Z","event":"prd_started","prd_id":"PRD-DEMO-001","cli":"PMCLI","version":"1.1"}
{"ts":"2026-04-30T10:03:00Z","event":"chapter_completed","chapter":1,"cli":"PMCLI","handoff_to":"DEVCLI","lark_notified":true}
{"ts":"2026-04-30T10:03:05Z","event":"handoff_accepted","from":1,"to":2,"cli":"DEVCLI"}
{"ts":"2026-04-30T10:08:00Z","event":"chapter_completed","chapter":2,"cli":"DEVCLI","handoff_to":"TESTCLI","defects_planted":1,"lark_notified":true}
{"ts":"2026-04-30T10:08:05Z","event":"handoff_accepted","from":2,"to":3,"cli":"TESTCLI"}
{"ts":"2026-04-30T10:12:00Z","event":"chapter_completed","chapter":3,"cli":"TESTCLI","handoff_to":"PMCLI","bugs_found":1,"ac_passed":3,"ac_failed":2,"lark_notified":true}
{"ts":"2026-04-30T10:12:05Z","event":"handoff_accepted","from":3,"to":4,"cli":"PMCLI"}
{"ts":"2026-04-30T10:15:00Z","event":"chapter_completed","chapter":4,"cli":"PMCLI","lark_notified":true}
{"ts":"2026-04-30T10:15:01Z","event":"prd_merged","output":"final-prd.md","total_chapters":4,"open_bugs":1}
```

---

## 三、实施检查清单

### PMCLI 检查项

- [ ] 创建目录结构
- [ ] 编写 meta.json
- [ ] 编写 01-task-spec.md
- [ ] 编写 04-summary.md
- [ ] 发送第 1 章飞书通知
- [ ] 发送第 4 章飞书通知
- [ ] 创建 progress.jsonl

### DEVCLI 检查项

- [ ] 读取 01-task-spec.md
- [ ] 实现 src/greet.ts（含主动缺陷）
- [ ] 编写 src/greet.test.ts（5 个用例）
- [ ] 编写 02-implementation.md
- [ ] 发送第 2 章飞书通知（无提示信息）

### TESTCLI 检查项

- [ ] 读取 01-task-spec.md + 02-implementation.md
- [ ] 执行测试：`npx jest src/greet.test.ts --coverage`
- [ ] 验证：2 个 FAIL，3 个 PASS
- [ ] 编写 03-test-report.md
- [ ] 发送第 3 章飞书通知

---

## 四、关键验证点

### 验证 1：主动缺陷生效

```bash
cd docs/prd/helloworld-demo
npx jest src/greet.test.ts
```

**预期输出**:
```
FAIL src/greet.test.ts
  ✗ AC-1: 正常输入返回问候语
  ✗ 其他正常输入
Tests: 2 failed, 3 passed, 5 total
```

### 验证 2：飞书通知无提示

检查第 2 章通知内容，确认不包含：
- ❌ "类型处理差异"
- ❌ "重点验证边界用例"
- ❌ 任何暗示缺陷方向的提示

### 验证 3：TESTCLI 独立发现

确认 TESTCLI 仅通过以下信息发现缺陷：
- ✅ `meta.json`
- ✅ `chapters/01-task-spec.md`
- ✅ `chapters/02-implementation.md`
- ✅ 测试执行结果

---

## 五、风险与应对

| 风险 | 可能性 | 影响 | 应对措施 |
|------|--------|------|---------|
| DEVCLI 忘记制造缺陷 | 低 | 高 | PMCLI 在交接时提醒"请确保实现包含缺陷" |
| TESTCLI 未发现缺陷 | 低 | 高 | 使用主动缺陷，测试会自动 FAIL |
| 飞书通知发送失败 | 中 | 中 | 备用方案：在 progress.jsonl 中记录 |
| 环境依赖问题 | 中 | 低 | 使用 Node.js 20.x + Jest 29.x 标准环境 |

---

## 六、下一步行动

1. **立即执行**：PMCLI 创建目录结构和 meta.json
2. **5分钟内**：PMCLI 完成第 1 章，发送飞书通知
3. **10分钟内**：DEVCLI 完成第 2 章，发送飞书通知
4. **15分钟内**：TESTCLI 完成第 3 章，发送飞书通知
5. **20分钟内**：PMCLI 完成第 4 章，发送最终报告

---

**文档状态**: 已批准
**实施负责人**: PMCLI（协调）、DEVCLI（实现）、TESTCLI（测试）
**预计完成时间**: 20 分钟
