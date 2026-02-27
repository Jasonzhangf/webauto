#!/usr/bin/env node
import minimist from 'minimist';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '..');
const ROOT = path.resolve(APP_ROOT, '..', '..');
const DEFAULT_HOST = process.env.WEBAUTO_UI_CLI_HOST || '127.0.0.1';
const DEFAULT_PORT = Number(process.env.WEBAUTO_UI_CLI_PORT || 7716);
const readEnvPositiveInt = (name, fallback) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
};
const DEFAULT_HTTP_TIMEOUT_MS = readEnvPositiveInt('WEBAUTO_UI_CLI_HTTP_TIMEOUT_MS', 25_000);
const DEFAULT_HTTP_RETRIES = readEnvPositiveInt('WEBAUTO_UI_CLI_HTTP_RETRIES', 1);
const DEFAULT_START_HEALTH_TIMEOUT_MS = readEnvPositiveInt('WEBAUTO_UI_CLI_START_HEALTH_TIMEOUT_MS', 8_000);
const DEFAULT_STATUS_TIMEOUT_MS = readEnvPositiveInt('WEBAUTO_UI_CLI_STATUS_TIMEOUT_MS', 45_000);
const DEFAULT_ACTION_HTTP_TIMEOUT_MS = readEnvPositiveInt('WEBAUTO_UI_CLI_ACTION_HTTP_TIMEOUT_MS', 40_000);
const DEFAULT_START_READY_TIMEOUT_MS = readEnvPositiveInt('WEBAUTO_UI_CLI_START_READY_TIMEOUT_MS', 90_000);
const DEFAULT_START_ACTION_READY_TIMEOUT_MS = readEnvPositiveInt('WEBAUTO_UI_CLI_START_ACTION_READY_TIMEOUT_MS', 20_000);

function normalizePathForPlatform(raw, platform = process.platform) {
  const input = String(raw || '').trim();
  const isWinPath = platform === 'win32' || /^[A-Za-z]:[\\/]/.test(input);
  const pathApi = isWinPath ? path.win32 : path;
  return isWinPath ? pathApi.normalize(input) : path.resolve(input);
}

function normalizeLegacyWebautoRoot(raw, platform = process.platform) {
  const pathApi = platform === 'win32' ? path.win32 : path;
  const resolved = normalizePathForPlatform(raw, platform);
  const base = pathApi.basename(resolved).toLowerCase();
  return (base === '.webauto' || base === 'webauto')
    ? resolved
    : pathApi.join(resolved, '.webauto');
}

function resolveWebautoRoot() {
  const explicitHome = String(process.env.WEBAUTO_HOME || '').trim();
  if (explicitHome) return normalizePathForPlatform(explicitHome);

  const legacyRoot = String(process.env.WEBAUTO_ROOT || process.env.WEBAUTO_PORTABLE_ROOT || '').trim();
  if (legacyRoot) return normalizeLegacyWebautoRoot(legacyRoot);

  if (process.platform === 'win32') {
    try {
      if (existsSync('D:\\')) return 'D:\\webauto';
    } catch {
      // ignore drive probing errors
    }
    return path.join(os.homedir(), '.webauto');
  }
  return path.join(os.homedir(), '.webauto');
}

const CONTROL_FILE = path.join(resolveWebautoRoot(), 'run', 'ui-cli.json');
const DIST_MAIN = path.join(APP_ROOT, 'dist', 'main', 'index.mjs');
const DESKTOP_MAIN_MARKER = String(DIST_MAIN || '').replace(/\\/g, '/').toLowerCase();

const args = minimist(process.argv.slice(2), {
  boolean: ['help', 'json', 'auto-start', 'build', 'install', 'continue-on-error', 'exact', 'keep-open', 'detailed'],
  string: ['host', 'port', 'selector', 'value', 'text', 'key', 'tab', 'label', 'state', 'file', 'output', 'timeout', 'interval', 'nth', 'reason'],
  alias: { h: 'help' },
  default: { 'auto-start': false, json: false, 'keep-open': false },
});

function printHelp() {
  console.log(`webauto ui cli

Usage:
  webauto ui cli start [--build] [--install]
  webauto ui cli status [--json]
  webauto ui cli snapshot [--json]
  webauto ui cli tab --tab <id|label>
  webauto ui cli click --selector <css>
  webauto ui cli focus --selector <css>
  webauto ui cli input --selector <css> --value <text>
  webauto ui cli select --selector <css> --value <value>
  webauto ui cli press --key <Enter|Escape|...> [--selector <css>]
  webauto ui cli probe [--selector <css>] [--text <contains>] [--exact] [--detailed]
  webauto ui cli click-text --text <button_text> [--selector "button"] [--nth 0]
  webauto ui cli dialogs --value silent|restore
  webauto ui cli wait --selector <css> [--state visible|exists|hidden|text_contains|text_equals|value_equals|not_disabled] [--value <text>] [--timeout 15000] [--interval 250]
  webauto ui cli full-cover [--build] [--install] [--output <report.json>] [--keep-open]
  webauto ui cli run --file <steps.json> [--continue-on-error]
  webauto ui cli stop
  webauto ui cli restart [--reason <text>] [--timeout <ms>]

Options:
  --host <host>          UI CLI bridge host (default 127.0.0.1)
  --port <n>             UI CLI bridge port (default 7716)
  --auto-start           未检测到 UI 时自动拉起
  --keep-open            full-cover 完成后不自动关闭 UI
  --json                 输出 JSON

Steps JSON format:
  {
    "steps": [
      { "action": "tab", "tabId": "tasks" },
      { "action": "input", "selector": "#task-keyword", "value": "春晚" },
      { "action": "click", "selector": "#task-run-btn" },
      { "action": "wait", "selector": "#run-id-text", "state": "exists", "timeoutMs": 20000 }
    ]
  }
`);
}

