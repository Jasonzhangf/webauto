/**
 * 浏览器命令封装 (camo CLI 版本)
 *
 * 封装对 camo CLI 的调用，提供统一的命令接口。
 */

import { spawn } from 'child_process';
import { BROWSER_SERVICE, PROFILE, UNIFIED_API, HOME_URL } from '../env.mjs';

async function camoCommand(args, timeoutMs = 30_000) {
  return new Promise((resolve, reject) => {
    const child = spawn('camo', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (data) => { stdout += data; });
    child.stderr.on('data', (data) => { stderr += data; });
    
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`camo command timeout: ${args.join(' ')}`));
    }, timeoutMs);
    
    child.on('close', (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(`camo exit ${code}: ${stderr || stdout}`));
        return;
      }
      try {
        const result = JSON.parse(stdout);
        resolve(result);
      } catch {
        resolve({ ok: true, raw: stdout });
      }
    });
  });
}

export async function browserServiceCommand(action, args = {}, timeoutMs = 30_000) {
  // Map browser-service actions to camo CLI commands
  const camoArgs = mapToCamoArgs(action, args, PROFILE);
  return camoCommand(camoArgs, timeoutMs);
}

function mapToCamoArgs(action, args, profile) {
  const profileId = args.profileId || profile;
  
  switch (action) {
    case 'start':
      return ['start', profileId, '--url', args.url || HOME_URL, args.headless ? '--headless' : ''];
    case 'stop':
      return ['stop', profileId];
    case 'goto':
      return ['goto', profileId, args.url];
    case 'getStatus':
    case 'status':
      return ['status'];
    case 'screenshot':
      return args.output 
        ? ['screenshot', profileId, '--output', args.output]
        : ['screenshot', profileId];
    case 'saveCookies':
      return ['cookies', 'save', profileId, '--path', args.path];
    case 'loadCookies':
      return ['cookies', 'load', profileId, '--path', args.path];
    case 'autoCookies:start':
      return ['cookies', 'auto', 'start', profileId, '--interval', String(args.intervalMs || 2500)];
    case 'autoCookies:stop':
      return ['cookies', 'auto', 'stop', profileId];
    case 'mouse:click':
      return ['mouse', 'click', profileId, '--x', String(args.x), '--y', String(args.y), 
              args.button ? `--button ${args.button}` : '',
              args.clicks ? `--clicks ${args.clicks}` : ''];
    case 'mouse:move':
      return ['mouse', 'move', profileId, '--x', String(args.x), '--y', String(args.y)];
    case 'mouse:wheel':
      return ['mouse', 'wheel', profileId, 
              args.deltaX ? `--deltax ${args.deltaX}` : '',
              args.deltaY ? `--deltay ${args.deltaY}` : ''];
    case 'evaluate':
      // camo CLI 不直接支持 evaluate，需要通过 controller
      throw new Error('evaluate not supported in camo CLI, use controllerAction');
    default:
      throw new Error(`Unknown action: ${action}`);
  }
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
  // Use camo CLI sessions command
  const result = await camoCommand(['sessions']);
  return extractSessions(result);
}

export async function ensureProfileSessionExists() {
  // Use camo CLI to check sessions
  const result = await camoCommand(['sessions']).catch(() => ({ sessions: [] }));
  const sessions = result.sessions || [];
  const exists = sessions.some((s) => (s?.profileId || s?.profile_id) === PROFILE);
  
  if (!exists) {
    // Try to start session with camo
    console.log(`[Browser] Session ${PROFILE} not found, starting with camo...`);
    await camoCommand(['start', PROFILE, '--url', HOME_URL]);
    await delay(5000);
    
    // Double check
    const result2 = await camoCommand(['sessions']).catch(() => ({ sessions: [] }));
    const sessions2 = result2.sessions || [];
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
