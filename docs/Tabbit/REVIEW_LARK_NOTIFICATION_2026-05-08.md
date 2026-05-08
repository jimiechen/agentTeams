# 飞书通知改造方案评审意见

**评审日期**: 2026-05-08
**评审对象**: 
- 调研文档: `LARK_NOTIFICATION_IMPLEMENTATION.md`
- 改造方案: `TabAI会话_1778209000670.md`
**评审人**: AI Assistant
**结论**: ⚠️ 有条件通过（需解决3个关键问题）

---

## 一、方案概述

### 当前问题
当前 `replyPost()` 将长文本直接塞进飞书 post 消息体，导致：
- 代码块、表格、嵌套列表渲染错乱
- 消息长度受限（当前截断至 2000 字符）
- 复杂格式内容可读性差

### 改造目标
1. 飞书群消息只承载"任务完成 + 文档链接 + 摘要"
2. 完整响应写入本地 `runs/{run-id}/response.md`
3. 同步上传到飞书云文档，路径与本地镜像
4. 群聊发送结构化卡片消息，点击跳转云文档

---

## 二、评审意见

### ✅ 同意的部分

| 序号 | 内容 | 评价 |
|------|------|------|
| 1 | 将长文本从群消息剥离，改为云文档链接 | ✅ 正确方向，解决格式错乱和长度限制问题 |
| 2 | 本地路径与飞书云文档路径镜像 | ✅ 便于追溯和对照 |
| 3 | 使用飞书卡片消息（interactive）替代 post | ✅ 结构化展示，用户体验更好 |
| 4 | 保留降级路径（上传失败时回退到本地路径提示） | ✅ 高可用设计 |
| 5 | 新增 `markdown-formatter.ts` 纯函数模块 | ✅ 职责分离，便于测试 |
| 6 | 分阶段执行（Step 1-6） | ✅ 风险可控，便于验证 |

### ⚠️ 需要修改的部分

#### 问题 1: 飞书云文档 API 使用错误（严重）

**方案代码**:
```typescript
// lark-doc-uploader.ts 第 175-188 行
const docResp = await this.client.docx.document.create({
  data: {
    folder_token: folderToken,
    title: fileName.replace(/\.md$/, ''),
  },
});
// ...
await this.client.docx.document.rawContent({
  path: { document_id: docToken },
  data: { content },
});
```

**问题**:
1. `docx.document.rawContent` 接口**不存在**于飞书开放 API
2. 飞书云文档（docx）不支持直接写入 Markdown 内容
3. 正确的做法应该是：
   - **方案 A**: 使用 `drive.file.upload_all` 上传 Markdown 文件到云空间（作为文件，非在线文档）
   - **方案 B**: 创建 docx 文档后，使用 `docx.v1.blocks` API 逐块写入内容（需将 Markdown 解析为飞书文档块结构）
   - **方案 C**: 使用飞书 "知识库" 或 "维基" 的导入功能

**建议**:
采用 **方案 A**（上传文件），因为：
- 实现简单，直接上传 `.md` 文件
- 飞书支持在线预览 Markdown 文件
- 保持文件原始格式，无需转换

```typescript
// 修正后的上传逻辑
async uploadMarkdownFile(
  localFilePath: string,
  relativePath: string
): Promise<UploadResult> {
  const content = await fs.readFile(localFilePath, 'utf-8');
  const parts = relativePath.split('/').filter(Boolean);
  const fileName = parts.pop()!;
  const folderToken = await this.ensureFolderPath(parts);
  
  // 使用 drive.file.upload_all 上传文件
  const uploadResp = await this.client.drive.file.upload_all({
    data: {
      file_name: fileName,
      parent_type: 'explorer',
      parent_node: folderToken,
      size: Buffer.byteLength(content),
      file: Buffer.from(content), // 或创建可读流
    },
  });
  
  const fileToken = uploadResp.data?.file_token;
  if (!fileToken) throw new Error('文件上传失败');
  
  return {
    fileToken,
    fileUrl: `https://feishu.cn/file/${fileToken}`,
    relativePath,
  };
}
```

#### 问题 2: 卡片消息链接类型错误（中等）

**方案代码**:
```typescript
// lark-client.ts 第 293 行
url: params.docUrl,
```

**问题**:
- 飞书卡片消息的 `button` 组件的 `url` 字段，对于云文档链接需要特殊处理
- 直接使用 `https://feishu.cn/file/{token}` 可能在某些客户端无法正确跳转
- 应该使用飞书提供的 `open_url` 动作类型，或确保链接格式正确

**建议**:
```typescript
{
  tag: 'button',
  text: { tag: 'plain_text', content: '📄 查看完整报告' },
  url: params.docUrl,
  type: 'primary',
  // 添加 multi_open_url 确保兼容性
  multi_open_url: {
    url: params.docUrl,
    pc_url: params.docUrl,
    ios_url: params.docUrl,
    android_url: params.docUrl,
  },
}
```

#### 问题 3: 缺少配置项验证和默认值（低）

**方案代码**:
```yaml
lark:
  root_folder_token: "fldcnXXXXXXXXXXXX"
```

**问题**:
- `root_folder_token` 为必填项，但老配置没有此字段
- 缺少获取 `root_folder_token` 的文档说明
- 没有验证 `root_folder_token` 是否有效的逻辑

**建议**:
1. 在 `config.ts` 中添加可选配置项：
```typescript
export interface AppConfig {
  lark: {
    appId: string;
    appSecret: string;
    chatId: string;
    mentionKeyword: string;
    rootFolderToken?: string;  // 新增，可选
    uploadEnabled?: boolean;   // 新增，默认 false
  };
  // ...
}
```

