import minimist from 'minimist';
import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';

function sanitizeForPath(name) {
  if (!name) return '';
  return String(name).replace(/[\\/:"*?<>|]+/g, '_').trim();
}

function resolveDownloadRoot() {
  const custom = process.env.WEBAUTO_DOWNLOAD_ROOT || process.env.WEBAUTO_DOWNLOAD_DIR;
  if (custom && custom.trim()) return custom;
  const home = process.env.HOME || process.env.USERPROFILE || os.homedir();
  return path.join(home, '.webauto', 'download');
}

async function main() {
  const args = minimist(process.argv.slice(2));
  const platform = typeof args.platform === 'string' && args.platform.trim() ? String(args.platform).trim() : 'xiaohongshu';
  const env = typeof args.env === 'string' && args.env.trim() ? String(args.env).trim() : 'debug';
  const keyword = typeof args.keyword === 'string' ? args.keyword.trim() : '';

  if (args.help || args.h) {
    console.log(`Usage:
  node scripts/clean-xhs-download.mjs --keyword "<kw>" [--env debug] [--platform xiaohongshu]

Notes:
  - This script ONLY deletes: <download_root>/<platform>/<env>/<keyword>/
  - Default download_root is ~/.webauto/download (override via WEBAUTO_DOWNLOAD_ROOT).
`);
    return;
  }

  if (!keyword) {
    console.error('Missing --keyword');
    process.exit(1);
  }

  const safeKeyword = sanitizeForPath(keyword) || 'unknown';
  const root = path.resolve(resolveDownloadRoot());
  const target = path.resolve(root, platform, env, safeKeyword);

  if (!target.startsWith(root + path.sep)) {
    throw new Error(`refuse to delete outside download root: ${target}`);
  }

  const exists = await fs
    .stat(target)
    .then((s) => s.isDirectory())
    .catch(() => false);

  if (!exists) {
    console.log(`[clean-download] not found, skip: ${target}`);
    return;
  }

  await fs.rm(target, { recursive: true, force: true });
  console.log(`[clean-download] deleted: ${target}`);
}

main().catch((err) => {
  console.error('[clean-download] failed:', err?.message || String(err));
  process.exit(1);
});

