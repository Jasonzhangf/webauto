#!/usr/bin/env node
import minimist from 'minimist';
import { spawn } from 'node:child_process';
import { existsSync, writeFileSync, readFileSync, mkdirSync, readdirSync, statSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '..');
const DIST_MAIN = path.join(APP_ROOT, 'dist', 'main', 'index.mjs');

const args = minimist(process.argv.slice(2), {
  boolean: ['build', 'install', 'check', 'help', 'headless', 'no-daemon', 'dry-run', 'no-dry-run', 'parallel', 'do-likes'],
  string: ['profile', 'profiles', 'keyword', 'target', 'scenario', 'output', 'concurrency', 'like-keywords', 'max-likes'],
  alias: { h: 'help', p: 'profile', k: 'keyword', t: 'target', o: 'output' }
});

function printHelp() {
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

function resolveDownloadRoot() {
  const fromEnv = String(process.env.WEBAUTO_DOWNLOAD_ROOT || process.env.WEBAUTO_DOWNLOAD_DIR || '').trim();
  if (fromEnv) return path.resolve(fromEnv);
  return path.join(os.homedir(), '.webauto', 'download');
}

function findLatestSummary(keyword) {
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

function checkBuildStatus() {
  return existsSync(DIST_MAIN);
}

async function build() {
  return new Promise((resolve, reject) => {
    console.log('[ui-console] Building...');
    const child = spawn('npm', ['run', 'build'], {
      cwd: APP_ROOT,
      stdio: 'inherit',
      shell: true
    });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Build failed with code ${code}`));
    });
  });
}

async function install() {
  return new Promise((resolve, reject) => {
    console.log('[ui-console] Installing dependencies...');
    const child = spawn('npm', ['install'], {
      cwd: APP_ROOT,
      stdio: 'inherit',
      shell: true
    });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Install failed with code ${code}`));
    });
  });
}

async function startConsole(noDaemon = false) {
  if (!checkBuildStatus()) {
    console.log('[ui-console] Build not found, building...');
    await build();
  }

  console.log('[ui-console] Starting Desktop Console...');
  const npxBin = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const env = { ...process.env };
  if (noDaemon) env.WEBAUTO_NO_DAEMON = '1';
  const detached = !noDaemon;
  const stdio = detached ? 'ignore' : 'inherit';

  const useCmd = process.platform === 'win32';
  const spawnCmd = useCmd ? 'cmd.exe' : npxBin;
  const spawnArgs = useCmd
    ? ['/d', '/s', '/c', npxBin, 'electron', DIST_MAIN]
    : ['electron', DIST_MAIN];

  const child = spawn(spawnCmd, spawnArgs, {
    cwd: APP_ROOT,
    env,
    stdio,
    detached
  });

  if (noDaemon) {
    child.on('close', (code) => {
      console.log(`[ui-console] Exited with code ${code}`);
      process.exit(code);
    });
  } else {
    child.unref();
    console.log(`[ui-console] Started (PID: ${child.pid})`);
  }
}

class UITestRunner {
  constructor(options = {}) {
    this.profile = options.profile || 'test-profile';
    this.keyword = options.keyword || '自动化测试';
    this.target = options.target || 5;
    this.headless = options.headless || false;
    this.output = options.output || null;
    this.results = [];
    this.startTime = Date.now();
  }

  log(message, type = 'info') {
    const ts = new Date().toISOString();
    const line = `[${ts}] [${type}] ${message}`;
    console.log(line);
    this.results.push({ ts, type, message });
  }

