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
const RUN_DIR = path.join(WEBAUTO_HOME, 'run');
const LOG_DIR = path.join(WEBAUTO_HOME, 'logs');
const JOB_LOG_DIR = path.join(LOG_DIR, 'daemon-jobs');
const PID_FILE = path.join(RUN_DIR, 'webauto-daemon.pid');
const HEARTBEAT_FILE = path.join(RUN_DIR, 'webauto-daemon-heartbeat.json');
const AUTOSTART_MAC_PLIST = path.join(os.homedir(), 'Library', 'LaunchAgents', 'com.webauto.daemon.plist');
const SOCKET_PATH = process.platform === 'win32'
  ? '\\\\.\\pipe\\webauto-daemon'
  : path.join(RUN_DIR, 'webauto-daemon.sock');
const WEBAUTO_BIN = path.join(ROOT, 'bin', 'webauto.mjs');
const UI_CLI_SCRIPT = path.join(ROOT, 'apps', 'desktop-console', 'entry', 'ui-cli.mjs');
const XHS_INSTALL_SCRIPT = path.join(ROOT, 'apps', 'webauto', 'entry', 'xhs-install.mjs');

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
  if (process.platform !== 'win32') {
    try { unlinkSync(SOCKET_PATH); } catch {}
  }
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

async function runUiCli(args = []) {
  const ret = await runNode([UI_CLI_SCRIPT, ...args]);
  const parsed = parseJsonFromMixedOutput(ret.stdout, ret.stderr);
  return {
    ...ret,
    json: parsed,
  };
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
  cleanupRuntimeFiles();

  const state = {
    startedAt: Date.now(),
    desiredUi: false,
    jobs: new Map(),
    jobsOrder: [],
    shuttingDown: false,
  };
  let uiQueue = Promise.resolve();
  const enqueueUi = async (fn) => {
    const next = uiQueue.then(fn, fn);
    uiQueue = next.catch(() => null);
    return next;
  };

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
    writeJson(HEARTBEAT_FILE, buildHeartbeat({
      desiredUi: state.desiredUi,
      uptimeMs: Date.now() - state.startedAt,
      jobs,
    }));
  };

  const trimJobBuffer = () => {
    while (state.jobsOrder.length > 200) {
      const oldest = state.jobsOrder.shift();
      if (!oldest) continue;
      state.jobs.delete(oldest);
    }
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
    const child = spawn(process.execPath, [WEBAUTO_BIN, ...args], {
      cwd: ROOT,
      env: {
        ...process.env,
        WEBAUTO_DAEMON_BYPASS: '1',
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
    };
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
      updateHeartbeat();
      try { logStream.end(); } catch {}
    });
    child.on('error', (err) => {
      job.status = 'failed';
      job.code = null;
      job.finishedAt = nowIso();
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
      return {
        ok: true,
        pid: process.pid,
        startedAt: new Date(state.startedAt).toISOString(),
        uptimeMs: Date.now() - state.startedAt,
        desiredUi: state.desiredUi,
        shuttingDown: state.shuttingDown,
        socket: SOCKET_PATH,
        jobs,
      };
    }
    if (method === 'shutdown') {
      state.shuttingDown = true;
      state.desiredUi = false;
      void enqueueUi(() => runUiCli(['stop', '--json']).catch(() => null)).finally(() => {
        try { server.close(); } catch {}
        cleanupRuntimeFiles();
        process.exit(0);
      });
      return { ok: true, shuttingDown: true, pid: process.pid };
    }
    if (method === 'ui.start') {
      state.desiredUi = true;
      const ret = await enqueueUi(() => runUiCli(['start', '--json']));
      return { ok: ret.ok, result: ret.json || null, code: ret.code, stdout: ret.stdout, stderr: ret.stderr };
    }
    if (method === 'ui.stop') {
      state.desiredUi = false;
      const ret = await enqueueUi(() => runUiCli(['stop', '--json']));
      return { ok: ret.ok, result: ret.json || null, code: ret.code, stdout: ret.stdout, stderr: ret.stderr };
    }
    if (method === 'ui.status') {
      const ret = await enqueueUi(() => runUiCli(['status', '--json']));
      return { ok: ret.ok, result: ret.json || null, code: ret.code, stdout: ret.stdout, stderr: ret.stderr };
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

  const server = net.createServer((socket) => {
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

  const uiWatchdog = setInterval(() => {
    if (!state.desiredUi || state.shuttingDown) return;
    void enqueueUi(async () => {
      const status = await runUiCli(['status', '--json']).catch(() => ({ ok: false }));
      if (status?.ok && status?.json?.ok) return;
      await runUiCli(['start', '--json']).catch(() => null);
    });
  }, 10_000);
  uiWatchdog.unref();

  const shutdown = () => {
    state.shuttingDown = true;
    try { clearInterval(heartbeatTimer); } catch {}
    try { clearInterval(uiWatchdog); } catch {}
    try { server.close(); } catch {}
    cleanupRuntimeFiles();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('exit', () => {
    cleanupRuntimeFiles();
  });
}

async function ensureDaemonStarted(timeoutMs = 15_000) {
  const alive = await pingDaemon();
  if (alive?.ok && alive?.shuttingDown !== true) return alive;
  if (alive?.ok && alive?.shuttingDown === true) {
    const waitRet = await waitForDaemonExit(Math.min(timeoutMs, 8_000));
    if (!waitRet?.ok) {
      throw new Error(waitRet.error || `daemon_stop_timeout_${Math.min(timeoutMs, 8_000)}ms`);
    }
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

  if (args.help) {
    printHelp();
    return;
  }

  if (cmd === 'run') {
    await startDaemonServer();
    return;
  }

  if (cmd === 'start') {
    const status = await ensureDaemonStarted();
    print(status, jsonMode);
    return;
  }

  if (cmd === 'stop') {
    const ret = await requestDaemon({ method: 'shutdown', params: {} }).catch((error) => ({ ok: false, error: error?.message || String(error) }));
    if (!ret?.ok) {
      const errText = String(ret?.error || '');
      if (errText.includes('ENOENT') || errText.includes('ECONNREFUSED')) {
        print({ ok: true, alreadyStopped: true, stopped: true }, jsonMode);
        return;
      }
      print(ret, jsonMode);
      process.exit(1);
      return;
    }
    const stopped = await waitForDaemonExit(15_000);
    const out = {
      ...ret,
      stopped: stopped?.ok === true,
      stopWaitError: stopped?.ok ? null : (stopped?.error || 'unknown_stop_wait_error'),
    };
    print(out, jsonMode);
    if (!stopped?.ok) process.exit(1);
    return;
  }

  if (cmd === 'status') {
    const ret = await requestDaemon({ method: 'status', params: {} }).catch((error) => ({ ok: false, error: error?.message || String(error) }));
    print(ret, jsonMode);
    if (!ret?.ok) process.exit(1);
    return;
  }

  if (cmd === 'ui-start') {
    await ensureDaemonStarted();
    const ret = await requestDaemon({ method: 'ui.start', params: {} });
    print(ret, jsonMode);
    if (!ret?.ok) process.exit(1);
    return;
  }
  if (cmd === 'ui-stop') {
    await ensureDaemonStarted();
    const ret = await requestDaemon({ method: 'ui.stop', params: {} });
    print(ret, jsonMode);
    if (!ret?.ok) process.exit(1);
    return;
  }
  if (cmd === 'ui-status') {
    await ensureDaemonStarted();
    const ret = await requestDaemon({ method: 'ui.status', params: {} });
    print(ret, jsonMode);
    if (!ret?.ok) process.exit(1);
    return;
  }

  if (cmd === 'service-status') {
    await ensureDaemonStarted();
    const ret = await requestDaemon({ method: 'service.status', params: {} });
    print(ret, jsonMode);
    if (!ret?.ok) process.exit(1);
    return;
  }

  if (cmd === 'job-status') {
    await ensureDaemonStarted();
    const id = String(args['job-id'] || args._[1] || '').trim();
    const ret = await requestDaemon({ method: 'relay.status', params: { id } });
    print(ret, jsonMode);
    if (!ret?.ok) process.exit(1);
    return;
  }

  if (cmd === 'job-list') {
    await ensureDaemonStarted();
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
    await ensureDaemonStarted();
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
  await ensureDaemonStarted();
  const ret = await requestDaemon({
    method: 'relay.start',
    params: { args: rawArgv, wait },
  }, wait ? 24 * 60 * 60 * 1000 : 15_000);
  print(ret, jsonMode);
  if (!ret?.ok) process.exit(1);
  if (wait && ret?.job?.status === 'failed') process.exit(Number(ret?.job?.code || 1) || 1);
}

main().catch((err) => {
  console.error(err?.stack || err?.message || String(err));
  process.exit(1);
});
