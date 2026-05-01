import { greet } from './greet';

describe('greet', () => {
  test('AC1: 正常输入返回正确问候语', () => {
    expect(greet('Alice')).toBe('Hello, Alice!');
  });

  test('AC2: 空字符串返回默认问候语', () => {
    expect(greet('')).toBe('Hello, World!');
  });

  test('AC3: null 输入返回默认问候语', () => {
    expect(greet(null)).toBe('Hello, World!');
  });

  test('AC4: undefined 输入返回默认问候语', () => {
    expect(greet(undefined)).toBe('Hello, World!');
  });

  test('AC5: 所有测试用例通过', () => {
    // 综合验证
    expect(greet('Bob')).toBe('Hello, Bob!');
    expect(greet('')).toBe('Hello, World!');
    expect(greet(null)).toBe('Hello, World!');
  });
});
