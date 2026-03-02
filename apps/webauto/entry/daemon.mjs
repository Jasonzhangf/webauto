#!/usr/bin/env node
import minimist from 'minimist';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');

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

function resolveWebautoHome(env = process.env, platform = process.platform) {
  const explicitHome = String(env.WEBAUTO_HOME || '').trim();
  if (explicitHome) return normalizePathForPlatform(explicitHome, platform);

  const legacyRoot = String(env.WEBAUTO_ROOT || env.WEBAUTO_PORTABLE_ROOT || '').trim();
  if (legacyRoot) return normalizeLegacyWebautoRoot(legacyRoot, platform);

  const homeDir = platform === 'win32'
    ? (env.USERPROFILE || os.homedir())
    : (env.HOME || os.homedir());
  if (platform === 'win32') {
    try {
      if (existsSync('D:\\')) return 'D:\\webauto';
    } catch {
      // ignore
    }
    return path.win32.join(homeDir, '.webauto');
  }
  return path.join(homeDir, '.webauto');
}

const WEBAUTO_HOME = resolveWebautoHome();
process.env.WEBAUTO_HOME = WEBAUTO_HOME;
const RUN_DIR = path.join(WEBAUTO_HOME, 'run');
const LOG_DIR = path.join(WEBAUTO_HOME, 'logs');
const JOB_LOG_DIR = path.join(LOG_DIR, 'daemon-jobs');
const PID_FILE = path.join(RUN_DIR, 'webauto-daemon.pid');
const HEARTBEAT_FILE = path.join(RUN_DIR, 'webauto-daemon-heartbeat.json');
const DESKTOP_HEARTBEAT_FILE = path.join(RUN_DIR, 'desktop-console-heartbeat.json');
const ALT_WEBAUTO_HOME = path.join(os.homedir(), '.webauto');
const ALT_DESKTOP_HEARTBEAT_FILE = path.join(ALT_WEBAUTO_HOME, 'run', 'desktop-console-heartbeat.json');
const AUTOSTART_MAC_PLIST = path.join(os.homedir(), 'Library', 'LaunchAgents', 'com.webauto.daemon.plist');
const SOCKET_PATH = process.platform === 'win32'
  ? '\\\\.\\pipe\\webauto-daemon'
  : path.join(RUN_DIR, 'webauto-daemon.sock');
const WEBAUTO_BIN = path.join(ROOT, 'bin', 'webauto.mjs');
const UI_CLI_SCRIPT = path.join(ROOT, 'apps', 'desktop-console', 'entry', 'ui-cli.mjs');
const XHS_INSTALL_SCRIPT = path.join(ROOT, 'apps', 'webauto', 'entry', 'xhs-install.mjs');
const DAEMON_ENTRY_MARKER = String(fileURLToPath(import.meta.url) || '').replace(/\\/g, '/').toLowerCase();
const DESKTOP_MAIN_MARKER = String(path.join(ROOT, 'apps', 'desktop-console', 'dist', 'main', 'index.mjs') || '').replace(/\\/g, '/').toLowerCase();
const WEBAUTO_ENTRY_MARKER = normalizeCommandLine(path.join(ROOT, 'apps', 'webauto', 'entry'));
const WEBAUTO_BIN_MARKER = normalizeCommandLine(WEBAUTO_BIN);
const UI_CLI_MARKER = normalizeCommandLine(UI_CLI_SCRIPT);
const XHS_SCRIPTS_MARKER = normalizeCommandLine(path.join(ROOT, 'scripts', 'xiaohongshu'));
const WORKER_HEARTBEAT_INTERVAL_MS = 30_000;
const WORKER_HEARTBEAT_MISS_LIMIT = 3;
const WORKER_HEARTBEAT_STALE_MS = WORKER_HEARTBEAT_INTERVAL_MS * WORKER_HEARTBEAT_MISS_LIMIT;
const DAEMON_SHUTDOWN_GRACE_MS = WORKER_HEARTBEAT_INTERVAL_MS + 5_000;
let cachedWindowsSessionId = null;

function resolveWindowsSessionIdSync() {
  if (process.platform !== 'win32') return null;
  if (Number.isFinite(cachedWindowsSessionId)) return cachedWindowsSessionId;
  try {
    const psScript = [
      '[Console]::OutputEncoding=[System.Text.Encoding]::UTF8',
      `$p = Get-CimInstance Win32_Process -Filter "ProcessId=${process.pid}" | Select-Object -First 1 -ExpandProperty SessionId`,
      'if ($null -ne $p) { Write-Output $p }',
    ].join('; ');
    const ret = spawnSync('powershell', ['-NoProfile', '-Command', psScript], {
      encoding: 'utf8',
      timeout: 4_000,
      windowsHide: true,
    });
    if (ret.status !== 0) return null;
    const sid = Number(String(ret.stdout || '').trim());
    cachedWindowsSessionId = Number.isFinite(sid) ? Math.floor(sid) : null;
    return cachedWindowsSessionId;
  } catch {
    return null;
  }
}

function isWindowsSessionZero() {
  const sid = resolveWindowsSessionIdSync();
  return Number.isFinite(sid) && sid === 0;
}

function readEnvPositiveInt(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

const UI_CLI_START_TIMEOUT_MS = readEnvPositiveInt('WEBAUTO_DAEMON_UI_START_TIMEOUT_MS', 150_000);
const UI_CLI_STATUS_TIMEOUT_MS = readEnvPositiveInt('WEBAUTO_DAEMON_UI_STATUS_TIMEOUT_MS', 20_000);
const UI_CLI_STOP_TIMEOUT_MS = readEnvPositiveInt('WEBAUTO_DAEMON_UI_STOP_TIMEOUT_MS', 20_000);

function ensureDirs() {
  mkdirSync(RUN_DIR, { recursive: true });
  mkdirSync(LOG_DIR, { recursive: true });
  mkdirSync(JOB_LOG_DIR, { recursive: true });
}

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, payload) {
  ensureDirs();
  writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
}

function parseJsonFromMixedOutput(stdout = '', stderr = '') {
  const chunks = [String(stdout || ''), String(stderr || '')];
  for (const chunk of chunks) {
    const lines = chunk.split(/\r?\n/g).map((line) => line.trim()).filter(Boolean).reverse();
    for (const line of lines) {
      if (!(line.startsWith('{') && line.endsWith('}'))) continue;
      try {
        return JSON.parse(line);
      } catch {
        // continue
      }
    }
  }
  return null;
}

function appendClipped(base, next, limit = 500_000) {
  const merged = `${base || ''}${next || ''}`;
  if (merged.length <= limit) return merged;
  return merged.slice(merged.length - limit);
}

function runNode(args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, {
      cwd: ROOT,
      env: { ...process.env, ...(options.env || {}) },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += String(chunk || ''); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk || ''); });
    child.on('error', (error) => resolve({ ok: false, code: null, stdout, stderr, error: error?.message || String(error) }));
    child.on('close', (code) => {
      resolve({
        ok: code === 0,
        code,
        stdout,
        stderr,
      });
    });
  });
}

