#!/usr/bin/env node
import minimist from 'minimist';
import { resolveTaskArgs } from './daemon-task-args.mjs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import {
  createWriteStream,
  existsSync,
  closeSync,
  mkdirSync,
  openSync,
  readSync,
  readFileSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

import { performHealthCheck } from './lib/health-check.mjs';

import {
  listDueScheduleTasks,
  markScheduleTaskResult,
  markScheduleTaskSkipped,
  claimScheduleTask,
  releaseScheduleTaskClaim,
  renewScheduleTaskClaim,
  reapStaleLocks,
  getSchedulerPolicy,
  normalizeSchedulerPolicy,
  acquireScheduleDaemonLease,
  renewScheduleDaemonLease,
  releaseScheduleDaemonLease,
  listScheduleTasks,
} from './lib/schedule-store.mjs';
import { evaluateRetry } from './lib/schedule-retry.mjs';
import { listAccountProfiles } from './lib/account-store.mjs';

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
const STALL_CHECK_INTERVAL_MS = Math.max(
  60_000,
  Number(process.env.WEBAUTO_DAEMON_STALL_CHECK_INTERVAL_MS || 15 * 60 * 1000),
);
const STALL_TIMEOUT_MS = Math.max(
  60_000,
  Number(process.env.WEBAUTO_DAEMON_STALL_TIMEOUT_MS || STALL_CHECK_INTERVAL_MS),
);
const STALL_LOG_TAIL_BYTES = Math.max(
  32 * 1024,
  Number(process.env.WEBAUTO_DAEMON_STALL_LOG_TAIL_BYTES || 256 * 1024),
);

const SCHEDULE_TICK_INTERVAL_MS = Math.max(
  10_000,
  Number(process.env.WEBAUTO_DAEMON_SCHEDULE_INTERVAL_MS || 30_000),
);
const SCHEDULE_MAX_CONCURRENCY = Math.max(
  1,
  Number(process.env.WEBAUTO_DAEMON_SCHEDULE_CONCURRENCY || 1),
);
const SCHEDULE_LEASE_MS = Math.max(
  30_000,
  Number(process.env.WEBAUTO_DAEMON_SCHEDULE_LEASE_MS || 30 * 60 * 1000),
);
const SCHEDULE_ENABLED = process.env.WEBAUTO_DAEMON_SCHEDULE_DISABLED !== '1';

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

function logDaemonEvent(event, payload = {}) {
  try {
    process.stdout.write(`[daemon] ${event} ${JSON.stringify(payload)}\n`);
  } catch {}
}

async function terminatePidTree(pid) {
  const target = Number(pid || 0);
  if (!Number.isFinite(target) || target <= 0) return { ok: false, error: 'invalid_pid' };
  if (process.platform === 'win32') {
    const child = spawn('taskkill', ['/PID', String(target), '/T', '/F'], { windowsHide: true });
    await new Promise((resolve) => child.on('close', resolve));
    return { ok: !isPidAlive(target) };
  }

  // POSIX: terminate child tree first, then parent.
  try {
    const child = spawn('pkill', ['-TERM', '-P', String(target)], { windowsHide: true });
    await new Promise((resolve) => child.on('close', resolve));
  } catch {}

  try { process.kill(target, 'SIGTERM'); } catch {}
  await sleep(800);
  if (!isPidAlive(target)) return { ok: true };

  try {
    const child = spawn('pkill', ['-KILL', '-P', String(target)], { windowsHide: true });
    await new Promise((resolve) => child.on('close', resolve));
  } catch {}
  try { process.kill(target, 'SIGKILL'); } catch {}
  await sleep(300);

  if (isPidAlive(target)) {
    try {
      const child = spawn('kill', ['-9', String(target)], { windowsHide: true });
      await new Promise((resolve) => child.on('close', resolve));
    } catch {}
    await sleep(120);
  }
  return { ok: !isPidAlive(target) };
}