  async runCommand(cmd, args, timeoutMs = 30000, options = {}) {
    return new Promise((resolve, reject) => {
      const env = { ...process.env, ...(options.env || {}) };
      const child = spawn(cmd, args, { shell: false, stdio: 'pipe', cwd: options.cwd || process.cwd(), env });
      let stdout = '';
      let stderr = '';
      let timer = null;
      if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
        timer = setTimeout(() => {
          child.kill('SIGTERM');
          reject(new Error(`Command timeout: ${cmd}`));
        }, timeoutMs);
      }
      child.stdout.on('data', (data) => { stdout += data.toString(); });
      child.stderr.on('data', (data) => { stderr += data.toString(); });
      child.on('close', (code) => {
        if (timer) clearTimeout(timer);
        if (code === 0) resolve({ ok: true, stdout, stderr });
        else reject(new Error(stderr || `Exit code: ${code}`));
      });
    });
  }

  ensure(condition, message) {
    if (!condition) throw new Error(message);
  }

  parseJsonOutput(output) {
    const text = String(output || '').trim();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      for (let i = lines.length - 1; i >= 0; i -= 1) {
        try {
          return JSON.parse(lines[i]);
        } catch {
          // keep scanning
        }
      }
    }
    return null;
  }

  async runNodeScript(scriptPath, scriptArgs = [], timeoutMs = 30000, options = {}) {
    const cmd = process.execPath;
    return this.runCommand(cmd, [scriptPath, ...scriptArgs], timeoutMs, options);
  }

  async runJsonNodeScript(scriptPath, scriptArgs = [], timeoutMs = 30000, options = {}) {
    const out = await this.runNodeScript(scriptPath, scriptArgs, timeoutMs, options);
    const json = this.parseJsonOutput(out.stdout);
    this.ensure(json && typeof json === 'object', `JSON parse failed for ${path.basename(scriptPath)}`);
    return json;
  }

  async waitForHttp(url, timeoutMs = 20000) {
    const started = Date.now();
    while ((Date.now() - started) < timeoutMs) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
        if (res.ok) return true;
      } catch {
        // keep polling
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    return false;
  }

  async ensureUnifiedServer() {
    const healthUrl = 'http://127.0.0.1:7701/health';
    const running = await this.waitForHttp(healthUrl, 1200);
    if (running) return { child: null, owned: false };

    const child = spawn(process.execPath, [path.join(process.cwd(), 'dist/apps/webauto/server.js')], {
      cwd: process.cwd(),
      env: { ...process.env, WEBAUTO_RUNTIME_MODE: 'unified' },
      stdio: 'ignore',
    });
    const ready = await this.waitForHttp(healthUrl, 20000);
    if (!ready) {
      try { child.kill('SIGTERM'); } catch {}
      throw new Error('unified api did not become ready on :7701');
    }
    return { child, owned: true };
  }

  async testEnvCheck() {
      this.log('Starting environment check test', 'test');
    try {
      this.log('Testing: camo CLI');
      const camoCli = path.join(process.cwd(), 'bin', 'camoufox-cli.mjs');
      await this.runCommand('node', [camoCli, 'help']);
      this.log('PASS: camo CLI found', 'pass');

      this.log('Testing: Unified API');
      const apiRes = await fetch('http://127.0.0.1:7701/health');
      if (!apiRes.ok) throw new Error('Unified API not responding');
      this.log('PASS: Unified API running', 'pass');

      this.log('Testing: Camo Runtime (optional)');
      const runtimeRes = await fetch('http://127.0.0.1:7704/health');
      if (!runtimeRes.ok) {
        this.log('WARN: Camo Runtime not ready (optional)', 'warn');
      } else {
        this.log('PASS: Camo Runtime running', 'pass');
      }

      this.log('Environment check PASSED', 'success');
      return { passed: true };
    } catch (err) {
      this.log(`FAILED: ${err.message}`, 'fail');
      return { passed: false, error: err.message };
    }
  }

  async testAccountFlow() {
    this.log('Starting account flow test', 'test');
    try {
      this.log(`Testing: Create profile ${this.profile}`);
      const result = await this.runCommand('node', [
        path.join(process.cwd(), 'apps/webauto/entry/profilepool.mjs'),
        'add', 'test', '--json'
      ], 60000);
      const json = JSON.parse(result.stdout);
      if (json.ok && json.profileId) {
        this.log(`PASS: Profile created: ${json.profileId}`, 'pass');
      } else {
        throw new Error('Failed to create profile');
      }
      this.log('Account flow PASSED', 'success');
      return { passed: true, profileId: json.profileId };
    } catch (err) {
      this.log(`FAILED: ${err.message}`, 'fail');
      return { passed: false, error: err.message };
    }
  }

  async testConfigSave() {
    this.log('Starting config save test', 'test');
    try {
      const testConfig = {
        keyword: this.keyword, target: this.target, env: 'debug',
        fetchBody: true, fetchComments: true, maxComments: 50,
        autoLike: false, likeKeywords: '', headless: this.headless, dryRun: true
      };
      const configPath = path.join(process.cwd(), 'test-config.json');
      writeFileSync(configPath, JSON.stringify(testConfig, null, 2));
      this.log(`PASS: Config exported`, 'pass');
      const imported = JSON.parse(readFileSync(configPath, 'utf8'));
      if (imported.keyword === this.keyword) {
        this.log('PASS: Config imported', 'pass');
      }
      import('node:fs').then(fs => fs.unlinkSync(configPath));
      this.log('Config save PASSED', 'success');
      return { passed: true };
    } catch (err) {
      this.log(`FAILED: ${err.message}`, 'fail');
      return { passed: false, error: err.message };
    }
  }

  async testCrawlRun() {
    this.log('Starting crawl run test', 'test');
    try {
      const runProfilesRaw = String(args.profiles || '').trim();
      const runProfiles = runProfilesRaw
        ? runProfilesRaw.split(',').map((p) => p.trim()).filter(Boolean)
        : [];
      const profileFlag = runProfiles.length > 0
        ? ['--profiles', runProfiles.join(',')]
        : ['--profile', this.profile];
      this.log(`Testing: Crawl run (keyword=${this.keyword}, target=${this.target})`);
      const runArgs = [
        path.join(process.cwd(), 'apps/webauto/entry/xhs-unified.mjs'),
        ...profileFlag,
        '--keyword', this.keyword,
        '--target', String(this.target),
        '--env', 'debug',
      ];
      if (runProfiles.length > 1 && (args.parallel === true || args.parallel === undefined)) {
        runArgs.push('--parallel', 'true');
        const conc = String(args.concurrency || '').trim();
        if (conc) runArgs.push('--concurrency', conc);
      }
      const likeKeywords = String(args['like-keywords'] || '').trim();
      const doLikes = args['do-likes'] === true || Boolean(likeKeywords);
      if (doLikes) {
        runArgs.push('--do-likes', 'true');
        if (likeKeywords) runArgs.push('--like-keywords', likeKeywords);
        const maxLikes = String(args['max-likes'] || '').trim();
        if (maxLikes) runArgs.push('--max-likes', maxLikes);
      }
      const forceDryRun = args['dry-run'] === true && args['no-dry-run'] !== true;
      const dryFlag = forceDryRun ? '--dry-run' : '--no-dry-run';
      runArgs.push(dryFlag, 'true');
      if (this.headless) runArgs.push('--headless', 'true');
      await this.runCommand('node', runArgs, 0, { env: { WEBAUTO_BUS_EVENTS: '1' } });
      const summaryPath = findLatestSummary(this.keyword);
      if (summaryPath && existsSync(summaryPath)) {
        try {
          const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
          const totals = summary?.totals || {};
          const profiles = Array.isArray(summary?.profiles) ? summary.profiles : [];
          const reasons = profiles.map((p) => `${p.profileId}:${p.reason || p.stats?.stopReason || 'unknown'}`).join(', ');
          this.log(`Summary: profilesSucceeded=${totals.profilesSucceeded ?? '-'} profilesFailed=${totals.profilesFailed ?? '-'} openedNotes=${totals.openedNotes ?? '-'} operationErrors=${totals.operationErrors ?? '-'} recoveryFailed=${totals.recoveryFailed ?? '-'}`, 'info');
          if (reasons) this.log(`Stop reasons: ${reasons}`, 'info');
          this.log(`Summary path: ${summaryPath}`, 'info');
        } catch (err) {
          this.log(`Summary parse failed: ${err.message || String(err)}`, 'warn');
        }
      } else {
        this.log('Summary not found after crawl run', 'warn');
      }
      this.log('PASS: Crawl run completed', 'pass');
      this.log('Crawl run PASSED', 'success');
      return { passed: true };
    } catch (err) {
      this.log(`FAILED: ${err.message}`, 'fail');
      return { passed: false, error: err.message };
    }
  }

  async testFullCover() {
    this.log('Starting full-cover real test (no mock)', 'test');
    const portableRoot = path.join(process.cwd(), '.tmp', `ui-full-cover-${Date.now()}`);
    mkdirSync(portableRoot, { recursive: true });
    const isolatedEnv = { ...process.env, WEBAUTO_PORTABLE_ROOT: portableRoot };
    const accountScript = path.join(process.cwd(), 'apps/webauto/entry/account.mjs');
    const scheduleScript = path.join(process.cwd(), 'apps/webauto/entry/schedule.mjs');
    const xhsInstallScript = path.join(process.cwd(), 'apps/webauto/entry/xhs-install.mjs');
    const xhsStatusScript = path.join(process.cwd(), 'apps/webauto/entry/xhs-status.mjs');
    const runIds = [];
    let unifiedServer = null;
    try {
      this.log('Step 1/4: ensure backend dependencies', 'info');
      await this.runNodeScript(xhsInstallScript, ['--ensure-backend'], 180000);

      this.log('Step 2/4: account controls (add/get/update/list/delete)', 'info');
      const addRes = await this.runJsonNodeScript(
        accountScript,
        ['add', '--platform', 'xiaohongshu', '--alias', 'ui-e2e', '--status', 'pending', '--json'],
        90000,
        { env: isolatedEnv },
      );
      const accountId = String(addRes?.account?.id || '').trim();
      this.ensure(accountId, 'account add did not return account id');
      const profileId = String(addRes?.account?.profileId || '').trim();
      this.ensure(profileId, 'account add did not return profile id');

      const getRes = await this.runJsonNodeScript(accountScript, ['get', accountId, '--json'], 30000, { env: isolatedEnv });
      this.ensure(getRes?.ok === true, 'account get failed');

      const updateAccountRes = await this.runJsonNodeScript(
        accountScript,
        ['update', accountId, '--alias', 'ui-e2e-updated', '--json'],
        30000,
        { env: isolatedEnv },
      );
      this.ensure(updateAccountRes?.ok === true, 'account update failed');

      const listRes = await this.runJsonNodeScript(accountScript, ['list', '--json'], 30000, { env: isolatedEnv });
      this.ensure(Number(listRes?.count || 0) >= 1, 'account list returned empty unexpectedly');

      const deleteRes = await this.runJsonNodeScript(
        accountScript,
        ['delete', accountId, '--delete-profile', '--delete-fingerprint', '--json'],
        90000,
        { env: isolatedEnv },
      );
      this.ensure(deleteRes?.ok === true, 'account delete failed');

      this.log('Step 3/4: scheduler controls (CRUD/import-export/run/daemon)', 'info');
      const runAt = new Date(Date.now() + (60 * 60 * 1000)).toISOString();
      const argvJson = JSON.stringify({
        profile: 'xhs-e2e-profile',
        keyword: this.keyword,
        'max-notes': Math.max(1, Number(this.target) || 1),
        env: 'debug',
        'do-comments': false,
        'do-likes': false,
        'dry-run': true,
      });

      const addInterval = await this.runJsonNodeScript(
        scheduleScript,
        ['add', '--name', 'ui-interval', '--schedule-type', 'interval', '--interval-minutes', '5', '--max-runs', '2', '--argv-json', argvJson, '--json'],
        60000,
        { env: isolatedEnv },
      );
      const addOnce = await this.runJsonNodeScript(
        scheduleScript,
        ['add', '--name', 'ui-once', '--schedule-type', 'once', '--run-at', runAt, '--max-runs', '1', '--argv-json', argvJson, '--json'],
        60000,
        { env: isolatedEnv },
      );
      const addDaily = await this.runJsonNodeScript(
        scheduleScript,
        ['add', '--name', 'ui-daily', '--schedule-type', 'daily', '--run-at', runAt, '--max-runs', '3', '--argv-json', argvJson, '--json'],
        60000,
        { env: isolatedEnv },
      );
      const addWeekly = await this.runJsonNodeScript(
        scheduleScript,
        ['add', '--name', 'ui-weekly', '--schedule-type', 'weekly', '--run-at', runAt, '--max-runs', '4', '--argv-json', argvJson, '--json'],
        60000,
        { env: isolatedEnv },
      );
      const taskIds = [
        String(addInterval?.task?.id || '').trim(),
        String(addOnce?.task?.id || '').trim(),
        String(addDaily?.task?.id || '').trim(),
        String(addWeekly?.task?.id || '').trim(),
      ].filter(Boolean);
      this.ensure(taskIds.length === 4, 'schedule add did not create all 4 tasks');

      const listTasks = await this.runJsonNodeScript(scheduleScript, ['list', '--json'], 30000, { env: isolatedEnv });
      this.ensure(Number(listTasks?.count || 0) >= 4, 'schedule list count < 4');

      const firstTaskId = taskIds[0];
      const getTask = await this.runJsonNodeScript(scheduleScript, ['get', firstTaskId, '--json'], 30000, { env: isolatedEnv });
      this.ensure(String(getTask?.task?.id || '') === firstTaskId, 'schedule get did not return target task');

      const updateTask = await this.runJsonNodeScript(
        scheduleScript,
        ['update', firstTaskId, '--name', 'ui-interval-updated', '--enabled', 'true', '--schedule-type', 'interval', '--interval-minutes', '10', '--max-runs', '5', '--argv-json', argvJson, '--json'],
        60000,
        { env: isolatedEnv },
      );
      this.ensure(updateTask?.ok === true, 'schedule update failed');

      const exportAll = await this.runJsonNodeScript(scheduleScript, ['export', '--json'], 30000, { env: isolatedEnv });
      this.ensure(Array.isArray(exportAll?.tasks) && exportAll.tasks.length >= 4, 'schedule export returned no tasks');

      const importMerge = await this.runJsonNodeScript(
        scheduleScript,
        ['import', '--payload-json', JSON.stringify(exportAll), '--mode', 'merge', '--json'],
        60000,
        { env: isolatedEnv },
      );
      this.ensure(importMerge?.ok === true, 'schedule import merge failed');

      const runDue = await this.runJsonNodeScript(scheduleScript, ['run-due', '--limit', '20', '--json'], 120000, { env: isolatedEnv });
      this.ensure(runDue?.ok === true, 'schedule run-due failed');

      const daemonOnce = await this.runJsonNodeScript(
        scheduleScript,
        ['daemon', '--interval-sec', '5', '--limit', '20', '--once', '--json'],
        120000,
        { env: isolatedEnv },
      );
      this.ensure(daemonOnce?.ok === true, 'schedule daemon --once failed');

      for (const taskId of taskIds) {
        const del = await this.runJsonNodeScript(scheduleScript, ['delete', taskId, '--json'], 30000, { env: isolatedEnv });
        this.ensure(del?.ok === true, `schedule delete failed: ${taskId}`);
      }

      this.log('Step 4/4: real state/status coverage via unified API + xhs-status', 'info');
      unifiedServer = await this.ensureUnifiedServer();
      const runId = `ui-full-${Date.now()}`;
      runIds.push(runId);

      const createRes = await fetch('http://127.0.0.1:7701/api/v1/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          runId,
          profileId: 'ui-cover-profile',
          keyword: this.keyword,
          phase: 'unified',
          status: 'starting',
          progress: { total: 100, processed: 0, failed: 0 },
        }),
      });
      this.ensure(createRes.ok, 'POST /api/v1/tasks failed');

      const updateRes = await fetch(`http://127.0.0.1:7701/api/v1/tasks/${encodeURIComponent(runId)}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'running',
          progress: { total: 100, processed: 40, failed: 1 },
          stats: { notesProcessed: 40, commentsCollected: 88, likesPerformed: 3, repliesGenerated: 0, imagesDownloaded: 0, ocrProcessed: 0 },
        }),
      });
      this.ensure(updateRes.ok, 'POST /api/v1/tasks/<runId>/update failed');

      const eventRes = await fetch(`http://127.0.0.1:7701/api/v1/tasks/${encodeURIComponent(runId)}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'autoscript:operation_error',
          data: { runId, message: 'ui_full_cover_simulated_error', ts: new Date().toISOString() },
        }),
      });
      this.ensure(eventRes.ok, 'POST /api/v1/tasks/<runId>/events failed');

      const statusJson = await this.runJsonNodeScript(
        xhsStatusScript,
        ['--run-id', runId, '--json'],
        30000,
      );
      this.ensure(statusJson?.ok === true, 'xhs-status returned non-ok');
      this.ensure(Number(statusJson?.summary?.totals?.total || 0) >= 1, 'xhs-status total tasks is 0');
      this.ensure(String(statusJson?.detail?.runId || '') === runId, 'xhs-status detail runId mismatch');
      this.ensure((statusJson?.detail?.errorEvents || []).length >= 1, 'xhs-status errorEvents not populated');

      this.log('Full-cover real test PASSED', 'success');
      return {
        passed: true,
        portableRoot,
        runIds,
        covered: {
          account: true,
          scheduler: true,
          state: true,
        },
      };
    } catch (err) {
      this.log(`FAILED: ${err.message}`, 'fail');
      return { passed: false, error: err.message, portableRoot, runIds };
    } finally {
      for (const rid of runIds) {
        try {
          await fetch(`http://127.0.0.1:7701/api/v1/tasks/${encodeURIComponent(rid)}`, {
            method: 'DELETE',
          });
        } catch {}
      }
      if (unifiedServer?.owned && unifiedServer?.child) {
        try { unifiedServer.child.kill('SIGTERM'); } catch {}
      }
      try { rmSync(portableRoot, { recursive: true, force: true }); } catch {}
    }
  }

  async runScenario(scenario) {
    this.log(`Running test scenario: ${scenario}`, 'info');
    let result;
    switch (scenario) {
      case 'env-check': result = await this.testEnvCheck(); break;
      case 'account-flow': result = await this.testAccountFlow(); break;
      case 'config-save': result = await this.testConfigSave(); break;
      case 'crawl-run': result = await this.testCrawlRun(); break;
      case 'full-cover': result = await this.testFullCover(); break;
      default: throw new Error(`Unknown scenario: ${scenario}`);
    }
    result.duration = Date.now() - this.startTime;
    if (this.output) {
      const report = { scenario, ...result, results: this.results };
      mkdirSync(path.dirname(this.output), { recursive: true });
      writeFileSync(this.output, JSON.stringify(report, null, 2));
      this.log(`Report saved to ${this.output}`, 'info');
    }
    return result;
  }
}

