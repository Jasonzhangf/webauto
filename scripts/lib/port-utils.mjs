import { execSync } from 'node:child_process';
import { createServer } from 'node:net';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function parsePidList(output) {
  return Array.from(
    new Set(
      String(output || '')
        .split(/\s+/)
        .map((value) => Number(value.trim()))
        .filter((value) => Number.isInteger(value) && value > 0)
    )
  );
}

function listListeningPids(port) {
  try {
    if (process.platform === 'win32') {
      const output = execSync(`netstat -ano -p tcp | findstr :${port}`, { encoding: 'utf8' });
      const pids = [];
      for (const line of String(output || '').split(/\r?\n/)) {
        if (!line.includes('LISTENING')) continue;
        const parts = line.trim().split(/\s+/);
        const pid = Number(parts[parts.length - 1]);
        if (Number.isInteger(pid) && pid > 0) pids.push(pid);
      }
      return Array.from(new Set(pids));
    }

    const output = execSync(`lsof -nP -iTCP:${port} -sTCP:LISTEN -t || true`, { encoding: 'utf8' });
    return parsePidList(output);
  } catch {
    return [];
  }
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function tryKill(pid, signal) {
  const value = Number(pid);
  if (!Number.isInteger(value) || value <= 0) return false;
  try {
    if (process.platform === 'win32') {
      const args = ['/PID', String(value), '/T'];
      if (signal === 'SIGKILL') args.push('/F');
      execSync(`taskkill ${args.join(' ')}`, { stdio: 'ignore' });
      return true;
    }
    process.kill(value, signal);
    return true;
  } catch {
    return false;
  }
}

export async function checkPortInUse(port) {
  return new Promise((resolve) => {
    const server = createServer();
    let done = false;

    const settle = (value) => {
      if (done) return;
      done = true;
      resolve(value);
    };

    server.once('error', (err) => {
      settle(err?.code === 'EADDRINUSE');
    });

    server.once('listening', () => {
      server.close(() => settle(false));
    });

    try {
      server.listen({ host: '127.0.0.1', port, exclusive: true });
    } catch (err) {
      settle(err?.code === 'EADDRINUSE');
    }
  });
}

export async function releasePort(port, options = {}) {
  const { excludePids = [], logger = () => {} } = options;
  const blocked = await checkPortInUse(port);
  if (!blocked) return true;

  const excluded = new Set(excludePids.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0));
  const pids = listListeningPids(port).filter((pid) => !excluded.has(pid));

  if (pids.length === 0) {
    logger(`releasePort: no killable listener found on :${port}`, 'WARN');
    return !(await checkPortInUse(port));
  }

  logger(`releasePort: terminating listeners on :${port} -> ${pids.join(',')}`, 'WARN');

  for (const pid of pids) {
    tryKill(pid, 'SIGTERM');
  }
  await delay(500);

  for (const pid of pids) {
    if (!isProcessAlive(pid)) continue;
    logger(`releasePort: force killing pid=${pid} on :${port}`, 'WARN');
    tryKill(pid, 'SIGKILL');
  }
  await delay(200);

  return !(await checkPortInUse(port));
}
