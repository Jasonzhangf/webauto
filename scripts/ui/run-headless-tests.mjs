#!/usr/bin/env node
import { spawn } from 'node:child_process';
import net from 'node:net';

const profile = process.env.WEBAUTO_UI_TEST_PROFILE || 'weibo-fresh';
const targetUrl = process.env.WEBAUTO_UI_TEST_URL || 'https://weibo.com/';
const busPort = Number(process.env.WEBAUTO_FLOATING_BUS_PORT || 8790);
const busHost = process.env.WEBAUTO_FLOATING_BUS_HOST || '127.0.0.1';
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

async function waitForPort(port, host, timeoutMs = 45000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.createConnection({ port, host }, () => {
        socket.end();
        resolve(true);
      });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`waitForPort timeout: ${host}:${port}`));
        } else {
          setTimeout(attempt, 500);
        }
      });
    };
    attempt();
  });
}

function runDevDriver() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/ui/dev-driver.mjs'], {
      stdio: 'inherit',
      env: process.env,
    });
    child.on('exit', (code) => {
      if (code === 0) resolve(0);
      else reject(new Error(`dev-driver exited with code ${code}`));
    });
    child.on('error', reject);
  });
}

async function main() {
  if (process.env.WEBAUTO_SKIP_UI_TEST === '1') {
    console.log('[ui-test] skipped via WEBAUTO_SKIP_UI_TEST=1');
    return;
  }
  console.log('[ui-test] launching one-click browser in headless dev mode...');
  const env = {
    ...process.env,
    WEBAUTO_FLOATING_HEADLESS: '1',
    WEBAUTO_FLOATING_BUS_PORT: String(busPort),
  };
  const args = [
    'run',
    'browser:oneclick',
    '--',
    '--profile',
    profile,
    '--url',
    targetUrl,
    '--headless',
    '--dev',
  ];
  const child = spawn(npmCmd, args, { stdio: 'inherit', env });

  const cleanup = () => {
    try {
      child.kill('SIGTERM');
    } catch {}
  };

  child.on('exit', (code) => {
    if (code && code !== 0) {
      console.warn('[ui-test] one-click exited with code', code);
    }
  });

  try {
    await waitForPort(busPort, busHost, 45000);
    console.log('[ui-test] floating console bus ready, running driver...');
    await runDevDriver();
    console.log('[ui-test] driver completed');
  } finally {
    cleanup();
  }
}

main().catch((err) => {
  console.error('[ui-test] failed', err?.message || err);
  process.exit(1);
});
