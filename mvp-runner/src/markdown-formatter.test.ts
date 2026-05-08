/**
 * markdown-formatter.test.ts - 单元测试 (使用 node:assert)
 */

import { describe, test } from 'node:test';
import assert from 'node:assert';
import { formatResponseToMarkdown, extractSummary } from './markdown-formatter.js';

describe('formatResponseToMarkdown', () => {
  test('基本格式化', () => {
    const meta = {
      runId: '2026-05-08T12-00-00-000Z',
      taskSlot: 0,
      taskName: 'PMCLI',
      senderId: 'ou_123',
      promptText: 'Hello',
      responseText: 'World',
      durationMs: 5000,
      startedAt: '2026-05-08T12:00:00Z',
      finishedAt: '2026-05-08T12:00:05Z',
    };

    const result = formatResponseToMarkdown(meta);

    assert(result.includes('# Trae 任务执行报告'));
    assert(result.includes('PMCLI'));
    assert(result.includes('Hello'));
    assert(result.includes('World'));
    assert(result.includes('5.0s'));
    assert(result.includes('```json'));
  });

  test('无任务名时使用默认值', () => {
    const meta = {
      runId: 'test',
      taskSlot: 1,
      senderId: 'ou_123',
      promptText: 'test',
      responseText: 'test',
      durationMs: 1000,
      startedAt: '2026-05-08T12:00:00Z',
      finishedAt: '2026-05-08T12:00:01Z',
    };

    const result = formatResponseToMarkdown(meta);
    assert(result.includes('未命名'));
  });
});

describe('extractSummary', () => {
  test('含代码块的响应正确占位', () => {
    const text = '以下是代码：\n```typescript\nconst x = 1;\n```\n结束';
    const result = extractSummary(text);
    assert(result.includes('[代码块]'));
    assert(!result.includes('```'));
  });

  test('含表格的响应保留原文', () => {
    const text = '| A | B |\n|---|---|\n| 1 | 2 |';
    const result = extractSummary(text, 100);
    assert(result.includes('| A | B |'));
  });

  test('超长响应正确截断', () => {
    const text = 'A'.repeat(300);
    const result = extractSummary(text, 50);
    assert(result.length <= 53); // 50 + "..."
    assert(result.endsWith('...'));
  });

  test('空响应返回占位符', () => {
    assert.strictEqual(extractSummary(''), '（无内容）');
    assert.strictEqual(extractSummary('   '), '（无内容）');
  });

  test('含图片的响应正确占位', () => {
    const text = '看图：![alt](http://example.com/img.png) 结束';
    const result = extractSummary(text);
    assert(result.includes('[图片]'));
    assert(!result.includes('!['));
  });

  test('含链接的响应保留文本', () => {
    const text = '点击[这里](http://example.com)访问';
    const result = extractSummary(text);
    assert(result.includes('点击这里访问'));
    assert(!result.includes('http://example.com'));
  });

  test('多个空行压缩为单空格', () => {
    const text = '第一行\n\n\n第二行';
    const result = extractSummary(text);
    assert.strictEqual(result, '第一行 第二行');
  });
});