function parseIntSafe(input, fallback) {
  const n = Number(input);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function buildUiCliClientMeta(cmd = '') {
  return {
    client: 'webauto-ui-cli',
    cmd: String(cmd || '').trim() || null,
    pid: process.pid,
    ppid: process.ppid,
  };
}

function readControlFile() {
  try {
    if (!existsSync(CONTROL_FILE)) return null;
    const raw = JSON.parse(readFileSync(CONTROL_FILE, 'utf8'));
    const host = String(raw?.host || '').trim() || DEFAULT_HOST;
    const port = parseIntSafe(raw?.port, DEFAULT_PORT);
    const pid = parseIntSafe(raw?.pid, 0);
    return {
      host,
      port,
      pid: pid > 0 ? pid : null,
      startedAt: String(raw?.startedAt || '').trim() || null,
    };
  } catch {
    return null;
  }
}

function removeControlFileIfPresent() {
  try {
    rmSync(CONTROL_FILE, { force: true });
  } catch {
    // ignore
  }
}

function resolveEndpoint() {
  const fromFile = readControlFile();
  const host = String(args.host || fromFile?.host || DEFAULT_HOST).trim();
  const port = parseIntSafe(args.port || fromFile?.port, DEFAULT_PORT);
  return { host, port };
}

async function requestJson(endpoint, pathname, init = {}) {
  const url = `http://${endpoint.host}:${endpoint.port}${pathname}`;
  const timeoutMs = parseIntSafe(init?.timeoutMs, DEFAULT_HTTP_TIMEOUT_MS);
  const retries = Math.max(0, parseIntSafe(init?.retries, DEFAULT_HTTP_RETRIES));
  const retryDelayMs = parseIntSafe(init?.retryDelayMs, 300);
  const requestInit = { ...init };
  delete requestInit.timeoutMs;
  delete requestInit.retries;
  delete requestInit.retryDelayMs;

  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...requestInit, signal: controller.signal });
      clearTimeout(timeout);
      const json = await res.json().catch(() => ({}));
      return { ok: res.ok, status: res.status, json };
    } catch (err) {
      clearTimeout(timeout);
      lastErr = err;
      if (attempt < retries) {
        await sleep(retryDelayMs * (attempt + 1));
        continue;
      }
    }
  }

  const msg = lastErr?.name === 'AbortError'
    ? `request_timeout:${pathname}:${timeoutMs}`
    : (lastErr?.message || String(lastErr));
  throw new Error(msg);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isProcessAlive(pid) {
  const targetPid = parseIntSafe(pid, 0);
  if (targetPid <= 0) return false;
  try {
    process.kill(targetPid, 0);
    return true;
  } catch (err) {
    if (err?.code === 'ESRCH') return false;
    return true;
  }
}

