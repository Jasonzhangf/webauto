#!/usr/bin/env node
// 一键启动 Camoufox 浏览器服务并打开一个基础会话
// - 启动 Python 浏览器服务 (BrowserService + CamoufoxBrowserWrapper)
// - 为避免复用旧代码，每次运行前都尝试按端口杀掉旧的 Python 服务
// - 通过 REST API 创建一个使用指定 profile 的会话

import { spawn, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '../../..');

const HOST = process.env.BROWSER_SERVICE_HOST || '127.0.0.1';
const PORT = Number(process.env.BROWSER_SERVICE_PORT || '8888');

function shouldDelayRestore(_profileId) {
  if (process.env.BROWSER_DELAYED_RESTORE) {
    return process.env.BROWSER_DELAYED_RESTORE === '1';
  }
  return false; // 默认直接使用目标 profile 的 Cookie
}

function resolveInitialUrl(profileId) {
  // CLI 优先：支持 --url 覆盖
  const args = process.argv.slice(2);
  const idx = args.indexOf('--url');
  if (idx !== -1 && args[idx + 1]) {
    return String(args[idx + 1]);
  }

  // 环境变量显式指定
  if (process.env.BROWSER_INITIAL_URL) {
    return process.env.BROWSER_INITIAL_URL;
  }

  // 默认：1688 主 profile 自动打开首页，方便手动登录
  if (profileId === '1688-main-v1') {
    return 'https://www.1688.com/';
  }

  return null;
}

function resolveProfileId() {
  const args = process.argv.slice(2);
  const idx = args.indexOf('--profile');
  if (idx !== -1 && args[idx + 1]) {
    return String(args[idx + 1]);
  }
  if (process.env.BROWSER_PROFILE_ID) {
    return String(process.env.BROWSER_PROFILE_ID);
  }
  return 'default';
}

async function isHealthy() {
  const url = `http://${HOST}:${PORT}/api/v1/health`;
  try {
    const res = await fetch(url);
    if (!res.ok) return false;
    const j = await res.json();
    return !!j?.success;
  } catch {
    return false;
  }
}

function killCamoufoxIfAny() {
  // 清理可能残留的 Camoufox 进程，避免复用挂着旧 overlay / 旧上下文的实例
  if (process.platform === 'win32') return;
  try {
    execSync('pkill -f Camoufox || true', { stdio: 'ignore' });
    execSync('pkill -f camoufox || true', { stdio: 'ignore' });
  } catch {
    // 清理失败不影响后续流程
  }
}

function killPythonServiceIfAny() {
  // 本地开发：每次一键启动前都清理占用目标端口的旧 Python BrowserService，避免复用旧代码
  if (process.platform === 'win32') return;
  try {
    const out = execSync(`lsof -ti :${PORT} || true`, { encoding: 'utf8' });
    const pids = out.split(/\s+/).map((s) => Number(s.trim())).filter(Boolean);
    if (!pids.length) return;
    for (const pid of pids) {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        // 单个失败忽略
      }
    }
  } catch {
    // 端口检查失败不影响后续流程
  }
}

function startPythonService() {
  // 优先使用环境变量，其次尝试 python3，最后退回 python
  let pythonBin = process.env.PYTHON_BIN;
  if (!pythonBin) {
    pythonBin = 'python3';
  }
  const launcher = join(projectRoot, 'services', 'browser_launcher.py');

  const child = spawn(pythonBin, [launcher, '--host', HOST, '--port', String(PORT)], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
  });

  child.unref();
  return child.pid;
}

async function ensureService() {
  if (process.env.SKIP_KILL !== '1') {
    killPythonServiceIfAny();
    killCamoufoxIfAny();
  } else {
    console.log('⚠️  跳过 killPythonServiceIfAny/killCamoufoxIfAny，根据 SKIP_KILL=1');
  }

  const pid = startPythonService();

  // 等待服务健康，最多 20 秒
  for (let i = 0; i < 40; i++) {
    if (await isHealthy()) {
      return pid;
    }
    await wait(500);
  }

  throw new Error('Browser service did not become healthy within timeout');
}

