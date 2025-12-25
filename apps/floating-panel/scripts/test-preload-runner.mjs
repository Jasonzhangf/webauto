#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

const proc = spawn('npx', ['electron', 'scripts/test-preload.mjs'], {
  cwd: root,
  env: { ...process.env },
  stdio: ['ignore', 'inherit', 'inherit'],
});

proc.on('close', (code) => process.exit(code || 0));
