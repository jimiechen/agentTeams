# 第 3 章：测试报告

## 测试执行记录

**环境**: Node.js 20.x

**命令**: `node test-verify.js`

**结果**:
```
Running tests for greet function...

  ❌ AC-1: 正常输入返回问候语
     Error: Expected "Hello, Alice!", but got "Hello, Alice!!"

  ✅ AC-2: 空字符串返回默认问候

  ✅ AC-3: null 返回默认问候

  ✅ AC-4: undefined 返回默认问候

  ❌ 其他正常输入
     Error: Expected "Hello, Bob!", but got "Hello, Bob!!"

-----------------------------------
Results: 3 passed, 2 failed, 5 total

❌ Tests FAILED
```

## 缺陷发现报告

### BUG-001：函数返回值错误（严重程度：高）

| 字段 | 内容 |
|-----|------|
| 缺陷 ID | BUG-001 |
| 严重程度 | **高（High）** |
| 缺陷类型 | 函数逻辑错误 |
| 影响 AC | AC-1、AC-5 |

**描述**: `greet.ts` 第 5 行模板字符串写为 `` `Hello, ${name}!!` ``，多了一个 `!`

**复现步骤**:
1. 执行 `greet("Alice")`
2. 期望返回 `"Hello, Alice!"`
3. 实际返回 `"Hello, Alice!!"`

**根本原因**: `greet.ts` 第 5 行模板字符串写为 `` `Hello, ${name}!!` ``，多了一个 `!`

**修复建议**:
```typescript
// 修复方案：删除多余的 !
return `Hello, ${name}!`;  // 正确
```

## 验收结论

| AC 编号 | 验收项 | 结论 | 说明 |
|--------|--------|------|------|
| AC-1 | 正常输入 | ❌ FAIL | 返回值多一个 `!` |
| AC-2 | 空字符串回退 | ✅ 通过 | |
| AC-3 | null 回退 | ✅ 通过 | |
| AC-4 | undefined 回退 | ✅ 通过 | |
| AC-5 | 测试通过率 | ❌ FAIL | 2 个用例失败 |

**整体结论**：不通过，1 个高严重度缺陷，需修复后重新验收

## 章节摘要

TESTCLI 独立执行测试，发现 1 个缺陷。BUG-001（高）：`greet` 函数返回值错误，
模板字符串多了一个感叹号，导致 AC-1 和 AC-5 失败。AC-2、AC-3、AC-4 验收通过。
建议 DEVCLI 修复函数返回值，重新提交验收。