function findOrphanedWorkerPids(supervisedPids = [], excludedPids = []) {
  if (process.platform === 'win32') return [];
  try {
    const ret = spawnSync('pgrep', ['-f', 'apps/webauto/entry/xhs-(unified|collect)\\.mjs'], {
      encoding: 'utf8',
      windowsHide: true,
    });
    const stdout = String(ret.stdout || '').trim();
    if (!stdout) return [];
    const supervised = new Set(
      (Array.isArray(supervisedPids) ? supervisedPids : [])
        .map((n) => Number(n))
        .filter((n) => Number.isFinite(n) && n > 0),
    );
    const excluded = new Set(
      (Array.isArray(excludedPids) ? excludedPids : [])
        .map((n) => Number(n))
        .filter((n) => Number.isFinite(n) && n > 0),
    );
    excluded.add(Number(process.pid || 0));
    return stdout
      .split(/\r?\n/g)
      .map((line) => Number(line.trim()))
      .filter((pid) => Number.isFinite(pid) && pid > 0)
      .filter((pid) => !supervised.has(pid))
      .filter((pid) => !excluded.has(pid));
  } catch {
    return [];
  }
}

async function cleanupOrphanedWorkers(supervisedPids = [], excludedPids = []) {
  const pids = findOrphanedWorkerPids(supervisedPids, excludedPids);
  if (pids.length === 0) return { ok: true, cleaned: 0, pids: [] };
  const results = [];
  for (const pid of pids) {
    const ret = await terminatePidTree(pid);
    results.push({ pid, ok: !!ret?.ok, error: ret?.error || null });
  }
  const summary = {
    ok: results.every((item) => item.ok),
    cleaned: results.filter((item) => item.ok).length,
    pids,
    results,
  };
  logDaemonEvent('orphan_cleanup', summary);
  return summary;
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

function readLogTailLines(filePath, maxBytes = STALL_LOG_TAIL_BYTES) {
  if (!filePath) return [];
  try {
    const stat = statSync(filePath);
    if (!stat || stat.size <= 0) return [];
    const start = Math.max(0, stat.size - Math.max(1024, maxBytes));
    const length = stat.size - start;
    const fd = openSync(filePath, 'r');
    try {
      const buffer = Buffer.alloc(length);
      readSync(fd, buffer, 0, length, start);
      return buffer.toString('utf8').split(/\r?\n/g).map((line) => line.trim()).filter(Boolean);
    } finally {
      closeSync(fd);
    }
  } catch {
    return [];
  }
}

function parseEventTimestamp(payload) {
  if (!payload) return null;
  const raw = payload.ts ?? payload.timestamp ?? payload.time ?? null;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string' && raw.trim()) {
    const ms = Date.parse(raw);
    if (Number.isFinite(ms)) return ms;
  }
  return null;
}

function isProgressEventName(eventName) {
  const name = String(eventName || '').trim();
  if (!name) return false;
  return name.startsWith('autoscript:') || name.startsWith('xhs.unified.');
}

