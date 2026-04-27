import lark from '@larksuiteoapi/node-sdk';
import { config } from 'dotenv';

config();

const appId = process.env.LARK_APP_ID!;
const appSecret = process.env.LARK_APP_SECRET!;
const chatId = process.env.LARK_CHAT_ID!;

const client = new lark.Client({
  appId,
  appSecret,
  disableTokenCache: false,
});

async function test() {
  try {
    // 1. 获取群信息确认连接
    const chatRes = await client.im.chat.get({
      path: { chat_id: chatId },
    });
    console.log('✅ 群信息:', chatRes.data?.name);

    // 2. 发送测试消息
    await client.im.message.create({
      params: { receive_id_type: 'chat_id' },
      data: {
        receive_id: chatId,
        msg_type: 'text',
        content: JSON.stringify({ text: '🔔 PMCLI 服务连接测试' }),
      },
    });
    console.log('✅ 测试消息已发送');
  } catch (err) {
    console.error('❌ 失败:', (err as Error).message);
  }
}

test();
