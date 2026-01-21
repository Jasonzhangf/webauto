import path from 'node:path';
import { promises as fs } from 'node:fs';
import { isImageFile, ocrImagesWithMacPlugin, pickMacOcrLanguages } from './macosVisionOcrPlugin.js';

function readLineValue(md: string, prefix: string): string | null {
  const re = new RegExp(`^${prefix}\\s*(.+)$`, 'm');
  const m = md.match(re);
  return m ? String(m[1] ?? '').trim() : null;
}

export interface OrganizeOneNoteOptions {
  noteDir: string;
  noteId: string;
  keyword: string;
  ocrLanguages?: string;
  runOcr?: boolean;
  requireExistingOcr?: boolean;
}

export interface OrganizeOneNoteResult {
  noteId: string;
  ocrPath: string;
  mergedPath: string;
  imageCount: number;
  ocrErrors: number;
  ocrLanguagesUsed: string;
  link?: string;
}

export async function organizeOneNote(options: OrganizeOneNoteOptions): Promise<OrganizeOneNoteResult> {
  const noteDir = options.noteDir;
  const noteId = options.noteId;
  const keyword = options.keyword;

  const contentPath = path.join(noteDir, 'content.md');
  const commentsPath = path.join(noteDir, 'comments.md');
  const imagesDir = path.join(noteDir, 'images');
  const ocrPath = path.join(noteDir, 'ocr.md');
  const mergedPath = path.join(noteDir, 'merged.md');

  const content = await fs.readFile(contentPath, 'utf-8');
  const comments = await fs.readFile(commentsPath, 'utf-8');
  const link = readLineValue(content, '- 链接:') || undefined;

  let imageFiles: string[] = [];
  try {
    const ents = await fs.readdir(imagesDir, { withFileTypes: true });
    imageFiles = ents
      .filter((e) => e.isFile())
      .map((e) => e.name)
      .filter((n) => isImageFile(n))
      .sort();
  } catch {
    imageFiles = [];
  }

  const picked = pickMacOcrLanguages(options.ocrLanguages);
  const ocrLanguagesUsed = picked.languages;

  let ocrErrors = 0;
  let ocrMd: string | null = null;

  const runOcr = options.runOcr !== false;
  if (runOcr) {
    const absImages = imageFiles.map((img) => path.join(imagesDir, img));
    const ocr = imageFiles.length
      ? await ocrImagesWithMacPlugin(absImages, { languages: ocrLanguagesUsed, timeoutMs: 120_000 })
      : { languagesUsed: ocrLanguagesUsed, results: [], binPath: '' };

    const byImage = new Map<string, { text?: string; error?: string }>();
    for (const r of ocr.results) {
      byImage.set(String(r.image || '').trim(), { text: r.text, error: r.error });
    }

    const lines: string[] = [];
    lines.push(`# OCR（${imageFiles.length}）`);
    lines.push('');
    lines.push(`- Note ID: ${noteId}`);
    lines.push(`- 关键词: ${keyword}`);
    if (link) lines.push(`- 链接: ${link}`);
    lines.push(`- OCR 语言: ${ocrLanguagesUsed}`);
    lines.push('');

    if (imageFiles.length === 0) {
      lines.push('（无图片或 images/ 目录不存在）');
      lines.push('');
    } else {
      for (const img of imageFiles) {
        const imgPath = path.join(imagesDir, img);
        const rel = `images/${img}`;
        const res = byImage.get(imgPath) || {};
        lines.push(`## ${rel}`);
        lines.push('');
        if (res.error) {
          ocrErrors += 1;
          lines.push(`> OCR 失败: ${res.error}`);
          lines.push('');
        }
        const text = String(res.text || '').trim();
        if (text) {
          lines.push('```');
          lines.push(text);
          lines.push('```');
        } else {
          lines.push('（无可识别文字）');
        }
        lines.push('');
      }
    }

    ocrMd = `${lines.join('\n')}\n`;
    await fs.writeFile(ocrPath, ocrMd, 'utf-8');
  } else {
    try {
      ocrMd = await fs.readFile(ocrPath, 'utf-8');
    } catch {
      if (options.requireExistingOcr) {
        throw new Error(`missing ocr.md (requireExistingOcr=true): ${ocrPath}`);
      }
      const lines: string[] = [];
      lines.push(`# OCR（${imageFiles.length}）`);
      lines.push('');
      lines.push(`- Note ID: ${noteId}`);
      lines.push(`- 关键词: ${keyword}`);
      if (link) lines.push(`- 链接: ${link}`);
      lines.push(`- OCR 语言: ${ocrLanguagesUsed}`);
      lines.push(`- OCR: skipped`);
      lines.push('');
      ocrMd = `${lines.join('\n')}\n`;
      await fs.writeFile(ocrPath, ocrMd, 'utf-8');
    }
  }

  const mergedLines: string[] = [];
  mergedLines.push(`# 合并（${noteId}）`);
  mergedLines.push('');
  mergedLines.push(`- Note ID: ${noteId}`);
  mergedLines.push(`- 关键词: ${keyword}`);
  if (link) mergedLines.push(`- 链接: ${link}`);
  mergedLines.push('');
  mergedLines.push('## 正文');
  mergedLines.push('');
  mergedLines.push(content.trim());
  mergedLines.push('');
  mergedLines.push('## OCR');
  mergedLines.push('');
  mergedLines.push(String(ocrMd || '').trim());
  mergedLines.push('');
  mergedLines.push('## 评论');
  mergedLines.push('');
  mergedLines.push(comments.trim());
  mergedLines.push('');

  await fs.writeFile(mergedPath, `${mergedLines.join('\n')}\n`, 'utf-8');

  return {
    noteId,
    ocrPath,
    mergedPath,
    imageCount: imageFiles.length,
    ocrErrors,
    ocrLanguagesUsed,
    ...(link ? { link } : {}),
  };
}
