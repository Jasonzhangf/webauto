import minimist from 'minimist';
import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';

function sanitizeForPath(name) {
  if (!name) return '';
  return String(name).replace(/[\\/:"*?<>|]+/g, '_').trim();
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
  - This script ONLY deletes: ~/.webauto/download/<platform>/<env>/<keyword>/
  - It uses Node fs.rm (no shell rm), and safeguards the resolved path under ~/.webauto/download.
`);
    return;
  }

  if (!keyword) {
    console.error('Missing --keyword');
    process.exit(1);
  }

  const home = os.homedir();
  const safeKeyword = sanitizeForPath(keyword) || 'unknown';
  const root = path.resolve(home, '.webauto', 'download');
  const target = path.resolve(root, platform, env, safeKeyword);

  if (!target.startsWith(root + path.sep)) {
    throw new Error(`refuse to delete outside ~/.webauto/download: ${target}`);
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

