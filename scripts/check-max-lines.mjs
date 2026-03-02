#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const args = new Set(process.argv.slice(2));
const disabled = args.has('--disabled');
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const limit = Number(limitArg ? limitArg.split('=')[1] : 500) || 500;
const quick = args.has('--quick');

if (disabled) {
  console.log('[check-max-lines] skipped (--disabled)');
  process.exit(0);
}

const allowedExt = new Set([
  '.js', '.jsx', '.ts', '.tsx',
  '.mjs', '.mts', '.cjs', '.cts',
]);

const ignoreDirs = new Set([
  '.git', 'node_modules', 'dist', 'coverage', 'runtime',
  '.beads', '.tmp', '.cache', '.next', 'build', 'out',
  '.iflow', '.codex',
]);

function shouldScanFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return allowedExt.has(ext);
}

function walk(dir, results) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (ignoreDirs.has(entry.name)) continue;
      walk(full, results);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!shouldScanFile(full)) continue;
    results.push(full);
  }
}

function countLines(text) {
  if (text.length === 0) return 0;
  return text.split(/\r?\n/).length;
}

const files = [];
walk(root, files);

const failures = [];
for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  const lines = countLines(content);
  if (lines > limit) {
    failures.push({ file, lines });
    if (quick && failures.length >= 1) break;
  }
}

if (failures.length > 0) {
  console.error(`[check-max-lines] failed: ${failures.length} file(s) over ${limit} lines`);
  for (const item of failures.sort((a, b) => b.lines - a.lines)) {
    const rel = path.relative(root, item.file) || item.file;
    console.error(` - ${item.lines} ${rel}`);
  }
  process.exit(1);
}

console.log(`[check-max-lines] ok (limit=${limit})`);