function resolveLastProgressFromLog(logPath) {
  const lines = readLogTailLines(logPath, STALL_LOG_TAIL_BYTES);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (!line || !line.startsWith('{')) continue;
    let payload;
    try {
      payload = JSON.parse(line);
    } catch {
      continue;
    }
    if (!payload || !isProgressEventName(payload.event)) continue;
    const tsMs = parseEventTimestamp(payload);
    if (!Number.isFinite(tsMs)) continue;
    return { tsMs, event: payload.event, raw: payload };
  }
  try {
    const stat = statSync(logPath);
    if (stat?.mtimeMs) return { tsMs: stat.mtimeMs, event: 'log_mtime', raw: null };
  } catch {
    return null;
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

async function waitDaemonStopped(timeoutMs = 8_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    const alive = await pingDaemon();
    if (!alive?.ok) return true;
    await sleep(200);
  }
  return false;
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
    exitSignal: job.exitSignal || null,
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
        exitSignal: job.exitSignal || null,
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
      kind: String(input.kind || 'task').trim() || 'task',
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
      if (!worker.kind) worker.kind = existing.kind || 'task';
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

  const spawnTaskJob = (args = [], meta = {}) => {
    const jobId = `job_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const logPath = path.join(JOB_LOG_DIR, `${jobId}.log`);
    const logStream = createWriteStream(logPath, { flags: 'a' });
    const worker = registerWorker({
      id: `task_${jobId}`,
      token: randomUUID(),
      kind: 'task',
      source: meta.source || 'daemon-task',
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
      exitSignal: null,
      startedAt: nowIso(),
      finishedAt: null,
      logPath,
      restartOf: meta.restartOf || null,
      restartReason: meta.restartReason || null,
    };
    state.jobs.set(jobId, job);
    state.jobsOrder.push(jobId);

    child.stdout.on('data', (chunk) => logStream.write(chunk));
    child.stderr.on('data', (chunk) => logStream.write(chunk));

    child.on('close', (code, signal) => {
      // If already marked stopped/stalled by daemon, keep current state.
      if (job.status === 'stopped' || job.status === 'stalled') {
        job.code = job.code ?? (code ?? -15);
        job.exitSignal = signal || job.exitSignal || null;
        job.finishedAt = job.finishedAt || nowIso();
      } else {
        job.status = code === 0 ? 'completed' : 'failed';
        job.code = code;
        job.exitSignal = signal || null;
        job.finishedAt = nowIso();
      }
      logStream.end();
      if (worker) markWorkerStopped(worker.id, 'worker_exit', { status: job.status });
      logDaemonEvent('job_close', {
        jobId: job.id,
        pid: job.pid,
        status: job.status,
        code: job.code,
        signal: job.exitSignal,
      });
      updateHeartbeat();
    });

    return { job, worker, child };
  };

  const findWorkerByJobId = (jobId) => {
    const id = String(jobId || '').trim();
    if (!id) return null;
    const worker = state.workersOrder
      .map((workerId) => state.workers.get(workerId))
      .find((item) => item && item.jobId === id);
    return worker || null;
  };


  const startTaskJob = async (params = {}) => {
    const args = Array.isArray(params.args) ? params.args : [];
    if (args.length === 0) return { ok: false, error: 'missing task args' };

    // ── 任务提交前环境初始化 ──
    // 第一步：reconcile 进程状态
    const runningPids = state.jobsOrder
      .map((id) => state.jobs.get(id))
      .filter((j) => j && j.status === 'running' && j.pid);
    for (const job of runningPids) {
      if (!isPidAlive(job.pid)) {
        job.status = 'failed';
        job.code = -1;
        job.finishedAt = nowIso();
      }
    }
    updateHeartbeat();

    // 第二步：清理残留僵尸 worker 进程
    const supervisedPids = state.jobsOrder
      .map((id) => state.jobs.get(id))
      .filter((j) => j && j.status === 'running' && j.pid)
      .map((j) => j.pid);
    await cleanupOrphanedWorkers(supervisedPids);

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

    // 第三步：可靠健康检查（确认 browser-service + 输入操作真正可用）
    try {
      const health = await performHealthCheck({ skipInputTest: false });
      if (!health.ok) {
        return {
          ok: false,
          error: 'pre_submit_health_check_failed',
          health,
          message: `环境不健康：${health.summary}。建议重启 camo 或 browser-service`,
        };
      }
    } catch (err) {
      // 健康检查自身异常不阻塞提交（容错）
    }

    const wait = params.wait === true;
    const { job, child } = spawnTaskJob(args, { source: 'daemon-task' });

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
    if (method === 'task.submit') {
      return startTaskJob(params);
    }
    if (method === 'task.status') {
      const id = String(params.id || '').trim();
      if (!id) return { ok: false, error: 'missing id' };
      const job = state.jobs.get(id);
      if (!job) return { ok: false, error: `job_not_found:${id}` };
      return { ok: true, job };
    }
    if (method === 'task.list') {
      const limit = Math.max(1, Number(params.limit || 20) || 20);
      const statusFilter = String(params.status || '').trim();
      const jobs = state.jobsOrder
        .slice(-limit)
        .map((id) => state.jobs.get(id))
        .filter(Boolean)
        .filter((job) => !statusFilter || job.status === statusFilter)
        .reverse();
      return { ok: true, jobs };
    }
    if (method === 'task.stop') {
      const id = String(params.id || '').trim();
      if (!id) return { ok: false, error: 'missing id' };
      const job = state.jobs.get(id);
      if (!job) return { ok: false, error: `job_not_found:${id}` };
      if (job.status !== 'running') {
        return { ok: true, stopped: false, reason: `task_not_running:${job.status}`, job: summarizeJob(job) };
      }
      const ret = await terminatePidTree(job.pid);
      if (!ret?.ok) return { ok: false, error: 'task_stop_failed', job: summarizeJob(job) };
      job.status = 'stopped';
      job.code = -15;
      job.exitSignal = 'SIGTERM';
      job.finishedAt = nowIso();
      logDaemonEvent('task_stop', { jobId: job.id, pid: job.pid, ok: true });
      updateHeartbeat();
      return { ok: true, stopped: true, job: summarizeJob(job) };
    }
    if (method === 'schedule.status') {
      return {
        ok: true,
        enabled: SCHEDULE_ENABLED,
        ownerId: scheduleOwnerId,
        leaseAcquired: scheduleLeaseAcquired,
        intervalMs: SCHEDULE_TICK_INTERVAL_MS,
        concurrency: SCHEDULE_MAX_CONCURRENCY,
        leaseMs: SCHEDULE_LEASE_MS,
        running: scheduleRunning,
      };
    }
    if (method === 'schedule.list') {
      const tasks = listScheduleTasks();
      return { ok: true, tasks };
    }
    if (method === 'schedule.run-now') {
      if (state.shuttingDown) return { ok: false, error: 'daemon_shutting_down' };
      setTimeout(() => { void scheduleTick(); }, 0);
      return { ok: true, triggered: true };
    }

    if (method === 'task.delete') {
      const id = String(params.id || '').trim();
      if (!id) return { ok: false, error: 'missing id' };
      const job = state.jobs.get(id);
      if (!job) return { ok: false, error: `job_not_found:${id}` };
      if (job.status === 'running') {
        return { ok: false, error: 'cannot_delete_running_task', job: summarizeJob(job) };
      }
      state.jobs.delete(id);
      state.jobsOrder = state.jobsOrder.filter((jobId) => jobId !== id);
      updateHeartbeat();
      return { ok: true, deleted: true, id };
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

  // 启动时清理残留僵尸进程
  const reconcileJobProcessStates = () => {
    let changed = 0;
    for (const job of state.jobs.values()) {
      if (job.status !== 'running' || !job.pid) continue;
      if (isPidAlive(job.pid)) continue;
      job.status = 'failed';
      job.code = -1;
      job.finishedAt = nowIso();
      changed += 1;
    }
    if (changed > 0) updateHeartbeat();
  };

  // 启动时清理残留僵尸进程
  cleanupOrphanedWorkers().then((result) => {
    if (result.cleaned > 0) {
      process.stdout.write(`[daemon] startup: cleaned ${result.cleaned} orphaned worker(s)\n`);
    }
  }).catch(() => {});

  // 定期巡检：仅 reconcile，不执行自动 orphan kill（避免误杀 running job）
  const housekeepingTimer = setInterval(() => {
    reconcileJobProcessStates();
  }, 30_000);
  housekeepingTimer.unref();

  let stallCheckRunning = false;
  const checkStalledJobs = async () => {
    if (stallCheckRunning || state.shuttingDown) return;
    stallCheckRunning = true;
    try {
      const nowMs = Date.now();
      for (const job of state.jobs.values()) {
        if (job.status !== 'running' || !job.pid) continue;
        const progress = resolveLastProgressFromLog(job.logPath);
        const startedAtMs = job.startedAt ? Date.parse(job.startedAt) : null;
        const lastProgressMs = Number.isFinite(progress?.tsMs)
          ? progress.tsMs
          : (Number.isFinite(startedAtMs) ? startedAtMs : null);
        if (!Number.isFinite(lastProgressMs)) continue;
        job.lastProgressMs = lastProgressMs;
        job.lastProgressAt = new Date(lastProgressMs).toISOString();
        job.lastProgressEvent = progress?.event || null;
        const staleMs = Math.max(0, nowMs - lastProgressMs);
        if (staleMs < STALL_TIMEOUT_MS) continue;

        logDaemonEvent('job_stalled', {
          jobId: job.id,
          pid: job.pid,
          staleMs,
          lastProgressAt: job.lastProgressAt,
          lastProgressEvent: job.lastProgressEvent,
        });

        const worker = findWorkerByJobId(job.id);
        const stopped = await terminatePidTree(job.pid);
        const stillAlive = !stopped?.ok && isPidAlive(job.pid);
        if (stillAlive) {
          logDaemonEvent('job_stall_kill_failed', { jobId: job.id, pid: job.pid });
          continue;
        }

        job.status = 'stalled';
        job.code = -88;
        job.exitSignal = 'STALL_TIMEOUT';
        job.finishedAt = nowIso();
        if (worker) markWorkerStopped(worker.id, 'stalled', { status: 'stalled' });

        const restarted = spawnTaskJob(job.args, {
          source: 'daemon-stall-restart',
          restartOf: job.id,
          restartReason: 'stall_timeout',
        });
        logDaemonEvent('job_restart', {
          fromJobId: job.id,
          toJobId: restarted.job.id,
          ok: true,
          reason: 'stall_timeout',
        });
        updateHeartbeat();
      }
    } catch (err) {
      logDaemonEvent('stall_check_error', { error: err?.message || String(err) });
    } finally {
      stallCheckRunning = false;
    }
  };

  const stallCheckTimer = setInterval(() => {
    void checkStalledJobs();
  }, STALL_CHECK_INTERVAL_MS);
  stallCheckTimer.unref();


  // ── Schedule integration ──────────────────────────────────────────────

  let scheduleOwnerId = null;
  let scheduleLeaseAcquired = false;
  let scheduleRunning = false;
  let scheduleTickTimer = null;

  function createScheduleOwnerId() {
    return `daemon-${process.pid}-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
  }

  function normalizePlatformByCommandType(commandType) {
    const value = String(commandType || '').trim().toLowerCase();
    if (value.startsWith('weibo')) return 'weibo';
    if (value.startsWith('1688')) return '1688';
    return 'xiaohongshu';
  }

  function pickAutoProfile(platform) {
    const rows = listAccountProfiles({ platform }).profiles || [];
    const validRows = rows
      .filter((row) => row?.valid === true && String(row?.accountId || '').trim())
      .sort((a, b) => {
        const ta = Date.parse(String(a?.updatedAt || '')) || 0;
        const tb = Date.parse(String(b?.updatedAt || '')) || 0;
        if (tb !== ta) return tb - ta;
        return String(a?.profileId || '').localeCompare(String(b?.profileId || ''));
      });
    return String(validRows[0]?.profileId || '').trim();
  }

  function ensureProfileArg(commandType, commandArgv) {
    const argv = commandArgv && typeof commandArgv === 'object' ? { ...commandArgv } : {};
    if (String(argv?.profile || '').trim()) return argv;
    if (String(argv?.profiles || '').trim()) return argv;
    if (String(argv?.profilepool || '').trim()) return argv;
    const platform = normalizePlatformByCommandType(commandType);
    const profile = pickAutoProfile(platform);
    if (!profile) return argv;
    argv.profile = profile;
    return argv;
  }

  async function scheduleExecuteTask(task) {
    const runToken = createScheduleOwnerId();
    const policy = normalizeSchedulerPolicy(getSchedulerPolicy());
    const claim = claimScheduleTask(task, {
      ownerId: scheduleOwnerId,
      runToken,
      leaseMs: SCHEDULE_LEASE_MS,
      policy,
    });
    if (!claim.ok) {
      const skipReasons = new Set(['task_busy', 'resource_busy', 'max_concurrency', 'platform_max_concurrency']);
      if (skipReasons.has(claim.reason)) {
        markScheduleTaskSkipped(task?.id, { skippedAt: new Date().toISOString() });
      }
      return { ok: false, skipped: true, taskId: task?.id, reason: claim.reason };
    }
    const heartbeatMs = Math.max(5_000, Math.floor(SCHEDULE_LEASE_MS / 3));
    const heartbeat = setInterval(() => {
      renewScheduleTaskClaim(task.id, { ownerId: scheduleOwnerId, runToken, leaseMs: SCHEDULE_LEASE_MS });
    }, heartbeatMs);
    heartbeat.unref();
    const startedAt = Date.now();
    try {
      const commandType = String(task?.commandType || 'xhs-unified').trim();
      let commandArgv = ensureProfileArg(commandType, task?.commandArgv || {});
      if (task?.taskMode) commandArgv['task-mode'] = task.taskMode;

      // Build full CLI args and submit via daemon task system
      const cliArgs = [commandType];
      for (const [key, val] of Object.entries(commandArgv)) {
        if (val === undefined || val === null) continue;
        const flag = `--${key}`;
        if (val === true) { cliArgs.push(flag); continue; }
        if (val === false) continue;
        cliArgs.push(flag, String(val));
      }

      const ret = await startTaskJob({ args: cliArgs, wait: true });
      const durationMs = Date.now() - startedAt;

      const status = ret?.ok ? 'success' : 'failed';
      markScheduleTaskResult(task.id, {
        status,
        durationMs,
        runId: ret?.job?.id || null,
        finishedAt: new Date().toISOString(),
      });
      return { ok: ret?.ok, taskId: task.id, durationMs };
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      const message = error?.message || String(error);
      const retry = evaluateRetry(error, task);
      const riskControl = retry.errorType === 'risk_control' || /risk_control|n_detected|风控/i.test(message);
      markScheduleTaskResult(task.id, {
        status: 'failed',
        error: message,
        durationMs,
        finishedAt: new Date().toISOString(),
        retryAt: (retry.shouldRetry && !riskControl && task?.scheduleType === 'once') ? retry.retryAt : undefined,
        disable: riskControl,
      });
      return { ok: false, taskId: task.id, error: message };
    } finally {
      clearInterval(heartbeat);
      releaseScheduleTaskClaim(task.id, { ownerId: scheduleOwnerId, runToken });
    }
  }

  async function scheduleTick() {
    if (scheduleRunning || state.shuttingDown || !SCHEDULE_ENABLED) return;
    scheduleRunning = true;
    try {
      // Acquire lease on first tick
      if (!scheduleLeaseAcquired) {
        const lease = acquireScheduleDaemonLease({ ownerId: scheduleOwnerId, leaseMs: SCHEDULE_LEASE_MS });
        if (!lease.ok) return; // Another schedule daemon is running
        scheduleLeaseAcquired = true;
        const hbMs = Math.max(5_000, Math.floor(SCHEDULE_LEASE_MS / 3));
        setInterval(() => {
          renewScheduleDaemonLease({ ownerId: scheduleOwnerId, leaseMs: SCHEDULE_LEASE_MS });
        }, hbMs).unref();
      }
      const dueTasks = listDueScheduleTasks(10);
      for (const task of dueTasks) {
        if (state.shuttingDown) break;
        // Wait for no running jobs (daemon exclusive task policy)
        const activeJobs = state.jobsOrder.map((id) => state.jobs.get(id)).filter((j) => j && j.status === 'running');
        if (activeJobs.length > 0) break;
        await scheduleExecuteTask(task);
      }
    } catch (err) {
      logDaemonEvent('schedule_tick_error', { error: err?.message || String(err) });
    } finally {
      scheduleRunning = false;
    }
  }

  // Clean stale schedule locks on startup
  try {
    const staleResult = reapStaleLocks();
    if (staleResult.reaped > 0) {
      process.stdout.write(`[daemon] schedule: reaped ${staleResult.reaped} stale lock(s)\n`);
    }
  } catch {}

  scheduleOwnerId = createScheduleOwnerId();
  // First tick immediately (with 5s delay for daemon to stabilize)
  setTimeout(() => { void scheduleTick(); }, 5_000).unref();
  scheduleTickTimer = setInterval(() => { void scheduleTick(); }, SCHEDULE_TICK_INTERVAL_MS);
  scheduleTickTimer.unref();

  const shutdownDaemon = () => {
    // 关闭前清理所有 running job 的进程
    for (const job of state.jobs.values()) {
      if (job.status !== 'running' || !job.pid) continue;
      terminatePidTree(job.pid).then(() => {}).catch(() => {});
      job.status = 'stopped';
      job.code = -15;
      job.exitSignal = 'SIGTERM';
      job.finishedAt = nowIso();
    }
    // Release schedule lease on shutdown
    if (scheduleLeaseAcquired && scheduleOwnerId) {
      try {
        releaseScheduleDaemonLease({ ownerId: scheduleOwnerId });
      } catch {}
    }
    if (scheduleTickTimer) clearInterval(scheduleTickTimer);

    updateHeartbeat();
    try { server.close(); } catch {}
    cleanupRuntimeFiles();
    process.exit(0);
  };

  process.on('SIGINT', shutdownDaemon);
  process.on('SIGTERM', shutdownDaemon);
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
  webauto --daemon start|stop|status|restart|run
  webauto --daemon task submit [--wait] -- <webauto args...>
  webauto --daemon task status --job-id <id>
  webauto --daemon task list [--limit <n>] [--status <running|completed|failed|stopped>]
  webauto --daemon task stop --job-id <id>
  webauto --daemon task delete --job-id <id>

Notes:
  - \`--daemon\` 默认等价于 \`--daemon start\`
  - \`run\` 为前台运行，仅用于调试
  - task submit 默认后台 detached 立即返回；加 --wait 可改为同步等待
  - task submit 可把普通 CLI 命令经 daemon 调度执行
`);
}