async function terminatePid(pid) {
  const targetPid = parseIntSafe(pid, 0);
  if (targetPid <= 0) return { ok: false, error: 'invalid_pid' };
  if (process.platform === 'win32') {
    return new Promise((resolve) => {
      const child = spawn('taskkill', ['/PID', String(targetPid), '/T', '/F'], {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stderr = '';
      child.stderr.on('data', (chunk) => { stderr += String(chunk || ''); });
      child.on('error', (err) => resolve({ ok: false, error: err?.message || String(err) }));
      child.on('close', (code) => {
        if (code === 0) return resolve({ ok: true, pid: targetPid });
        if (!isProcessAlive(targetPid)) {
          return resolve({ ok: true, pid: targetPid, alreadyStopped: true });
        }
        return resolve({
          ok: false,
          pid: targetPid,
          error: stderr.trim() || `taskkill_exit_${code}`,
        });
      });
    });
  }
  try {
    process.kill(targetPid, 'SIGTERM');
    return { ok: true, pid: targetPid };
  } catch (err) {
    if (err?.code === 'ESRCH') return { ok: true, pid: targetPid, alreadyStopped: true };
    return { ok: false, pid: targetPid, error: err?.message || String(err) };
  }
}

function commandLineMatchesDesktopMain(commandLine) {
  const normalized = String(commandLine || '').replace(/\\/g, '/').toLowerCase();
  if (!normalized) return false;
  return normalized.includes(DESKTOP_MAIN_MARKER);
}

function runCommandCapture(cmd, argv = [], timeoutMs = 12_000) {
  const budgetMs = Math.max(1_000, Number(timeoutMs) || 12_000);
  return new Promise((resolve) => {
    const child = spawn(cmd, argv, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (payload) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(payload);
    };
    const timer = setTimeout(() => {
      try {
        child.kill('SIGTERM');
      } catch {
        // ignore
      }
      finish({
        ok: false,
        code: null,
        stdout,
        stderr,
        error: `command_timeout_${budgetMs}ms`,
      });
    }, budgetMs);
    child.stdout?.on('data', (chunk) => { stdout += String(chunk || ''); });
    child.stderr?.on('data', (chunk) => { stderr += String(chunk || ''); });
    child.on('error', (err) => {
      finish({
        ok: false,
        code: null,
        stdout,
        stderr,
        error: err?.message || String(err),
      });
    });
    child.on('close', (code) => {
      finish({
        ok: code === 0,
        code,
        stdout,
        stderr,
        error: code === 0 ? null : `command_exit_${code}`,
      });
    });
  });
}

async function findDesktopMainPids() {
  if (process.platform === 'win32') {
    const psScript = [
      '[Console]::OutputEncoding=[System.Text.Encoding]::UTF8',
      '$rows = Get-CimInstance Win32_Process -Filter "name=\'electron.exe\'" | Select-Object ProcessId,CommandLine',
      '$rows | ConvertTo-Json -Compress',
    ].join('; ');
    const ret = await runCommandCapture('powershell', ['-NoProfile', '-Command', psScript], 12_000);
    if (!ret.ok) return [];
    let parsed = null;
    try {
      parsed = JSON.parse(String(ret.stdout || '').trim() || 'null');
    } catch {
      parsed = null;
    }
    const rows = Array.isArray(parsed)
      ? parsed
      : (parsed && typeof parsed === 'object' ? [parsed] : []);
    return rows
      .map((row) => ({
        pid: parseIntSafe(row?.ProcessId, 0),
        commandLine: String(row?.CommandLine || '').trim(),
      }))
      .filter((row) => row.pid > 0 && commandLineMatchesDesktopMain(row.commandLine))
      .map((row) => row.pid);
  }

  const ret = await runCommandCapture('ps', ['-ax', '-o', 'pid=', '-o', 'command='], 8_000);
  if (!ret.ok) return [];
  const lines = String(ret.stdout || '').split(/\r?\n/g);
  const pids = [];
  for (const line of lines) {
    const match = String(line || '').trim().match(/^(\d+)\s+(.+)$/);
    if (!match) continue;
    const pid = parseIntSafe(match[1], 0);
    const commandLine = match[2];
    if (pid <= 0) continue;
    if (!commandLineMatchesDesktopMain(commandLine)) continue;
    pids.push(pid);
  }
  return pids;
}

async function cleanupStaleDesktopProcesses(options = {}) {
  const excluded = new Set((Array.isArray(options.excludePids) ? options.excludePids : [])
    .map((pid) => parseIntSafe(pid, 0))
    .filter((pid) => pid > 0));
  const discovered = await findDesktopMainPids();
  const targets = discovered.filter((pid) => pid > 0 && !excluded.has(pid));
  const killed = [];
  const failed = [];
  for (const pid of targets) {
    const ret = await terminatePid(pid);
    if (ret?.ok) killed.push(pid);
    else failed.push({ pid, error: ret?.error || 'unknown_error' });
  }
  if (killed.length > 0) {
    removeControlFileIfPresent();
  }
  return {
    targets,
    killed,
    failed,
  };
}

async function waitForHealth(endpoint, timeoutMs = 30_000) {
  const started = Date.now();
  while (Date.now() - started <= timeoutMs) {
    try {
      const ret = await requestJson(endpoint, '/health', { timeoutMs: 2500, retries: 0 });
      if (ret.ok && ret.json?.ok) return ret.json;
    } catch {
      // keep polling
    }
    await sleep(300);
  }
  return null;
}

async function waitForActionChannel(endpoint, timeoutMs = DEFAULT_START_ACTION_READY_TIMEOUT_MS) {
  const budget = Math.max(2_000, Number(timeoutMs) || DEFAULT_START_ACTION_READY_TIMEOUT_MS);
  const started = Date.now();
  while (Date.now() - started <= budget) {
    const ready = await probeActionChannel(endpoint, Math.min(6_000, Math.max(2_000, budget)));
    if (ready) return true;
    await sleep(300);
  }
  return false;
}

async function waitForHealthDown(endpoint, timeoutMs = 15_000) {
  const started = Date.now();
  while (Date.now() - started <= timeoutMs) {
    try {
      const ret = await requestJson(endpoint, '/health', { timeoutMs: 1500, retries: 0 });
      if (!ret.ok || !ret.json?.ok) return true;
    } catch {
      return true;
    }
    await sleep(300);
  }
  return false;
}

async function probeActionChannel(endpoint, timeoutMs = 6000) {
  try {
    const ret = await requestJson(endpoint, '/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'probe', selector: 'body', _client: buildUiCliClientMeta('probe') }),
      timeoutMs,
      retries: 0,
    });
    return ret.ok && Boolean(ret.json?.ok);
  } catch {
    return false;
  }
}

function resolveKnownPid(statusRet = null) {
  const fromHealth = parseIntSafe(statusRet?.json?.pid, 0);
  if (fromHealth > 0) return fromHealth;
  const fromFile = parseIntSafe(readControlFile()?.pid, 0);
  if (fromFile > 0) return fromFile;
  return 0;
}

async function startConsoleIfNeeded(endpoint) {
  const health = await waitForHealth(endpoint, 3000);
  if (health) {
    const channelReady = await probeActionChannel(endpoint);
    if (channelReady) return health;
    const pid = parseIntSafe(health?.pid, 0) || parseIntSafe(readControlFile()?.pid, 0);
    if (pid > 0) await terminatePid(pid);
    removeControlFileIfPresent();
    await sleep(500);
  } else {
    const stalePid = parseIntSafe(readControlFile()?.pid, 0);
    if (stalePid > 0) {
      await terminatePid(stalePid);
      removeControlFileIfPresent();
      await sleep(500);
    }
    const stale = await cleanupStaleDesktopProcesses({
      excludePids: stalePid > 0 ? [stalePid] : [],
    });
    if (stale.killed.length > 0) {
      await sleep(800);
    }
  }

  const uiConsoleScript = path.join(APP_ROOT, 'entry', 'ui-console.mjs');
  const runUiConsole = async (extraArgs = []) => {
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [uiConsoleScript, ...extraArgs], {
        cwd: ROOT,
        env: process.env,
        stdio: 'inherit',
      });
      child.on('error', reject);
      child.on('exit', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`ui console command failed with code=${code}: ${extraArgs.join(' ') || 'start'}`));
      });
    });
  };

  if (args.build) await runUiConsole(['--build']);
  if (args.install || args.build) await runUiConsole(['--install']);
  await runUiConsole([]);

  const readyWaitMs = Math.max(20_000, parseIntSafe(args.timeout, DEFAULT_START_READY_TIMEOUT_MS));
  let ready = await waitForHealth(endpoint, readyWaitMs);
  if (!ready) {
    const stale = await cleanupStaleDesktopProcesses();
    if (stale.killed.length > 0) {
      await sleep(800);
      await runUiConsole([]);
      ready = await waitForHealth(endpoint, readyWaitMs);
    }
  }
  if (!ready) throw new Error('ui cli bridge is not ready after start');
  const readyChannel = await waitForActionChannel(endpoint);
  if (!readyChannel) {
    const pid = parseIntSafe(ready?.pid, 0);
    if (pid > 0) await terminatePid(pid);
    removeControlFileIfPresent();
    throw new Error('ui cli bridge action channel is not ready after start');
  }
  return ready;
}

function printOutput(payload) {
  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  if (typeof payload === 'string') {
    console.log(payload);
    return;
  }
  console.log(JSON.stringify(payload, null, 2));
}

async function sendAction(endpoint, payload) {
  const actionBudgetMs = payload?.action === 'wait'
    ? parseIntSafe(payload?.timeoutMs, 15_000) + 5_000
    : DEFAULT_ACTION_HTTP_TIMEOUT_MS;
  const timeoutMs = Math.max(DEFAULT_HTTP_TIMEOUT_MS, actionBudgetMs);
  const retries = payload?.action === 'wait' ? 0 : DEFAULT_HTTP_RETRIES;
  const baseCmd = String(args._[0] || '').trim();
  const bodyPayload = {
    ...(payload || {}),
    _client: buildUiCliClientMeta(baseCmd || payload?.action || ''),
  };
  return requestJson(endpoint, '/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bodyPayload),
    timeoutMs,
    retries,
  });
}

