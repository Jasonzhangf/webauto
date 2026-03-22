#!/usr/bin/env node
import minimist from 'minimist';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
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
const SOCKET_PATH = process.platform === 'win32'
  ? '\\\\.\\pipe\\webauto-daemon'
  : path.join(RUN_DIR, 'webauto-daemon.sock');
const WEBAUTO_BIN = path.join(ROOT, 'bin', 'webauto.mjs');
const WORKER_HEARTBEAT_INTERVAL_MS = 30_000;
const WORKER_HEARTBEAT_MISS_LIMIT = 3;
const WORKER_HEARTBEAT_STALE_MS = WORKER_HEARTBEAT_INTERVAL_MS * WORKER_HEARTBEAT_MISS_LIMIT;
const DAEMON_SHUTDOWN_GRACE_MS = WORKER_HEARTBEAT_INTERVAL_MS + 5_000;

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

function nowIso() {
  return new Date().toISOString();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanupRuntimeFiles() {
  try { rmSync(PID_FILE, { force: true }); } catch {}
  try { rmSync(HEARTBEAT_FILE, { force: true }); } catch {}
  if (process.platform !== 'win32') {
    try { unlinkSync(SOCKET_PATH); } catch {}
  }
}

function isPidAlive(pid) {
  const target = Number(pid || 0);
  if (!Number.isFinite(target) || target <= 0) return false;
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
    const child = spawn('taskkill', ['/PID', String(target), '/T', '/F'], { windowsHide: true });
    await new Promise((resolve) => child.on('close', resolve));
    return { ok: !isPidAlive(target) };
  }
  try { process.kill(target, 'SIGTERM'); } catch {}
  await sleep(600);
  if (!isPidAlive(target)) return { ok: true };
  try { process.kill(target, 'SIGKILL'); } catch {}
  await sleep(200);
  return { ok: !isPidAlive(target) };
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
    return { ok: false, error: 'pid_terminate_failed', pid };
  }
  await sleep(300);
  cleanupRuntimeFiles();
  return { ok: true, stopped: true, alreadyStopped: false, pid, fallback: 'pid_file' };
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
    child.on('close', (code) => resolve({ ok: code === 0, code, stdout, stderr }));
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
  });
}

async function pingDaemon() {
  try {
    const ret = await requestDaemon({ method: 'ping', params: {} }, 4_000);
    return ret?.ok ? ret : null;
  } catch {
    return null;
  }
}

function buildWorkerEnv(worker) {
  return {
    WEBAUTO_DAEMON_SOCKET: SOCKET_PATH,
    WEBAUTO_DAEMON_WORKER_ID: worker.id,
    WEBAUTO_DAEMON_WORKER_TOKEN: worker.token,
    WEBAUTO_DAEMON_WORKER_KIND: worker.kind,
  };
}

