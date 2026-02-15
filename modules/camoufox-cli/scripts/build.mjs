#!/usr/bin/env node
import { copyFileSync, chmodSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const src = path.join(root, 'src', 'cli.mjs');
const dest = path.join(root, 'bin', 'camoufox.mjs');

copyFileSync(src, dest);
chmodSync(dest, 0o755);
console.log('Build: src/cli.mjs -> bin/camoufox.mjs');