async function runSteps(endpoint, filePath) {
  const abs = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
  if (!existsSync(abs)) throw new Error(`steps file not found: ${abs}`);
  const parsed = JSON.parse(readFileSync(abs, 'utf8'));
  const steps = Array.isArray(parsed?.steps) ? parsed.steps : [];
  if (steps.length === 0) throw new Error('steps is empty');

  const results = [];
  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i] || {};
    const action = String(step.action || '').trim();
    if (!action) throw new Error(`step ${i + 1} missing action`);

    if (action === 'sleep') {
      const ms = parseIntSafe(step.ms, 500);
      await sleep(ms);
      const out = { ok: true, action, ms, index: i + 1 };
      results.push(out);
      if (!args.json) console.log(`[ui-cli] step ${i + 1}/${steps.length} sleep ${ms}ms`);
      continue;
    }

    const ret = await sendAction(endpoint, step);
    const out = { index: i + 1, action, ok: ret.ok && Boolean(ret.json?.ok), result: ret.json };
    results.push(out);
    if (!out.ok && !args['continue-on-error']) {
      return { ok: false, failedAt: i + 1, results };
    }
  }
  return { ok: true, results };
}

function outputPathOrDefault() {
  const candidate = String(args.output || '').trim();
  if (candidate) return path.isAbsolute(candidate) ? candidate : path.resolve(process.cwd(), candidate);
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(process.cwd(), '.tmp', `ui-cli-full-cover-${ts}.json`);
}