2. 启动时验证：
```typescript
if (cfg.lark.uploadEnabled && !cfg.lark.rootFolderToken) {
  bootWarn('Lark upload enabled but root_folder_token not set, falling back to local-only');
  cfg.lark.uploadEnabled = false;
}
```

3. 在 `.env.example` 中增加注释说明：
```bash
# 飞书云文档上传（可选）
# LARK_ROOT_FOLDER_TOKEN=fldcnxxxxxxxx  # 在飞书空间创建 agentTeams 文件夹后，从 URL 提取
# LARK_UPLOAD_ENABLED=true              # 是否启用飞书云文档上传
```

---

## 三、补充建议

### 建议 1: 渐进式改造

不要一次性替换 `replyPost`，而是新增模式：

```typescript
// runner-multi.ts
enum ReplyMode {
  POST = 'post',           // 当前模式
  CARD = 'card',           // 新卡片模式
  HYBRID = 'hybrid',       // 先尝试卡片，失败回退到 post
}

// 配置项
reply_mode: 'post' | 'card' | 'hybrid'  // 默认 'hybrid'
```

这样可以在不破坏现有功能的情况下逐步验证新方案。

### 建议 2: 本地文件结构优化

当前 `runs/{run-id}.md` 是扁平结构，建议改为：

```
runs/
└── {run-id}/
    ├── response.md      # AI 响应内容
    ├── meta.json        # 任务元数据
    └── prompt.md        # 原始提示词
```

与方案一致，但需要注意：
- 修改 `persist()` 方法的文件路径
- 保留旧的 `runs/{run-id}.md` 作为兼容（或迁移脚本）

### 建议 3: 卡片消息内容精简

当前卡片字段较多，建议精简为：

```typescript
const card = {
  config: { wide_screen_mode: true },
  header: {
    title: { tag: 'plain_text', content: `${statusEmoji} ${params.taskName}` },
    template: params.status === 'success' ? 'green' : 'red',
  },
  elements: [
    {
      tag: 'div',
      fields: [
        { is_short: true, text: { tag: 'lark_md', content: `**耗时**\n${params.durationSec}s` } },
        { is_short: true, text: { tag: 'lark_md', content: `**状态**\n${params.status}` } },
      ],
    },
    { tag: 'hr' },
    {
      tag: 'div',
      text: { tag: 'lark_md', content: `**摘要**\n${params.summary}` },
    },
    {
      tag: 'action',
      actions: [
        {
          tag: 'button',
          text: { tag: 'plain_text', content: '📄 查看完整报告' },
          url: params.docUrl,
          type: 'primary',
        },
      ],
    },
  ],
};
```

### 建议 4: 上传限流

如方案所述，飞书 API 有 QPS 限制。建议：

```typescript
import pQueue from 'p-queue';

class LarkDocUploader {
  private uploadQueue = new pQueue({ concurrency: 3 });
  
  async uploadMarkdown(localFilePath: string, relativePath: string): Promise<UploadResult> {
    return this.uploadQueue.add(() => this.doUpload(localFilePath, relativePath));
  }
  
  private async doUpload(...): Promise<UploadResult> {
    // 实际上传逻辑
  }
}
```

---

## 四、修改后的实施计划

| 步骤 | 内容 | 耗时 | 依赖 |
|------|------|------|------|
| Step 1 | 创建 `markdown-formatter.ts` | 30min | 无 |
| Step 2 | 创建 `lark-doc-uploader.ts`（使用 `drive.file.upload_all`） | 45min | Step 1 |
| Step 3 | 在 `lark-client.ts` 新增 `sendTaskCompleteCard` | 20min | 无 |
| Step 4 | 改造 `runner-multi.ts`，支持 `reply_mode` 配置 | 30min | Step 1-3 |
| Step 5 | 更新 `config.ts` 和 `.env.example` | 15min | Step 4 |
| Step 6 | 端到端验证（上传文件 + 卡片消息） | 30min | Step 5 |
| Step 7 | 清理临时脚本文件，提交代码 | 15min | Step 6 |

**总耗时**: 约 3.5 小时

---

## 五、风险与应对

| 风险 | 等级 | 应对 |
|------|------|------|
| 飞书 `drive.file.upload_all` API 与预期不符 | 高 | Step 2 预留 45min，包含 API 调试时间 |
| 卡片消息在某些飞书客户端显示异常 | 中 | 使用 `HYBRID` 模式，可回退到 `POST` |
| 上传阻塞主流程 | 中 | 上传失败降级到本地路径提示，不阻塞 |
| root_folder_token 配置错误 | 低 | 启动时验证，无效则禁用上传功能 |

---

## 六、评审结论

**方案方向正确**，将长文本从群消息剥离到云文档是解决当前格式错乱问题的最佳实践。

**关键修改点**:
1. ⚠️ **必须修改**: 使用 `drive.file.upload_all` 替代不存在的 `docx.document.rawContent`
2. ⚠️ **建议修改**: 卡片消息按钮添加 `multi_open_url` 确保兼容性
3. 💡 **建议优化**: 增加 `reply_mode` 配置，支持渐进式改造

**建议决策**: 
- 如果飞书 `drive.file.upload_all` API 验证通过 → **批准实施**
- 如果 API 验证不通过 → **退回重新设计上传方案**

---

**评审完成时间**: 2026-05-08
**下一步行动**: 验证 `drive.file.upload_all` API 可用性
