#!/usr/bin/env node
import minimist from 'minimist';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function npmBin() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function usage() {
  console.log(`webauto (dev)

Usage:
  webauto ui console [--build] [--install] [--check]
  webauto dev install-global [--full] [--link]

Examples:
  webauto ui console --check
  webauto ui console --build
  webauto dev install-global --link
`);
}

function exists(p) {
  try {
    return existsSync(p);
  } catch {
    return false;
  }
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

function checkDesktopConsoleDeps() {
  return exists(path.join(ROOT, 'apps', 'desktop-console', 'node_modules', 'electron'));
}

function checkDesktopConsoleBuilt() {
  return exists(path.join(ROOT, 'apps', 'desktop-console', 'dist', 'renderer', 'index.html'));
}

function checkServicesBuilt() {
  return exists(path.join(ROOT, 'dist', 'modules')) && exists(path.join(ROOT, 'dist', 'services'));
}

async function uiConsole({ build, install, checkOnly }) {
  const okServices = checkServicesBuilt();
  const okDeps = checkDesktopConsoleDeps();
  const okUiBuilt = checkDesktopConsoleBuilt();

  if (checkOnly) {
    console.log(`[check] repoRoot: ${ROOT}`);
    console.log(`[check] dist/services: ${okServices ? 'OK' : 'MISSING'}`);
    console.log(`[check] desktop-console deps: ${okDeps ? 'OK' : 'MISSING'}`);
    console.log(`[check] desktop-console dist: ${okUiBuilt ? 'OK' : 'MISSING'}`);
    return;
  }

  if (!okServices) {
    if (!build) {
      console.error('❌ missing dist/ (services/modules). Run: npm run build:services');
      process.exit(2);
    }
    await run(npmBin(), ['run', 'build:services']);
  }

  if (!okDeps) {
    if (!install && !build) {
      console.error('❌ missing apps/desktop-console/node_modules. Run: npm --prefix apps/desktop-console install');
      process.exit(2);
    }
    await run(npmBin(), ['--prefix', path.join('apps', 'desktop-console'), 'install']);
  }

  if (!okUiBuilt) {
    if (!build) {
      console.error('❌ missing apps/desktop-console/dist. Run: npm --prefix apps/desktop-console run build');
      process.exit(2);
    }
    await run(npmBin(), ['--prefix', path.join('apps', 'desktop-console'), 'run', 'build']);
  }

  await run(npmBin(), ['--prefix', path.join('apps', 'desktop-console'), 'start']);
}

async function main() {
  const args = minimist(process.argv.slice(2), {
    boolean: ['help', 'build', 'install', 'check', 'full', 'link'],
    alias: { h: 'help' },
  });

  if (args.help) {
    usage();
    return;
  }

  const cmd = String(args._[0] || '').trim();
  const sub = String(args._[1] || '').trim();
  const sub2 = String(args._[2] || '').trim();

  if (cmd === 'ui' && sub === 'console') {
    await uiConsole({
      build: args.build === true,
      install: args.install === true,
      checkOnly: args.check === true,
    });
    return;
  }

  if (cmd === 'dev' && sub === 'install-global') {
    const scriptPath = path.join(ROOT, 'scripts', 'dev', 'build-install-global.mjs');
    const pass = [];
    if (args.full === true) pass.push('--full');
    if (args.link === true) pass.push('--link');
    await run(process.platform === 'win32' ? 'node.exe' : 'node', [scriptPath, ...pass], { cwd: ROOT });
    return;
  }

  usage();
  process.exit(1);
}

main().catch((err) => {
  console.error(err?.stack || err?.message || String(err));
  process.exit(1);
});