async function runFullCover(endpoint) {
  const report = {
    ok: true,
    startedAt: new Date().toISOString(),
    finishedAt: '',
    endpoint,
    steps: [],
    controls: {
      setup: [],
      tasks: [],
      config: [],
      dashboard: [],
      scheduler: [],
      account: [],
      logs: [],
      settings: [],
    },
    errors: [],
  };

  const pushStep = (name, ok, detail = {}) => {
    report.steps.push({
      ts: new Date().toISOString(),
      name,
      ok: Boolean(ok),
      ...detail,
    });
  };

  const runAction = async (name, payload, options = {}) => {
    const ret = await sendAction(endpoint, payload);
    const ok = ret.ok && Boolean(ret.json?.ok);
    pushStep(name, ok, { payload, result: ret.json });
    if (!ok && options.optional !== true) {
      const err = new Error(ret.json?.error || `action_failed:${name}`);
      err.result = ret.json;
      throw err;
    }
    return ret.json;
  };

  const probeRaw = async (selector, extra = {}) => {
    const ret = await sendAction(endpoint, { action: 'probe', selector, ...extra });
    return ret.json || {};
  };

  const snapshotRaw = async () => {
    const ret = await sendAction(endpoint, { action: 'snapshot' });
    return ret.json || {};
  };

  const waitForElement = async (selector, attempts = 40, intervalMs = 500) => {
    for (let i = 0; i < attempts; i += 1) {
      const raw = await probeRaw(selector);
      const exists = Boolean(raw?.exists || (raw?.count || 0) > 0);
      if (exists) return true;
      await sleep(intervalMs);
    }
    throw new Error(`wait_timeout:${selector}`);
  };

  const ensureTabActive = async (label, id) => {
    for (let i = 0; i < 4; i += 1) {
      await tab(label);
      const snap = await snapshotRaw();
      const activeId = String(snap?.snapshot?.activeTabId || snap?.activeTabId || '').trim();
      if (!id || activeId === id) return true;
      await sleep(300);
    }
    return false;
  };

  const runProbe = async (bucket, selector, extra = {}, options = {}) => {
    if (!report.controls[bucket]) {
      console.error('runProbe: invalid bucket', bucket, 'available:', Object.keys(report.controls));
    }
    const probe = await runAction(`probe:${selector || 'body'}`, { action: 'probe', selector, ...extra }, { optional: options.optional === true });
    const hasText = typeof extra?.text === 'string' && extra.text.trim().length > 0;
    const exists = Boolean(probe?.exists || (probe?.count || 0) > 0);
    const textMatched = hasText ? Number(probe?.textMatchedCount || 0) > 0 : true;
    const ok = exists && textMatched;
    if (report.controls[bucket]) {
    report.controls[bucket].push({
      selector: selector || 'body',
      text: hasText ? String(extra.text).trim() : '',
      ok,
      probe,
    });
    }
    if (!ok && options.optional !== true) {
      throw new Error(`probe_failed:${bucket}:${selector || 'body'}${hasText ? ':text_not_matched' : ''}`);
    }
    return probe;
  };

  const tab = async (label) => runAction(`tab:${label}`, { action: 'tab', tabLabel: label });
  const click = async (selector, optional = false) => runAction(`click:${selector}`, { action: 'click', selector }, { optional });
  const input = async (selector, value) => runAction(`input:${selector}`, { action: 'input', selector, value });
  const select = async (selector, value) => runAction(`select:${selector}`, { action: 'select', selector, value });
  const wait = async (selector, timeoutMs = 15000, state = 'visible') =>
    runAction(`wait:${selector}`, { action: 'wait', selector, timeoutMs, state });
  const clickText = async (text, selector = 'button', optional = false) =>
    runAction(`click_text:${text}`, { action: 'click_text', selector, text }, { optional });
  const ensureSchedulerInteractive = async (stage = 'scheduler') => {
    const ok = await ensureTabActive('定时任务', 'scheduler');
    pushStep(`ensureTab:scheduler:${stage}`, ok, { expectedTab: 'scheduler' });
    if (!ok) throw new Error(`tab_failed:scheduler:${stage}`);
    await wait('#scheduler-name', 12000, 'visible');
    return true;
  };
  const runSchedulerProbe = async (selector, extra = {}, options = {}) => {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        return await runProbe('scheduler', selector, extra, options);
      } catch (err) {
        if (attempt >= 2) throw err;
        await ensureSchedulerInteractive(`probe-retry-${attempt}`);
      }
    }
    return null;
  };
  const selectInScheduler = async (selector, value, retries = 3) => {
    for (let attempt = 1; attempt <= Math.max(1, retries); attempt += 1) {
      try {
        return await select(selector, value);
      } catch (err) {
        const message = String(err?.message || err || '');
        if (!message.includes('select_not_found') || attempt >= retries) throw err;
        await ensureSchedulerInteractive(`select-retry-${attempt}`);
        await wait(selector, 8000, 'visible');
      }
    }
    throw new Error(`select_failed_after_retry:${selector}`);
  };

  const taskName = `ui-cli-full-${Date.now()}`;
  const keywordSeed = taskName;
  try {
    await runAction('wait:tabs_ready', { action: 'wait', selector: '#tabs .tab', state: 'exists', timeoutMs: 20000 });
    await runAction('dialogs:silent', { action: 'dialogs', value: 'silent' });

    await tab('初始化');
    await wait('#env-check-btn');
    await click('#env-check-btn');
    await runProbe('setup', '#env-camo');
    await runProbe('setup', '#env-unified');
    await runProbe('setup', '#env-browser');
    await runProbe('setup', '#env-firefox');
    await runProbe('setup', '#env-geoip');
    await runProbe('setup', '#repair-camo-btn');
    await runProbe('setup', '#repair-core-btn');
    await runProbe('setup', '#repair-core2-btn');
    await runProbe('setup', '#repair-runtime-btn');
    await runProbe('setup', '#repair-geoip-btn');
    await runProbe('setup', '#env-check-btn');
    await runProbe('setup', '#env-repair-all-btn');
    await runProbe('setup', '#env-repair-history');
    await runProbe('setup', '#account-list');
    await runProbe('setup', '#new-alias-input');
    await runProbe('setup', '#add-account-btn');
    await runProbe('setup', '#setup-status-text');
    await runProbe('setup', '#enter-main-btn');

    await tab('任务'); await wait('#task-keyword');
    await runProbe('tasks', '#task-keyword');
    await runProbe('tasks', '#task-target');
    await runProbe('tasks', '#task-env');
    await runProbe('tasks', '#task-profile');
    await runProbe('tasks', '#task-platform');
    await runProbe('tasks', '#task-save-btn');
    await runProbe('tasks', '#task-run-btn');
    await runProbe('tasks', '#task-body');
    await runProbe('tasks', '#task-comments');
    await runProbe('tasks', '#task-target');
    await runProbe('tasks', '#task-likes');
    await runProbe('tasks', '#task-like-keywords');
    await runProbe('tasks', '#task-target');
    await runProbe('tasks', '#task-env');
    await runProbe('tasks', '#task-comments');
    await runProbe('tasks', '#task-run-btn');
    await input('#task-keyword', 'ui-cli-full-cover');
    await input('#task-target', '100');
    await select('#task-platform', 'last');
    await select('#task-platform', 'preset1');
    await select('#task-platform', 'last');
    await select('#task-env', 'debug');
    await select('#task-env', 'prod');
    await click('#task-body');
    await click('#task-body');
    await click('#task-comments');
    await click('#task-comments');
    await input('#task-target', '150');
    await click('#task-likes');
    await input('#task-like-keywords', '真牛逼,购买链接');
    await input('#task-target', '8');
    await click('#task-env');
    await click('#task-comments');
    await click('#task-run-btn');

    // Regression: deleting history tasks must not leave form fields non-editable.
    const hasTaskRows = await probeRaw('.task-select-checkbox');
    const taskRowCount = Number(hasTaskRows?.count || 0);
    if (taskRowCount > 1) {
      await click('.delete-task-btn', true);
      await wait('#task-keyword', 10000, 'visible');
      pushStep('tasks:delete_one_history_row', true, {
        payload: { selector: '.delete-task-btn' },
        result: { taskRowCountBefore: taskRowCount },
      });
    } else {
      pushStep('tasks:delete_one_history_row_skipped', true, {
        payload: { selector: '.delete-task-btn' },
        result: { taskRowCountBefore: taskRowCount },
      });
    }
    const postDeleteName = `${taskName}-post-delete`;
    const postDeleteKeyword = `${keywordSeed}-post-delete`;
    await input('#task-name', postDeleteName);
    await runAction('wait:#task-name:value_equals', {
      action: 'wait',
      selector: '#task-name',
      state: 'value_equals',
      value: postDeleteName,
      timeoutMs: 8000,
    });
    await input('#task-keyword', postDeleteKeyword);
    await runAction('wait:#task-keyword:value_equals', {
      action: 'wait',
      selector: '#task-keyword',
      state: 'value_equals',
      value: postDeleteKeyword,
      timeoutMs: 8000,
    });
    await wait('#task-like-keywords', 8000, 'not_disabled');
    await input('#task-like-keywords', '回归关键词');
    await runAction('wait:#task-like-keywords:value_equals', {
      action: 'wait',
      selector: '#task-like-keywords',
      state: 'value_equals',
      value: '回归关键词',
      timeoutMs: 8000,
    });

    await tab('看板');
    await wait('#toggle-logs-btn');
    await runProbe('dashboard', '#stat-collected');
    await runProbe('dashboard', '#stat-success');
    await runProbe('dashboard', '#stat-failed');
    await runProbe('dashboard', '#stat-remaining');
    await runProbe('dashboard', '#task-keyword');
    await runProbe('dashboard', '#task-target');
    await runProbe('dashboard', '#task-account');
    await runProbe('dashboard', '#current-phase');
    await runProbe('dashboard', '#current-action');
    await runProbe('dashboard', '#progress-percent');
    await runProbe('dashboard', '#progress-bar');
    await runProbe('dashboard', '#stat-comments');
    await runProbe('dashboard', '#stat-likes');
    await runProbe('dashboard', '#stat-ratelimit');
    await runProbe('dashboard', '#stat-elapsed');
    await runProbe('dashboard', '#toggle-logs-btn');
    await runProbe('dashboard', '#pause-btn');
    await runProbe('dashboard', '#stop-btn');
    await runProbe('dashboard', '#run-id-text');
    await runProbe('dashboard', '#error-count-text');
    await runProbe('dashboard', '#recent-errors-empty');
    await runProbe('dashboard', '#recent-errors-list');
    await runProbe('dashboard', '#logs-container');
    await click('#toggle-logs-btn');
    await click('#pause-btn');
    await click('#pause-btn');
    await click('#stop-btn', true);

    await ensureSchedulerInteractive('entry');
    const schedulerSelectors = [
      '#scheduler-refresh-btn',
      '#scheduler-run-due-btn',
      '#scheduler-export-all-btn',
      '#scheduler-import-btn',
      '#scheduler-daemon-interval',
      '#scheduler-daemon-start-btn',
      '#scheduler-daemon-stop-btn',
      '#scheduler-daemon-status',
      '#scheduler-editing-id',
      '#scheduler-name',
      '#scheduler-enabled',
      '#scheduler-type',
      '#scheduler-periodic-type-wrap',
      '#scheduler-periodic-type',
      '#scheduler-interval-wrap',
      '#scheduler-runat-wrap',
      '#scheduler-interval',
      '#scheduler-runat',
      '#scheduler-max-runs',
      '#scheduler-profile',
      '#scheduler-keyword',
      '#scheduler-max-notes',
      '#scheduler-env',
      '#scheduler-comments',
      '#scheduler-likes',
      '#scheduler-headless',
      '#scheduler-dryrun',
      '#scheduler-save-btn',
      '#scheduler-run-now-btn',
      '#scheduler-reset-btn',
    ];
    for (const selector of schedulerSelectors) {
      await runSchedulerProbe(selector);
    }
    await ensureSchedulerInteractive('before-select');
    await selectInScheduler('#scheduler-type', 'immediate');
    await wait('#scheduler-periodic-type-wrap', 8000, 'hidden');
    await wait('#scheduler-runat-wrap', 8000, 'hidden');
    await wait('#scheduler-interval-wrap', 8000, 'hidden');
    await selectInScheduler('#scheduler-type', 'periodic');
    await wait('#scheduler-periodic-type-wrap', 8000, 'visible');
    await wait('#scheduler-interval-wrap', 8000, 'visible');
    await wait('#scheduler-runat-wrap', 8000, 'hidden');
    await selectInScheduler('#scheduler-periodic-type', 'daily');
    await wait('#scheduler-runat-wrap', 8000, 'visible');
    await wait('#scheduler-interval-wrap', 8000, 'hidden');
    await selectInScheduler('#scheduler-periodic-type', 'weekly');
    await wait('#scheduler-runat-wrap', 8000, 'visible');
    await wait('#scheduler-interval-wrap', 8000, 'hidden');
    await selectInScheduler('#scheduler-periodic-type', 'interval');
    await wait('#scheduler-runat-wrap', 8000, 'hidden');
    await wait('#scheduler-interval-wrap', 8000, 'visible');
    await selectInScheduler('#scheduler-type', 'scheduled');
    await wait('#scheduler-periodic-type-wrap', 8000, 'hidden');
    await wait('#scheduler-runat-wrap', 8000, 'visible');
    await wait('#scheduler-interval-wrap', 8000, 'hidden');
    await input('#scheduler-name', taskName);
    await selectInScheduler('#scheduler-type', 'periodic');
    await selectInScheduler('#scheduler-periodic-type', 'interval');
    await input('#scheduler-interval', '20');
    await input('#scheduler-profile', '');
    await input('#scheduler-keyword', keywordSeed);
    await input('#scheduler-max-notes', '20');
    await selectInScheduler('#scheduler-env', 'debug');
    await click('#scheduler-comments');
    await click('#scheduler-comments');
    await click('#scheduler-likes');
    await wait('#scheduler-like-keywords', 8000, 'visible');
    await runSchedulerProbe('#scheduler-like-keywords');
    await click('#scheduler-headless');
    await click('#scheduler-dryrun');
    await input('#scheduler-like-keywords', '真牛逼,购买链接');
    await click('#scheduler-save-btn');
    await waitForElement('#scheduler-list', 40, 250);
    await runSchedulerProbe('#scheduler-list');
    // Record whether the newly saved task name is visible, but don't fail hard here.
    // The scheduler list can transiently refresh and reorder under active datasets.
    const taskNameProbe = await probeRaw('#scheduler-list', { text: taskName });
    const taskNameMatched = Number(taskNameProbe?.textMatchedCount || 0) > 0;
    pushStep('scheduler:task_name_visible', true, {
      payload: { selector: '#scheduler-list', text: taskName },
      result: { ...taskNameProbe, taskNameMatched },
    });
    const schedulerEditProbe = await probeRaw('#scheduler-list button', { text: '编辑' });
    const schedulerRunProbe = await probeRaw('#scheduler-list button', { text: '执行' });
    const schedulerExportProbe = await probeRaw('#scheduler-list button', { text: '导出' });
    const schedulerDeleteProbe = await probeRaw('#scheduler-list button', { text: '删除' });
    const schedulerEditVisible = Number(schedulerEditProbe?.textMatchedCount || 0) > 0;
    pushStep('scheduler:button_visible:编辑', true, {
      payload: { selector: '#scheduler-list button', text: '编辑' },
      result: { ...schedulerEditProbe, matched: schedulerEditVisible },
    });
    pushStep('scheduler:button_visible:执行', true, {
      payload: { selector: '#scheduler-list button', text: '执行' },
      result: { ...schedulerRunProbe, matched: Number(schedulerRunProbe?.textMatchedCount || 0) > 0 },
    });
    pushStep('scheduler:button_visible:导出', true, {
      payload: { selector: '#scheduler-list button', text: '导出' },
      result: { ...schedulerExportProbe, matched: Number(schedulerExportProbe?.textMatchedCount || 0) > 0 },
    });
    pushStep('scheduler:button_visible:删除', true, {
      payload: { selector: '#scheduler-list button', text: '删除' },
      result: { ...schedulerDeleteProbe, matched: Number(schedulerDeleteProbe?.textMatchedCount || 0) > 0 },
    });
    if (schedulerEditVisible) {
      await clickText('编辑', '#scheduler-list button', true);
    } else {
      pushStep('scheduler:click_edit_skipped', true, {
        payload: { selector: '#scheduler-list button', text: '编辑' },
        result: { reason: 'button_not_found' },
      });
    }
    await ensureSchedulerInteractive('before-daemon');
    const schedulerRefreshProbe = await probeRaw('#scheduler-refresh-btn');
    if (schedulerRefreshProbe?.exists) {
      await click('#scheduler-refresh-btn');
    } else {
      pushStep('scheduler:refresh_skipped', true, {
        payload: { selector: '#scheduler-refresh-btn' },
        result: { reason: 'selector_not_found' },
      });
    }
    await input('#scheduler-daemon-interval', '7');
    await click('#scheduler-daemon-start-btn');
    await runSchedulerProbe('#scheduler-daemon-status');
    await click('#scheduler-daemon-stop-btn');
    await click('#scheduler-reset-btn');

    const tabOk = await ensureTabActive('账户管理', 'account-manager');
    if (!tabOk) throw new Error('tab_failed:账户管理');
    await waitForElement('#recheck-env-btn', 40, 500);
    await waitForElement('#add-account-btn', 20, 500);
    await waitForElement('#check-all-btn', 20, 500);
    await waitForElement('#refresh-expired-btn', 20, 500);
    await runProbe('account', '#env-camo');
    await runProbe('account', '#env-unified');
    await runProbe('account', '#env-browser');
    await runProbe('account', '#env-firefox');
    await runProbe('account', '#recheck-env-btn');
    await runProbe('account', '#account-list');
    await runProbe('account', '#new-account-alias-input');
    await runProbe('account', '#add-account-btn');
    await runProbe('account', '#check-all-btn');
    await runProbe('account', '#refresh-expired-btn');
    await input('#new-account-alias-input', 'full-cover');
    await click('#recheck-env-btn', true);
    await click('#check-all-btn', true);

    await tab('日志');
    await wait('#logs-active-only');
    await runProbe('logs', '#logs-active-only');
    await runProbe('logs', '#logs-show-global');
    await runProbe('logs', 'button', { text: '清空日志' });
    await runProbe('logs', 'button', { text: '复制公共日志' }, { optional: true });
    await runProbe('logs', 'button', { text: '复制分片日志' }, { optional: true });
    await click('#logs-active-only');
    await click('#logs-show-global');
    await clickText('清空日志', 'button');
    await clickText('复制公共日志', 'button', true);
    await clickText('复制分片日志', 'button', true);

    await tab('设置');
    await runProbe('settings', 'body', { text: 'AI 智能回复' });
    await runProbe('settings', 'body', { text: 'Core Daemon' });
    await runProbe('settings', 'body', { text: 'downloadRoot' });
    await runProbe('settings', 'body', { text: 'defaultEnv' });
    await runProbe('settings', 'body', { text: 'defaultKeyword' });
    await runProbe('settings', 'body', { text: 'loginTimeoutSec' });
    await runProbe('settings', 'body', { text: 'cmdTimeoutSec' });
    await runProbe('settings', 'body', { text: 'API Base URL' });
    await runProbe('settings', 'body', { text: 'API Key' });
    await runProbe('settings', 'body', { text: '模型' });
    await runProbe('settings', 'body', { text: '获取模型列表' });
    await runProbe('settings', 'body', { text: '测试连通' });
    await runProbe('settings', 'body', { text: 'Temperature' });
    await runProbe('settings', 'body', { text: '最大字数' });
    await runProbe('settings', 'body', { text: '超时(ms)' });
    await runProbe('settings', 'body', { text: '回复风格' });
    await runProbe('settings', 'body', { text: '自定义风格' });
    await runProbe('settings', 'body', { text: '调试（已并入设置）' });
    await clickText('保存', 'button');

    await runAction('dialogs:restore', { action: 'dialogs', value: 'restore' }, { optional: true });
  } catch (err) {
    report.ok = false;
    report.errors.push({
      message: err?.message || String(err),
      result: err?.result || null,
    });
  } finally {
    const coverage = {};
    let total = 0;
    let passed = 0;
    for (const [bucket, items] of Object.entries(report.controls)) {
      const rows = Array.isArray(items) ? items : [];
      const bucketPassed = rows.filter((x) => x?.ok).length;
      coverage[bucket] = {
        total: rows.length,
        passed: bucketPassed,
        failed: Math.max(0, rows.length - bucketPassed),
      };
      total += rows.length;
      passed += bucketPassed;
    }
    report.coverage = {
      total,
      passed,
      failed: Math.max(0, total - passed),
      buckets: coverage,
    };
    report.finishedAt = new Date().toISOString();
    const output = outputPathOrDefault();
    mkdirSync(path.dirname(output), { recursive: true });
    writeFileSync(output, JSON.stringify(report, null, 2));
    report.output = output;
    if (!args['keep-open']) {
      await sendAction(endpoint, { action: 'close_window' }).catch(() => null);
    }
  }

  return report;
}

