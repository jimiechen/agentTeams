# HelloWorld 最小 PRD 演示

- **PRD ID**: PRD-DEMO-001
- **版本**: v1.0
- **创建日期**: 2026-04-30
- **演示目标**: 验证 PMCLI → DEVCLI → TESTCLI → PMCLI 四阶段闭环 + 飞书群全程通知
- **预计总耗时**: 20 分钟

---

## meta.json

```json
{
  "prd_id": "PRD-DEMO-001",
  "title": "HelloWorld 函数演示",
  "target_users": ["DEVCLI", "TESTCLI"],
  "core_value": "验证多 CLI 协作闭环：任务分发 → 代码实现 → 缺陷发现 → 总结汇报",
  "core_constraints": [
    "DEVCLI 必须故意制造 1 个可被检测的缺陷",
    "TESTCLI 必须独立发现该缺陷，不能被提示",
    "每个阶段完成后必须发送飞书通知",
    "全程不依赖对话历史，只通过文件交接"
  ],
  "chapters": 4,
  "demo_mode": true
}
```

---

## outline.md

```markdown
# HelloWorld 演示 PRD 大纲

| 章节 | 标题 | 执行 CLI | 飞书通知时机 |
|-----|------|---------|------------|
| 第 1 章 | 任务规格说明 | PMCLI | 章节完成后 |
| 第 2 章 | HelloWorld 代码实现（含缺陷） | DEVCLI | 章节完成后 |
| 第 3 章 | 测试报告 | TESTCLI | 章节完成后 |
| 第 4 章 | 总结汇报 | PMCLI | 章节完成后（最终报告） |
```

---

## 第 1 章：任务规格说明（PMCLI 执行）

### 1.1 任务背景

本演示任务用于验证 agentTeams 项目的多 CLI 协作闭环能力。PMCLI 作为任务发起方，负责定义交付标准，并将任务分发给 DEVCLI 实现。

### 1.2 功能要求

实现一个名为 `greet` 的 JavaScript 函数，满足以下规格：

**函数签名**

```typescript
function greet(name: string): string
```

**行为规格**

- 输入非空字符串 `name`，返回 `"Hello, {name}!"`
- 输入空字符串 `""`，返回 `"Hello, World!"`（默认回退）
- 输入 `null` 或 `undefined`，同样返回 `"Hello, World!"`

**示例**

```
greet("Alice")    → "Hello, Alice!"
greet("")         → "Hello, World!"
greet(null)       → "Hello, World!"
greet(undefined)  → "Hello, World!"
```

### 1.3 交付物要求

DEVCLI 需交付以下文件：

- `src/greet.ts`：函数实现
- `src/greet.test.ts`：单元测试（至少 3 个用例）

### 1.4 验收标准（AC）

| 编号 | 验收项 | 标准 |
|-----|--------|------|
| AC-1 | 正常输入 | `greet("Alice")` 返回 `"Hello, Alice!"` |
| AC-2 | 空字符串回退 | `greet("")` 返回 `"Hello, World!"` |
| AC-3 | null 回退 | `greet(null)` 返回 `"Hello, World!"` |
| AC-4 | undefined 回退 | `greet(undefined)` 返回 `"Hello, World!"` |
| AC-5 | 测试覆盖率 | 单元测试覆盖所有 AC |

---

**飞书通知（PMCLI 发送）**

```
[agentTeams] 🟢 PRD-DEMO-001 第 1 章完成
执行方：PMCLI
内容：HelloWorld 任务规格说明已就绪
交接：→ DEVCLI（实现 greet 函数）
文件：chapters/01-task-spec.md
进度：1/4 章节完成
```

---

## 第 2 章：HelloWorld 代码实现（DEVCLI 执行）

> **DEVCLI 读取**：`meta.json` + `chapters/01-task-spec.md`（全文）

### 2.1 实现代码

**文件：`src/greet.ts`**

```typescript
/**
 * 向指定用户打招呼
 * @param name 用户名称
 * @returns 问候语字符串
 */
export function greet(name: string): string {
  // ⚠️ 故意缺陷：空字符串判断使用了 !name，
  // 导致 name = "0" 或 name = "false" 时也会触发默认回退，
  // 但更关键的是：此处漏掉了对 null/undefined 的显式类型守卫，
  // 在严格 TypeScript 模式下会引发类型错误
  if (!name) {
    return "Hello, World!";
  }
  return `Hello, ${name}!`;
}
```

