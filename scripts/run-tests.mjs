#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const TARGET_DIR = process.argv[2];

if (!TARGET_DIR) {
  console.error('Usage: node scripts/run-tests.mjs <dir>');
  process.exit(1);
}

const TARGET = path.resolve(ROOT, TARGET_DIR);
const EXCLUDE_DIRS = new Set(['node_modules', 'dist', '.git', '.svn', '.hg']);

function isTestFile(name) {
  return name.endsWith('.test.ts') || name.endsWith('.test.mts');
}

function walk(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDE_DIRS.has(entry.name)) continue;
      walk(full, out);
    } else if (entry.isFile() && isTestFile(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const files = walk(TARGET, []);

if (files.length === 0) {
  console.log(`[run-tests] no test files under ${TARGET_DIR}`);
  process.exit(0);
}

const tsxEntry = path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const args = [tsxEntry, '--test', ...files];
const ret = spawnSync(process.execPath, args, { stdio: 'inherit', windowsHide: true });
if (ret.error) {
  console.error(`[run-tests] failed to spawn tsx: ${ret.error.message}`);
  process.exit(1);
}
process.exit(ret.status ?? 1);
