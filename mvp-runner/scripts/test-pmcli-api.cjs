/**
 * API 测试 - 使用新文件夹 token
 */

const lark = require('@larksuiteoapi/node-sdk');
const fs = require('fs');

const client = new lark.Client({
  appId: 'cli_a9645d1646a31bc9',
  appSecret: 'X56MxRXD6fAvHmi0SkJlkdHTVq62Ulum',
  appType: lark.AppType.SelfBuild,
});

// 新的文件夹 token
const rootFolderToken = 'JwItfxAPxlEyQMdqOnlcsbkWnwC';
const output = [];

async function main() {
  output.push('=== 飞书 API 可用性验证 ===');
  output.push('时间: ' + new Date().toISOString());
  output.push('App ID: cli_a9645d1646a31bc9');
  output.push('Root Folder Token: ' + rootFolderToken);
  output.push('');

  let listPass = false;
  let folderPass = false;
  let uploadPass = false;
  let testFolderToken = '';
  let fileToken = '';

  // 1. 测试 list 接口
  output.push('--- 测试 1: drive.v1.file.list ---');
  try {
    const listResp = await client.drive.v1.file.list({
      params: { folder_token: rootFolderToken },
    });
    output.push('✅ 列表查询成功');
    const files = listResp.data?.files || [];
    output.push('   文件数量: ' + files.length);
    if (files.length > 0) {
      output.push('   首个文件: ' + files[0].name + ' (' + files[0].type + ')');
    }
    listPass = true;
  } catch (err) {
    output.push('❌ 列表查询失败: ' + err.message);
    output.push('   错误码: ' + (err.code || 'unknown'));
  }
  output.push('');

  // 2. 测试 create_folder 接口
  output.push('--- 测试 2: drive.v1.file.create_folder ---');
  try {
    const folderResp = await client.drive.v1.file.createFolder({
      data: {
        name: 'test-api-' + Date.now(),
        folder_token: rootFolderToken,
      },
    });
    testFolderToken = folderResp.data?.token || '';
    if (testFolderToken) {
      output.push('✅ 文件夹创建成功');
      output.push('   Token: ' + testFolderToken);
      output.push('   URL: https://feishu.cn/drive/folder/' + testFolderToken);
      folderPass = true;
    } else {
      output.push('❌ 文件夹创建失败: 未返回 token');
    }
  } catch (err) {
    output.push('❌ 文件夹创建失败: ' + err.message);
    output.push('   错误码: ' + (err.code || 'unknown'));
  }
  output.push('');

  // 3. 测试 upload_all 接口
  output.push('--- 测试 3: drive.v1.file.upload_all ---');
  try {
    const testContent = '# Test Upload\n\nThis is a test markdown file.\n\n时间: ' + new Date().toISOString() + '\n';
    const content = Buffer.from(testContent, 'utf-8');
    const targetFolder = testFolderToken || rootFolderToken;
    
    const uploadResp = await client.drive.v1.file.uploadAll({
      data: {
        file_name: 'test-upload-' + Date.now() + '.md',
        parent_type: 'explorer',
        parent_node: targetFolder,
        size: content.length,
        file: content,
      },
    });

    fileToken = uploadResp.data?.file_token || '';
    if (fileToken) {
      output.push('✅ 文件上传成功');
      output.push('   File Token: ' + fileToken);
      output.push('   URL: https://feishu.cn/file/' + fileToken);
      uploadPass = true;
    } else {
      output.push('❌ 文件上传失败: 未返回 file_token');
    }
  } catch (err) {
    output.push('❌ 文件上传失败: ' + err.message);
    output.push('   错误码: ' + (err.code || 'unknown'));
  }
  output.push('');

  // 总结
  output.push('=== 验证结果总结 ===');
  output.push('1. list 接口: ' + (listPass ? '✅ 通过' : '❌ 失败'));
  output.push('2. create_folder 接口: ' + (folderPass ? '✅ 通过' : '❌ 失败'));
  output.push('3. upload_all 接口: ' + (uploadPass ? '✅ 通过' : '❌ 失败'));
  output.push('');

  const allPass = listPass && folderPass && uploadPass;
  if (allPass) {
    output.push('✅ 全部通过 - 可以启用卡片消息功能');
  } else {
    output.push('❌ 存在失败 - 需要检查配置');
  }

  fs.writeFileSync('scripts/test-result.txt', output.join('\n'));
  console.log(output.join('\n'));
}

main().catch(err => {
  console.error('Fatal error:', err);
});
