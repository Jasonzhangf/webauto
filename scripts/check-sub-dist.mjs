#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const scanRoots = ['apps', 'modules', 'services', 'libs', 'runtime'];
const allowDirs = new Set([
  'apps/desktop-console/dist',
  'dist',
]);

function walk(dir, hits) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const abs = path.join(dir, entry.name);
    const rel = path.relative(root, abs).replace(/\\/g, '/');
    if (entry.name === 'node_modules' || rel.startsWith('dist/')) continue;
    if (entry.name === 'dist' && !allowDirs.has(rel)) {
      hits.push(rel);
      continue;
    }
    walk(abs, hits);
  }
}

const nestedDist = [];
for (const rel of scanRoots) {
  const abs = path.join(root, rel);
  if (fs.existsSync(abs)) walk(abs, nestedDist);
}

if (nestedDist.length > 0) {
  console.error('[check-sub-dist] failed');
  console.error('Unexpected nested dist directories detected:');
  for (const dir of nestedDist) console.error(` - ${dir}`);
  process.exit(1);
}

console.log('[check-sub-dist] ok');
