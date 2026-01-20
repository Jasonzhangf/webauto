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
  } = input;

  const safeKeyword = sanitizeForPath(keyword) || 'unknown';
  const keywordDir = path.join(homeDir, '.webauto', 'download', platform, env, safeKeyword);

  const exists = await pathExists(keywordDir);
  if (!exists) {
    return { keywordDir, noteIds: [], count: 0 };
  }

  const entries = await fs.readdir(keywordDir, { withFileTypes: true }).catch((): any[] => []);
  const noteIds: string[] = [];

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
      }
    }
    if (!ok) continue;

    noteIds.push(noteId);
  }

  return { keywordDir, noteIds, count: noteIds.length };
}
