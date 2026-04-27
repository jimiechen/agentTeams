import lark from '@larksuiteoapi/node-sdk';
import { config } from 'dotenv';

config();

const appId = process.env.LARK_APP_ID!;
const appSecret = process.env.LARK_APP_SECRET!;
const chatId = process.env.LARK_CHAT_ID!;

console.log('=== 配置检查 ===');
console.log('App ID:', appId ? `${appId.substring(0, 8)}...` : '未设置');
console.log('App Secret:', appSecret ? `${appSecret.substring(0, 8)}...` : '未设置');
console.log('Chat ID:', chatId);
console.log('');

const client = new lark.Client({
  appId,
  appSecret,
  disableTokenCache: false,
});

async function check() {
  try {
    // 1. 获取群信息
    console.log('=== 检查群信息 ===');
    const chatRes = await client.im.chat.get({
      path: { chat_id: chatId },
    });
    console.log('✅ 群名称:', chatRes.data?.name);
    console.log('✅ 群类型:', chatRes.data?.chat_mode);
    console.log('');

    // 2. 获取群成员
    console.log('=== 检查群成员 ===');
    const membersRes = await client.im.chat.members.get({
      path: { chat_id: chatId },
      params: { member_id_type: 'open_id' },
    });
    const members = membersRes.data?.items || [];
    console.log('✅ 群成员数:', members.length);
    console.log('');

    // 3. 获取机器人信息
    console.log('=== 检查机器人信息 ===');
    const botRes = await client.application.applicationInformation.get({
      path: { app_id: appId },
    });
    console.log('✅ 机器人名称:', botRes.data?.app_name);
    console.log('');

    // 4. 发送测试消息
    console.log('=== 发送测试消息 ===');
    await client.im.message.create({
      params: { receive_id_type: 'chat_id' },
      data: {
        receive_id: chatId,
        msg_type: 'text',
        content: JSON.stringify({ text: '🔔 配置检查测试消息' }),
      },
    });
    console.log('✅ 测试消息已发送');

  } catch (err) {
    console.error('❌ 错误:', (err as Error).message);
    console.error((err as any).response?.data || '');
  }
}

check();