function requestDaemon(payload, timeoutMs = 15_000) {
  return new Promise((resolve, reject) => {
    const client = net.createConnection(SOCKET_PATH);
    let timer = setTimeout(() => {
      timer = null;
      client.destroy(new Error(`daemon_request_timeout_${timeoutMs}ms`));
    }, timeoutMs);
    let buffer = '';
    client.on('error', (error) => {
      if (timer) clearTimeout(timer);
      reject(error);
    });
    client.on('connect', () => {
      client.write(`${JSON.stringify(payload)}\n`);
    });
    client.on('data', (chunk) => {
      buffer += String(chunk || '');
      const idx = buffer.indexOf('\n');
      if (idx < 0) return;
      const line = buffer.slice(0, idx).trim();
      if (timer) clearTimeout(timer);
      try {
        const parsed = JSON.parse(line || '{}');
        resolve(parsed);
      } catch (error) {
        reject(error);
      } finally {
        client.end();
      }
    });
    client.on('close', () => {
      if (timer) clearTimeout(timer);
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pingDaemon() {
  try {
    const ret = await requestDaemon({ method: 'ping', params: {} }, 4_000);
    return ret?.ok ? ret : null;
  } catch {
    return null;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function buildHeartbeat(extra = {}) {
  return {
    ok: true,
    pid: process.pid,
    ts: nowIso(),
    socket: SOCKET_PATH,
    ...extra,
  };
}

function cleanupRuntimeFiles() {
  try { rmSync(PID_FILE, { force: true }); } catch {}
  try { rmSync(HEARTBEAT_FILE, { force: true }); } catch {}
  try { rmSync(DESKTOP_HEARTBEAT_FILE, { force: true }); } catch {}
  if (ALT_DESKTOP_HEARTBEAT_FILE !== DESKTOP_HEARTBEAT_FILE) {
    try { rmSync(ALT_DESKTOP_HEARTBEAT_FILE, { force: true }); } catch {}
  }
  if (process.platform !== 'win32') {
    try { unlinkSync(SOCKET_PATH); } catch {}
  }
}

function isPidAlive(pid) {
  const target = Number(pid || 0);
  if (!Number.isFinite(target) || target <= 0) return false;
  if (process.platform === 'win32') {
    const ret = spawnSync('tasklist', ['/FI', `PID eq ${target}`], {
      windowsHide: true,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const out = String(ret.stdout || '');
    if (!out) return false;
    const rows = out.split(/\r?\n/g).map((line) => line.trim()).filter(Boolean);
    return rows.some((line) => line.includes(` ${target}`));
  }
  try {
    process.kill(target, 0);
    return true;
  } catch {
    return false;
  }
}

async function terminatePidTree(pid) {
  const target = Number(pid || 0);
  if (!Number.isFinite(target) || target <= 0) return { ok: false, error: 'invalid_pid' };
  if (process.platform === 'win32') {
    const ret = spawnSync('taskkill', ['/PID', String(target), '/T', '/F'], {
      windowsHide: true,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return {
      ok: ret.status === 0 || !isPidAlive(target),
      code: ret.status,
      stdout: String(ret.stdout || '').trim(),
      stderr: String(ret.stderr || '').trim(),
    };
  }

  try {
    process.kill(target, 'SIGTERM');
  } catch {
    // ignore
  }
  await sleep(600);
  if (!isPidAlive(target)) return { ok: true };
  try {
    process.kill(target, 'SIGKILL');
  } catch {
    // ignore
  }
  await sleep(200);
  return { ok: !isPidAlive(target) };
}

async function waitForDaemonExit(timeoutMs = 15_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    const alive = await pingDaemon();
    if (!alive?.ok) return { ok: true, stopped: true };
    await sleep(200);
  }
  return { ok: false, error: `daemon_stop_timeout_${timeoutMs}ms` };
}

function detectConnectErrorCode(errorText = '') {
  const text = String(errorText || '').toUpperCase();
  if (text.includes('EPERM')) return 'EPERM';
  if (text.includes('EACCES')) return 'EACCES';
  if (text.includes('ENOENT')) return 'ENOENT';
  if (text.includes('ECONNREFUSED')) return 'ECONNREFUSED';
  return '';
}

async function forceStopByPidFile() {
  const pidMeta = readJson(PID_FILE, {}) || {};
  const pid = Number(pidMeta?.pid || 0);
  if (!Number.isFinite(pid) || pid <= 0) {
    cleanupRuntimeFiles();
    return { ok: true, stopped: true, alreadyStopped: true, fallback: 'no_pid_file' };
  }
  if (!isPidAlive(pid)) {
    cleanupRuntimeFiles();
    return { ok: true, stopped: true, alreadyStopped: true, pid, fallback: 'stale_pid_file' };
  }
  const terminated = await terminatePidTree(pid);
  if (!terminated?.ok) {
    return {
      ok: false,
      error: 'pid_terminate_failed',
      pid,
      terminateCode: terminated?.code ?? null,
      terminateStdout: terminated?.stdout || '',
      terminateStderr: terminated?.stderr || '',
    };
  }
  await sleep(500);
  if (isPidAlive(pid)) {
    return { ok: false, error: 'pid_still_alive_after_terminate', pid };
  }
  cleanupRuntimeFiles();
  return { ok: true, stopped: true, alreadyStopped: false, pid, fallback: 'pid_file' };
}

function normalizeCommandLine(raw = '') {
  return String(raw || '').replace(/\\/g, '/').toLowerCase();
}

function isDaemonRunCommand(commandLine = '') {
  const cmd = normalizeCommandLine(commandLine);
  return cmd.includes(DAEMON_ENTRY_MARKER) && cmd.includes(' daemon.mjs run');
}

function isWebautoNodeCommand(commandLine = '') {
  const cmd = normalizeCommandLine(commandLine);
  if (!cmd) return false;
  if (cmd.includes(DAEMON_ENTRY_MARKER)) return true;
  if (cmd.includes(WEBAUTO_BIN_MARKER)) return true;
  if (cmd.includes(WEBAUTO_ENTRY_MARKER)) return true;
  if (cmd.includes(UI_CLI_MARKER)) return true;
  if (cmd.includes(XHS_SCRIPTS_MARKER)) return true;
  return false;
}

function parsePidsFromWindowsProcessList(exeName = 'node.exe') {
  if (process.platform !== 'win32') return [];
  const ret = spawnSync('powershell', [
    '-NoProfile',
    '-Command',
    [
      '[Console]::OutputEncoding=[System.Text.Encoding]::UTF8',
      `$rows = Get-CimInstance Win32_Process -Filter "name='${exeName}'" | Select-Object ProcessId,CommandLine`,
      '$rows | ConvertTo-Json -Compress',
    ].join('; '),
  ], {
    windowsHide: true,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (ret.status !== 0) return [];
  let parsed = null;
  try {
    parsed = JSON.parse(String(ret.stdout || '').trim() || 'null');
  } catch {
    parsed = null;
  }
  const rows = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
  return rows
    .map((row) => ({
      pid: Number(row?.ProcessId || 0),
      commandLine: String(row?.CommandLine || ''),
    }))
    .filter((row) => Number.isFinite(row.pid) && row.pid > 0);
}

function parseWindowsProcessListWithSession(exeName) {
  if (process.platform !== 'win32') return [];
  const safeName = String(exeName || '').trim() || 'electron.exe';
  const ret = spawnSync('powershell', [
    '-NoProfile',
    '-Command',
    [
      '[Console]::OutputEncoding=[System.Text.Encoding]::UTF8',
      `$rows = Get-CimInstance Win32_Process -Filter "name='${safeName}'" | Select-Object ProcessId,CommandLine,SessionId`,
      '$rows | ConvertTo-Json -Compress',
    ].join('; '),
  ], {
    windowsHide: true,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (ret.status !== 0) return [];
  let parsed = null;
  try {
    parsed = JSON.parse(String(ret.stdout || '').trim() || 'null');
  } catch {
    parsed = null;
  }
  const rows = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
  return rows
    .map((row) => ({
      pid: Number(row?.ProcessId || 0),
      sessionId: Number(row?.SessionId || 0),
      commandLine: String(row?.CommandLine || ''),
    }))
    .filter((row) => Number.isFinite(row.pid) && row.pid > 0);
}

function listDesktopConsoleProcesses() {
  if (process.platform !== 'win32') return [];
  return parseWindowsProcessListWithSession('electron.exe')
    .filter((row) => normalizeCommandLine(row.commandLine).includes(DESKTOP_MAIN_MARKER))
    .map((row) => ({
      pid: Math.floor(row.pid),
      sessionId: Number.isFinite(row.sessionId) ? Math.floor(row.sessionId) : null,
    }));
}

function listWebautoNodeProcessesWithSession() {
  if (process.platform !== 'win32') return [];
  return parseWindowsProcessListWithSession('node.exe')
    .filter((row) => isWebautoNodeCommand(row.commandLine))
    .map((row) => ({
      pid: Math.floor(row.pid),
      sessionId: Number.isFinite(row.sessionId) ? Math.floor(row.sessionId) : null,
      commandLine: row.commandLine || '',
    }));
}

function listDesktopHeartbeatPids() {
  if (process.platform !== 'win32') return [];
  const paths = Array.from(new Set([DESKTOP_HEARTBEAT_FILE, ALT_DESKTOP_HEARTBEAT_FILE]));
  const pids = [];
  for (const filePath of paths) {
    const payload = readJson(filePath, null);
    const pid = Number(payload?.pid || 0);
    if (!Number.isFinite(pid) || pid <= 0) continue;
    if (isPidAlive(pid)) pids.push(Math.floor(pid));
  }
  return Array.from(new Set(pids));
}

function listManagedRuntimeProcessesWithSession() {
  if (process.platform !== 'win32') return { daemon: [], app: [], ui: [] };
  const nodeRows = parseWindowsProcessListWithSession('node.exe');
  const daemon = nodeRows
    .filter((row) => isDaemonRunCommand(row.commandLine))
    .map((row) => ({
      pid: Math.floor(row.pid),
      sessionId: Number.isFinite(row.sessionId) ? Math.floor(row.sessionId) : null,
    }));
  const app = nodeRows
    .filter((row) => isWebautoNodeCommand(row.commandLine))
    .map((row) => ({
      pid: Math.floor(row.pid),
      sessionId: Number.isFinite(row.sessionId) ? Math.floor(row.sessionId) : null,
    }));
  const ui = listDesktopConsoleProcesses();
  return { daemon, app, ui };
}

function listManagedRuntimePids() {
  if (process.platform !== 'win32') return { daemonPids: [], uiPids: [] };
  const discovered = listManagedRuntimeProcessesWithSession();
  const daemonPids = discovered.daemon.map((row) => row.pid);
  const appPids = discovered.app.map((row) => row.pid);
  const uiPids = discovered.ui.map((row) => row.pid);
  const heartbeatPids = listDesktopHeartbeatPids();
  return {
    daemonPids: Array.from(new Set(daemonPids)),
    uiPids: Array.from(new Set([...uiPids, ...heartbeatPids])),
    appPids: Array.from(new Set(appPids)),
  };
}

async function sweepManagedRuntimeProcesses(options = {}) {
  const excluded = new Set((Array.isArray(options.excludePids) ? options.excludePids : [])
    .concat(process.pid)
    .map((pid) => Number(pid || 0))
    .filter((pid) => Number.isFinite(pid) && pid > 0));
  const discovered = listManagedRuntimePids();
  const targets = Array.from(new Set([
    ...discovered.daemonPids,
    ...discovered.uiPids,
    ...(Array.isArray(discovered.appPids) ? discovered.appPids : []),
  ])).filter((pid) => pid > 0 && !excluded.has(pid));
  const killed = [];
  const failed = [];
  for (const pid of targets) {
    const ret = await terminatePidTree(pid);
    if (ret?.ok) {
      killed.push(pid);
    } else {
      failed.push({
        pid,
        error: ret?.error || 'terminate_failed',
        code: ret?.code ?? null,
        stderr: ret?.stderr || '',
      });
    }
  }
  if (targets.length > 0) cleanupRuntimeFiles();
  return {
    ok: failed.length === 0,
    daemonPids: discovered.daemonPids,
    uiPids: discovered.uiPids,
    appPids: Array.isArray(discovered.appPids) ? discovered.appPids : [],
    targets,
    killed,
    failed,
  };
}

async function sweepRuntimeProcessesOtherSessions(currentSessionId, options = {}) {
  if (process.platform !== 'win32') return { ok: true, targets: [], killed: [], failed: [] };
  if (!Number.isFinite(currentSessionId)) return { ok: true, targets: [], killed: [], failed: [] };
  const excluded = new Set((Array.isArray(options.excludePids) ? options.excludePids : [])
    .map((pid) => Number(pid || 0))
    .filter((pid) => Number.isFinite(pid) && pid > 0));
  const discovered = listManagedRuntimeProcessesWithSession();
  const targets = Array.from(new Set([
    ...discovered.daemon,
    ...discovered.app,
    ...discovered.ui,
  ]
    .filter((row) => Number.isFinite(row.sessionId) && row.sessionId !== currentSessionId)
    .map((row) => row.pid)))
    .filter((pid) => pid > 0 && !excluded.has(pid));
  const killed = [];
  const failed = [];
  for (const pid of targets) {
    const ret = await terminatePidTree(pid);
    if (ret?.ok) {
      killed.push(pid);
    } else {
      failed.push({
        pid,
        error: ret?.error || 'terminate_failed',
        code: ret?.code ?? null,
        stderr: ret?.stderr || '',
      });
    }
  }
  return { ok: failed.length === 0, targets, killed, failed };
}

async function cleanupUiSessionMismatch() {
  if (process.platform !== 'win32') return { ok: true, killed: [], failed: [] };
  const currentSessionId = resolveWindowsSessionIdSync();
  if (!Number.isFinite(currentSessionId)) return { ok: true, killed: [], failed: [] };
  const candidates = listDesktopConsoleProcesses()
    .filter((row) => Number.isFinite(row.sessionId) && row.sessionId !== currentSessionId);
  const killed = [];
  const failed = [];
  for (const row of candidates) {
    const ret = await terminatePidTree(row.pid);
    if (ret?.ok) {
      killed.push(row.pid);
    } else {
      failed.push({
        pid: row.pid,
        error: ret?.error || 'terminate_failed',
        code: ret?.code ?? null,
        stderr: ret?.stderr || '',
      });
    }
  }
  return { ok: failed.length === 0, killed, failed };
}

async function runUiCli(args = [], options = {}) {
  const ret = await runNode([UI_CLI_SCRIPT, ...args], { env: options.env || {} });
  const parsed = parseJsonFromMixedOutput(ret.stdout, ret.stderr);
  return {
    ...ret,
    json: parsed,
  };
}

async function runUiCliBounded(args = [], maxWaitMs = 20_000, options = {}) {
  const uiTask = runUiCli(args, options);
  const timeoutTask = sleep(Math.max(1_000, Number(maxWaitMs) || 20_000)).then(() => ({
    ok: false,
    code: null,
    stdout: '',
    stderr: '',
    json: null,
    timeout: true,
    error: `ui_cli_timeout_${Math.max(1_000, Number(maxWaitMs) || 20_000)}ms`,
  }));
  return Promise.race([uiTask, timeoutTask]);
}

async function stopUiCliForShutdown(maxWaitMs = 8_000) {
  const stopTask = runUiCliBounded(['stop', '--json'], Math.max(1_000, Number(maxWaitMs) || 8_000)).catch(() => null);
  const timeoutTask = sleep(Math.max(1_000, Number(maxWaitMs) || 8_000)).then(() => ({ timeout: true }));
  return Promise.race([stopTask, timeoutTask]);
}

async function runServiceCheck() {
  const ret = await runNode([XHS_INSTALL_SCRIPT, '--check', '--all', '--json']);
  const parsed = parseJsonFromMixedOutput(ret.stdout, ret.stderr);
  return {
    ...ret,
    json: parsed,
  };
}

function safeTrimArray(input) {
  if (!Array.isArray(input)) return [];
  return input.map((item) => String(item || '').trim()).filter(Boolean);
}

async function installAutostart() {
  if (process.platform === 'win32') {
    const taskName = 'WebAutoDaemon';
    const tr = `"${process.execPath}" "${WEBAUTO_BIN}" --daemon start`;
    const ret = spawnSync('schtasks', [
      '/Create',
      '/SC', 'ONLOGON',
      '/TN', taskName,
      '/TR', tr,
      '/F',
    ], {
      encoding: 'utf8',
      windowsHide: true,
    });
    return {
      ok: ret.status === 0,
      platform: 'win32',
      taskName,
      command: tr,
      code: ret.status,
      stdout: String(ret.stdout || '').trim(),
      stderr: String(ret.stderr || '').trim(),
    };
  }

  if (process.platform === 'darwin') {
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>com.webauto.daemon</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>ProgramArguments</key>
    <array>
      <string>${process.execPath}</string>
      <string>${WEBAUTO_BIN}</string>
      <string>--daemon</string>
      <string>start</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${ROOT}</string>
    <key>StandardOutPath</key>
    <string>${path.join(LOG_DIR, 'daemon-launchagent.out.log')}</string>
    <key>StandardErrorPath</key>
    <string>${path.join(LOG_DIR, 'daemon-launchagent.err.log')}</string>
  </dict>
</plist>
`;
    ensureDirs();
    mkdirSync(path.dirname(AUTOSTART_MAC_PLIST), { recursive: true });
    writeFileSync(AUTOSTART_MAC_PLIST, plist, 'utf8');
    spawnSync('launchctl', ['unload', AUTOSTART_MAC_PLIST], { encoding: 'utf8' });
    const ret = spawnSync('launchctl', ['load', '-w', AUTOSTART_MAC_PLIST], { encoding: 'utf8' });
    return {
      ok: ret.status === 0,
      platform: 'darwin',
      plistPath: AUTOSTART_MAC_PLIST,
      code: ret.status,
      stdout: String(ret.stdout || '').trim(),
      stderr: String(ret.stderr || '').trim(),
    };
  }

  return { ok: false, error: `unsupported_platform:${process.platform}` };
}

async function uninstallAutostart() {
  if (process.platform === 'win32') {
    const taskName = 'WebAutoDaemon';
    const ret = spawnSync('schtasks', ['/Delete', '/TN', taskName, '/F'], {
      encoding: 'utf8',
      windowsHide: true,
    });
    return {
      ok: ret.status === 0,
      platform: 'win32',
      taskName,
      code: ret.status,
      stdout: String(ret.stdout || '').trim(),
      stderr: String(ret.stderr || '').trim(),
    };
  }
  if (process.platform === 'darwin') {
    spawnSync('launchctl', ['unload', AUTOSTART_MAC_PLIST], { encoding: 'utf8' });
    try { rmSync(AUTOSTART_MAC_PLIST, { force: true }); } catch {}
    return { ok: true, platform: 'darwin', plistPath: AUTOSTART_MAC_PLIST };
  }
  return { ok: false, error: `unsupported_platform:${process.platform}` };
}

async function autostartStatus() {
  if (process.platform === 'win32') {
    const ret = spawnSync('schtasks', ['/Query', '/TN', 'WebAutoDaemon'], { encoding: 'utf8', windowsHide: true });
    return {
      ok: true,
      platform: 'win32',
      installed: ret.status === 0,
      code: ret.status,
      stdout: String(ret.stdout || '').trim(),
      stderr: String(ret.stderr || '').trim(),
    };
  }
  if (process.platform === 'darwin') {
    return {
      ok: true,
      platform: 'darwin',
      installed: existsSync(AUTOSTART_MAC_PLIST),
      plistPath: AUTOSTART_MAC_PLIST,
    };
  }
  return { ok: false, error: `unsupported_platform:${process.platform}` };
}

async function startDaemonServer() {
  ensureDirs();
  const sessionId = resolveWindowsSessionIdSync();
  await sweepRuntimeProcessesOtherSessions(sessionId, { excludePids: [process.pid] });
  cleanupRuntimeFiles();

  const state = {
    startedAt: Date.now(),
    desiredUi: false,
    jobs: new Map(),
    jobsOrder: [],
    workers: new Map(),
    workersOrder: [],
    uiWorkerId: null,
    shuttingDown: false,
    shutdownReason: null,
    shutdownStartedAt: null,
    shutdownTimer: null,
  };
  let uiQueue = Promise.resolve();
  const enqueueUi = async (fn) => {
    const next = uiQueue.then(fn, fn);
    uiQueue = next.catch(() => null);
    return next;
  };
  let server = null;

  const summarizeWorker = (worker) => ({
    id: worker.id,
    kind: worker.kind,
    source: worker.source || null,
    status: worker.status,
    pid: worker.pid || null,
    jobId: worker.jobId || null,
    startedAt: worker.startedAt || null,
    lastHeartbeatAt: worker.lastHeartbeatAt || null,
    finishedAt: worker.finishedAt || null,
    staleMs: Math.max(0, Date.now() - Number(worker.lastHeartbeatMs || state.startedAt)),
  });

  const updateHeartbeat = () => {
    const jobs = state.jobsOrder
      .slice(-20)
      .map((jobId) => state.jobs.get(jobId))
      .filter(Boolean)
      .map((job) => ({
        id: job.id,
        status: job.status,
        startedAt: job.startedAt,
        finishedAt: job.finishedAt || null,
        pid: job.pid || null,
        code: job.code ?? null,
      }));
    const workers = state.workersOrder
      .slice(-50)
      .map((workerId) => state.workers.get(workerId))
      .filter(Boolean)
      .map((worker) => summarizeWorker(worker));
    writeJson(HEARTBEAT_FILE, buildHeartbeat({
      desiredUi: state.desiredUi,
      shuttingDown: state.shuttingDown,
      shutdownReason: state.shutdownReason,
      shutdownStartedAt: state.shutdownStartedAt,
      uptimeMs: Date.now() - state.startedAt,
      sessionId,
      jobs,
      workers,
    }));
  };

  const trimJobBuffer = () => {
    while (state.jobsOrder.length > 200) {
      const oldest = state.jobsOrder.shift();
      if (!oldest) continue;
      state.jobs.delete(oldest);
    }
  };

  const trimWorkerBuffer = () => {
    while (state.workersOrder.length > 300) {
      const oldest = state.workersOrder.shift();
      if (!oldest) continue;
      if (oldest === state.uiWorkerId) continue;
      const worker = state.workers.get(oldest);
      if (!worker) continue;
      if (worker.status === 'running') {
        state.workersOrder.push(oldest);
        break;
      }
      state.workers.delete(oldest);
    }
  };

  const registerWorker = (input = {}) => {
    const id = String(input.id || '').trim();
    const token = String(input.token || '').trim();
    if (!id || !token) return null;
    const nowMs = Date.now();
    const existing = state.workers.get(id);
    const worker = {
      id,
      token,
      kind: String(input.kind || 'relay').trim() || 'relay',
      source: String(input.source || '').trim() || null,
      pid: Number.isFinite(Number(input.pid)) ? Math.floor(Number(input.pid)) : null,
      jobId: String(input.jobId || '').trim() || null,
      status: String(input.status || 'running').trim() || 'running',
      startedAt: String(input.startedAt || nowIso()),
      lastHeartbeatMs: nowMs,
      lastHeartbeatAt: nowIso(),
      finishedAt: null,
      finishReason: null,
    };
    if (existing) {
      worker.startedAt = existing.startedAt || worker.startedAt;
      worker.lastHeartbeatMs = Number(existing.lastHeartbeatMs || nowMs) || nowMs;
      worker.lastHeartbeatAt = existing.lastHeartbeatAt || worker.lastHeartbeatAt;
      worker.finishedAt = existing.finishedAt || null;
      worker.finishReason = existing.finishReason || null;
      if (!worker.source) worker.source = existing.source || null;
      if (!worker.jobId) worker.jobId = existing.jobId || null;
      if (!(worker.pid > 0)) worker.pid = existing.pid || null;
      if (!worker.kind) worker.kind = existing.kind || 'relay';
    } else {
      state.workersOrder.push(id);
    }
    state.workers.set(id, worker);
    trimWorkerBuffer();
    return worker;
  };

  const markWorkerStopped = (workerId, reason = 'stopped', patch = {}) => {
    const id = String(workerId || '').trim();
    if (!id) return null;
    const worker = state.workers.get(id);
    if (!worker) return null;
    worker.status = String(patch.status || reason || 'stopped');
    worker.finishedAt = nowIso();
    worker.finishReason = String(reason || '').trim() || null;
    if (Number.isFinite(Number(patch.pid)) && Number(patch.pid) > 0) {
      worker.pid = Math.floor(Number(patch.pid));
    }
    if (typeof patch.code !== 'undefined') worker.code = patch.code;
    if (typeof patch.source === 'string' && patch.source.trim()) worker.source = patch.source.trim();
    return worker;
  };

  const buildWorkerEnv = (worker) => ({
    WEBAUTO_DAEMON_BYPASS: '1',
    WEBAUTO_DAEMON_SOCKET: SOCKET_PATH,
    WEBAUTO_DAEMON_WORKER_ID: worker.id,
    WEBAUTO_DAEMON_WORKER_TOKEN: worker.token,
    WEBAUTO_DAEMON_WORKER_KIND: worker.kind,
    WEBAUTO_DAEMON_HEARTBEAT_INTERVAL_MS: String(WORKER_HEARTBEAT_INTERVAL_MS),
    WEBAUTO_DAEMON_HEARTBEAT_MISS_LIMIT: String(WORKER_HEARTBEAT_MISS_LIMIT),
    WEBAUTO_DAEMON_SESSION_ID: Number.isFinite(sessionId) ? String(sessionId) : '',
  });

  const allocateUiWorker = () => {
    const currentId = String(state.uiWorkerId || '').trim();
    const current = currentId ? state.workers.get(currentId) : null;
    if (current && current.status === 'running') return current;
    const worker = registerWorker({
      id: `ui_${Date.now()}_${randomUUID().slice(0, 8)}`,
      token: randomUUID(),
      kind: 'ui-desktop',
      source: 'daemon-ui-start',
      status: 'running',
    });
    state.uiWorkerId = worker?.id || null;
    return worker;
  };

  const startRelayJob = async (params = {}) => {
    const args = safeTrimArray(params.args);
    if (args.length === 0) {
      return { ok: false, error: 'missing relay args' };
    }
    const wait = params.wait === true;
    const jobId = `job_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const logPath = path.join(JOB_LOG_DIR, `${jobId}.log`);
    const logStream = createWriteStream(logPath, { flags: 'a' });
    const worker = registerWorker({
      id: `relay_${jobId}`,
      token: randomUUID(),
      kind: 'relay',
      source: 'daemon-relay',
      jobId,
      status: 'running',
    });
    const child = spawn(process.execPath, [WEBAUTO_BIN, ...args], {
      cwd: ROOT,
      env: {
        ...process.env,
        ...buildWorkerEnv(worker),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const job = {
      id: jobId,
      args,
      pid: Number(child.pid || 0) || null,
      status: 'running',
      code: null,
      startedAt: nowIso(),
      finishedAt: null,
      logPath,
      workerId: worker?.id || null,
    };
    if (worker) worker.pid = Number(child.pid || 0) || null;
    let stdoutTail = '';
    let stderrTail = '';
    state.jobs.set(jobId, job);
    state.jobsOrder.push(jobId);
    trimJobBuffer();
    updateHeartbeat();

    child.stdout.on('data', (chunk) => {
      const text = String(chunk || '');
      stdoutTail = appendClipped(stdoutTail, text);
      logStream.write(`[stdout] ${text}`);
    });
    child.stderr.on('data', (chunk) => {
      const text = String(chunk || '');
      stderrTail = appendClipped(stderrTail, text);
      logStream.write(`[stderr] ${text}`);
    });
    child.on('close', (code) => {
      job.status = code === 0 ? 'done' : 'failed';
      job.code = Number.isFinite(Number(code)) ? Number(code) : null;
      job.finishedAt = nowIso();
      markWorkerStopped(job.workerId, job.status === 'done' ? 'process_exit_ok' : 'process_exit_failed', {
        code: job.code,
        source: 'child-close',
      });
      updateHeartbeat();
      try { logStream.end(); } catch {}
    });
    child.on('error', (err) => {
      job.status = 'failed';
      job.code = null;
      job.finishedAt = nowIso();
      markWorkerStopped(job.workerId, 'process_error', { source: 'child-error' });
      logStream.write(`[error] ${err?.message || String(err)}\n`);
      updateHeartbeat();
      try { logStream.end(); } catch {}
    });

    if (!wait) {
      return { ok: true, detached: true, job };
    }
    const waited = await new Promise((resolve) => {
      child.on('close', () => resolve({
        id: job.id,
        status: job.status,
        code: job.code,
        startedAt: job.startedAt,
        finishedAt: job.finishedAt,
        logPath: job.logPath,
        stdout: stdoutTail,
        stderr: stderrTail,
        json: parseJsonFromMixedOutput(stdoutTail, stderrTail),
      }));
    });
    return { ok: true, detached: false, job: waited };
  };

  const handleMethod = async (method, params = {}) => {
    if (method === 'ping' || method === 'status') {
      const jobs = state.jobsOrder
        .slice(-20)
        .map((id) => state.jobs.get(id))
        .filter(Boolean);
      const workers = state.workersOrder
        .slice(-50)
        .map((id) => state.workers.get(id))
        .filter(Boolean)
        .map((worker) => summarizeWorker(worker));
      return {
        ok: true,
        pid: process.pid,
        startedAt: new Date(state.startedAt).toISOString(),
        uptimeMs: Date.now() - state.startedAt,
        desiredUi: state.desiredUi,
        shuttingDown: state.shuttingDown,
        shutdownReason: state.shutdownReason,
        shutdownStartedAt: state.shutdownStartedAt,
        socket: SOCKET_PATH,
        jobs,
        workers,
      };
    }
    if (method === 'worker.heartbeat') {
      const workerId = String(params.workerId || '').trim();
      const token = String(params.token || '').trim();
      if (!workerId || !token) return { ok: false, error: 'missing_worker_credentials' };
      const worker = state.workers.get(workerId);
      if (!worker) return { ok: false, error: `worker_not_found:${workerId}` };
      if (worker.token !== token) return { ok: false, error: `worker_token_mismatch:${workerId}` };
      if (process.platform === 'win32') {
        const daemonSessionId = resolveWindowsSessionIdSync();
        const workerSessionId = Number(params.sessionId);
        if (Number.isFinite(daemonSessionId) && Number.isFinite(workerSessionId) && daemonSessionId !== workerSessionId) {
          return { ok: false, error: `worker_session_mismatch:${workerSessionId}`, daemonSessionId };
        }
      }
      const nowMs = Date.now();
      worker.lastHeartbeatMs = nowMs;
      worker.lastHeartbeatAt = nowIso();
      worker.status = 'running';
      const pid = Number(params.pid || 0);
      if (Number.isFinite(pid) && pid > 0) worker.pid = Math.floor(pid);
      const source = String(params.source || '').trim();
      if (source) worker.source = source;
      updateHeartbeat();
      return {
        ok: true,
        daemonTs: nowIso(),
        shuttingDown: state.shuttingDown,
        heartbeatIntervalMs: WORKER_HEARTBEAT_INTERVAL_MS,
        heartbeatMissLimit: WORKER_HEARTBEAT_MISS_LIMIT,
        sessionId,
      };
    }
    if (method === 'worker.exit') {
      const workerId = String(params.workerId || '').trim();
      const token = String(params.token || '').trim();
      if (!workerId || !token) return { ok: false, error: 'missing_worker_credentials' };
      const worker = state.workers.get(workerId);
      if (!worker) return { ok: false, error: `worker_not_found:${workerId}` };
      if (worker.token !== token) return { ok: false, error: `worker_token_mismatch:${workerId}` };
      markWorkerStopped(workerId, 'worker_exit', {
        source: String(params.source || '').trim() || 'worker',
      });
      updateHeartbeat();
      return { ok: true, acknowledged: true };
    }
    if (state.shuttingDown && method !== 'autostart.status') {
      return {
        ok: false,
        error: `daemon_shutting_down:${state.shutdownReason || 'requested'}`,
      };
    }
    if (method === 'shutdown') {
      state.shuttingDown = true;
      state.shutdownReason = 'rpc_shutdown';
      state.shutdownStartedAt = nowIso();
      state.desiredUi = false;
      updateHeartbeat();
      if (!state.shutdownTimer) {
        state.shutdownTimer = setTimeout(() => {
          try { server?.close(); } catch {}
          cleanupRuntimeFiles();
          process.exit(0);
        }, DAEMON_SHUTDOWN_GRACE_MS);
        state.shutdownTimer.unref();
      }
      return { ok: true, shuttingDown: true, pid: process.pid };
    }
    if (method === 'ui.start') {
      state.desiredUi = true;
      await cleanupUiSessionMismatch();
      const uiWorker = allocateUiWorker();
      const env = uiWorker ? buildWorkerEnv(uiWorker) : {};
      const ret = await enqueueUi(() => runUiCliBounded(['start', '--json'], UI_CLI_START_TIMEOUT_MS, { env }));
      const statusPid = Number(ret?.json?.status?.pid || 0);
      if (uiWorker && Number.isFinite(statusPid) && statusPid > 0) uiWorker.pid = Math.floor(statusPid);
      return {
        ok: ret.ok,
        result: ret.json || null,
        code: ret.code,
        stdout: ret.stdout,
        stderr: ret.stderr,
        timeout: ret.timeout === true,
        error: ret.error || ret?.json?.error || null,
      };
    }
    if (method === 'ui.stop') {
      state.desiredUi = false;
      const ret = await enqueueUi(() => runUiCliBounded(['stop', '--json'], UI_CLI_STOP_TIMEOUT_MS));
      let sweep = null;
      if (!ret.ok || ret.timeout === true) {
        sweep = await sweepManagedRuntimeProcesses({ excludePids: [process.pid] });
      }
      if (state.uiWorkerId) {
        markWorkerStopped(state.uiWorkerId, 'ui_stop_requested', { source: 'daemon-ui-stop' });
      }
      return {
        ok: ret.ok || (sweep?.ok === true),
        result: ret.json || null,
        code: ret.code,
        stdout: ret.stdout,
        stderr: ret.stderr,
        timeout: ret.timeout === true,
        error: ret.error || ret?.json?.error || null,
        sweep,
      };
    }
    if (method === 'ui.status') {
      const ret = await enqueueUi(() => runUiCliBounded(['status', '--json'], UI_CLI_STATUS_TIMEOUT_MS));
      const statusPid = Number(ret?.json?.pid || 0);
      if (state.uiWorkerId && Number.isFinite(statusPid) && statusPid > 0) {
        const worker = state.workers.get(state.uiWorkerId);
        if (worker) worker.pid = Math.floor(statusPid);
      }
      return {
        ok: ret.ok,
        result: ret.json || null,
        code: ret.code,
        stdout: ret.stdout,
        stderr: ret.stderr,
        timeout: ret.timeout === true,
        error: ret.error || ret?.json?.error || null,
      };
    }
    if (method === 'service.status') {
      const ret = await runServiceCheck();
      return { ok: ret.ok, result: ret.json || null, code: ret.code, stdout: ret.stdout, stderr: ret.stderr };
    }
    if (method === 'relay.start') {
      return startRelayJob(params);
    }
    if (method === 'relay.status') {
      const id = String(params.id || '').trim();
      if (!id) return { ok: false, error: 'missing id' };
      const job = state.jobs.get(id);
      if (!job) return { ok: false, error: `job_not_found:${id}` };
      return { ok: true, job };
    }
    if (method === 'relay.list') {
      const limit = Math.max(1, Number(params.limit || 20) || 20);
      const jobs = state.jobsOrder
        .slice(-limit)
        .map((id) => state.jobs.get(id))
        .filter(Boolean)
        .reverse();
      return { ok: true, jobs };
    }
    if (method === 'autostart.install') {
      return installAutostart();
    }
    if (method === 'autostart.uninstall') {
      return uninstallAutostart();
    }
    if (method === 'autostart.status') {
      return autostartStatus();
    }
    return { ok: false, error: `unsupported_method:${method}` };
  };

  server = net.createServer((socket) => {
    let buf = '';
    socket.on('data', (chunk) => {
      buf += String(chunk || '');
      const idx = buf.indexOf('\n');
      if (idx < 0) return;
      const line = buf.slice(0, idx).trim();
      buf = '';
      let req = {};
      try {
        req = JSON.parse(line || '{}');
      } catch (error) {
        socket.write(`${JSON.stringify({ ok: false, error: error?.message || String(error) })}\n`);
        socket.end();
        return;
      }
      Promise.resolve(handleMethod(String(req.method || '').trim(), req.params || {}))
        .then((ret) => {
          socket.write(`${JSON.stringify(ret || { ok: false, error: 'empty_response' })}\n`);
          socket.end();
        })
        .catch((error) => {
          socket.write(`${JSON.stringify({ ok: false, error: error?.message || String(error) })}\n`);
          socket.end();
        });
    });
  });

  await new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(SOCKET_PATH, () => resolve());
  });

  writeJson(PID_FILE, { pid: process.pid, startedAt: nowIso(), socket: SOCKET_PATH });
  updateHeartbeat();

  const heartbeatTimer = setInterval(updateHeartbeat, 5_000);
  heartbeatTimer.unref();

  const workerWatchdog = setInterval(() => {
    let dirty = false;
    for (const workerId of state.workersOrder) {
      const worker = state.workers.get(workerId);
      if (!worker) continue;
      if (worker.status !== 'running') continue;
      const staleMs = Date.now() - Number(worker.lastHeartbeatMs || state.startedAt);
      if (staleMs <= WORKER_HEARTBEAT_STALE_MS) continue;

      const pid = Number(worker.pid || 0);
      if (!Number.isFinite(pid) || pid <= 0 || !isPidAlive(pid)) {
        markWorkerStopped(workerId, 'worker_gone', { source: 'watchdog' });
        dirty = true;
        continue;
      }

      if (state.shuttingDown) continue;
      void terminatePidTree(pid).then(() => {
        markWorkerStopped(workerId, 'worker_heartbeat_timeout_killed', {
          source: 'watchdog',
          pid,
        });
        updateHeartbeat();
      });
      dirty = true;
    }
    if (dirty) updateHeartbeat();
  }, WORKER_HEARTBEAT_INTERVAL_MS);
  workerWatchdog.unref();

  const uiWatchdogEnabled = String(process.env.WEBAUTO_DAEMON_UI_WATCHDOG || '1') === '1';
  const uiWatchdog = uiWatchdogEnabled
    ? setInterval(() => {
        if (!state.desiredUi || state.shuttingDown) return;
        void enqueueUi(async () => {
          const status = await runUiCliBounded(['status', '--json'], UI_CLI_STATUS_TIMEOUT_MS).catch(() => ({ ok: false }));
          if (status?.ok && status?.json?.ok) return;
          const uiWorker = allocateUiWorker();
          const env = uiWorker ? buildWorkerEnv(uiWorker) : {};
          await runUiCliBounded(['start', '--json'], UI_CLI_START_TIMEOUT_MS, { env }).catch(() => null);
        });
      }, 10_000)
    : null;
  if (uiWatchdog) uiWatchdog.unref();

  const shutdown = (reason = 'signal') => {
    if (state.shuttingDown) return;
    state.shuttingDown = true;
    state.shutdownReason = String(reason || '').trim() || 'signal';
    state.shutdownStartedAt = nowIso();
    state.desiredUi = false;
    updateHeartbeat();
    if (state.shutdownTimer) return;
    state.shutdownTimer = setTimeout(() => {
      try { clearInterval(heartbeatTimer); } catch {}
      try { clearInterval(workerWatchdog); } catch {}
      if (uiWatchdog) {
        try { clearInterval(uiWatchdog); } catch {}
      }
      try { server?.close(); } catch {}
      cleanupRuntimeFiles();
      process.exit(0);
    }, DAEMON_SHUTDOWN_GRACE_MS);
    state.shutdownTimer.unref();
  };

  process.on('SIGINT', () => shutdown('sigint'));
  process.on('SIGTERM', () => shutdown('sigterm'));
  process.on('exit', () => {
    try { clearInterval(heartbeatTimer); } catch {}
    try { clearInterval(workerWatchdog); } catch {}
    if (uiWatchdog) {
      try { clearInterval(uiWatchdog); } catch {}
    }
    cleanupRuntimeFiles();
  });
}

async function ensureDaemonStarted(timeoutMs = 15_000, options = {}) {
  const allowStart = options.allowStart !== false;
  const alive = await pingDaemon();
  if (alive?.ok && alive?.shuttingDown !== true) return alive;
  if (alive?.ok && alive?.shuttingDown === true) {
    const shutdownWaitMs = Math.max(Number(timeoutMs) || 15_000, DAEMON_SHUTDOWN_GRACE_MS + 10_000, 8_000);
    const waitRet = await waitForDaemonExit(shutdownWaitMs);
    if (!waitRet?.ok) {
      throw new Error(waitRet.error || `daemon_stop_timeout_${shutdownWaitMs}ms`);
    }
  }

  if (!allowStart) {
    throw new Error('daemon_not_running_session0');
  }

  ensureDirs();
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), 'run'], {
    cwd: ROOT,
    env: process.env,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();

  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    const status = await pingDaemon();
    if (status?.ok && status?.shuttingDown !== true) return status;
    await sleep(250);
  }
  throw new Error(`daemon_start_timeout_${timeoutMs}ms`);
}

function print(payload, jsonMode) {
  if (jsonMode) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  if (typeof payload === 'string') {
    console.log(payload);
    return;
  }
  console.log(JSON.stringify(payload, null, 2));
}

function printHelp() {
  console.log(`webauto daemon

Usage:
  webauto --daemon
  webauto --daemon start|stop|status|run
  webauto --daemon relay [--detach] -- <webauto args...>
  webauto --daemon ui-start|ui-stop|ui-status
  webauto --daemon autostart install|uninstall|status

Notes:
  - \`--daemon\` 默认等价于 \`--daemon start\`
  - \`run\` 为前台运行，仅用于调试
  - relay 默认同步等待并返回结果；加 --detach 可改为后台任务
  - relay 可把普通 CLI 命令经 daemon 中继执行
`);
}

async function main() {
  const rawArgv = process.argv.slice(2);
  const args = minimist(rawArgv, {
    boolean: ['help', 'json', 'detach'],
    string: ['job-id'],
    alias: { h: 'help' },
  });
  const jsonMode = args.json === true;
  const cmd = String(args._[0] || 'start').trim().toLowerCase();
  const sessionZero = isWindowsSessionZero();
  const allowDaemonStart = !sessionZero;

  if (!args.help && sessionZero && (cmd === 'start' || cmd === 'run')) {
    const message = `[daemon] Session 0 blocked: "${cmd}" must be started from a non-Session 0 desktop session. If daemon is already running, use "webauto --daemon ui-start".`;
    if (jsonMode) {
      console.log(JSON.stringify({ ok: false, error: message, code: 'SESSION0_BLOCKED' }, null, 2));
    } else {
      console.error(message);
    }
    process.exit(2);
  }

  if (args.help) {
    printHelp();
    return;
  }

  if (cmd === 'run') {
    await startDaemonServer();
    return;
  }

  if (cmd === 'start') {
    const status = await ensureDaemonStarted(undefined, { allowStart: allowDaemonStart });
    print(status, jsonMode);
    return;
  }

  if (cmd === 'stop') {
    const ret = await requestDaemon({ method: 'shutdown', params: {} }).catch((error) => ({ ok: false, error: error?.message || String(error) }));
    if (!ret?.ok) {
      const errText = String(ret?.error || '').trim();
      const connectErrCode = detectConnectErrorCode(errText);
      if (connectErrCode === 'ENOENT' || connectErrCode === 'ECONNREFUSED' || connectErrCode === 'EPERM' || connectErrCode === 'EACCES') {
        const forced = await forceStopByPidFile();
        const sweep = await sweepManagedRuntimeProcesses();
        if (forced?.ok) {
          print({
            ok: true,
            stopped: sweep.ok === true,
            alreadyStopped: forced.alreadyStopped === true,
            pid: Number.isFinite(Number(forced.pid)) ? Number(forced.pid) : null,
            fallback: forced.fallback || null,
            connectError: errText || null,
            sweep,
          }, jsonMode);
          if (!sweep.ok) process.exit(1);
          return;
        }
        print({
          ok: false,
          error: forced?.error || 'forced_stop_failed',
          connectError: errText || null,
          pid: Number.isFinite(Number(forced?.pid)) ? Number(forced.pid) : null,
          terminateCode: forced?.terminateCode ?? null,
          terminateStdout: forced?.terminateStdout || '',
          terminateStderr: forced?.terminateStderr || '',
          sweep,
        }, jsonMode);
        process.exit(1);
        return;
      }
      const sweep = await sweepManagedRuntimeProcesses();
      print({
        ...ret,
        sweep,
      }, jsonMode);
      process.exit(1);
      return;
    }
    const stopped = await waitForDaemonExit(Math.max(20_000, DAEMON_SHUTDOWN_GRACE_MS + 10_000));
    const sweep = await sweepManagedRuntimeProcesses();
    const out = {
      ...ret,
      stopped: stopped?.ok === true && sweep.ok === true,
      stopWaitError: stopped?.ok ? null : (stopped?.error || 'unknown_stop_wait_error'),
      sweep,
    };
    print(out, jsonMode);
    if (!stopped?.ok || !sweep.ok) process.exit(1);
    return;
  }

  if (cmd === 'status') {
    const ret = await requestDaemon({ method: 'status', params: {} }).catch((error) => ({ ok: false, error: error?.message || String(error) }));
    print(ret, jsonMode);
    if (!ret?.ok) process.exit(1);
    return;
  }

  if (cmd === 'ui-start') {
    await ensureDaemonStarted(undefined, { allowStart: allowDaemonStart });
    const requestTimeoutMs = Math.max(120_000, UI_CLI_START_TIMEOUT_MS + 30_000);
    const ret = await requestDaemon({ method: 'ui.start', params: {} }, requestTimeoutMs);
    print(ret, jsonMode);
    if (!ret?.ok) process.exit(1);
    return;
  }
  if (cmd === 'ui-stop') {
    await ensureDaemonStarted(undefined, { allowStart: allowDaemonStart });
    const ret = await requestDaemon({ method: 'ui.stop', params: {} }, Math.max(30_000, UI_CLI_STOP_TIMEOUT_MS + 10_000));
    print(ret, jsonMode);
    if (!ret?.ok) process.exit(1);
    return;
  }
  if (cmd === 'ui-status') {
    await ensureDaemonStarted(undefined, { allowStart: allowDaemonStart });
    const ret = await requestDaemon({ method: 'ui.status', params: {} }, Math.max(30_000, UI_CLI_STATUS_TIMEOUT_MS + 10_000));
    print(ret, jsonMode);
    if (!ret?.ok) process.exit(1);
    return;
  }

  if (cmd === 'service-status') {
    await ensureDaemonStarted(undefined, { allowStart: allowDaemonStart });
    const ret = await requestDaemon({ method: 'service.status', params: {} });
    print(ret, jsonMode);
    if (!ret?.ok) process.exit(1);
    return;
  }

  if (cmd === 'job-status') {
    await ensureDaemonStarted(undefined, { allowStart: allowDaemonStart });
    const id = String(args['job-id'] || args._[1] || '').trim();
    const ret = await requestDaemon({ method: 'relay.status', params: { id } });
    print(ret, jsonMode);
    if (!ret?.ok) process.exit(1);
    return;
  }

  if (cmd === 'job-list') {
    await ensureDaemonStarted(undefined, { allowStart: allowDaemonStart });
    const limit = Number(args._[1] || 20) || 20;
    const ret = await requestDaemon({ method: 'relay.list', params: { limit } });
    print(ret, jsonMode);
    if (!ret?.ok) process.exit(1);
    return;
  }

  if (cmd === 'autostart') {
    const action = String(args._[1] || 'status').trim().toLowerCase();
    let ret = null;
    if (action === 'install') ret = await installAutostart();
    else if (action === 'uninstall') ret = await uninstallAutostart();
    else if (action === 'status') ret = await autostartStatus();
    else ret = { ok: false, error: `unsupported_autostart_action:${action}` };
    print(ret, jsonMode);
    if (!ret?.ok) process.exit(1);
    return;
  }

  if (cmd === 'relay') {
    const idx = rawArgv.indexOf('--');
    const relayArgs = idx >= 0 ? rawArgv.slice(idx + 1) : rawArgv.slice(1);
    if (relayArgs.length === 0) {
      print({ ok: false, error: 'missing relay command' }, jsonMode);
      process.exit(2);
      return;
    }
    const wait = args.detach !== true;
    await ensureDaemonStarted(undefined, { allowStart: allowDaemonStart });
    const ret = await requestDaemon({
      method: 'relay.start',
      params: { args: relayArgs, wait },
    }, wait ? 24 * 60 * 60 * 1000 : 15_000);
    print(ret, jsonMode);
    if (!ret?.ok) process.exit(1);
    if (wait && ret?.job?.status === 'failed') process.exit(Number(ret?.job?.code || 1) || 1);
    return;
  }

  // Unknown command under daemon entry: treat as relay args for convenience.
  const wait = args.detach !== true;
  await ensureDaemonStarted(undefined, { allowStart: allowDaemonStart });
  const ret = await requestDaemon({
    method: 'relay.start',
    params: { args: rawArgv, wait },
  }, wait ? 24 * 60 * 60 * 1000 : 15_000);
  print(ret, jsonMode);
  if (!ret?.ok) process.exit(1);
  if (wait && ret?.job?.status === 'failed') process.exit(Number(ret?.job?.code || 1) || 1);
}

main().catch((err) => {
  const message = String(err?.message || '').trim();
  if (message === 'daemon_not_running_session0') {
    console.error('[daemon] Session 0 blocked: daemon is not running. Start daemon from a non-Session 0 desktop session, then retry.');
  } else {
    console.error(err?.stack || err?.message || String(err));
  }
  process.exit(1);
});