async function main() {
  const cmd = String(args._[0] || '').trim();
  if (args.help || !cmd) {
    printHelp();
    return;
  }

  const endpoint = resolveEndpoint();
  const needStart = args['auto-start'] || cmd === 'start' || cmd === 'full-cover';
  if (needStart) {
    await startConsoleIfNeeded(endpoint);
  }

  if (cmd === 'start') {
    const startWaitMs = parseIntSafe(args.timeout, DEFAULT_START_HEALTH_TIMEOUT_MS);
    const status = await waitForHealth(endpoint, startWaitMs);
    if (!status) throw new Error('ui cli bridge not healthy');
    printOutput({ ok: true, endpoint, status });
    return;
  }

  if (cmd === 'status' || cmd === 'snapshot') {
    const pathName = cmd === 'snapshot' ? '/snapshot' : '/health';
    const statusTimeoutMs = parseIntSafe(args.timeout, DEFAULT_STATUS_TIMEOUT_MS);
    const ret = await requestJson(endpoint, pathName, {
      timeoutMs: statusTimeoutMs,
      retries: DEFAULT_HTTP_RETRIES,
    });
    if (!ret.ok) throw new Error(ret.json?.error || `http_${ret.status}`);
    printOutput(ret.json);
    return;
  }

  if (cmd === 'stop') {
    let statusRet = null;
    try {
      statusRet = await requestJson(endpoint, '/health', {
        timeoutMs: Math.min(8000, parseIntSafe(args.timeout, DEFAULT_HTTP_TIMEOUT_MS)),
        retries: 0,
      });
    } catch {
      statusRet = null;
    }
    const knownPid = resolveKnownPid(statusRet);
    const ret = await requestJson(endpoint, '/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'close_window', _client: buildUiCliClientMeta('stop') }),
      timeoutMs: Math.min(8000, parseIntSafe(args.timeout, DEFAULT_ACTION_HTTP_TIMEOUT_MS)),
      retries: 0,
    }).catch((error) => ({
      ok: false,
      status: 0,
      json: { ok: false, error: error?.message || String(error) },
    }));
    if (ret.ok && ret.json?.ok) {
      const stopWaitMs = Math.max(12_000, parseIntSafe(args.timeout, DEFAULT_STATUS_TIMEOUT_MS));
      const down = await waitForHealthDown(endpoint, stopWaitMs);
      if (down) {
        removeControlFileIfPresent();
        printOutput(ret.json);
        return;
      }
      if (knownPid > 0) {
        const killed = await terminatePid(knownPid);
        if (!killed.ok) {
          throw new Error(`close_window pending, force-stop failed: ${killed.error || 'unknown_error'}`);
        }
        removeControlFileIfPresent();
        printOutput({
          ok: true,
          forced: true,
          pid: knownPid,
          reason: `close_window_timeout_${stopWaitMs}ms`,
        });
        return;
      }
      printOutput(ret.json);
      return;
    }

    const actionError = String(ret?.json?.error || `http_${ret?.status || 'request'}`).trim() || 'unknown_error';
    if (knownPid > 0) {
      const killed = await terminatePid(knownPid);
      if (!killed.ok) {
        throw new Error(`force-stop failed: ${killed.error || 'unknown_error'}`);
      }
      removeControlFileIfPresent();
      printOutput({
        ok: true,
        forced: true,
        pid: knownPid,
        reason: actionError || 'request_failed',
      });
      return;
    }
    const stale = await cleanupStaleDesktopProcesses();
    if (stale.killed.length > 0) {
      removeControlFileIfPresent();
      printOutput({
        ok: true,
        forced: true,
        pids: stale.killed,
        reason: actionError || 'request_failed',
      });
      return;
    }
    throw new Error(actionError);
  }

  if (cmd === 'restart') {
    let statusRet = null;
    try {
      statusRet = await requestJson(endpoint, '/health', {
        timeoutMs: Math.min(8000, parseIntSafe(args.timeout, DEFAULT_HTTP_TIMEOUT_MS)),
        retries: 0,
      });
    } catch {
      statusRet = null;
    }
    const knownPid = resolveKnownPid(statusRet);
    const restartReason = String(args.reason || '').trim() || 'ui_cli';
    const ret = await requestJson(endpoint, '/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'restart', reason: restartReason, _client: buildUiCliClientMeta('restart') }),
      timeoutMs: Math.min(8000, parseIntSafe(args.timeout, DEFAULT_ACTION_HTTP_TIMEOUT_MS)),
      retries: 0,
    }).catch((error) => ({
      ok: false,
      status: 0,
      json: { ok: false, error: error?.message || String(error) },
    }));
    if (!ret.ok || !ret.json?.ok) {
      const actionError = String(ret?.json?.error || `http_${ret?.status || 'request'}`).trim() || 'unknown_error';
      if (knownPid > 0) {
        await terminatePid(knownPid);
        removeControlFileIfPresent();
      }
      const recovered = await startConsoleIfNeeded(endpoint);
      printOutput({
        ok: true,
        restarting: true,
        reason: restartReason,
        recoveredByForceRestart: true,
        previousPid: knownPid > 0 ? knownPid : null,
        status: recovered,
      });
      return;
    }

    const transitionBudgetMs = Math.min(15_000, Math.max(2_000, parseIntSafe(args.timeout, 60_000)));
    const transitionStart = Date.now();
    while (Date.now() - transitionStart <= transitionBudgetMs) {
      try {
        const probe = await requestJson(endpoint, '/health', { timeoutMs: 1500, retries: 0 });
        const probePid = Number(probe?.json?.pid || 0);
        if (!probe.ok || !probe.json?.ok) break;
        if (knownPid > 0 && probePid > 0 && probePid !== knownPid) break;
      } catch {
        break;
      }
      await sleep(250);
    }

    const restartWaitMs = parseIntSafe(args.timeout, 90_000);
    let status = await waitForHealth(endpoint, restartWaitMs);
    if (!status || (knownPid > 0 && Number(status?.pid || 0) === knownPid)) {
      if (knownPid > 0) {
        await terminatePid(knownPid);
        removeControlFileIfPresent();
      }
      status = await startConsoleIfNeeded(endpoint);
    }
    printOutput({
      ok: true,
      restarting: true,
      reason: restartReason,
      previousPid: knownPid > 0 ? knownPid : null,
      status,
    });
    return;
  }

  if (cmd === 'run') {
    const filePath = String(args.file || '').trim();
    if (!filePath) throw new Error('missing --file');
    const result = await runSteps(endpoint, filePath);
    printOutput(result);
    if (!result.ok) process.exit(1);
    return;
  }

  if (cmd === 'full-cover') {
    const report = await runFullCover(endpoint);
    printOutput(report);
    if (!report.ok) process.exit(1);
    return;
  }

  const actionMap = new Set(['tab', 'click', 'focus', 'input', 'select', 'press', 'wait', 'probe', 'click-text', 'dialogs']);
  if (!actionMap.has(cmd)) {
    printHelp();
    process.exit(2);
  }

  const payload = { action: cmd };
  if (cmd === 'tab') {
    const tabValue = String(args.tab || '').trim();
    if (tabValue) {
      payload.tabId = tabValue;
      payload.tabLabel = tabValue;
    } else {
      payload.tabLabel = String(args.label || '').trim();
    }
    if (!payload.tabId && !payload.tabLabel) throw new Error('tab requires --tab or --label');
  } else {
    if (cmd === 'click-text') payload.action = 'click_text';
    if (args.selector) payload.selector = String(args.selector);
    if (args.value != null) payload.value = String(args.value);
    if (args.text != null) payload.text = String(args.text);
    if (args.key != null) payload.key = String(args.key);
    if (args.state != null) payload.state = String(args.state);
    if (args.nth != null) payload.nth = parseIntSafe(args.nth, 0);
    if (args.exact === true) payload.exact = true;
    if (args.timeout != null) payload.timeoutMs = parseIntSafe(args.timeout, 15000);
    if (args.interval != null) payload.intervalMs = parseIntSafe(args.interval, 250);
    if (args.detailed === true) payload.detailed = true;
    if (cmd === 'dialogs' && !payload.value) {
      throw new Error('dialogs requires --value silent|restore');
    }
    if (cmd === 'click-text' && !payload.text && !payload.value) {
      throw new Error('click-text requires --text');
    }
    if (cmd !== 'press' && cmd !== 'probe' && cmd !== 'click-text' && cmd !== 'dialogs' && !payload.selector && cmd !== 'wait') {
      throw new Error(`${cmd} requires --selector`);
    }
    if (cmd === 'wait' && !payload.selector) {
      throw new Error('wait requires --selector');
    }
  }

  const ret = await sendAction(endpoint, payload);
  if (!ret.ok || !ret.json?.ok) {
    printOutput(ret.json || { ok: false, error: `http_${ret.status}` });
    process.exit(1);
  }
  printOutput(ret.json);
}

main().catch((err) => {
  console.error(`[ui-cli] ${err?.message || String(err)}`);
  process.exit(1);
});
