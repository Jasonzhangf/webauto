/**
 * Phase 3-4 Block: 持久化详情内容
 *
 * 职责：
 * - 创建目录：~/.webauto/download/xiaohongshu/{env}/{keyword}/{noteId}/
 * - 下载图片到 images/ 目录
 * - 生成 README.md（含相对路径引用）
 */

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface PersistDetailInput {
  noteId: string;
  detail: {
    title?: string;
    content?: string;
    authorName?: string;
    authorId?: string;
    publishTime?: string;
    images?: string[];
  };
  keyword: string;
  env?: string;
  unifiedApiUrl?: string;
}

export interface PersistDetailOutput {
  success: boolean;
  noteDir: string;
  readmePath: string;
  imagesDir: string;
  imageCount: number;
  error?: string;
}

function resolveDownloadRoot(): string {
  const custom = process.env.WEBAUTO_DOWNLOAD_ROOT || process.env.WEBAUTO_DOWNLOAD_DIR;
  if (custom && custom.trim()) return custom;
  const home = process.env.HOME || process.env.USERPROFILE || os.homedir();
  return path.join(home, '.webauto', 'download');
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

async function downloadImage(url: string, destPath: string, timeout = 30000): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(destPath, buffer);
  } finally {
    clearTimeout(timer);
  }
}

function getFileExtension(url: string): string {
  const match = url.match(/\\.([a-z0-9]+)(?:\\?|$)/i);
  return match ? `.${match[1].toLowerCase()}` : '.jpg';
}

export async function execute(input: PersistDetailInput): Promise<PersistDetailOutput> {
  const {
    noteId,
    detail,
    keyword,
    env = 'download',
    unifiedApiUrl = 'http://127.0.0.1:7701',
  } = input;

  console.log(`[Phase34PersistDetail] 持久化: ${noteId}`);

  try {
    // 1. 创建目录结构
    const baseDir = path.join(resolveDownloadRoot(), 'xiaohongshu', env, keyword, noteId);
    const imagesDir = path.join(baseDir, 'images');
    const readmePath = path.join(baseDir, 'README.md');

    await ensureDir(baseDir);
    await ensureDir(imagesDir);

    // 2. 下载图片
    const images = detail.images || [];
    let downloadedCount = 0;

    for (let i = 0; i < images.length; i++) {
      try {
        const imgUrl = images[i];
        const ext = getFileExtension(imgUrl);
        const destPath = path.join(imagesDir, `${i}${ext}`);

        console.log(`[Phase34PersistDetail] 下载图片 ${i + 1}/${images.length}: ${imgUrl.slice(0, 60)}...`);
        await downloadImage(imgUrl, destPath);
        downloadedCount++;

        // 避免请求过快
        if (i < images.length - 1) {
          await delay(200);
        }
      } catch (err: any) {
        console.warn(`[Phase34PersistDetail] 图片下载失败 [${i}]: ${err.message}`);
      }
    }

    // 3. 生成 README.md
    const lines: string[] = [];
    lines.push(`# ${detail.title || '无标题'}`);
    lines.push('');
    lines.push(`## 元数据`);
    lines.push(`- **Note ID**: ${noteId}`);
    lines.push(`- **作者**: ${detail.authorName || '未知'} (${detail.authorId || 'N/A'})`);
    lines.push(`- **发布时间**: ${detail.publishTime || '未知'}`);
    lines.push(`- **原始链接**: \`https://www.xiaohongshu.com/explore/${noteId}\``);
    lines.push('');
    lines.push(`## 正文`);
    lines.push(detail.content || '无正文内容');
    lines.push('');

    if (downloadedCount > 0) {
      lines.push(`## 图片 (${downloadedCount}张)`);
      for (let i = 0; i < downloadedCount; i++) {
        lines.push(`![图片${i + 1}](./images/${i}.jpg)`);
      }
      lines.push('');
    }

    const readmeContent = lines.join('\\n');
    await fs.writeFile(readmePath, readmeContent, 'utf8');

    console.log(`[Phase34PersistDetail] ✅ 持久化完成: ${baseDir}`);

    return {
      success: true,
      noteDir: baseDir,
      readmePath,
      imagesDir,
      imageCount: downloadedCount,
    };

  } catch (err: any) {
    console.error(`[Phase34PersistDetail] ❌ 失败: ${err.message}`);
    return {
      success: false,
      noteDir: '',
      readmePath: '',
      imagesDir: '',
      imageCount: 0,
      error: err.message,
    };
  }
}
