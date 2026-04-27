import lark from '@larksuiteoapi/node-sdk';
import { readFileSync } from 'node:fs';
import { config } from 'dotenv';

config();

const appId = process.env.LARK_APP_ID!;
const appSecret = process.env.LARK_APP_SECRET!;
const chatId = process.env.LARK_CHAT_ID!;

// 提问人的 open_id
const mentionUserId = 'ou_45cead2a3a87deb0e89b221eaa05dc34';

// 读取最新的任务结果
const runFile = 'D:\\TraeProject\\agentTeams\\mvp-runner\\runs\\2026-04-27T11-11-22-543Z.md';
const content = readFileSync(runFile, 'utf-8');

const client = new lark.Client({
  appId,
  appSecret,
  disableTokenCache: false,
});

async function sendResult() {
  const postContent = {
    zh_cn: {
      title: '📊 任务执行结果',
      content: [
        [{ tag: 'at', user_id: mentionUserId }],
        [{ tag: 'text', text: '\n\n' }],
        [{ tag: 'text', text: content }],
      ],
    },
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
    console.log('✅ 结果已发送到群聊');
  } catch (err) {
    console.error('❌ 发送失败:', (err as Error).message);
    process.exit(1);
  }
}

sendResult();
