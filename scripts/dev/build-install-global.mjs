#!/usr/bin/env node
import { ensureUtf8Console } from '../lib/cli-encoding.mjs';

ensureUtf8Console();

/**
 * One-shot dev script:
 * 1) build dev artifacts
 * 2) install globally (prefer `npm install -g .`, fallback to `npm link`)
 * 3) run regression
 *
 * Usage:
 *   node scripts/dev/build-install-global.mjs
 *   node scripts/dev/build-install-global.mjs --full
 *   node scripts/dev/build-install-global.mjs --link
 *
 * Notes:
 * - Default regression: `npm test`
 * - `--full`: run `node tests/runner/TestRunner.mjs --all` after `npm test`
 */

import minimist from 'minimist';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function npmBin() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function nodeBin() {
  return process.platform === 'win32' ? 'node.exe' : 'node';
}

async function run(cmd, args, options = {}) {
  await new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: ROOT,
      env: process.env,
      stdio: 'inherit',
      ...options,
    });
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))));
  });
}

function hasRootDeps() {
  return existsSync(path.join(ROOT, 'node_modules'));
}

function hasDesktopConsoleDeps() {
  return existsSync(path.join(ROOT, 'apps', 'desktop-console', 'node_modules'));
}

async function ensureDeps() {
  if (!hasRootDeps()) {
    await run(npmBin(), ['install']);
  }
  if (!hasDesktopConsoleDeps()) {
    await run(npmBin(), ['--prefix', path.join('apps', 'desktop-console'), 'install']);
  }
}

async function buildDev() {
 await run(npmBin(), ['run', 'build:services']);
 await run(npmBin(), ['--prefix', path.join('apps', 'desktop-console'), 'run', 'build']);
  // Copy camoufox-cli
  const cliSrc = path.join(ROOT, 'modules', 'camoufox-cli', 'src', 'cli.mjs');
  const cliDest = path.join(ROOT, 'bin', 'camoufox-cli.mjs');
  if (existsSync(cliSrc)) {
    const { copyFile } = await import('node:fs/promises');
    await copyFile(cliSrc, cliDest);
    const { chmodSync } = await import('node:fs');
    chmodSync(cliDest, 0o755);
    console.log('[dev-install] copied camoufox-cli');
  }
}

async function installGlobal({ preferLink }) {
  if (preferLink) {
    await run(npmBin(), ['link']);
    return { method: 'link' };
  }

  try {
    await run(npmBin(), ['install', '-g', '.']);
    return { method: 'install-g' };
  } catch (err) {
    console.warn('[dev-install] npm install -g failed; fallback to npm link');
    console.warn(String(err?.message || err));
    await run(npmBin(), ['link']);
    return { method: 'link-fallback' };
  }
}

async function smokeGlobalCli() {
  // Verify installed CLI can run (no Electron launch here).
  await run(nodeBin(), [path.join(ROOT, 'bin', 'webauto.mjs'), 'ui', 'console', '--check']);
}

async function regression({ full }) {
  await run(npmBin(), ['test']);
  await run(npmBin(), ['run', 'test:state:coverage']);
  if (full) {
    await run(nodeBin(), [path.join(ROOT, 'tests', 'runner', 'TestRunner.mjs'), '--all']);
  }
}

async function main() {
  const argv = minimist(process.argv.slice(2), { boolean: ['full', 'link'] });
  const full = argv.full === true;
  const preferLink = argv.link === true;

  console.log('[dev-install] step=deps');
  await ensureDeps();

  console.log('[dev-install] step=build');
  await buildDev();

  console.log('[dev-install] step=install-global');
  const installed = await installGlobal({ preferLink });
  console.log(`[dev-install] installed via: ${installed.method}`);

  console.log('[dev-install] step=smoke');
  await smokeGlobalCli();

  console.log('[dev-install] step=regression');
  await regression({ full });

  console.log('[dev-install] OK');
}

main().catch((err) => {
  console.error(err?.stack || err?.message || String(err));
  process.exit(1);
});
