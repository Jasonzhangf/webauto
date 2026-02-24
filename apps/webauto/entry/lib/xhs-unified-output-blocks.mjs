import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { sanitizeForPath } from './xhs-unified-blocks.mjs';

function sanitizeKeywordDirParts({ env, keyword }) {
  return {
    safeEnv: sanitizeForPath(env, 'prod'),
    safeKeyword: sanitizeForPath(keyword, 'unknown'),
  };
}

export function resolveDownloadRoot(customRoot = '') {
  const fromArg = String(customRoot || '').trim();
  if (fromArg) return path.resolve(fromArg);
  const fromEnv = String(process.env.WEBAUTO_DOWNLOAD_ROOT || process.env.WEBAUTO_DOWNLOAD_DIR || '').trim();
  if (fromEnv) return path.resolve(fromEnv);
  if (process.platform === 'win32') {
    try {
      if (fs.existsSync('D:\\')) return 'D:\\webauto';
    } catch {
      // ignore
    }
    const home = process.env.HOME || process.env.USERPROFILE || os.homedir();
    return path.join(home, '.webauto');
  }
  const home = process.env.HOME || process.env.USERPROFILE || os.homedir();
  return path.join(home, '.webauto', 'download');
}

const NON_NOTE_DIR_NAMES = new Set([
  'merged',
  'profiles',
  'like-evidence',
  'virtual-like',
  'smart-reply',
  'comment-match',
  'discover-fallback',
]);

async function collectKeywordDirs(baseOutputRoot, env, keyword) {
  const { safeEnv, safeKeyword } = sanitizeKeywordDirParts({ env, keyword });
  const dirs = [
    path.join(baseOutputRoot, 'xiaohongshu', safeEnv, safeKeyword),
  ];
  const shardsRoot = path.join(baseOutputRoot, 'shards');
  try {
    const entries = await fsp.readdir(shardsRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      dirs.push(path.join(shardsRoot, entry.name, 'xiaohongshu', safeEnv, safeKeyword));
    }
  } catch {
    // ignore
  }
  return Array.from(new Set(dirs));
}

export async function collectCompletedNoteIds(baseOutputRoot, env, keyword) {
  const keywordDirs = await collectKeywordDirs(baseOutputRoot, env, keyword);
  const completed = new Set();
  for (const keywordDir of keywordDirs) {
    let entries = [];
    try {
      entries = await fsp.readdir(keywordDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const noteId = String(entry.name || '').trim();
      if (!noteId || noteId.startsWith('.') || noteId.startsWith('_')) continue;
      if (NON_NOTE_DIR_NAMES.has(noteId)) continue;
      completed.add(noteId);
    }
  }
  return {
    count: completed.size,
    noteIds: Array.from(completed),
  };
}
