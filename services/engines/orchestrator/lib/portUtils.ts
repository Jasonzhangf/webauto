// @ts-nocheck
import { spawn } from 'node:child_process';

export async function killPort(port) {
  return new Promise((resolve) => {
    const cmd = process.platform === 'win32' ? `for /f "tokens=5" %a in ('netstat -aon ^| find ":${port} " ^| find "LISTENING"') do taskkill /f /pid %a` : `lsof -ti :${port} | xargs kill -9`;
    const p = spawn(cmd, { shell: true });
    p.on('close', () => resolve(true));
  });
}

export async function listPorts(ports) {
  return ports.map(p => ({ port: p, inUse: false }));
}

