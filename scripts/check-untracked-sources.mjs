#!/usr/bin/env node
import { execSync } from 'node:child_process';

const trackedRoots = ['apps', 'bin', 'libs', 'modules', 'runtime', 'services', 'src', 'tests', 'scripts'];
const sourceExt = /\.(ts|tsx|mts|cts|js|mjs|cjs|json|py)$/i;

function listUntracked() {
  const cmd = `git ls-files --others --exclude-standard -- ${trackedRoots.join(' ')}`;
  const out = execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return out
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => sourceExt.test(line));
}

let untracked = [];
try {
  untracked = listUntracked();
} catch (error) {
  console.error('[check-untracked-sources] failed to query git:', error?.message || String(error));
  process.exit(1);
}

if (untracked.length > 0) {
  console.error('[check-untracked-sources] failed');
  console.error('Untracked source files are not allowed before build:');
  for (const file of untracked) console.error(` - ${file}`);
  process.exit(1);
}

console.log('[check-untracked-sources] ok');
