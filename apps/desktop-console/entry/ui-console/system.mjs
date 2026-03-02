import { spawn } from 'node:child_process';
import { existsSync, readdirSync, statSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { APP_ROOT, DIST_MAIN, resolveDownloadRoot, checkBuildStatus, resolveElectronBin } from './constants.mjs';

export { checkBuildStatus };

export function printHelp() {
  console.log(`webauto ui console

Usage:
  webauto ui console [--build] [--install] [--check] [--no-daemon]
  webauto ui test <scenario> [options]

Test Scenarios:
  env-check    - Environment check automation test
  account-flow - Account creation/login flow test
  config-save  - Config save/load test
  crawl-run    - Full crawl flow test
  full-cover   - Real end-to-end UI control + status coverage (no mock)

Options:
  --check      Check build/dep status only
  --build      Auto-build if missing
  --install    Auto-install if missing deps
  --no-daemon  Run in foreground mode
  --foreground Alias of --no-daemon
  --scenario   Test scenario name
  --profile    Test profile ID
  --profiles   Test profile IDs (comma-separated)
  --keyword    Test keyword
  --target     Target count
  --like-keywords  Like keyword filter
  --do-likes   Enable likes
  --max-likes  Max likes per note (0=unlimited)
  --parallel   Enable parallel sharding
  --concurrency  Parallel concurrency
  --headless   Headless mode
  --output     Output report path
`);
}

export function findLatestSummary(keyword) {
  const root = resolveDownloadRoot();
  const safeKeyword = String(keyword || '').trim();
  if (!safeKeyword) return null;
  const keywordDir = path.join(root, 'xiaohongshu', 'debug', safeKeyword);
  const mergedDir = path.join(keywordDir, 'merged');
  if (!existsSync(mergedDir)) return null;
  const entries = readdirSync(mergedDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.startsWith('run-'))
    .map((e) => {
      const full = path.join(mergedDir, e.name);
      return { full, mtime: statSync(full).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);
  for (const entry of entries) {
    const summaryPath = path.join(entry.full, 'summary.json');
    if (existsSync(summaryPath)) return summaryPath;
  }
  return null;
}

export async function readWindowsSessionId(pid) {
  const targetPid = Number(pid || 0);
  if (!Number.isFinite(targetPid) || targetPid <= 0 || process.platform !== 'win32') return null;
  return new Promise((resolve) => {
    const child = spawn('wmic', ['process', 'where', `processid=${targetPid}`, 'get', 'SessionId', '/value'], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    let stdout = '';
    child.stdout.on('data', (chunk) => { stdout += String(chunk || ''); });
    child.on('error', () => resolve(null));
    child.on('close', () => {
      const match = stdout.match(/SessionId\s*=\s*(\d+)/i);
      if (!match) return resolve(null);
      const sessionId = Number(match[1]);
      resolve(Number.isFinite(sessionId) ? sessionId : null);
    });
  });
}

export async function build() {
  return new Promise((resolve, reject) => {
    console.log('[ui-console] Building...');
    const child = spawn('npm', ['run', 'build'], {
      cwd: APP_ROOT,
      stdio: 'inherit',
      shell: true,
    });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Build failed with code ${code}`));
    });
  });
}

export async function install() {
  return new Promise((resolve, reject) => {
    console.log('[ui-console] Installing dependencies...');
    const child = spawn('npm', ['install'], {
      cwd: APP_ROOT,
      stdio: 'inherit',
      shell: true,
    });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Install failed with code ${code}`));
    });
  });
}

export async function startConsole(noDaemon = false) {
  if (!checkBuildStatus()) {
    console.log('[ui-console] Build not found, building...');
    await build();
  }

  console.log('[ui-console] Starting Desktop Console...');
  const env = { ...process.env };
  if (noDaemon) env.WEBAUTO_NO_DAEMON = '1';
  const detached = !noDaemon;
  const stdio = detached ? 'ignore' : 'inherit';
  const electronBin = resolveElectronBin();
  if (!existsSync(electronBin)) {
    throw new Error(`electron binary not found: ${electronBin}`);
  }
  const spawnCmd = electronBin;
  const spawnArgs = [DIST_MAIN];

  const child = spawn(spawnCmd, spawnArgs, {
    cwd: APP_ROOT,
    env,
    stdio,
    detached,
    windowsHide: true,
  });

  if (noDaemon) {
    child.on('close', (code) => {
      console.log(`[ui-console] Exited with code ${code}`);
      process.exit(code);
    });
  } else {
    child.unref();
    console.log(`[ui-console] Started (PID: ${child.pid})`);
    if (process.platform === 'win32') {
      const sessionId = await readWindowsSessionId(child.pid);
      if (sessionId === 0) {
        console.warn('[ui-console] started in Session 0 (service/non-interactive). UI bridge is available, but desktop window will not be visible.');
      }
    }
  }
}

export function writeReport(output, payload) {
  if (!output) return;
  try {
    mkdirSync(path.dirname(output), { recursive: true });
    writeFileSync(output, JSON.stringify(payload, null, 2));
  } catch {
    // ignore
  }
}

export function resolveReportPath(output) {
  const resolved = String(output || '').trim();
  if (resolved) return resolved;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(os.tmpdir(), `ui-console-report-${stamp}.json`);
}
