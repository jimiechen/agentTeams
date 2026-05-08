/**
 * 测试 upload_all 接口返回值结构
 */

const lark = require('@larksuiteoapi/node-sdk');

const client = new lark.Client({
  appId: 'cli_a9645d1646a31bc9',
  appSecret: 'X56MxRXD6fAvHmi0SkJlkdHTVq62Ulum',
  appType: lark.AppType.SelfBuild,
});

const rootFolderToken = 'JwItfxAPxlEyQMdqOnlcsbkWnwC';

async function main() {
  console.log('=== 测试 upload_all 返回值结构 ===\n');

  const testContent = '# Test\n\n时间: ' + new Date().toISOString() + '\n';
  const content = Buffer.from(testContent, 'utf-8');

  try {
    const uploadResp = await client.drive.v1.file.uploadAll({
      data: {
        file_name: 'test-' + Date.now() + '.md',
        parent_type: 'explorer',
        parent_node: rootFolderToken,
        size: content.length,
        file: content,
      },
    });

    console.log('返回值类型:', typeof uploadResp);
    console.log('返回值键:', Object.keys(uploadResp));
    console.log('');
    console.log('uploadResp.data:', JSON.stringify(uploadResp.data, null, 2));
    console.log('');
    console.log('uploadResp 原始:', uploadResp);
  } catch (err) {
    console.log('错误:', err.message);
    console.log('错误码:', err.code);
    if (err.response) {
      console.log('响应数据:', JSON.stringify(err.response?.data, null, 2));
    }
  }
}

main();
