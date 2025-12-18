#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const outDir = path.resolve(__dirname, '../dist');

console.log('[floating-panel] cleaning dist...');
fs.rmSync(outDir, { recursive: true, force: true });

console.log('[floating-panel] building TypeScript...');
const tsc = spawn('npx', ['tsc', '-p', path.join(__dirname, '../tsconfig.json')], {
  cwd: root,
  stdio: 'inherit',
  shell: true,
});

tsc.on('close', (code) => {
  if (code !== 0) {
    console.error('[floating-panel] build failed');
    process.exit(code);
  }
  console.log('[floating-panel] build complete');
});
