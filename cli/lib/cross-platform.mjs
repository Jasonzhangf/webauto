/**
 * Cross-platform utilities for wa CLI.
 */

import { execSync } from 'child_process';

export const isWindows = process.platform === 'win32';
export const isMac = process.platform === 'darwin';
export const isLinux = process.platform === 'linux';

/**
 * Get npm command for current platform.
 */
export function npmCmd() {
  return isWindows ? 'npm.cmd' : 'npm';
}

/**
 * Get npx command for current platform.
 */
export function npxCmd() {
  return isWindows ? 'npx.cmd' : 'npx';
}

/**
 * Get python command for current platform.
 */
export function pythonCmd() {
  return isWindows ? 'python' : 'python3';
}

/**
 * Run a shell command and return output.
 */
export function runCmd(cmd, opts = {}) {
  try {
    const out = execSync(cmd, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: opts.timeout || 30000,
      cwd: opts.cwd,
      env: { ...process.env, ...opts.env },
    });
    return { ok: true, stdout: out.trim(), stderr: '' };
  } catch (err) {
    return { ok: false, stdout: (err.stdout || '').trim(), stderr: (err.stderr || '').trim(), code: err.status };
  }
}