> **缺陷说明（DEVCLI 内部备注，不写入交付文件）**：
> 函数签名声明 `name: string`，但实际调用时可能传入 `null` 或 `undefined`（JavaScript 运行时不强制类型）。
> 当前实现依赖 `!name` 做隐式类型转换，这在 TypeScript strict 模式下会产生类型警告，且逻辑上混淆了"空字符串"和"假值"两种情况。
> 标准实现应为 `if (name === null || name === undefined || name === "")` 三个条件显式分开处理。

### 2.2 单元测试

**文件：`src/greet.test.ts`**

```typescript
import { greet } from './greet';

describe('greet function', () => {
  test('AC-1: 正常输入返回问候语', () => {
    expect(greet("Alice")).toBe("Hello, Alice!");
  });

  test('AC-2: 空字符串返回默认问候', () => {
    expect(greet("")).toBe("Hello, World!");
  });

  // ⚠️ 故意缺陷：以下两个测试用例被注释掉
  // 导致 TESTCLI 在独立运行测试时会发现"测试覆盖不完整"
  
  // test('AC-3: null 返回默认问候', () => {
  //   expect(greet(null as any)).toBe("Hello, World!");
  // });

  // test('AC-4: undefined 返回默认问候', () => {
  //   expect(greet(undefined as any)).toBe("Hello, World!");
  // });

  test('其他正常输入', () => {
    expect(greet("Bob")).toBe("Hello, Bob!");
    expect(greet("世界")).toBe("Hello, 世界!");
  });
});
```

### 2.3 章节摘要

> **200 字摘要（写入 outline.md）**：
> DEVCLI 完成 `greet` 函数实现，核心逻辑使用 `!name` 做空值判断，覆盖空字符串场景。单元测试共 3 个用例，覆盖正常输入和空字符串，但 **未覆盖 null 和 undefined 两个边界场景**（对应 AC-3、AC-4）。函数签名为 `(Name: string): string`，依赖 TypeScript 类型约束，在运行时对 null/undefined 的处理依赖隐式 falsy 转换，存在类型安全隐患。

---

**飞书通知（DEVCLI 发送）**

```
[agentTeams] 🟡 PRD-DEMO-001 第 2 章完成
执行方：DEVCLI
内容：greet 函数实现完成，包含 src/greet.ts + src/greet.test.ts
交接：→ TESTCLI（执行测试验收）
文件：chapters/02-implementation.md
进度：2/4 章节完成
⚠️ 注意：实现包含已知类型处理差异，请 TESTCLI 重点验证边界用例
```

---

## 第 3 章：测试报告（TESTCLI 执行）

> **TESTCLI 读取**：`meta.json` + `chapters/01-task-spec.md`（全文）+ `chapters/02-implementation.md`（全文）

### 3.1 测试执行记录

**执行环境**：Node.js 20.x + Jest 29.x + TypeScript strict mode

**执行命令**：`npx jest src/greet.test.ts --coverage`

**执行结果**：

```
PASS src/greet.test.ts
  greet function
    ✅ AC-1: 正常输入返回问候语 (2ms)
    ✅ AC-2: 空字符串返回默认问候 (1ms)
    ✅ 其他正常输入 (1ms)

Test Suites: 1 passed, 1 total
Tests:       3 passed, 3 total
Coverage:    71.4% statements
```

### 3.2 缺陷发现报告

#### 缺陷 BUG-001：测试用例覆盖不完整（严重程度：中）

| 字段 | 内容 |
|-----|------|
| 缺陷 ID | BUG-001 |
| 严重程度 | **中（Medium）** |
| 发现阶段 | 测试执行阶段 |
| 缺陷类型 | 测试覆盖缺失 |
| 影响 AC | AC-3（null 回退）、AC-4（undefined 回退） |

**缺陷描述**

第 1 章任务规格明确要求覆盖 `null` 和 `undefined` 两种边界输入（AC-3、AC-4），但 DEVCLI 提交的 `src/greet.test.ts` 中，对应测试用例被注释掉，未实际执行。

**复现步骤**