async function listSessions() {
  const url = `http://${HOST}:${PORT}/api/v1/sessions`;
  const res = await fetch(url);
  if (!res.ok) {
    return [];
  }
  const j = await res.json().catch(() => ({}));
  const data = j?.data || {};
  const sessions = data.sessions || [];
  return Array.isArray(sessions) ? sessions : [];
}

async function killSameProfileSessions(profileId) {
  const sessions = await listSessions();
  const targets = sessions.filter((s) => {
    const pid = s.profile_id || s.profile?.profile_id;
    return pid === profileId;
  });
  if (!targets.length) return;
  console.log(`ℹ️ 检测到同 profile (${profileId}) 的历史会话 ${targets.length} 个，准备清理...`);
  for (const s of targets) {
    const sid = s.session_id || s.sessionId || s.id;
    if (!sid) continue;
    try {
      const url = `http://${HOST}:${PORT}/api/v1/sessions/${encodeURIComponent(sid)}`;
      const res = await fetch(url, { method: 'DELETE' });
      if (res.ok) {
        console.log(`   • 已关闭旧会话 ${sid}`);
      }
    } catch {
      // 单个失败忽略
    }
  }
}

async function createSession(profileId = 'default', autoRestore = true) {
  const url = `http://${HOST}:${PORT}/api/v1/sessions`;
  const body = {
    profile: {
      profile_id: profileId,
      // 其他字段使用服务端默认配置（增强反检测 + zh-CN）
    },
    options: {
      autoRestore
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Create session failed: HTTP ${res.status} ${text}`);
  }

  const j = await res.json();
  if (!j?.success) {
    throw new Error(`Create session error: ${j?.error || 'unknown error'}`);
  }

  const data = j.data || {};
  return data.session_id || data.sessionId || data.id;
}

async function main() {
  console.log('🚀 一键启动 Camoufox 浏览器服务并创建会话...');

  const profileId = resolveProfileId();

  const pid = await ensureService();
  if (pid) {
    console.log(`✅ 浏览器服务已启动 (pid=${pid})，地址 http://${HOST}:${PORT}`);
  } else {
    console.log(`ℹ️ 浏览器服务已在运行中，地址 http://${HOST}:${PORT}`);
  }

  // 先清理同 profile 的旧会话，保留其他 profile 的实例
  await killSameProfileSessions(profileId);

  const delayedRestore = shouldDelayRestore(profileId);
  const sessionId = await createSession(profileId, !delayedRestore);

  console.log('');
  console.log('✅ 已创建浏览器会话:');
  console.log(`   session_id: ${sessionId}`);
  console.log(`   profile_id: ${profileId}  (Cookie 自动恢复: ${!delayedRestore})`);
  console.log('');
  console.log('👀 请在前台确认 Camoufox 窗口已经弹出。');

  const initialUrl = resolveInitialUrl(profileId);
  if (initialUrl) {
    console.log('');
    console.log(`👉 自动导航至 ${initialUrl}...`);
    await navigatePage(sessionId, initialUrl);
    console.log('✅ 初始页面加载完毕（已加载 profile Cookie）。');
  } else {
    console.log('');
    console.log('ℹ️ 未设置 BROWSER_INITIAL_URL，已跳过自动导航，请在窗口中手动打开目标站点。');
  }
}

main().catch((e) => {
  console.error('❌ 一键启动 Camoufox 失败:', e?.message || String(e));
  process.exit(1);
});

async function navigatePage(sessionId, url) {
  const endpoint = `http://${HOST}:${PORT}/api/v1/sessions/${encodeURIComponent(sessionId)}/navigate`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j?.success) {
    throw new Error(`导航 ${url} 失败: ${j?.error || res.statusText}`);
  }
  return j;
}

async function restoreSessionCookies(sessionId, url) {
  const endpoint = `http://${HOST}:${PORT}/api/v1/sessions/${encodeURIComponent(sessionId)}/restore`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j?.success) {
    throw new Error(`恢复会话失败: ${j?.error || res.statusText}`);
  }
  return j;
}
