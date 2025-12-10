#!/usr/bin/env node
import { spawn } from 'node:child_process';
import net from 'node:net';

const profile = process.env.WEBAUTO_UI_TEST_PROFILE || 'weibo-fresh';
const targetUrl = process.env.WEBAUTO_UI_TEST_URL || 'https://weibo.com/';
const busPort = Number(process.env.WEBAUTO_FLOATING_BUS_PORT || 8790);
const busHost = process.env.WEBAUTO_FLOATING_BUS_HOST || '127.0.0.1';
const browserServicePort = Number(process.env.WEBAUTO_BROWSER_SERVICE_PORT || 7704);
const browserServiceHost = process.env.WEBAUTO_BROWSER_SERVICE_HOST || '127.0.0.1';
const browserHealthPath = process.env.WEBAUTO_BROWSER_SERVICE_HEALTH || '/health';
const browserHealthUrl = `http://${browserServiceHost}:${browserServicePort}${browserHealthPath}`;
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const driverStartDelayMs = Number(process.env.WEBAUTO_UI_TEST_DRIVER_DELAY || '10000');

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

async function waitForHealth(url, timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (res.ok) {
        return true;
      }
    } catch {
      /* ignore failures */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`waitForHealth timeout: ${url}`);
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

function runHighlightSmoke(profileId) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/ui/highlight-smoke.mjs'], {
      stdio: 'inherit',
      env: {
        ...process.env,
        WEBAUTO_UI_TEST_PROFILE: profileId,
        WEBAUTO_BROWSER_WS_HOST: process.env.WEBAUTO_BROWSER_WS_HOST || '127.0.0.1',
        WEBAUTO_BROWSER_WS_PORT: process.env.WEBAUTO_BROWSER_WS_PORT || '8765',
      },
    });
    child.on('exit', (code) => {
      if (code === 0) resolve(0);
      else reject(new Error(`highlight-smoke exited with code ${code}`));
    });
    child.on('error', reject);
  });
}

function runHoverSmoke(profileId, busHost, busPort) {
  const busUrl = process.env.WEBAUTO_FLOATING_BUS_URL || `ws://${busHost}:${busPort}`;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/ui/hover-highlight-smoke.mjs'], {
      stdio: 'inherit',
      env: {
        ...process.env,
        WEBAUTO_UI_TEST_PROFILE: profileId,
        WEBAUTO_FLOATING_BUS_URL: busUrl,
      },
    });
    child.on('exit', (code) => {
      if (code === 0) resolve(0);
      else reject(new Error(`hover-highlight-smoke exited with code ${code}`));
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
    await waitForHealth(browserHealthUrl, 45000);
    if (driverStartDelayMs > 0) {
      console.log(`[ui-test] waiting ${driverStartDelayMs}ms before starting driver...`);
      await new Promise((resolve) => setTimeout(resolve, driverStartDelayMs));
    }
    console.log('[ui-test] floating console bus ready, running driver...');
    await runDevDriver();
    console.log('[ui-test] driver completed');
    await runHighlightSmoke(profile);
    console.log('[ui-test] highlight smoke passed');
    await runHoverSmoke(profile, busHost, busPort);
    console.log('[ui-test] hover highlight smoke passed');
  } finally {
    cleanup();
  }
}

main().catch((err) => {
  console.error('[ui-test] failed', err?.message || err);
  process.exit(1);
});