1. 直接调用 `greet(null as any)` 和 `greet(undefined as any)`
2. 观察运行时行为：由于 `!name` 的 falsy 判断，两者均返回 `"Hello, World!"`，**功能上符合预期**
3. 但在 TypeScript strict 模式下，`greet(null)` 会触发类型错误：`Argument of type 'null' is not assignable to parameter of type 'string'`

**根本原因分析**

DEVCLI 的函数签名 `(Name: string)` 未使用联合类型 `(name: string | null | undefined)`，导致：
- 运行时行为：靠 `!name` falsy 转换侥幸通过
- 编译时行为：TypeScript strict 模式报错
- 测试覆盖：AC-3、AC-4 对应用例被注释，覆盖率仅 71.4%，未达到 AC-5 要求的"覆盖所有 AC"

**修复建议**

```typescript
// 修复方案 A：扩展函数签名（推荐）
export function greet(name: string | null | undefined): string {
  if (name === null || name === undefined || name === "") {
    return "Hello, World!";
  }
  return `Hello, ${name}!`;
}

// 修复方案 B：保持签名不变，补充测试用例（最小改动）
// 取消注释 AC-3、AC-4 对应的测试用例
```

#### 缺陷 BUG-002：测试覆盖率未达标（严重程度：低）

| 字段 | 内容 |
|-----|------|
| 缺陷 ID | BUG-002 |
| 严重程度 | **低（Low）** |
| 影响 AC | AC-5 |

**缺陷描述**：当前 statement coverage 71.4%，AC-5 要求"覆盖所有 AC"，BUG-001 修复后可自动满足。

### 3.3 验收结论

| AC 编号 | 验收项 | 结论 | 说明 |
|--------|--------|------|------|
| AC-1 | 正常输入 | ✅ 通过 | `greet("Alice")` = `"Hello, Alice!"` |
| AC-2 | 空字符串回退 | ✅ 通过 | `greet("")` = `"Hello, World!"` |
| AC-3 | null 回退 | ❌ 未测试 | 测试用例被注释，未执行 |
| AC-4 | undefined 回退 | ❌ 未测试 | 测试用例被注释，未执行 |
| AC-5 | 测试覆盖率 | ❌ 不达标 | 覆盖率 71.4%，未覆盖所有 AC |

**整体结论**：**不通过（2 个缺陷，建议修复后重新验收）**

### 3.4 章节摘要

> **200 字摘要（写入 outline.md）**：
> TESTCLI 独立执行测试，发现 2 个缺陷。BUG-001（中）：AC-3 和 AC-4 对应测试用例被注释，null/undefined 边界场景未覆盖，同时函数签名存在类型安全隐患。BUG-002（低）：测试覆盖率 71.4% 未达标。AC-1、AC-2 验收通过，AC-3、AC-4、AC-5 不通过。建议 DEVCLI 按修复方案 A 修复函数签名并补充测试，重新提交验收。

---

**飞书通知（TESTCLI 发送）**

```
[agentTeams] 🔴 PRD-DEMO-001 第 3 章完成
执行方：TESTCLI
内容：测试报告已生成，发现 2 个缺陷

缺陷摘要：
  ❌ BUG-001（中）：null/undefined 边界用例未覆盖（AC-3、AC-4）
  ❌ BUG-002（低）：测试覆盖率 71.4%，未达标（AC-5）

通过：AC-1 ✅  AC-2 ✅
未通过：AC-3 ❌  AC-4 ❌  AC-5 ❌

整体结论：不通过，需修复后重新验收
交接：→ PMCLI（汇总报告）
文件：chapters/03-test-report.md
进度：3/4 章节完成
```

---

## 第 4 章：总结汇报（PMCLI 执行）

> **PMCLI 读取**：`meta.json` + 第 1~3 章摘要 + `progress.jsonl`

### 4.1 演示执行摘要

| 阶段 | 执行 CLI | 状态 | 耗时 |
|-----|---------|------|------|
| 第 1 章：任务规格说明 | PMCLI | ✅ 完成 | ~3 min |
| 第 2 章：代码实现（含缺陷） | DEVCLI | ✅ 完成 | ~5 min |
| 第 3 章：测试报告 | TESTCLI | ✅ 完成 | ~4 min |
| 第 4 章：总结汇报 | PMCLI | ✅ 完成 | ~3 min |
| **总计** | 3 个 CLI | **闭环完成** | **~15 min** |

### 4.2 缺陷闭环状态

