#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      cwd: repoRoot,
      env: process.env,
    });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))));
    child.on('error', reject);
  });
}

async function main() {
  await run('npx', [
    'c8',
    '--reporter=text',
    '--reporter=lcov',
    '--all',
    '--exclude', '**/dist/**',
    '--exclude', '**/node_modules/**',
    '--exclude', '**/coverage/**',
    '--exclude', '**/apps/floating-panel/**',
    '--exclude', '**/scripts/**',
    '--exclude', '**/docs/**',
    '--exclude', '**/tests/**',
    '--extension', '.ts',
    '--extension', '.mts',
    '--extension', '.mjs',
    'npx',
    'tsx',
    '--test',
    'modules/**/*.test.ts',
    'modules/**/*.test.mts',
    'services/**/*.test.ts',
    'libs/**/*.test.ts',
    'sharedmodule/**/*.test.ts',
    'runtime/**/*.test.ts',
    'launcher/**/*.test.ts',
  ]);
}

main().catch((err) => {
  console.error('[coverage] failed:', err?.message || String(err));
  process.exit(1);
});
