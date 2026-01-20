/**
 * 浏览器命令封装
 *
 * 封装对 Unified API 和 Browser Service 的调用，提供统一的命令接口。
 */

import { BROWSER_SERVICE, PROFILE, UNIFIED_API, HOME_URL } from '../env.mjs';

export async function browserServiceCommand(action, args = {}, timeoutMs = 30_000) {
  const url = `${BROWSER_SERVICE}/command`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, args }),
    signal: AbortSignal.timeout ? AbortSignal.timeout(timeoutMs) : undefined,
  });
  const raw = await res.text();
  const data = raw ? JSON.parse(raw) : {};
  if (!res.ok) {
    throw new Error(
      data?.error || data?.body?.error || `browser-service command "${action}" HTTP ${res.status}`,
    );
  }
  if (data && data.ok === false) {
    throw new Error(data.error || `browser-service command "${action}" failed`);
  }
  if (data && data.error) {
    throw new Error(data.error);
  }
  return data;
}

export async function controllerAction(action, payload = {}, timeoutMs = 20_000) {
  const res = await fetch(`${UNIFIED_API}/v1/controller/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload }),
    signal: AbortSignal.timeout ? AbortSignal.timeout(timeoutMs) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return data.data || data;
}

function extractSessions(payload) {
  if (!payload) return [];
  if (Array.isArray(payload.sessions)) return payload.sessions;
  if (Array.isArray(payload.data?.sessions)) return payload.data.sessions;
  if (Array.isArray(payload.result?.sessions)) return payload.result.sessions;
  if (payload.data) return extractSessions(payload.data);
  return [];
}

export async function listSessions() {
  const raw = await controllerAction('session:list', {});
  return extractSessions(raw);
}

export async function ensureProfileSessionExists() {
  const sessions = await listSessions().catch(() => []);
  const exists = sessions.some((s) => (s?.profileId || s?.profile_id) === PROFILE);
  
  if (!exists) {
    // 尝试启动 session
    console.log(`[Browser] Session ${PROFILE} not found, starting...`);
    await browserServiceCommand('start', { profileId: PROFILE, headless: true, url: HOME_URL });
    await delay(5000);
    
    // 二次确认
    const sessions2 = await listSessions().catch(() => []);
    return sessions2.some((s) => (s?.profileId || s?.profile_id) === PROFILE);
  }
  
  return true;
}

export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function formatDuration(ms) {
  const total = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${m}:${pad(s)}`;
}
