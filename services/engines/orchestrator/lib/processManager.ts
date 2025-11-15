// @ts-nocheck
import { spawn } from 'node:child_process';

export function startNodeProcess({ name, script, onLog }) {
  const proc = spawn(process.execPath, [script], { stdio: ['ignore', 'pipe', 'pipe'] });
  proc.stdout.on('data', d => onLog(name, d.toString()));
  proc.stderr.on('data', d => onLog(name, d.toString(), true));
  return proc;
}

export async function waitForHealth(url, { timeoutMs = 20000 } = {}) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const r = await fetch(url);
      if (r.ok) return true;
    } catch {}
    await new Promise(r => setTimeout(r, 1000));
  }
  return false;
}

