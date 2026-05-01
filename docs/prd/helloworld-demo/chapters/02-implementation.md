# 第 2 章：HelloWorld 代码实现

## 实现代码

**文件：`src/greet.ts`**

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

**文件：`src/greet.test.ts`**

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
