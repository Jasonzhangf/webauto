import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { existsSync, promises as fs } from 'node:fs';
import { appendRunLog } from './lifecycle.mts';
import { trackBrowserProcess } from './process-cleanup.mts';
import { GroupQueue } from './queue.mts';
import { getRunLifecycle, setRunLifecycle } from './run-lifecycle.mts';
import type { CmdEvent, RunJsonSpec, SpawnSpec } from './types.mts';

const groupQueues = new Map<string, GroupQueue>();
const runs = new Map<string, { child: ReturnType<typeof spawn>; title: string; startedAt: number; profiles?: string[] }>();
const trackedRunPids = new Set<number>();

function now() {
  return Date.now();
}

function generateRunId() {
  return `run_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

function getQueue(groupKey: string) {
  const key = groupKey || 'default';
  let q = groupQueues.get(key);
  if (!q) {
    q = new GroupQueue();
    groupQueues.set(key, q);
  }
  return q;
}

export function listRunIds() {
  return Array.from(runs.keys());
}

export function hasRuns() {
  return runs.size > 0;
}

export function getRunCount() {
  return runs.size;
}

export function hasRunId(runId: string) {
  const rid = String(runId || '').trim();
  if (!rid) return false;
  return runs.has(rid);
}

export function getTrackedRunPidCount() {
  return trackedRunPids.size;
}

export function resolveCwd(repoRoot: string, input?: string) {
  const raw = String(input || '').trim();
  if (!raw) return repoRoot;
  return path.isAbsolute(raw) ? raw : path.resolve(repoRoot, raw);
}

export function resolveNodeBin() {
  const explicit = String(process.env.WEBAUTO_NODE_BIN || '').trim();
  if (explicit) return explicit;
  const npmNode = String(process.env.npm_node_execpath || '').trim();
  if (npmNode) {
    const base = path.basename(npmNode).toLowerCase();
    const isNode = base === 'node' || base === 'node.exe';
    if (isNode && existsSync(npmNode)) return npmNode;
  }

  const pathEnv = String(process.env.PATH || process.env.Path || '').trim();
  if (pathEnv) {
    const dirs = pathEnv.split(path.delimiter).filter(Boolean);
    const names = process.platform === 'win32' ? ['node.exe', 'node.cmd', 'node'] : ['node'];
    for (const dir of dirs) {
      for (const name of names) {
        const full = path.join(dir, name);
        if (existsSync(full)) return full;
      }
    }
  }

  if (process.platform === 'darwin') {
    const macCandidates = [
      '/opt/homebrew/bin/node',
      '/usr/local/bin/node',
      '/usr/bin/node',
    ];
    for (const candidate of macCandidates) {
      if (existsSync(candidate)) return candidate;
    }
  } else if (process.platform === 'linux') {
    const linuxCandidates = ['/usr/bin/node', '/usr/local/bin/node'];
    for (const candidate of linuxCandidates) {
      if (existsSync(candidate)) return candidate;
    }
  } else if (process.platform === 'win32') {
    const winCandidates = [
      path.join(String(process.env.ProgramFiles || 'C:\\Program Files'), 'nodejs', 'node.exe'),
      path.join(String(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'), 'nodejs', 'node.exe'),
      path.join(String(process.env.LOCALAPPDATA || ''), 'Programs', 'nodejs', 'node.exe'),
    ].filter((item) => String(item || '').trim().length > 0);
    for (const candidate of winCandidates) {
      if (existsSync(candidate)) return candidate;
    }
  }
  return process.platform === 'win32' ? 'node.exe' : 'node';
}

export function isPidAlive(pid: number): boolean {
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
    const lines = out.split(/\r?\n/g).map((line) => line.trim()).filter(Boolean);
    return lines.some((line) => line.includes(` ${target}`));
  }
  try {
    process.kill(target, 0);
    return true;
  } catch {
    return false;
  }
}

export function createLineEmitter(runId: string, type: 'stdout' | 'stderr', onLine?: (line: string) => void, sendEvent?: (evt: CmdEvent) => void) {
  let pending = '';

  const emit = (line: string) => {
    const normalized = String(line || '').replace(/\r$/, '');
    if (!normalized) return;
    if (sendEvent) sendEvent({ type, runId, line: normalized, ts: now() });
    if (typeof onLine === 'function') onLine(normalized);
  };

  return {
    push(chunk: Buffer) {
      pending += chunk.toString('utf8');
      let idx = pending.indexOf('\n');
      while (idx >= 0) {
        const line = pending.slice(0, idx);
        pending = pending.slice(idx + 1);
        emit(line);
        idx = pending.indexOf('\n');
      }
    },
    flush() {
      if (!pending) return;
      emit(pending);
      pending = '';
    },
  };
}

export function terminateRunProcess(runId: string, reason: string, emitEvent: (evt: CmdEvent) => void) {
  if (reason === 'window_closed') {
    emitEvent({ type: 'stderr', runId, line: '[watchdog] skip kill on window_closed; use ui stop', ts: now() });
    return false;
  }
  const run = runs.get(runId);
  if (!run) return false;
  const child = run.child;
  const pid = Number(child.pid || 0);

  try {
    if (process.platform === 'win32') {
      if (pid > 0) {
        spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
      }
    } else {
      if (pid > 0) {
        try { process.kill(pid, 'SIGTERM'); } catch {}
      }
    }
  } catch {
    // ignore
  }

  try {
    child.kill('SIGTERM');
  } catch {
    // ignore
  }

  emitEvent({ type: 'stderr', runId, line: `[watchdog] kill requested (${reason})`, ts: now() });
  return true;
}

export function trackRunPid(child: ReturnType<typeof spawn>) {
  const pid = Number(child?.pid || 0);
  if (pid > 0) trackedRunPids.add(pid);
}

export function untrackRunPid(child: ReturnType<typeof spawn>) {
  const pid = Number(child?.pid || 0);
  if (pid > 0) trackedRunPids.delete(pid);
}

export async function cleanupTrackedRunPidsBestEffort(reason: string) {
  for (const pid of Array.from(trackedRunPids.values())) {
    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
      } else {
        process.kill(pid, 'SIGTERM');
      }
    } catch {
      // ignore
    }
    trackedRunPids.delete(pid);
  }
  if (trackedRunPids.size > 0) {
    console.warn(`[desktop-console] residual run pids after cleanup (${reason}): ${trackedRunPids.size}`);
    trackedRunPids.clear();
  }
}

export async function spawnCommand(repoRoot: string, spec: SpawnSpec, emitEvent: (evt: CmdEvent) => void) {
  const runId = generateRunId();
  const groupKey = spec.groupKey || 'xiaohongshu';
  const q = getQueue(groupKey);
  const cwd = resolveCwd(repoRoot, spec.cwd);
  const args = Array.isArray(spec.args) ? spec.args : [];
  appendRunLog(runId, `[queued] title=${String(spec.title || '').trim() || '-'} cwd=${cwd}`);
  setRunLifecycle(runId, {
    state: 'queued',
    title: String(spec.title || ''),
    queuedAt: now(),
  });

  const isXhsRunCommand = args.some((item) => /xhs-(orchestrate|unified)\.mjs$/i.test(String(item || '').replace(/\\/g, '/')));
  const extractProfilesFromArgs = (argv: string[]) => {
    const out: string[] = [];
    for (let i = 0; i < argv.length; i += 1) {
      const flag = String(argv[i] || '').trim();
      if (flag === '--profile' || flag === '--profile-id') {
        const value = String(argv[i + 1] || '').trim();
        if (value) out.push(value);
      } else if (flag === '--profiles') {
        const value = String(argv[i + 1] || '').trim();
        if (value) {
          value.split(',').map((v) => v.trim()).filter(Boolean).forEach((v) => out.push(v));
        }
      }
    }
    return Array.from(new Set(out));
  };
  const requestedProfiles = isXhsRunCommand ? extractProfilesFromArgs(args) : [];
  if (requestedProfiles.length > 0) {
    for (const run of runs.values()) {
      const activeProfiles = Array.isArray(run.profiles) ? run.profiles : [];
      const conflict = requestedProfiles.find((p) => activeProfiles.includes(p));
      if (conflict) {
        throw new Error(`profile already running: ${conflict}`);
      }
    }
  }

  q.enqueue(
    () =>
      new Promise<void>((resolve) => {
        let finished = false;
        let exitCode: number | null = null;
        let exitSignal: string | null = null;
        let orphanCheckTimer: NodeJS.Timeout | null = null;
        const finalize = (code: number | null, signal: string | null) => {
          if (finished) return;
          finished = true;
          if (orphanCheckTimer) {
            clearInterval(orphanCheckTimer);
            orphanCheckTimer = null;
          }
          setRunLifecycle(runId, {
            state: 'exited',
            exitedAt: now(),
            exitCode: code,
            signal,
          });
          emitEvent({ type: 'exit', runId, exitCode: code, signal, ts: now() });
          appendRunLog(runId, `[exit] code=${code ?? 'null'} signal=${signal ?? 'null'}`);
          runs.delete(runId);
          resolve();
        };

        let child: ReturnType<typeof spawn>;
        try {
          const nodeBin = resolveNodeBin();
          appendRunLog(runId, `[cmd] ${nodeBin}`);
          child = spawn(nodeBin, args, {
            cwd,
            env: {
              ...process.env,
              ...(spec.env || {}),
            },
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true,
          });
        } catch (err: any) {
          const message = err?.message || String(err);
          setRunLifecycle(runId, {
            state: 'exited',
            exitedAt: now(),
            exitCode: null,
            signal: 'spawn_exception',
            lastError: message,
          });
          emitEvent({ type: 'stderr', runId, line: `[spawn-throw] ${message}`, ts: now() });
          appendRunLog(runId, `[spawn-throw] ${message}`);
          finalize(null, 'spawn_exception');
          return;
        }

        const stdoutLines = createLineEmitter(runId, 'stdout', (line) => appendRunLog(runId, `[stdout] ${line}`), emitEvent);
        const stderrLines = createLineEmitter(runId, 'stderr', (line) => appendRunLog(runId, `[stderr] ${line}`), emitEvent);
        try {
          child.stdout?.on('data', (chunk: Buffer) => {
            stdoutLines.push(chunk);
          });
          child.stderr?.on('data', (chunk: Buffer) => {
            const text = chunk.toString('utf8');
            const lines = text.split(/\r?\n/g).map((line) => line.trim()).filter(Boolean);
            if (lines.length > 0) {
              setRunLifecycle(runId, { lastError: lines[lines.length - 1] });
            }
            stderrLines.push(chunk);
          });
          child.on('error', (err: any) => {
            const message = err?.message || String(err);
            setRunLifecycle(runId, { lastError: message });
            emitEvent({ type: 'stderr', runId, line: `[spawn-error] ${message}`, ts: now() });
            appendRunLog(runId, `[spawn-error] ${message}`);
            finalize(null, 'error');
          });
          child.on('exit', (code, signal) => {
            exitCode = code;
            exitSignal = signal;
            const timer = setTimeout(() => {
              if (finished) return;
              untrackRunPid(child);
              stdoutLines.flush();
              stderrLines.flush();
              finalize(exitCode ?? null, exitSignal ?? null);
            }, 200);
            if (timer && typeof (timer as any).unref === 'function') {
              (timer as any).unref();
            }
          });
          child.on('close', (code, signal) => {
            untrackRunPid(child);
            stdoutLines.flush();
            stderrLines.flush();
            finalize(exitCode ?? code ?? null, exitSignal ?? signal ?? null);
          });
        } catch (err: any) {
          const message = err?.message || String(err);
          setRunLifecycle(runId, { lastError: message });
          emitEvent({ type: 'stderr', runId, line: `[spawn-setup-error] ${message}`, ts: now() });
          appendRunLog(runId, `[spawn-setup-error] ${message}`);
          finalize(null, 'setup_error');
          return;
        }

        trackRunPid(child);
        if (child.pid) trackBrowserProcess(child.pid);
        runs.set(runId, { child, title: spec.title, startedAt: now(), profiles: requestedProfiles });
        setRunLifecycle(runId, {
          state: 'running',
          startedAt: now(),
          pid: child.pid || -1,
          title: String(spec.title || ''),
        });
        emitEvent({ type: 'started', runId, title: spec.title, pid: child.pid ?? -1, ts: now() });
        appendRunLog(runId, `[started] pid=${child.pid ?? -1} title=${String(spec.title || '').trim() || '-'}`);
        if (args.length > 0) {
          appendRunLog(runId, `[args] ${args.join(' ')}`);
        }
        const pid = Number(child.pid || 0);
        if (pid > 0) {
          orphanCheckTimer = setInterval(() => {
            if (finished) return;
            if (!isPidAlive(pid)) {
              untrackRunPid(child);
              stdoutLines.flush();
              stderrLines.flush();
              appendRunLog(runId, '[watchdog] child pid disappeared before close/exit event');
              finalize(exitCode, exitSignal || 'pid_gone');
            }
          }, 1000);
          if (orphanCheckTimer && typeof (orphanCheckTimer as any).unref === 'function') {
            (orphanCheckTimer as any).unref();
          }
        }
      }),
  );

  return { runId };
}

export async function runJson(repoRoot: string, spec: RunJsonSpec) {
  const timeoutRaw = Number(spec.timeoutMs);
  const timeoutMs = Number.isFinite(timeoutRaw) ? Math.floor(timeoutRaw) : 20_000;
  const cwd = resolveCwd(repoRoot, spec.cwd);
  const child = spawn(resolveNodeBin(), spec.args, {
    cwd,
    env: { ...process.env, ...(spec.env || {}) },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];

  child.stdout?.on('data', (c: Buffer) => stdout.push(c));
  child.stderr?.on('data', (c: Buffer) => stderr.push(c));

  let timer: NodeJS.Timeout | null = null;
  if (timeoutMs > 0) {
    timer = setTimeout(() => {
      try {
        child.kill('SIGTERM');
      } catch {
        // ignore
      }
    }, timeoutMs);
  }

  const { code } = await new Promise<{ code: number | null }>((resolve) => {
    child.on('exit', (c) => resolve({ code: c }));
  });
  if (timer) clearTimeout(timer);

  const out = Buffer.concat(stdout).toString('utf8').trim();
  const err = Buffer.concat(stderr).toString('utf8').trim();

  if (code !== 0) {
    return { ok: false, code, stdout: out, stderr: err };
  }

  try {
    const json = JSON.parse(out);
    return { ok: true, code, json };
  } catch {
    return { ok: true, code, stdout: out, stderr: err };
  }
}

export function createRunManager(repoRoot: string, emitEvent: (evt: CmdEvent) => void) {
  return {
    spawnCommand: (spec: SpawnSpec) => spawnCommand(repoRoot, spec, emitEvent),
    runJson: (spec: RunJsonSpec) => runJson(repoRoot, spec),
    terminateRunProcess: (runId: string, reason: string) => terminateRunProcess(runId, reason, emitEvent),
  };
}
