#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const BASE_DIR = dirname(fileURLToPath(import.meta.url));

const script =
  process.platform === 'win32'
    ? 'build-cli-win.mjs'
    : process.platform === 'darwin'
      ? 'build-cli-macos.mjs'
      : null;

if (!script) {
  console.error('[build-cli] unsupported platform:', process.platform);
  process.exit(1);
}

execFileSync(process.execPath, [resolve(BASE_DIR, script)], {
  cwd: ROOT,
  stdio: 'inherit'
});
