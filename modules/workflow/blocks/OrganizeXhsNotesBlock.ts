/**
 * Workflow Block: OrganizeXhsNotesBlock
 *
 * 采集完成后的整理：
 * 1) OCR 扫描每个 note 的 images/，输出 ocr.md
 * 2) 合并 ocr + 正文 + 评论，输出 merged.md
 * 3) 合并所有帖子，输出 ALL.md（编号 + 链接 + 合并正文）
 *
 * 注意：
 * - 只做本地落盘整理（~/.webauto/download），不做任何浏览器操作。
 */

import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { countPersistedNotes } from './helpers/persistedNotes.js';
import { organizeOneNote } from './helpers/xhsNoteOrganizer.js';

export interface OrganizeXhsNotesInput {
  platform?: 'xiaohongshu';
  env?: string;
  keyword: string;
  ocrLanguages?: string;
  runOcr?: boolean;
}

export interface OrganizeXhsNotesOutput {
  success: boolean;
  keywordDir: string;
  noteCount: number;
  ocrLanguagesUsed: string;
  ocrWarning?: string; // legacy field (tesseract era)
  allPath?: string;
  processed: Array<{
    noteId: string;
    ocrPath?: string;
    mergedPath?: string;
    imageCount: number;
    ocrErrors: number;
    ok: boolean;
    error?: string;
  }>;
  error?: string;
}

function sanitizeForPath(name: string): string {
  if (!name) return '';
  return name.replace(/[\\/:"*?<>|]+/g, '_').trim();
}

export async function execute(input: OrganizeXhsNotesInput): Promise<OrganizeXhsNotesOutput> {
  const platform = input.platform || 'xiaohongshu';
  const env = input.env || 'debug';
  const keyword = String(input.keyword || '').trim();
  if (!keyword) {
    return { success: false, keywordDir: '', noteCount: 0, ocrLanguagesUsed: 'eng', processed: [], error: 'missing_keyword' };
  }

  const persisted = await countPersistedNotes({
    platform,
    env,
    keyword,
    homeDir: os.homedir(),
    requiredFiles: ['content.md', 'comments.md'],
    requireCommentsDone: true,
  });

  const keywordDir = persisted.keywordDir;
  const noteIds = persisted.noteIds.slice().sort();

  const ocrLang = String(input.ocrLanguages || '').trim() || 'chi_sim+eng';

  const processed: OrganizeXhsNotesOutput['processed'] = [];

  // 汇总 ALL.md
  const allLines: string[] = [];
  allLines.push(`# 合并汇总（${keyword}）`);
  allLines.push('');
  allLines.push(`- 关键词: ${keyword}`);
  allLines.push(`- 环境: ${env}`);
  allLines.push(`- 目录: ${keywordDir}`);
  allLines.push(`- 数量: ${noteIds.length}`);
  allLines.push(`- OCR 语言: ${ocrLang}`);
  allLines.push('');

  for (let i = 0; i < noteIds.length; i += 1) {
    const noteId = noteIds[i];
    const noteDir = path.join(keywordDir, noteId);
    try {
      const res = await organizeOneNote({
        noteDir,
        noteId,
        keyword,
        ocrLanguages: ocrLang,
        runOcr: input.runOcr === true,
        requireExistingOcr: input.runOcr !== true,
      });

      allLines.push(`## ${i + 1}. ${noteId}`);
      allLines.push('');
      if (res.link) allLines.push(`- 链接: ${res.link}`);
      allLines.push('');
      const merged = await fs.readFile(res.mergedPath, 'utf-8');
      allLines.push(merged.trim());
      allLines.push('');
      allLines.push('---');
      allLines.push('');

      processed.push({
        noteId,
        ocrPath: res.ocrPath,
        mergedPath: res.mergedPath,
        imageCount: res.imageCount,
        ocrErrors: res.ocrErrors,
        ok: true,
      });
    } catch (e: any) {
      processed.push({
        noteId,
        imageCount: 0,
        ocrErrors: 0,
        ok: false,
        error: e?.message || String(e),
      });
      // 不阻断其它 note
      continue;
    }
  }

  const safeKeyword = sanitizeForPath(keyword) || 'unknown';
  const allPath = path.join(keywordDir, `ALL-${safeKeyword}.md`);
  await fs.writeFile(allPath, `${allLines.join('\n')}\n`, 'utf-8');

  const failed = processed.filter((p) => !p.ok);

  return {
    success: failed.length === 0,
    keywordDir,
    noteCount: noteIds.length,
    ocrLanguagesUsed: ocrLang,
    allPath,
    processed,
    ...(failed.length
      ? { error: `organize_failed_notes: ${failed.length}/${noteIds.length}` }
      : {}),
  };
}
