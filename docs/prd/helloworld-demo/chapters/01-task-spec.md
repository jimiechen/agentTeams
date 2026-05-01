# 第 1 章：任务规格说明

## 任务背景

本演示任务用于验证 agentTeams 项目的多 CLI 协作闭环能力。PMCLI 作为任务发起方，负责定义交付标准，并将任务分发给 DEVCLI 实现。

## 功能要求

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

## 交付物要求

DEVCLI 需交付以下文件：

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
