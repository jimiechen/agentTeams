# 第 1 章：任务规格说明

## 任务背景

验证多 CLI 协作闭环 - PMCLI/DEVCLI/TESTCLI 通过文件交接完成完整开发流程。

## 功能要求

实现 `greet(name: string): string` 函数：
- 输入：name（字符串）
- 输出：问候语（字符串）

## 行为规格

| 场景 | 输入 | 预期输出 |
|------|------|----------|
| 正常输入 | "Alice" | "Hello, Alice!" |
| 空字符串 | "" | "Hello, World!" |
| null | null | "Hello, World!" |
| undefined | undefined | "Hello, World!" |

## 交付物

- `src/greet.ts` - 实现代码
- `src/greet.test.ts` - 测试用例

## 验收标准（AC）

1. **AC1**: 正常输入返回正确问候语
2. **AC2**: 空字符串返回默认问候语
3. **AC3**: null 输入返回默认问候语
4. **AC4**: undefined 输入返回默认问候语
5. **AC5**: 所有测试用例通过

## 约束条件

- DEVCLI 必须故意制造 1 个可被测试框架自动检测的缺陷
- TESTCLI 必须独立发现该缺陷，不能被提示
