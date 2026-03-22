#!/usr/bin/env node
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const binDir = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(binDir, '..');
const cliIndex = join(PROJECT_ROOT, 'cli', 'index.mjs');

await import(cliIndex);
