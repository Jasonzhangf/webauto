/**
 * PersistXhsNoteBlock
 *
 * 将小红书帖子详情 + 评论持久化到本地目录：
 *   ~/.webauto/download/xiaohongshu/{env}/{keyword}/{noteId}/
 *   - content.md
 *   - images/{index}.jpg
 */

import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';

export interface PersistXhsNoteInput {
  sessionId: string;
  env: string;
  platform?: string;
  keyword: string;
  noteId: string;
  detailUrl?: string;
  detail?: any;
  commentsResult?: any;
  persistMode?: 'detail' | 'comments' | 'both';
}

export interface PersistXhsNoteOutput {
  success: boolean;
  error?: string;
  outputDir?: string;
  contentPath?: string;
  imagesDir?: string;
}

function sanitizeForPath(name: string): string {
  if (!name) return '';
  return name.replace(/[\\/:"*?<>|]+/g, '_').trim();
}

function formatUrlForLog(url: string, maxLen = 180): string {
  const s = (url || '').toString();
  if (s.length <= maxLen) return s;
  return `${s.slice(0, maxLen)}…`;
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

async function downloadImage(url: string, imagesDir: string, index: number): Promise<string | null> {
  if (!url) return null;

  // 过滤明显是头像/图标等小图的最小体积阈值（字节）
  const MIN_IMAGE_BYTES = 20 * 1024; // 约 20KB

  let normalized = String(url).trim();
  if (!normalized) return null;

  if (normalized.startsWith('//')) {
    normalized = `https:${normalized}`;
  }

  // 绝大多数头像/静态图标不属于帖子图片，直接跳过（避免大量无意义的 fetch）
  const skipByUrl =
    /sns-avatar-[^/]+\.xhscdn\.com\/avatar\//i.test(normalized) ||
    /picasso-static\.xiaohongshu\.com\/fe-platform\//i.test(normalized) ||
    normalized.startsWith('data:') ||
    normalized.startsWith('blob:');
  if (skipByUrl) {
    return null;
  }

  if (!/^https?:/i.test(normalized)) {
    console.warn(`[PersistXhsNote] Skip non-http image url: ${formatUrlForLog(normalized)}`);
    return null;
  }

  try {
    const res = await fetch(normalized);
    if (!res.ok) {
      console.warn(
        `[PersistXhsNote] Image fetch failed: ${formatUrlForLog(normalized)} status=${res.status}`,
      );
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());

    // 根据字节大小粗略过滤掉头像/小图标等小尺寸图片
    if (buf.length < MIN_IMAGE_BYTES) {
      console.warn(
        `[PersistXhsNote] Skip tiny image (${buf.length}B < ${MIN_IMAGE_BYTES}B): ${formatUrlForLog(normalized)}`,
      );
      return null;
    }

    const filename = `${String(index).padStart(2, '0')}.jpg`;
    const filepath = path.join(imagesDir, filename);
    await fs.writeFile(filepath, buf);
    return path.join('images', filename);
  } catch (err: any) {
    console.warn(
      `[PersistXhsNote] Image download error: ${formatUrlForLog(normalized)} - ${err?.message || err}`,
    );
    return null;
  }
}

export async function execute(input: PersistXhsNoteInput): Promise<PersistXhsNoteOutput> {
  const {
    env,
    platform = 'xiaohongshu',
    keyword,
    noteId,
    detailUrl,
    detail,
    commentsResult,
    persistMode = 'both',
  } = input;

  if (!env || !keyword || !noteId) {
    return {
      success: false,
      error: 'Missing env, keyword or noteId',
    };
  }

  try {
    const homeDir = os.homedir();
    const baseDir = path.join(homeDir, '.webauto', 'download', platform, env);
    const safeKeyword = sanitizeForPath(keyword) || 'unknown';
    const keywordDir = path.join(baseDir, safeKeyword);
    const postDir = path.join(keywordDir, noteId);
    const imagesDir = path.join(postDir, 'images');

    await ensureDir(keywordDir);
    await ensureDir(postDir);
    await ensureDir(imagesDir);

    const wantDetail = persistMode === 'detail' || persistMode === 'both';
    const wantComments = persistMode === 'comments' || persistMode === 'both';

    const detailData = detail || {};
    const titleFromDetail =
      detailData.title ||
      detailData.note_title ||
      detailData.header?.title ||
      detailData.content?.title ||
      '';
    const title = titleFromDetail || '无标题';

    const author =
      detailData.author ||
      detailData.header?.author ||
      detailData.header?.user_name ||
      detailData.header?.nickname ||
      '';

    const contentText =
      detailData.contentText ||
      detailData.content?.text ||
      detailData.content?.desc ||
      detailData.content?.content ||
      '';

    const detailPath = path.join(postDir, 'content.md');
    const commentsPath = path.join(postDir, 'comments.md');

    // 1) 详情（正文/图片）
    if (wantDetail) {
      const existingDetail = await fs.stat(detailPath).catch(() => null);

      // 图片下载：如果 images 目录已有文件则不重复下载
      let hasAnyImage = false;
      try {
        const existing = await fs.readdir(imagesDir).catch(() => []);
        hasAnyImage = Array.isArray(existing) && existing.length > 0;
      } catch {
        hasAnyImage = false;
      }

      const localImages: string[] = [];
      const images: string[] = Array.isArray(detailData?.gallery?.images)
        ? detailData.gallery.images
        : [];

      if (!hasAnyImage && images.length > 0) {
        const MAX_IMAGES_TO_DOWNLOAD = 6;
        let imgIndex = 0;
        for (const url of images) {
          imgIndex += 1;
          if (imgIndex > MAX_IMAGES_TO_DOWNLOAD) break;
          const rel = await downloadImage(url, imagesDir, imgIndex);
          if (rel) localImages.push(rel);
        }
      }

      if (!existingDetail || !existingDetail.isFile()) {
        const lines: string[] = [];
        lines.push(`# ${title}`);
        lines.push('');
        lines.push(`- Note ID: ${noteId || '未知'}`);
        lines.push(`- 关键词: ${keyword || '未知'}`);
        if (detailUrl) lines.push(`- 链接: ${detailUrl}`);
        if (author) lines.push(`- 作者: ${author}`);
        lines.push(`- 采集时间: ${new Date().toISOString()}`);
        lines.push('');
        lines.push('## 正文');
        lines.push('');
        lines.push(contentText || '（无正文）');
        lines.push('');

        // 图片渲染：优先使用本地已下载的图片；否则仅记录数量
        const imagesToRender = localImages.length > 0 ? localImages : [];
        if (imagesToRender.length > 0) {
          lines.push('## 图片');
          lines.push('');
          for (const rel of imagesToRender) {
            const safeRel = rel.replace(/\\/g, '/');
            lines.push(`![](${safeRel})`);
          }
          lines.push('');
        }

        await fs.writeFile(detailPath, lines.join('\n'), 'utf-8');
      }
    }

    // 2) 评论（独立文件，支持后续增量更新）
    if (wantComments) {
      const comments: any[] = Array.isArray(commentsResult?.comments) ? commentsResult.comments : [];
      const headerTotal =
        typeof commentsResult?.totalFromHeader === 'number' ? commentsResult.totalFromHeader : null;

      // 没有任何评论且没有明确 reachedEnd/emptyState 信号时，不写入 comments.md
      const hasAnySignal =
        comments.length > 0 ||
        typeof commentsResult?.reachedEnd === 'boolean' ||
        typeof commentsResult?.emptyState === 'boolean' ||
        typeof headerTotal === 'number';

      if (hasAnySignal) {
        const lines: string[] = [];
        lines.push(`# 评论（${comments.length}）`);
        lines.push('');
        lines.push(`- Note ID: ${noteId || '未知'}`);
        lines.push(`- 关键词: ${keyword || '未知'}`);
        if (detailUrl) lines.push(`- 链接: ${detailUrl}`);
        lines.push(`- 采集时间: ${new Date().toISOString()}`);
        lines.push(
          `- 评论统计: 抓取=${comments.length}, header=${
            headerTotal !== null ? headerTotal : '未知'
          }（reachedEnd=${commentsResult?.reachedEnd ? '是' : '否'}, empty=${
            commentsResult?.emptyState ? '是' : '否'
          }）`,
        );
        lines.push('');

        if (comments.length === 0) {
          lines.push('（无评论）');
        } else {
          for (const c of comments) {
            if (!c) continue;
            const user = c.user_name || c.username || '未知用户';
            const uid = c.user_id || '';
            const ts = c.timestamp || '';
            const text = c.text || '';
            const idPart = uid ? ` (${uid})` : '';
            const tsPart = ts ? ` [${ts}]` : '';
            lines.push(`- **${user}**${idPart}${tsPart}：${text}`);
          }
        }

        await fs.writeFile(commentsPath, lines.join('\n'), 'utf-8');
      }
    }

    return {
      success: true,
      outputDir: postDir,
      contentPath: detailPath,
      imagesDir,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || String(err),
    };
  }
}
