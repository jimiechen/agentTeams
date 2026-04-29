/**
 * WikiBot 查询接口
 * 支持: 上次/上周/之前/历史 关键词查询
 */

import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import path from 'node:path';

// ──────────────────────────────────────────────
// 类型定义
// ──────────────────────────────────────────────

export interface QueryResult {
  found: boolean;
  content: string;
  source: string;
  date?: string;
}

export interface TodoItem {
  text: string;
  date: string;
  status: 'active' | 'completed' | 'abandoned';
}

// ──────────────────────────────────────────────
// 查询工具函数
// ──────────────────────────────────────────────

/** 获取最近N天的日期列表 */
function getRecentDates(days: number): string[] {
  const dates: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}

/** 读取Layer 1文件 */
function readLayer1(workspacePath: string, date: string): string | null {
  const filePath = path.join(workspacePath, 'wiki', 'daily', `${date}.md`);
  if (!existsSync(filePath)) return null;
  return readFileSync(filePath, 'utf-8');
}

/** 读取Layer 2文件 */
function readLayer2(workspacePath: string): string | null {
  const filePath = path.join(workspacePath, 'wiki', 'core', 'knowledge.md');
  if (!existsSync(filePath)) return null;
  return readFileSync(filePath, 'utf-8');
}

/** 读取todo文件 */
function readTodo(workspacePath: string): TodoItem[] {
  const filePath = path.join(workspacePath, 'wiki', 'todo.md');
  if (!existsSync(filePath)) return [];

  const content = readFileSync(filePath, 'utf-8');
  const items: TodoItem[] = [];

  // 解析待办项
  const lines = content.split('\n');
  let currentDate = '';

  for (const line of lines) {
    const dateMatch = line.match(/^##\s+(\d{4}-\d{2}-\d{2})/);
    if (dateMatch) {
      currentDate = dateMatch[1];
      continue;
    }

    const todoMatch = line.match(/^[-*]\s+\[([ x])\]\s+(.+)/);
    if (todoMatch && currentDate) {
      items.push({
        text: todoMatch[2].trim(),
        date: currentDate,
        status: todoMatch[1] === 'x' ? 'completed' : 'active',
      });
    }
  }

  return items;
}

// ──────────────────────────────────────────────
// 查询处理器
// ──────────────────────────────────────────────

/**
 * 查询"上次"的记忆
 * 返回最近一天的Layer 1
 */
export function queryLast(workspacePath: string): QueryResult {
  const dates = getRecentDates(7);

  for (const date of dates) {
    const content = readLayer1(workspacePath, date);
    if (content) {
      return {
        found: true,
        content: content.substring(0, 2000), // 限制长度
        source: `wiki/daily/${date}.md`,
        date,
      };
    }
  }

  return { found: false, content: '没有找到最近的记忆', source: '' };
}

/**
 * 查询"上周"的记忆
 * 返回最近7天的Layer 1合并
 */
export function queryLastWeek(workspacePath: string): QueryResult {
  const dates = getRecentDates(7);
  const parts: string[] = [];

  for (const date of dates) {
    const content = readLayer1(workspacePath, date);
    if (content) {
      parts.push(`### ${date}\n${content.substring(0, 500)}`);
    }
  }

  if (parts.length === 0) {
    return { found: false, content: '没有找到上周的记忆', source: '' };
  }

  return {
    found: true,
    content: parts.join('\n\n---\n\n'),
    source: `wiki/daily/ (${parts.length}天)`,
  };
}

/**
 * 查询"之前"的特定日期
 */
export function queryBefore(workspacePath: string, targetDate: string): QueryResult {
  const content = readLayer1(workspacePath, targetDate);

  if (content) {
    return {
      found: true,
      content: content.substring(0, 2000),
      source: `wiki/daily/${targetDate}.md`,
      date: targetDate,
    };
  }

  return { found: false, content: `没有找到 ${targetDate} 的记忆`, source: '' };
}

/**
 * 查询"历史"核心知识
 */
export function queryHistory(workspacePath: string): QueryResult {
  const content = readLayer2(workspacePath);

  if (content) {
    return {
      found: true,
      content: content.substring(0, 2000),
      source: 'wiki/core/knowledge.md',
    };
  }

  return { found: false, content: '没有找到核心知识', source: '' };
}

/**
 * 智能查询路由
 */
export function queryWiki(workspacePath: string, query: string): QueryResult {
  const q = query.toLowerCase().trim();

  // "上次" / "最近" / "昨天"
  if (/^(上次|最近|昨天|latest|last)$/.test(q)) {
    return queryLast(workspacePath);
  }

  // "上周" / "最近7天" / "week"
  if (/^(上周|最近7天|最近七天|week)$/.test(q)) {
    return queryLastWeek(workspacePath);
  }

  // "历史" / "核心" / "core"
  if (/^(历史|核心|core|history)$/.test(q)) {
    return queryHistory(workspacePath);
  }

  // "之前 YYYY-MM-DD" / "before 2026-04-20"
  const beforeMatch = q.match(/^(之前|before)\s+(\d{4}-\d{2}-\d{2})$/);
  if (beforeMatch) {
    return queryBefore(workspacePath, beforeMatch[2]);
  }

  // 默认查询最近一天
  return queryLast(workspacePath);
}

// ──────────────────────────────────────────────
// 待办管理
// ──────────────────────────────────────────────

/**
 * 获取待办列表
 */
export function getTodos(workspacePath: string, filter?: 'active' | 'completed' | 'all'): TodoItem[] {
  const items = readTodo(workspacePath);

  if (filter && filter !== 'all') {
    return items.filter(i => i.status === filter);
  }

  return items;
}

/**
 * 格式化待办输出
 */
export function formatTodos(items: TodoItem[]): string {
  if (items.length === 0) {
    return '暂无待办事项';
  }

  const active = items.filter(i => i.status === 'active');
  const completed = items.filter(i => i.status === 'completed');

  let result = '';

  if (active.length > 0) {
    result += '## 活跃待办\n';
    active.forEach(item => {
      result += `- [ ] ${item.date}: ${item.text}\n`;
    });
    result += '\n';
  }

  if (completed.length > 0) {
    result += '## 已完成\n';
    completed.slice(-5).forEach(item => { // 只显示最近5条
      result += `- [x] ${item.date}: ${item.text}\n`;
    });
  }

  return result;
}

// ──────────────────────────────────────────────
// 共享知识晋升
// ──────────────────────────────────────────────

/**
 * 检查是否有知识可以晋升到shared层
 * 条件: 在2+工作区的Layer 2中出现相同模式，持续2+周
 */
export function checkPromotions(workspaces: string[]): Array<{
  pattern: string;
  workspaces: string[];
  age: number;
}> {
  const candidates: Array<{ pattern: string; workspaces: string[]; age: number }> = [];

  // 读取所有工作区的Layer 2
  const layer2Contents = new Map<string, string>();
  for (const ws of workspaces) {
    const wsPath = path.resolve('./workspaces', ws);
    const content = readLayer2(wsPath);
    if (content) {
      layer2Contents.set(ws, content);
    }
  }

  // 简单匹配: 查找在所有工作区中都出现的行
  if (layer2Contents.size >= 2) {
    const firstEntry = layer2Contents.entries().next().value;
    if (!firstEntry) return candidates;
    const [firstWs, firstContent] = firstEntry as [string, string];
    const lines = firstContent.split('\n').filter((l: string) => l.trim().startsWith('-'));

    for (const line of lines) {
      const pattern = line.trim();
      const matchedWorkspaces = [firstWs];

      for (const [ws, content] of layer2Contents) {
        if (ws !== firstWs && content.includes(pattern)) {
          matchedWorkspaces.push(ws);
        }
      }

      if (matchedWorkspaces.length >= 2) {
        candidates.push({
          pattern: pattern.substring(0, 100),
          workspaces: matchedWorkspaces,
          age: 1, // 简化处理，实际需要追踪历史
        });
      }
    }
  }

  return candidates;
}
