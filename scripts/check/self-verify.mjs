#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');

const syntaxTargets = [
  'services/controller/src/controller.js',
  'services/controller/src/server.mjs',
  'apps/floating-panel/electron/main.js',
  'apps/floating-panel/electron/controllerClient.js',
  'apps/floating-panel/renderer/app.js',
];

async function run(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      stdio: 'inherit',
      ...options,
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(' ')} failed with code ${code}`));
      }
    });
  });
}

async function main() {
  console.log('[verify] running node --check on key entry files');
  for (const target of syntaxTargets) {
    const abs = path.join(repoRoot, target);
    console.log(`  • checking ${target}`);
    await run(process.execPath, ['--check', abs]);
  }

  console.log('[verify] building TypeScript services');
  await run('npm', ['run', 'build:services'], { env: process.env });

  console.log('[verify] running headless UI tests');
  await run('npm', ['run', 'ui:test'], { env: process.env });

  console.log('[verify] all checks passed');
}

main().catch((err) => {
  console.error('[verify] failed:', err?.message || err);
  process.exit(1);
});
