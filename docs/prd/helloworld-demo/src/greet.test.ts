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
