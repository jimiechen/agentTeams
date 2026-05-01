// 测试验证脚本 - 不依赖外部测试框架
import { greet } from './greet.ts';

const tests = [
  { name: 'AC1: 正常输入', input: 'Alice', expected: 'Hello, Alice!' },
  { name: 'AC2: 空字符串', input: '', expected: 'Hello, World!' },
  { name: 'AC3: null 输入', input: null, expected: 'Hello, World!' },
  { name: 'AC4: undefined 输入', input: undefined, expected: 'Hello, World!' },
  { name: 'AC5: 综合验证-Bob', input: 'Bob', expected: 'Hello, Bob!' },
];

let pass = 0;
let fail = 0;

console.log('=== 测试执行开始 ===\n');

for (const test of tests) {
  const result = greet(test.input);
  const status = result === test.expected ? 'PASS' : 'FAIL';
  
  if (status === 'PASS') {
    pass++;
    console.log(`✅ ${test.name}: ${status}`);
  } else {
    fail++;
    console.log(`❌ ${test.name}: ${status}`);
    console.log(`   预期: "${test.expected}"`);
    console.log(`   实际: "${result}"`);
  }
}

console.log(`\n=== 测试结果 ===`);
console.log(`总计: ${tests.length} 个测试`);
console.log(`通过: ${pass} 个`);
console.log(`失败: ${fail} 个`);

if (fail > 0) {
  console.log(`\n⚠️ 发现缺陷！`);
  process.exit(1);
} else {
  console.log(`\n✅ 所有测试通过！`);
  process.exit(0);
}
