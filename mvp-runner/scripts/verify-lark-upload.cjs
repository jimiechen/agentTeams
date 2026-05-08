/**
 * Step 0: 飞书 API 可用性验证脚本
 * 验证 drive.file.upload_all / create_folder / list 三个核心接口
 * 
 * 使用方式: node scripts/verify-lark-upload.cjs
 */

const lark = require('@larksuiteoapi/node-sdk');
const fs = require('node:fs');
const path = require('node:path');

// 从环境变量读取配置
function need(key) {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env var: ${key}`);
  return v;
}

const appId = need('LARK_APP_ID');
const appSecret = need('LARK_APP_SECRET');
const rootFolderToken = 'AaeMfIB3clNGUQdRnHHc2wUbnKc'; // 用户提供的 token

const client = new lark.Client({
  appId,
  appSecret,
  appType: lark.AppType.SelfBuild,
});

const reports = [];
function log(msg) {
  console.log(msg);
  reports.push(msg);
}

async function main() {
  log('=== Step 0: 飞书 API 可用性验证 ===');
  log(`时间: ${new Date().toISOString()}`);
  log(`App ID: ${appId.slice(0, 8)}...`);
  log(`Root Folder Token: ${rootFolderToken}`);
  log('');

  let listPass = false;
  let folderPass = false;
  let uploadPass = false;
  let testFolderToken = '';
  let fileToken = '';

  // 1. 验证 list 接口（查询根目录）
  log('--- 测试 1: drive.v1.file.list ---');
  try {
    const listResp = await client.drive.v1.file.list({
      params: { folder_token: rootFolderToken },
    });
    log(`✅ 列表查询成功`);
    const files = listResp.data?.files || [];
    log(`   文件数量: ${files.length}`);
    if (files.length > 0) {
      log(`   首个文件: ${files[0].name} (${files[0].type})`);
    }
    listPass = true;
  } catch (err) {
    log(`❌ 列表查询失败: ${err.message}`);
    log(`   错误码: ${err.code || 'unknown'}`);
  }
  log('');

  // 2. 验证 create_folder 接口
  log('--- 测试 2: drive.v1.file.create_folder ---');
  try {
    const folderResp = await client.drive.v1.file.createFolder({
      data: {
        name: `test-api-${Date.now()}`,
        folder_token: rootFolderToken,
      },
    });
    testFolderToken = folderResp.data?.token || '';
    if (testFolderToken) {
      log(`✅ 文件夹创建成功`);
      log(`   Token: ${testFolderToken}`);
      log(`   URL: https://feishu.cn/drive/folder/${testFolderToken}`);
      folderPass = true;
    } else {
      log(`❌ 文件夹创建失败: 未返回 token`);
    }
  } catch (err) {
    log(`❌ 文件夹创建失败: ${err.message}`);
    log(`   错误码: ${err.code || 'unknown'}`);
  }
  log('');

  // 3. 验证 upload_all 接口
  log('--- 测试 3: drive.v1.file.upload_all ---');
  try {
    // 创建测试文件
    const testDir = path.join(__dirname, '.tmp');
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    const testFile = path.join(testDir, `test-upload-${Date.now()}.md`);
    fs.writeFileSync(testFile, `# Test Upload\n\nThis is a test markdown file.\n\n时间: ${new Date().toISOString()}\n`, 'utf-8');

    const content = fs.readFileSync(testFile);
    const targetFolder = testFolderToken || rootFolderToken;
    
    const uploadResp = await client.drive.v1.file.uploadAll({
      data: {
        file_name: `test-upload-${Date.now()}.md`,
        parent_type: 'explorer',
        parent_node: targetFolder,
        size: content.length,
        file: content,
      },
    });

    fileToken = uploadResp.data?.file_token || '';
    if (fileToken) {
      log(`✅ 文件上传成功`);
      log(`   File Token: ${fileToken}`);
      log(`   URL: https://feishu.cn/file/${fileToken}`);
      uploadPass = true;
    } else {
      log(`❌ 文件上传失败: 未返回 file_token`);
    }
  } catch (err) {
    log(`❌ 文件上传失败: ${err.message}`);
    log(`   错误码: ${err.code || 'unknown'}`);
    if (err.response) {
      log(`   响应: ${JSON.stringify(err.response).slice(0, 500)}`);
    }
  }
  log('');

  // 总结
  log('=== 验证结果总结 ===');
  log(`1. list 接口: ${listPass ? '✅ 通过' : '❌ 失败'}`);
  log(`2. create_folder 接口: ${folderPass ? '✅ 通过' : '❌ 失败'}`);
  log(`3. upload_all 接口: ${uploadPass ? '✅ 通过' : '❌ 失败'}`);
  log('');

  const allPass = listPass && folderPass && uploadPass;
  if (allPass) {
    log('✅ 全部通过 - 可以进入 Step 1');
    log('');
    log('下一步操作:');
    log('1. 将 LARK_ROOT_FOLDER_TOKEN 添加到 .env 文件');
    log('2. 设置 LARK_UPLOAD_ENABLED=true');
    log('3. 设置 LARK_REPLY_MODE=hybrid');
    log('4. 重启 mvp-runner');
  } else {
    log('❌ 存在失败 - 需要检查配置或 API 权限');
    log('');
    log('可能的原因:');
    log('1. 飞书应用没有云文档相关权限');
    log('2. token 格式不正确');
    log('3. 网络问题');
  }

  // 保存报告
  const reportDir = path.join(__dirname, '..', '..', 'comms', 'reports');
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }
  const reportFile = path.join(reportDir, `${Date.now()}-api-verification.md`);
  fs.writeFileSync(reportFile, reports.join('\n'), 'utf-8');
  log(`\n报告已保存: ${reportFile}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
