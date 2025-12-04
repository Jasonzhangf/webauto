#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const modulesRoot = path.join(repoRoot, 'modules');
const moduleNames = [
  'browser-control',
  'session-manager',
  'container-registry',
  'container-matcher',
  'operations',
  'operation-selector',
  'storage',
  'logging',
];

async function ensureDirExists(dir) {
  try {
    const stat = await fs.stat(dir);
    if (!stat.isDirectory()) {
      throw new Error(`${dir} is not a directory`);
    }
  } catch (err) {
    throw new Error(`missing directory: ${dir} (${err.message})`);
  }
}

async function ensureFileExists(file) {
  try {
    const stat = await fs.stat(file);
    if (!stat.isFile()) {
      throw new Error(`${file} is not a file`);
    }
  } catch (err) {
    throw new Error(`missing file: ${file} (${err.message})`);
  }
}

async function run() {
  await ensureDirExists(modulesRoot);
  for (const name of moduleNames) {
    const moduleDir = path.join(modulesRoot, name);
    await ensureDirExists(moduleDir);
    await ensureFileExists(path.join(moduleDir, 'README.md'));
    await ensureDirExists(path.join(moduleDir, 'src'));
  }
  await ensureFileExists(path.join(repoRoot, 'docs', 'architecture', 'README.md'));
  console.log('[modules-check] structure ok');
}

run().catch((err) => {
  console.error('[modules-check] failed:', err.message || err);
  process.exit(1);
});