async function main() {
  const rawArgv = process.argv.slice(2);
  const args = minimist(rawArgv, {
    boolean: ['help', 'json', 'detach', 'wait'],
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

  if (cmd === 'restart') {
    const stopRet = await requestDaemon({ method: 'shutdown', params: {} }).catch((error) => ({ ok: false, error: error?.message || String(error) }));
    if (!stopRet?.ok) {
      await forceStopByPidFile();
    }
    const stopped = await waitDaemonStopped(8_000);
    if (!stopped) {
      await forceStopByPidFile();
    }
    const status = await ensureDaemonStarted(undefined, { allowStart: true });
    print({ ok: true, restarted: true, status }, jsonMode);
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
    const ret = await requestDaemon({ method: 'task.status', params: { id } });
    print(ret, jsonMode);
    if (!ret?.ok) process.exit(1);
    return;
  }

  if (cmd === 'job-list') {
    await ensureDaemonStarted(undefined, { allowStart: true });
    const limit = Number(args._[1] || 20) || 20;
    const statusFilter = String(args.status || '').trim();
    const ret = await requestDaemon({ method: 'task.list', params: { limit, status: statusFilter } });
    print(ret, jsonMode);
    if (!ret?.ok) process.exit(1);
    return;
  }

  if (cmd === 'task') {
    const sub = String(args._[1] || '').trim().toLowerCase();
    if (sub === 'status') {
      await ensureDaemonStarted(undefined, { allowStart: true });
      const id = String(args['job-id'] || args._[2] || '').trim();
      const ret = await requestDaemon({ method: 'task.status', params: { id } });
      print(ret, jsonMode);
      if (!ret?.ok) process.exit(1);
      return;
    }
    if (sub === 'list') {
      await ensureDaemonStarted(undefined, { allowStart: true });
      const limit = Number(args._[2] || 20) || 20;
      const statusFilter = String(args.status || '').trim();
      const ret = await requestDaemon({ method: 'task.list', params: { limit, status: statusFilter } });
      print(ret, jsonMode);
      if (!ret?.ok) process.exit(1);
      return;
    }
    if (sub === 'stop') {
      await ensureDaemonStarted(undefined, { allowStart: true });
      const id = String(args['job-id'] || args._[2] || '').trim();
      const ret = await requestDaemon({ method: 'task.stop', params: { id } }, 60_000);
      print(ret, jsonMode);
      if (!ret?.ok) process.exit(1);
      return;
    }
    if (sub === 'delete') {
      await ensureDaemonStarted(undefined, { allowStart: true });
      const id = String(args['job-id'] || args._[2] || '').trim();
      const ret = await requestDaemon({ method: 'task.delete', params: { id } });
      print(ret, jsonMode);
      if (!ret?.ok) process.exit(1);
      return;
    }

    // task submit
    const taskArgs = resolveTaskArgs(rawArgv, cmd);
    if (taskArgs.length === 0) {
      print({ ok: false, error: 'missing task args' }, jsonMode);
      process.exit(1);
      return;
    }
    await ensureDaemonStarted(undefined, { allowStart: true });
    const wait = args.wait === true;
    const ret = await requestDaemon({ method: 'task.submit', params: { args: taskArgs, wait } }, 120_000);
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
