#!/usr/bin/env node
import minimist from 'minimist';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '..');
const ROOT = path.resolve(APP_ROOT, '..', '..');
const CONTROL_FILE = path.join(os.homedir(), '.webauto', 'run', 'ui-cli.json');
const DEFAULT_HOST = process.env.WEBAUTO_UI_CLI_HOST || '127.0.0.1';
const DEFAULT_PORT = Number(process.env.WEBAUTO_UI_CLI_PORT || 7716);

const args = minimist(process.argv.slice(2), {
  boolean: ['help', 'json', 'auto-start', 'build', 'install', 'continue-on-error', 'exact', 'keep-open', 'detailed'],
  string: ['host', 'port', 'selector', 'value', 'text', 'key', 'tab', 'label', 'state', 'file', 'output', 'timeout', 'interval', 'nth'],
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

function readControlFile() {
  try {
    if (!existsSync(CONTROL_FILE)) return null;
    const raw = JSON.parse(readFileSync(CONTROL_FILE, 'utf8'));
    const host = String(raw?.host || '').trim() || DEFAULT_HOST;
    const port = parseIntSafe(raw?.port, DEFAULT_PORT);
    return { host, port };
  } catch {
    return null;
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
  const res = await fetch(url, init);
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealth(endpoint, timeoutMs = 30_000) {
  const started = Date.now();
  while (Date.now() - started <= timeoutMs) {
    try {
      const ret = await requestJson(endpoint, '/health');
      if (ret.ok && ret.json?.ok) return ret.json;
    } catch {
      // keep polling
    }
    await sleep(300);
  }
  return null;
}

async function startConsoleIfNeeded(endpoint) {
  const health = await waitForHealth(endpoint, 1500);
  if (health) return health;

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

  if (args.install) await runUiConsole(['--install']);
  if (args.build) await runUiConsole(['--build']);
  await runUiConsole([]);

  const ready = await waitForHealth(endpoint, 45_000);
  if (!ready) throw new Error('ui cli bridge is not ready after start');
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
  return requestJson(endpoint, '/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
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
    const probe = await runAction(`probe:${selector || 'body'}`, { action: 'probe', selector, ...extra }, { optional: options.optional === true });
    const hasText = typeof extra?.text === 'string' && extra.text.trim().length > 0;
    const exists = Boolean(probe?.exists || (probe?.count || 0) > 0);
    const textMatched = hasText ? Number(probe?.textMatchedCount || 0) > 0 : true;
    const ok = exists && textMatched;
    report.controls[bucket].push({
      selector: selector || 'body',
      text: hasText ? String(extra.text).trim() : '',
      ok,
      probe,
    });
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

    await tab('定时任务');
    await wait('#scheduler-name');
    await runProbe('scheduler', '#scheduler-refresh-btn');
    await runProbe('scheduler', '#scheduler-run-due-btn');
    await runProbe('scheduler', '#scheduler-export-all-btn');
    await runProbe('scheduler', '#scheduler-import-btn');
    await runProbe('scheduler', '#scheduler-daemon-interval');
    await runProbe('scheduler', '#scheduler-daemon-start-btn');
    await runProbe('scheduler', '#scheduler-daemon-stop-btn');
    await runProbe('scheduler', '#scheduler-daemon-status');
    await runProbe('scheduler', '#scheduler-editing-id');
    await runProbe('scheduler', '#scheduler-name');
    await runProbe('scheduler', '#scheduler-enabled');
    await runProbe('scheduler', '#scheduler-type');
    await runProbe('scheduler', '#scheduler-interval-wrap');
    await runProbe('scheduler', '#scheduler-runat-wrap');
    await runProbe('scheduler', '#scheduler-interval');
    await runProbe('scheduler', '#scheduler-runat');
    await runProbe('scheduler', '#scheduler-max-runs');
    await runProbe('scheduler', '#scheduler-profile');
    await runProbe('scheduler', '#scheduler-keyword');
    await runProbe('scheduler', '#scheduler-max-notes');
    await runProbe('scheduler', '#scheduler-env');
    await runProbe('scheduler', '#scheduler-comments');
    await runProbe('scheduler', '#scheduler-likes');
    await runProbe('scheduler', '#scheduler-headless');
    await runProbe('scheduler', '#scheduler-dryrun');
    await runProbe('scheduler', '#scheduler-like-keywords');
    await runProbe('scheduler', '#scheduler-save-btn');
    await runProbe('scheduler', '#scheduler-reset-btn');
    await select('#scheduler-type', 'once');
    await wait('#scheduler-runat-wrap', 8000, 'visible');
    await wait('#scheduler-interval-wrap', 8000, 'hidden');
    await select('#scheduler-type', 'daily');
    await wait('#scheduler-runat-wrap', 8000, 'visible');
    await select('#scheduler-type', 'weekly');
    await wait('#scheduler-runat-wrap', 8000, 'visible');
    await select('#scheduler-type', 'interval');
    await wait('#scheduler-interval-wrap', 8000, 'visible');
    await wait('#scheduler-runat-wrap', 8000, 'hidden');
    await input('#scheduler-name', taskName);
    await select('#scheduler-type', 'interval');
    await input('#scheduler-interval', '20');
    await input('#scheduler-profile', 'xiaohongshu-batch-0');
    await input('#scheduler-keyword', keywordSeed);
    await input('#scheduler-max-notes', '20');
    await select('#scheduler-env', 'debug');
    await click('#scheduler-comments');
    await click('#scheduler-comments');
    await click('#scheduler-likes');
    await click('#scheduler-headless');
    await click('#scheduler-dryrun');
    await input('#scheduler-like-keywords', '真牛逼,购买链接');
    await click('#scheduler-save-btn');
    await wait('#scheduler-list');
    // Wait for async schedule refresh to render the new task.
    for (let i = 0; i < 6; i += 1) {
      const raw = await probeRaw('#scheduler-list', { text: taskName });
      if (Number(raw?.textMatchedCount || 0) > 0) break;
      await sleep(500);
    }
    await runProbe('scheduler', '#scheduler-list', { text: taskName });
    await runProbe('scheduler', '#scheduler-list button', { text: '编辑' });
    await runProbe('scheduler', '#scheduler-list button', { text: '执行' });
    await runProbe('scheduler', '#scheduler-list button', { text: '导出' });
    await runProbe('scheduler', '#scheduler-list button', { text: '删除' });
    await clickText('编辑', '#scheduler-list button', true);
    await click('#scheduler-refresh-btn');
    await input('#scheduler-daemon-interval', '7');
    await click('#scheduler-daemon-start-btn');
    await wait('#scheduler-daemon-status', 10000, 'exists');
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
    await runProbe('account', '#add-account-confirm-btn');
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
    const status = await waitForHealth(endpoint, 1000);
    if (!status) throw new Error('ui cli bridge not healthy');
    printOutput({ ok: true, endpoint, status });
    return;
  }

  if (cmd === 'status' || cmd === 'snapshot') {
    const pathName = cmd === 'snapshot' ? '/snapshot' : '/status';
    const ret = await requestJson(endpoint, pathName);
    if (!ret.ok) throw new Error(ret.json?.error || `http_${ret.status}`);
    printOutput(ret.json);
    return;
  }

  if (cmd === 'stop') {
    const ret = await sendAction(endpoint, { action: 'close_window' });
    if (!ret.ok) throw new Error(ret.json?.error || `http_${ret.status}`);
    printOutput(ret.json);
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
