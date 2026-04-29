/**
 * 验证飞书机器人配置
 * 检查机器人在群聊中的状态
 */

import * as lark from '@larksuiteoapi/node-sdk';

const bots = [
  {
    name: 'PMCLI',
    appId: 'cli_a9645d1646a31bc9',
    appSecret: 'X56MxRXD6fAvHmi0SkJlkdHTVq62Ulum',
    chatId: 'oc_9f741c1f2d5b1fc1e98a0b42c04283c5',
  },
  {
    name: 'DEVCLI',
    appId: 'cli_a965c93882f81bc8',
    appSecret: 'ncRPwXBhvTs6gpudpl69LgTUwq6DJlEI',
    chatId: 'oc_9f741c1f2d5b1fc1e98a0b42c04283c5',
  },
];

async function verifyBot(bot: typeof bots[0]) {
  console.log(`\n🔍 验证 ${bot.name} Bot...`);
  console.log(`   App ID: ${bot.appId}`);
  console.log(`   Chat ID: ${bot.chatId}`);

  const client = new lark.Client({
    appId: bot.appId,
    appSecret: bot.appSecret,
    disableTokenCache: false,
  });

  // 1. 测试获取群组信息
  try {
    const chatInfo = await client.im.chat.get({
      path: { chat_id: bot.chatId },
    });
    console.log(`   ✅ 可以访问群组: ${chatInfo.data?.name || '未知'}`);
  } catch (err: any) {
    console.log(`   ❌ 无法访问群组: ${err?.msg || err?.message}`);
    return;
  }

  // 2. 测试发送消息
  try {
    await client.im.message.create({
      params: { receive_id_type: 'chat_id' },
      data: {
        receive_id: bot.chatId,
        msg_type: 'text',
        content: JSON.stringify({ text: `🤖 ${bot.name} Bot 验证消息 - ${new Date().toLocaleString()}` }),
      },
    });
    console.log(`   ✅ 发送消息成功`);
  } catch (err: any) {
    console.log(`   ❌ 发送消息失败: ${err?.msg || err?.message}`);
    console.log(`   错误码: ${err?.code}`);
  }
}

async function main() {
  console.log('🚀 开始验证飞书机器人配置...\n');

  for (const bot of bots) {
    await verifyBot(bot);
  }

  console.log('\n✅ 验证完成');
}

main().catch(console.error);
