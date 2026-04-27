#!/usr/bin/env tsx
/**
 * 发送任务执行报告到飞书群
 */

import lark from '@larksuiteoapi/node-sdk';
import { readFileSync } from 'fs';
import { config } from 'dotenv';

config();

const appId = process.env.LARK_APP_ID!;
const appSecret = process.env.LARK_APP_SECRET!;
const chatId = process.env.LARK_CHAT_ID!;

async function sendReport() {
  const client = new lark.Client({
    appId,
    appSecret,
    disableTokenCache: false,
  });

  // 读取报告内容
  const reportPath = 'd:\\TraeProject\\agentTeams\\docs\\TASK_EXECUTION_REPORT_2026-04-27.md';
  const reportContent = readFileSync(reportPath, 'utf-8');

  // 构建富文本消息
  const postContent = {
    zh_cn: {
      title: '📊 任务执行报告 - 2026年4月27日',
      content: [
        [{ tag: 'text', text: '📋 执行概况\n' }],
        [{ tag: 'text', text: '━━━━━━━━━━━━━━━━━━\n' }],
        [{ tag: 'text', text: '• 总执行任务数: 10\n' }],
        [{ tag: 'text', text: '• 成功执行: 7 (70%)\n' }],
        [{ tag: 'text', text: '• 执行失败: 3\n' }],
        [{ tag: 'text', text: '• 平均执行时长: 15秒\n\n' }],
        
        [{ tag: 'text', text: '✅ 主要成果\n' }],
        [{ tag: 'text', text: '━━━━━━━━━━━━━━━━━━\n' }],
        [{ tag: 'text', text: '1. 修复参数传递错误\n' }],
        [{ tag: 'text', text: '2. 修复Signature空值错误\n' }],
        [{ tag: 'text', text: '3. 优化图片内容解析\n' }],
        [{ tag: 'text', text: '4. 完成CDP响应解析增强\n' }],
        [{ tag: 'text', text: '5. 提交代码到远程分支\n\n' }],
        
        [{ tag: 'text', text: '⚠️ 待解决问题\n' }],
        [{ tag: 'text', text: '━━━━━━━━━━━━━━━━━━\n' }],
        [{ tag: 'text', text: '• 文本填充不匹配问题\n' }],
        [{ tag: 'text', text: '• AI响应格式调研\n\n' }],
        
        [{ tag: 'text', text: '📁 报告文件\n' }],
        [{ tag: 'text', text: 'docs/TASK_EXECUTION_REPORT_2026-04-27.md\n\n' }],
        
        [{ tag: 'text', text: '请项目经理审核，谢谢！' }]
      ]
    }
  };

  try {
    await client.im.message.create({
      params: { receive_id_type: 'chat_id' },
      data: {
        receive_id: chatId,
        msg_type: 'post',
        content: JSON.stringify(postContent),
      },
    });
    console.log('✅ 报告已发送到飞书群');
  } catch (err) {
    console.error('❌ 发送失败:', (err as Error).message);
    process.exit(1);
  }
}

sendReport();
