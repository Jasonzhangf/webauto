import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';

export interface PersistedNotesCountInput {
  platform: string;
  env: string;
  keyword: string;
  homeDir?: string;
  requiredFiles?: string[];
  requireCommentsDone?: boolean;
  minCommentsCoverageRatio?: number;
}

export interface PersistedNotesCountOutput {
  keywordDir: string;
  noteIds: string[];
  count: number;
}

function sanitizeForPath(name: string): string {
  if (!name) return '';
  return name.replace(/[\\/:"*?<>|]+/g, '_').trim();
}

async function pathExists(filepath: string): Promise<boolean> {
  try {
    await fs.access(filepath);
    return true;
  } catch {
    return false;
  }
}

export async function countPersistedNotes(
  input: PersistedNotesCountInput,
): Promise<PersistedNotesCountOutput> {
  const {
    platform,
    env,
    keyword,
    homeDir = os.homedir(),
    requiredFiles = ['content.md'],
    requireCommentsDone = false,
    minCommentsCoverageRatio,
  } = input;

  const safeKeyword = sanitizeForPath(keyword) || 'unknown';
  const keywordDir = path.join(homeDir, '.webauto', 'download', platform, env, safeKeyword);

  const exists = await pathExists(keywordDir);
  if (!exists) {
    return { keywordDir, noteIds: [], count: 0 };
  }

  const entries = await fs.readdir(keywordDir, { withFileTypes: true }).catch((): any[] => []);
  const noteIds: string[] = [];

  function parseCommentsStats(text: string): { fetched: number | null; header: number | null } {
    // PersistXhsNoteBlock 写入格式：抓取=10, header=123（reachedEnd=是, empty=否, coverage=...）
    const m = text.match(/评论统计:\\s*抓取=(\\d+),\\s*header=([^（\\n]+)/);
    if (!m) return { fetched: null, header: null };
    const fetched = Number(m[1]);
    const headerRaw = String(m[2] || '').trim();
    const header = /^\\d+$/.test(headerRaw) ? Number(headerRaw) : null;
    return {
      fetched: Number.isFinite(fetched) ? fetched : null,
      header: Number.isFinite(header as any) ? (header as number) : null,
    };
  }

  async function commentsDone(commentsPath: string): Promise<boolean> {
    try {
      const text = await fs.readFile(commentsPath, 'utf-8');
      // PersistXhsNoteBlock 写入格式：reachedEnd=是/否, empty=是/否
      if (text.includes('empty=是')) return true;
      if (text.includes('reachedEnd=是')) return true;
      return false;
    } catch {
      return false;
    }
  }

  async function commentsCoverageOk(commentsPath: string): Promise<boolean> {
    const ratio =
      typeof minCommentsCoverageRatio === 'number' &&
      Number.isFinite(minCommentsCoverageRatio) &&
      minCommentsCoverageRatio > 0
        ? minCommentsCoverageRatio
        : null;
    if (!ratio) return true;
    try {
      const text = await fs.readFile(commentsPath, 'utf-8');
      const stats = parseCommentsStats(text);
      if (stats.header === null || stats.header <= 0) return true; // 标称未知/0：不做覆盖率要求
      if (stats.fetched === null) return false;
      return stats.fetched >= Math.ceil(stats.header * ratio);
    } catch {
      return false;
    }
  }

  for (const ent of entries) {
    if (!ent?.isDirectory?.()) continue;
    const noteId = ent.name;

    let ok = true;
    for (const filename of requiredFiles) {
      const p = path.join(keywordDir, noteId, filename);
      if (!(await pathExists(p))) {
        ok = false;
        break;
      }
      if (ok && requireCommentsDone && filename === 'comments.md') {
        const done = await commentsDone(p);
        if (!done) {
          ok = false;
          break;
        }
        const covOk = await commentsCoverageOk(p);
        if (!covOk) {
          ok = false;
          break;
        }
      }
    }
    if (!ok) continue;

    noteIds.push(noteId);
  }

  return { keywordDir, noteIds, count: noteIds.length };
}