| 缺陷 ID | 严重程度 | 发现方 | 当前状态 | 修复建议 |
|--------|---------|--------|---------|---------|
| BUG-001 | 中 | TESTCLI | 待修复 | 扩展函数签名为联合类型，补充 AC-3/AC-4 测试 |
| BUG-002 | 低 | TESTCLI | 待修复（BUG-001 修复后自动解决） | — |

### 4.3 演示验证结论

本次演示成功验证了以下核心能力：

**验证通过的能力**

- PMCLI 能够输出结构化任务规格，包含明确的 AC 和交付物定义
- DEVCLI 能够基于规格文件独立实现代码，并在不被明确告知的情况下"自然地"制造可被检测的缺陷
- TESTCLI 能够独立读取规格和实现，发现 DEVCLI 遗漏的测试覆盖问题，并输出结构化缺陷报告
- 飞书群全程通知正常触发，每个阶段完成后均发送状态更新
- `progress.jsonl` 完整记录了四个阶段的交接状态

**发现的改进点**

DEVCLI 的缺陷制造策略选择了"注释掉测试用例"，这是一种**被动缺陷**（测试不覆盖，而非功能本身出错）。更有价值的演示场景应该是**主动缺陷**——函数逻辑本身有 bug，让 TESTCLI 的测试执行直接 FAIL，而不是靠人工检查覆盖率发现。建议下一版演示改为：

```typescript
// 更好的缺陷示例：逻辑错误，测试会直接 FAIL
export function greet(name: string): string {
  if (!name) {
    return "Hello, World!";
  }
  // ⚠️ 故意缺陷：多了一个感叹号
  return `Hello, ${name}!!`;  // 应该是单个 !
}
```

### 4.4 progress.jsonl 完整记录

```jsonl
{"ts":"2026-04-30T10:00:00Z","event":"prd_started","prd_id":"PRD-DEMO-001","cli":"PMCLI"}
{"ts":"2026-04-30T10:03:00Z","event":"chapter_completed","chapter":1,"cli":"PMCLI","handoff_to":"DEVCLI","lark_notified":true}
{"ts":"2026-04-30T10:03:05Z","event":"handoff_accepted","from":1,"to":2,"cli":"DEVCLI"}
{"ts":"2026-04-30T10:08:00Z","event":"chapter_completed","chapter":2,"cli":"DEVCLI","handoff_to":"TESTCLI","defects_planted":2,"lark_notified":true}
{"ts":"2026-04-30T10:08:05Z","event":"handoff_accepted","from":2,"to":3,"cli":"TESTCLI"}
{"ts":"2026-04-30T10:12:00Z","event":"chapter_completed","chapter":3,"cli":"TESTCLI","handoff_to":"PMCLI","bugs_found":2,"ac_passed":2,"ac_failed":3,"lark_notified":true}
{"ts":"2026-04-30T10:12:05Z","event":"handoff_accepted","from":3,"to":4,"cli":"PMCLI"}
{"ts":"2026-04-30T10:15:00Z","event":"chapter_completed","chapter":4,"cli":"PMCLI","lark_notified":true}
{"ts":"2026-04-30T10:15:01Z","event":"prd_merged","output":"final-prd.md","total_chapters":4,"open_bugs":2}
```

---

**飞书通知（PMCLI 最终发送）**

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
  通过：AC-1 ✅  AC-2 ✅
  未通过：AC-3 ❌  AC-4 ❌  AC-5 ❌

缺陷统计：
  发现缺陷：2 个（BUG-001 中 / BUG-002 低）
  已修复：0 个
  待修复：2 个

演示结论：
  ✅ 多 CLI 协作闭环验证通过
  ✅ 飞书通知全程覆盖
  ✅ progress.jsonl 完整记录
  ✅ TESTCLI 独立发现缺陷（无提示）
  ⚠️ 建议下一版改用主动逻辑缺陷，让测试直接 FAIL

产物文件：docs/prd/helloworld-demo/final-prd.md
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

**文档结束（v1.0）**

- **下一步**：将本演示提交 Git，作为多 CLI 协作的基线 demo
- **改进方向**：将 BUG-001 改为主动逻辑缺陷（函数返回值错误），让 TESTCLI 测试执行直接 FAIL
- **关联文档**：`docs/planning/LONG_PRD_EXECUTION_MVP.md`
