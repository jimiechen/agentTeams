/**
 * lark-doc-uploader.ts - 飞书云文档上传封装
 * 使用 drive.file.upload_all 直接上传 .md 文件
 */

import type lark from '@larksuiteoapi/node-sdk';
import { createReadStream, statSync } from 'node:fs';
import { dirname } from 'node:path';
import PQueue from 'p-queue';

export interface UploadResult {
  fileToken: string;
  fileUrl: string;
  relativePath: string;
}

export class LarkAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LarkAuthError';
  }
}

export class LarkDocUploader {
  private client: lark.Client;
  private rootFolderToken: string;
  private pathTokenCache = new Map<string, string>();
  private queue: PQueue;

  constructor(
    client: lark.Client,
    rootFolderToken: string,
    options: { concurrency?: number } = {}
  ) {
    this.client = client;
    this.rootFolderToken = rootFolderToken;
    this.queue = new PQueue({ concurrency: options.concurrency ?? 3 });
  }

  /**
   * 上传 Markdown 文件到飞书云空间
   * 自动按相对路径创建/查找父目录，与本地路径镜像
   */
  async uploadMarkdown(
    localFilePath: string,
    relativePath: string
  ): Promise<UploadResult> {
    return this.queue.add(async () => {
      // 检查文件大小（飞书单文件上限 20MB）
      const stats = statSync(localFilePath);
      const maxSize = 20 * 1024 * 1024; // 20MB
      if (stats.size > maxSize) {
        throw new Error(`文件大小 ${stats.size} 超过 20MB 上限`);
      }

      // 解析路径，逐级创建/查找文件夹
      const parts = relativePath.split('/').filter(Boolean);
      const fileName = parts.pop()!;
      const folderToken = await this.ensureFolderPath(parts);

      // 使用流式上传
      const fileStream = createReadStream(localFilePath);
      const uploadResp = await this.client.drive.v1.file.uploadAll({
        data: {
          file_name: fileName,
          parent_type: 'explorer',
          parent_node: folderToken,
          size: stats.size,
          file: fileStream,
        } as any,
      });

      // 注意：uploadAll 返回的 file_token 在根级别，不是在 data 里
      const fileToken = (uploadResp as any)?.file_token || '';
      if (!fileToken) {
        throw new Error('文件上传失败：未返回 file_token');
      }

      return {
        fileToken,
        fileUrl: `https://feishu.cn/file/${fileToken}`,
        relativePath,
      };
    }) as Promise<UploadResult>;
  }

  /**
   * 按路径数组逐级查找或创建文件夹
   * 例如 ['runs', '2026-05-08', 'run-xxx'] 会在飞书中创建对应的目录结构
   */
  private async ensureFolderPath(parts: string[]): Promise<string> {
    let currentToken = this.rootFolderToken;
    let cumulativePath = '';

    for (const part of parts) {
      cumulativePath = cumulativePath ? `${cumulativePath}/${part}` : part;

      // 缓存命中
      if (this.pathTokenCache.has(cumulativePath)) {
        currentToken = this.pathTokenCache.get(cumulativePath)!;
        continue;
      }

      // 查询当前目录下是否已存在该子文件夹
      try {
        const listResp = await this.client.drive.v1.file.list({
          params: { folder_token: currentToken },
        });
        const files = (listResp.data as any)?.files || [];
        const existing = files.find(
          (f: any) => f.name === part && f.type === 'folder'
        );

        if (existing) {
          currentToken = existing.token;
        } else {
          // 创建新文件夹
          const createResp = await this.client.drive.v1.file.createFolder({
            data: {
              name: part,
              folder_token: currentToken,
            } as any,
          });
          currentToken = (createResp.data as any)?.token || '';
          if (!currentToken) {
            throw new Error(`创建文件夹失败: ${cumulativePath}`);
          }
        }

        this.pathTokenCache.set(cumulativePath, currentToken);
      } catch (err: any) {
        // 401/403 认证错误
        if (err.code === 401 || err.code === 403) {
          throw new LarkAuthError(`飞书认证失败，请检查 app_id/app_secret: ${err.message}`);
        }
        // 429 限流
        if (err.code === 429) {
          // 等待 1 秒后重试一次
          await new Promise(r => setTimeout(r, 1000));
          return this.ensureFolderPath(parts);
        }
        throw err;
      }
    }

    return currentToken;
  }
}
