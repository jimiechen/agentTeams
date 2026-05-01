/**
 * 简单测试验证脚本（无需 Jest）
 * 验证 greet 函数的行为
 */

const { greet } = require('./greet');

let passCount = 0;
let failCount = 0;

function test(name, fn) {
  try {
    fn();
    passCount++;
    console.log(`  ✅ ${name}`);
  } catch (error) {
    failCount++;
    console.log(`  ❌ ${name}`);
    console.log(`     Error: ${error.message}`);
  }
}

function expect(actual) {
  return {
    toBe(expected) {
      if (actual !== expected) {
        throw new Error(`Expected "${expected}", but got "${actual}"`);
      }
    }
  };
}

console.log('Running tests for greet function...\n');

// AC-1: 正常输入
test('AC-1: 正常输入返回问候语', () => {
  expect(greet("Alice")).toBe("Hello, Alice!");
});

// AC-2: 空字符串
test('AC-2: 空字符串返回默认问候', () => {
  expect(greet("")).toBe("Hello, World!");
});

// AC-3: null
test('AC-3: null 返回默认问候', () => {
  expect(greet(null)).toBe("Hello, World!");
});

// AC-4: undefined
test('AC-4: undefined 返回默认问候', () => {
  expect(greet(undefined)).toBe("Hello, World!");
});

// 其他正常输入
test('其他正常输入', () => {
  expect(greet("Bob")).toBe("Hello, Bob!");
});

console.log('\n-----------------------------------');
console.log(`Results: ${passCount} passed, ${failCount} failed, ${passCount + failCount} total`);

if (failCount > 0) {
  console.log('\n❌ Tests FAILED');
  process.exit(1);
} else {
  console.log('\n✅ All tests passed');
  process.exit(0);
}
