/**
 * Step 0: 飞书 API 可用性验证脚本
 * 验证 drive.file.upload_all / create_folder / list 三个核心接口
 */

import lark from '@larksuiteoapi/node-sdk';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

// 从环境变量读取配置
function need(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env var: ${key}`);
  return v;
}

const appId = need('LARK_APP_ID');
const appSecret = need('LARK_APP_SECRET');
const rootFolderToken = process.env.LARK_ROOT_FOLDER_TOKEN || '';

const client = new lark.Client({
  appId,
  appSecret,
  appType: lark.AppType.SelfBuild,
});

const reports: string[] = [];
function log(msg: string) {
  console.log(msg);
  reports.push(msg);
}

async function main() {
  log('=== Step 0: 飞书 API 可用性验证 ===');
  log(`时间: ${new Date().toISOString()}`);
  log(`App ID: ${appId.slice(0, 8)}...`);
  log(`Root Folder Token: ${rootFolderToken || '(未设置)'}`);
  log('');

  // 1. 验证 list 接口（查询根目录）
  log('--- 测试 1: drive.v1.file.list ---');
  try {
    const listResp = await client.drive.v1.file.list({
      params: { folder_token: rootFolderToken || undefined },
    });
    log(`✅ 列表查询成功`);
    log(`   返回数据键: ${Object.keys(listResp.data || {}).join(', ')}`);
    const files = (listResp.data as any)?.files || [];
    log(`   文件数量: ${files.length}`);
    if (files.length > 0) {
      log(`   首个文件: ${files[0].name} (${files[0].type})`);
    }
  } catch (err: any) {
    log(`❌ 列表查询失败: ${err.message}`);
    log(`   错误码: ${err.code || 'unknown'}`);
  }
  log('');

  // 2. 验证 create_folder 接口
  log('--- 测试 2: drive.v1.file.create_folder ---');
  let testFolderToken = '';
  try {
    const folderResp = await client.drive.v1.file.createFolder({
      data: {
        name: `test-api-${Date.now()}`,
        folder_token: rootFolderToken || undefined,
      } as any,
    });
    testFolderToken = (folderResp.data as any)?.token || '';
    log(`✅ 文件夹创建成功`);
    log(`   Token: ${testFolderToken}`);
    log(`   URL: https://feishu.cn/drive/folder/${testFolderToken}`);
  } catch (err: any) {
    log(`❌ 文件夹创建失败: ${err.message}`);
    log(`   错误码: ${err.code || 'unknown'}`);
  }
  log('');

  // 3. 验证 upload_all 接口
  log('--- 测试 3: drive.v1.file.upload_all ---');
  let fileToken = '';
  try {
    // 创建测试文件
    const testDir = join(process.cwd(), 'scripts', '.tmp');
    mkdirSync(testDir, { recursive: true });
    const testFile = join(testDir, `test-upload-${Date.now()}.md`);
    writeFileSync(testFile, '# Test Upload\n\nThis is a test markdown file.\n\n```typescript\nconst x = 1;\n```\n', 'utf-8');

    const content = readFileSync(testFile);
    const uploadResp = await client.drive.v1.file.uploadAll({
      data: {
        file_name: `test-upload-${Date.now()}.md`,
        parent_type: 'explorer',
        parent_node: testFolderToken || rootFolderToken || undefined,
        size: content.length,
        file: content,
      } as any,
    });

    fileToken = (uploadResp.data as any)?.file_token || '';
    log(`✅ 文件上传成功`);
    log(`   File Token: ${fileToken}`);
    log(`   URL: https://feishu.cn/file/${fileToken}`);
  } catch (err: any) {
    log(`❌ 文件上传失败: ${err.message}`);
    log(`   错误码: ${err.code || 'unknown'}`);
    if (err.response) {
      log(`   响应: ${JSON.stringify(err.response).slice(0, 200)}`);
    }
  }
  log('');

  // 总结
  log('=== 验证结果总结 ===');
  const allPass = fileToken && testFolderToken;
  if (allPass) {
    log('✅ 全部通过 - 可以进入 Step 1');
  } else {
    log('❌ 存在失败 - 需要检查配置或 API 权限');
  }

  // 保存报告
  const reportDir = join(process.cwd(), '..', 'comms', 'reports');
  mkdirSync(reportDir, { recursive: true });
  const reportFile = join(reportDir, `${Date.now()}-api-verification.md`);
  writeFileSync(reportFile, reports.join('\n'), 'utf-8');
  log(`\n报告已保存: ${reportFile}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