async function startDaemonServer() {
  ensureDirs();
  cleanupRuntimeFiles();
  if (process.platform !== 'win32') {
    try { unlinkSync(SOCKET_PATH); } catch {}
  }

  const state = {
    startedAt: Date.now(),
    jobs: new Map(),
    jobsOrder: [],
    workers: new Map(),
    workersOrder: [],
    shuttingDown: false,
    shutdownReason: null,
    shutdownStartedAt: null,
    shutdownTimer: null,
  };

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


  const summarizeJob = (job) => ({
    id: job.id,
    args: job.args,
    pid: job.pid || null,
    status: job.status,
    code: job.code ?? null,
    startedAt: job.startedAt || null,
    finishedAt: job.finishedAt || null,
    logPath: job.logPath || null,
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
      .map((id) => state.workers.get(id))
      .filter(Boolean)
      .map((worker) => summarizeWorker(worker));
    writeJson(HEARTBEAT_FILE, {
      ok: true,
      pid: process.pid,
      ts: nowIso(),
      socket: SOCKET_PATH,
      jobs,
      workers,
      shuttingDown: state.shuttingDown,
    });
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
    if (typeof patch.source === 'string' && patch.source.trim()) worker.source = patch.source.trim();
    return worker;
  };


  const startRelayJob = async (params = {}) => {
    const args = Array.isArray(params.args) ? params.args : [];
    if (args.length === 0) return { ok: false, error: 'missing relay args' };

    // 排他性控制：同一时间只允许一个任务运行
    const activeJobs = state.jobsOrder
      .map((id) => state.jobs.get(id))
      .filter((j) => j && j.status === 'running');
    if (activeJobs.length > 0) {
      return {
        ok: false,
        error: 'task_already_running',
        activeJob: { id: activeJobs[0].id, pid: activeJobs[0].pid, startedAt: activeJobs[0].startedAt },
      };
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
      env: { ...process.env, ...buildWorkerEnv(worker) },
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
    state.jobs.set(jobId, job);
    state.jobsOrder.push(jobId);

    child.stdout.on('data', (chunk) => logStream.write(chunk));
    child.stderr.on('data', (chunk) => logStream.write(chunk));

    child.on('close', (code) => {
      job.status = code === 0 ? 'completed' : 'failed';
      job.code = code;
      job.finishedAt = nowIso();
      logStream.end();
      if (worker) markWorkerStopped(worker.id, 'worker_exit', { status: job.status });
      updateHeartbeat();
    });

    if (!wait) {
      updateHeartbeat();
      return { ok: true, detached: true, job: summarizeJob(job) };
    }

    await new Promise((resolve) => child.on('close', resolve));
    updateHeartbeat();
    return { ok: true, detached: false, job: summarizeJob(job) };
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
      let worker = state.workers.get(workerId);
      if (!worker) {
        worker = registerWorker({
          id: workerId,
          token,
          kind: params.kind || 'worker',
          source: params.source || null,
          pid: params.pid || null,
          status: 'running',
        });
      }
      if (!worker) return { ok: false, error: 'worker_register_failed' };
      if (worker.token !== token) return { ok: false, error: `worker_token_mismatch:${workerId}` };
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
      };
    }
    if (method === 'worker.exit') {
      const workerId = String(params.workerId || '').trim();
      const token = String(params.token || '').trim();
      if (!workerId || !token) return { ok: false, error: 'missing_worker_credentials' };
      const worker = state.workers.get(workerId);
      if (!worker) return { ok: false, error: `worker_not_found:${workerId}` };
      if (worker.token !== token) return { ok: false, error: `worker_token_mismatch:${workerId}` };
      markWorkerStopped(workerId, 'worker_exit', { source: String(params.source || '').trim() || 'worker' });
      updateHeartbeat();
      return { ok: true, acknowledged: true };
    }
    if (method === 'shutdown') {
      state.shuttingDown = true;
      state.shutdownReason = 'rpc_shutdown';
      state.shutdownStartedAt = nowIso();
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
      const method = String(req?.method || '').trim();
      handleMethod(method, req?.params || {})
        .then((res) => {
          socket.write(`${JSON.stringify(res)}\n`);
          socket.end();
        })
        .catch((err) => {
          socket.write(`${JSON.stringify({ ok: false, error: err?.message || String(err) })}\n`);
          socket.end();
        });
    });
  });

  if (process.platform !== 'win32' && existsSync(SOCKET_PATH)) {
    try { unlinkSync(SOCKET_PATH); } catch {}
  }

  await new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(SOCKET_PATH, () => resolve());
  });

  writeJson(PID_FILE, { pid: process.pid, startedAt: nowIso() });
  updateHeartbeat();
  const heartbeatTimer = setInterval(updateHeartbeat, 5_000);
  heartbeatTimer.unref();

  process.on('SIGINT', () => {
    try { server.close(); } catch {}
    cleanupRuntimeFiles();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    try { server.close(); } catch {}
    cleanupRuntimeFiles();
    process.exit(0);
  });
}

async function ensureDaemonStarted(timeoutMs = 15_000, options = {}) {
  const allowStart = options.allowStart !== false;
  const alive = await pingDaemon();
  if (alive?.ok) return alive;
  if (!allowStart) {
    throw new Error('daemon_not_running');
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
    if (status?.ok) return status;
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
    const status = await ensureDaemonStarted(undefined, { allowStart: true });
    print(status, jsonMode);
    return;
  }

  if (cmd === 'stop') {
    const ret = await requestDaemon({ method: 'shutdown', params: {} }).catch((error) => ({ ok: false, error: error?.message || String(error) }));
    if (!ret?.ok) {
      const forced = await forceStopByPidFile();
      print({ ok: false, error: ret?.error || 'shutdown_failed', forced }, jsonMode);
      process.exit(1);
      return;
    }
    print(ret, jsonMode);
    return;
  }

  if (cmd === 'status') {
    const ret = await requestDaemon({ method: 'status', params: {} }).catch((error) => ({ ok: false, error: error?.message || String(error) }));
    print(ret, jsonMode);
    if (!ret?.ok) process.exit(1);
    return;
  }


  if (cmd === 'job-status') {
    await ensureDaemonStarted(undefined, { allowStart: true });
    const id = String(args['job-id'] || args._[1] || '').trim();
    const ret = await requestDaemon({ method: 'relay.status', params: { id } });
    print(ret, jsonMode);
    if (!ret?.ok) process.exit(1);
    return;
  }

  if (cmd === 'job-list') {
    await ensureDaemonStarted(undefined, { allowStart: true });
    const limit = Number(args._[1] || 20) || 20;
    const ret = await requestDaemon({ method: 'relay.list', params: { limit } });
    print(ret, jsonMode);
    if (!ret?.ok) process.exit(1);
    return;
  }

  if (cmd === 'relay') {
    const idx = rawArgv.indexOf('--');
    const relayArgs = idx >= 0 ? rawArgv.slice(idx + 1) : rawArgv.slice(1);
    if (relayArgs.length === 0) {
      print({ ok: false, error: 'missing relay args' }, jsonMode);
      process.exit(1);
      return;
    }
    await ensureDaemonStarted(undefined, { allowStart: true });
    const wait = args.detach !== true;
    const ret = await requestDaemon({ method: 'relay.start', params: { args: relayArgs, wait } }, 120_000);
    print(ret, jsonMode);
    if (!ret?.ok) process.exit(1);
    return;
  }

  print({ ok: false, error: `unsupported_command:${cmd}` }, jsonMode);
  process.exit(1);
}

main().catch((err) => {
  console.error('[daemon] fatal', err);
  process.exit(1);
});
