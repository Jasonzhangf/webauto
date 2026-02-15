#!/usr/bin/env node
import minimist from 'minimist';
import { spawn } from 'node:child_process';
import { existsSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATE_FILE = path.join(process.env.HOME || process.env.USERPROFILE || '.', '.webauto', 'cli-state.json');

function loadState() {
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
  } catch {
    return { initialized: false, version: null };
  }
}

function saveState(state) {
  try {
    const dir = path.dirname(STATE_FILE);
    if (!existsSync(dir)) {
      import('node:fs').then(fs => fs.mkdirSync(dir, { recursive: true }));
    }
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch {}
}

function isGlobalInstall() {
  // Check if running from global node_modules
  const execPath = process.argv[1] || '';
  return execPath.includes('node_modules/@web-auto/webauto') || 
         execPath.includes('/opt/homebrew/lib/node_modules') ||
         execPath.includes('/usr/local/lib/node_modules') ||
         execPath.includes(process.env.NPM_CONFIG_PREFIX || '') ||
         !existsSync(path.join(ROOT, '.git'));
}

function npmBin() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function usage() {
  console.log(`webauto (dev)

Usage:
  webauto ui console [--build] [--install] [--check]
  webauto dev install-global [--full] [--link]
  webauto build:dev        # Local link mode
  webauto build:release    # Prepare npm release

Examples:
  webauto ui console --check
  webauto ui console --build
  webauto ui console --install
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

async function runInDir(dir, cmd, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: dir,
      env: process.env,
      stdio: 'inherit',
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

async function ensureDepsAndBuild() {
  console.log('[webauto] First run from global install, setting up...');
  
  // Check if we have desktop-console source
  const appDir = path.join(ROOT, 'apps', 'desktop-console');
  if (!exists(appDir)) {
    console.error('❌ desktop-console source not found in package');
    process.exit(1);
  }

  // Install deps if needed
  if (!checkDesktopConsoleDeps()) {
    console.log('[webauto] Installing desktop-console dependencies...');
    await runInDir(appDir, npmBin(), ['install']);
  }

  // Build if needed  
  if (!checkDesktopConsoleBuilt()) {
    console.log('[webauto] Building desktop-console...');
    await runInDir(appDir, npmBin(), ['run', 'build']);
  }

  // Mark as initialized
  const pkgJson = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
  saveState({ initialized: true, version: pkgJson.version });
  console.log('[webauto] Setup complete!');
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
    console.log(`[check] isGlobalInstall: ${isGlobalInstall()}`);
    return;
  }

  // For global install, auto-setup on first run
  if (isGlobalInstall()) {
    const state = loadState();
    const pkgJson = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
    if (!state.initialized || state.version !== pkgJson.version) {
      await ensureDepsAndBuild();
    }
  } else {
    // Local dev mode - require explicit build
  if (!okServices) {
    if (!build) {
      console.error('❌ missing dist/ (services/modules). Run: npm run build:services');
      process.exit(2);
    }
    await run(npmBin(), ['run', 'build:services']);
  }
  }

  if (!okDeps) {
    if (!install && !build) {
      console.error('❌ missing apps/desktop-console/node_modules. Run: npm --prefix apps/desktop-console install');
      process.exit(2);
    }
    await runInDir(path.join(ROOT, 'apps', 'desktop-console'), npmBin(), ['install']);
  }

  if (!okUiBuilt) {
    if (!build) {
      console.error('❌ missing apps/desktop-console/dist. Run: npm --prefix apps/desktop-console run build');
      process.exit(2);
    }
    await runInDir(path.join(ROOT, 'apps', 'desktop-console'), npmBin(), ['run', 'build']);
  }

  await runInDir(path.join(ROOT, 'apps', 'desktop-console'), npmBin(), ['start']);
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

  // build:dev - local development mode
  if (cmd === 'build:dev') {
    console.log('[webauto] Running local dev setup...');
    await run(npmBin(), ['run', 'build:services']);
    await runInDir(path.join(ROOT, 'apps', 'desktop-console'), npmBin(), ['install']);
    await runInDir(path.join(ROOT, 'apps', 'desktop-console'), npmBin(), ['run', 'build']);
    console.log('[webauto] Dev setup complete');
    return;
  }

  // build:release - prepare for npm publish
  if (cmd === 'build:release') {
    console.log('[webauto] Building release version...');
    await run(npmBin(), ['run', 'build:services']);
    // Clean up state for fresh install
    saveState({ initialized: false, version: null });
    console.log('[webauto] Release build complete');
    console.log('[webauto] Ready to publish');
    return;
  }

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