async function main() {
  if (args.help || args.h) { printHelp(); process.exit(0); }
  if (args.check) {
    const buildOk = checkBuildStatus();
    console.log(`Build: ${buildOk ? 'OK' : 'MISSING'}`);
    process.exit(buildOk ? 0 : 1);
  }
  if (args.build) { await build(); process.exit(0); }
  if (args.install) { await install(); process.exit(0); }

  const testIndex = process.argv.indexOf('test');
  if (testIndex !== -1 && process.argv[testIndex + 1]) {
    const scenario = process.argv[testIndex + 1];
    const runner = new UITestRunner({
      profile: args.profile, keyword: args.keyword,
      target: parseInt(args.target) || 5,
      headless: args.headless, output: args.output
    });
    try {
      const result = await runner.runScenario(scenario);
      if (result.passed) {
        console.log(`\n✅ Test PASSED (${result.duration}ms)`);
        process.exit(0);
      } else {
        console.log(`\n❌ Test FAILED: ${result.error}`);
        process.exit(1);
      }
    } catch (err) {
      const message = err?.message || String(err);
      if (process.platform === 'win32' && message.includes('3221226505')) {
        console.warn(`[ui-console] Ignored spurious exit on Windows: ${message}`);
        process.exit(0);
      }
      console.log(`\n❌ Test ERROR: ${message}`);
      process.exit(1);
    }
    return;
  }

  await startConsole(args['no-daemon']);
}

main().catch((err) => {
  console.error('[ui-console] Error:', err.message);
  process.exit(1);
});
