import { CORE_DAEMON_URL } from './core-daemon.mjs';
/**
 * 服务管理模块 (camo CLI 版本)
 *
 * 负责：
 * - 健康检查
 * - 启动 Unified API
 * - 使用 camo CLI 管理浏览器会话
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

import { CONFIG } from './env.mjs';

const DEFAULT_SERVICE_SPECS = (repoRoot) => [
  {
    key: 'unified-api',
    label: 'Unified API',
    healthUrl: 'http://127.0.0.1:7701/health',
    script: path.join(repoRoot, 'dist', 'services', 'unified-api', 'server.js'),
    env: { PORT: '7701', NODE_ENV: 'production' },
    startTimeoutMs: 30_000,
  },
  // browser-service 由 camo CLI 管理，不再作为独立服务启动
];

const DEFAULT_HEARTBEAT_FILE = path.join(os.homedir(), '.webauto', 'run', 'xhs-heartbeat.json');

function ensureHeartbeatEnv() {
  if (process.env.WEBAUTO_HEARTBEAT_FILE) return;
  process.env.WEBAUTO_HEARTBEAT_FILE = DEFAULT_HEARTBEAT_FILE;
}

function serviceLabel(spec) {
  return spec?.label || spec?.key || 'service';
}

export async function checkServiceHealth(url, timeoutMs = 2000) {
  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout ? AbortSignal.timeout(timeoutMs) : undefined,
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function waitForServiceHealthy(spec) {
  const timeout = spec.startTimeoutMs || 30_000;
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const ok = await checkServiceHealth(spec.healthUrl);
    if (ok) return true;
    await delay(1500);
  }
  return false;
}

async function runNodeScript(scriptPath, args = [], { cwd } = {}) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd,
      stdio: 'inherit',
      windowsHide: true,
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`node ${path.basename(scriptPath)} exited with code ${code}`));
    });
  });
}

async function tryStartCoreDaemon(root) {
  const daemonPath = path.join(root, 'scripts', 'core-daemon.mjs');
  if (!fs.existsSync(daemonPath)) return false;
  try {
    console.log('[Services] core-daemon start...');
    await runNodeScript(daemonPath, ['start'], { cwd: root });
    return true;
  } catch (err) {
    console.warn(`[Services] core-daemon start failed: ${err?.message || err}`);
    return false;
  }
}

export async function startNodeService(spec, { repoRoot } = {}) {
  const scriptPath = spec.script;
  if (!fs.existsSync(scriptPath)) {
    throw new Error(
      `${serviceLabel(spec)} script not found: ${scriptPath}. 请先运行 npm run build:services`,
    );
  }

  try {
    const child = spawn('node', [scriptPath], {
      cwd: repoRoot,
      env: { ...process.env, ...spec.env },
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.unref();
    console.log(`[Services] ${serviceLabel(spec)} 启动命令已下发 (pid=${child.pid})`);
  } catch (err) {
    throw new Error(`启动 ${serviceLabel(spec)} 失败: ${err?.message || err}`);
  }

  const healthy = await waitForServiceHealthy(spec);
  if (!healthy) {
    throw new Error(`${serviceLabel(spec)} 启动后健康检查失败 (${spec.healthUrl})`);
  }
  console.log(`[Services] ${serviceLabel(spec)} ✅ 在线`);
}

export async function ensureBaseServices({ repoRoot } = {}) {
  console.log('0️⃣ Phase1: 确认基础服务（Unified API）按依赖顺序就绪...');
  ensureHeartbeatEnv();

  const root = repoRoot || process.cwd();
  const specs = DEFAULT_SERVICE_SPECS(root);

  let needStart = false;
  for (const spec of specs) {
    const healthy = await checkServiceHealth(spec.healthUrl);
    if (!healthy) {
      needStart = true;
      break;
    }
  }

  if (needStart) {
    await tryStartCoreDaemon(root);
  }

  for (const spec of specs) {
    const label = serviceLabel(spec);
    const healthy = await checkServiceHealth(spec.healthUrl);
    if (healthy) {
      console.log(`[Services] ${label} 已在线 (${spec.healthUrl})`);
      continue;
    }
    console.log(`[Services] ${label} 未检测到，准备启动...`);
    await startNodeService(spec, { repoRoot: root });
  }
  
  // Browser service 由 camo CLI 管理，确保 camo init 已执行
  await ensureCamoReady();
}

async function ensureCamoReady() {
  // Run camo init to ensure browser-service is ready
  const result = await runCamoCommand(['init']).catch(() => null);
  if (result?.browserService) {
    console.log('[Services] Browser Service (via camo) ✅ 在线');
  } else {
    console.warn('[Services] Browser Service (via camo) ⚠️ 未检测到，首次使用需要启动浏览器会话');
  }
}

function runCamoCommand(args, timeoutMs = 10_000) {
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
      if (code !== 0 && code !== null) {
        reject(new Error(`camo exit ${code}: ${stderr || stdout}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch {
        resolve({ ok: true, raw: stdout });
      }
    });
  });
}

export async function controllerAction(action, payload = {}, timeoutMs = 20_000) {
  const res = await fetch(`${CONFIG.UNIFIED_API}/v1/controller/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload }),
    signal: AbortSignal.timeout ? AbortSignal.timeout(timeoutMs) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return data.data || data;
}

export async function listSessions() {
  // Use camo CLI sessions command
  try {
    const result = await runCamoCommand(['sessions']);
    return result.sessions || [];
  } catch {
    return [];
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
