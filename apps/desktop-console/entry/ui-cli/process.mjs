import { spawn } from 'node:child_process';
import {
  DESKTOP_MAIN_MARKER,
  parseIntSafe,
} from './constants.mjs';

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isProcessAlive(pid) {
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

export async function terminatePid(pid) {
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

export function commandLineMatchesDesktopMain(commandLine) {
  const normalized = String(commandLine || '').replace(/\\/g, '/').toLowerCase();
  if (!normalized) return false;
  return normalized.includes(DESKTOP_MAIN_MARKER);
}

export function runCommandCapture(cmd, argv = [], timeoutMs = 12_000) {
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

export function runCommandStream(cmd, argv = [], options = {}) {
  const budgetMs = Number(options.timeoutMs) || 0;
  const forwardOutput = options.forwardOutput === true;
  const env = options.env ? { ...process.env, ...options.env } : process.env;
  const cwd = options.cwd || process.cwd();
  return new Promise((resolve) => {
    const child = spawn(cmd, argv, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
      cwd,
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
    const timer = budgetMs > 0
      ? setTimeout(() => {
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
          timedOut: true,
        });
      }, budgetMs)
      : null;
    child.stdout?.on('data', (chunk) => {
      const text = String(chunk || '');
      stdout += text;
      if (forwardOutput) process.stdout.write(text);
    });
    child.stderr?.on('data', (chunk) => {
      const text = String(chunk || '');
      stderr += text;
      if (forwardOutput) process.stderr.write(text);
    });
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
