import { spawn } from 'node:child_process';

const SEARCH_URL = 'https://www.xiaohongshu.com/explore';

async function controllerAction(action, payload, apiUrl) {
  const res = await fetch(`${apiUrl}/v1/controller/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload }),
  });
  const data = await res.json().catch(() => ({}));
  return data.data || data;
}

async function checkHealth(url) {
  try {
    const res = await fetch(url);
    return res.ok;
  } catch {
    return false;
  }
}

export async function ensureServicesHealthy({ allowRestart = false } = {}) {
  const uOk = await checkHealth(CORE_DAEMON_URL + "/health");
  const bOk = await checkHealth(CORE_DAEMON_URL + "/health");
  const sOk = await checkHealth(CORE_DAEMON_URL + "/health");

  if (uOk && bOk && sOk) return;

  const action = allowRestart ? 'restart' : 'start';
  await new Promise((resolve, reject) => {
    const child = spawn('node', ['scripts/core-daemon.mjs', action], { stdio: 'inherit' });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`core-daemon ${action} exit ${code}`))));
    child.on('error', reject);
  });
}

export async function restoreBrowserState(profile, apiUrl = CORE_DAEMON_URL) {
  try {
    const listRes = await controllerAction('browser:page:list', { profile }, apiUrl);
    const pages = listRes?.pages || listRes?.data?.pages || [];
    // close all tabs except index 0
    for (const p of pages) {
      if (p.index !== 0) {
        await controllerAction('browser:page:close', { profile, index: p.index }, apiUrl).catch(() => null);
      }
    }
    // switch to tab 0 and navigate to search page
    await controllerAction('browser:page:switch', { profile, index: 0 }, apiUrl).catch(() => null);
    await controllerAction('browser:goto', { profile, url: SEARCH_URL }, apiUrl).catch(() => null);
  } catch {
    // ignore
  }
}

export async function restartCoreServices() {
  await new Promise((resolve, reject) => {
    const child = spawn('node', ['scripts/core-daemon.mjs', 'restart'], { stdio: 'inherit' });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`core-daemon restart exit ${code}`))));
    child.on('error', reject);
  });
}
