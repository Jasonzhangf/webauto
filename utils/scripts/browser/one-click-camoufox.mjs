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
    env: { ...process.env },
  });

  child.unref();
  return child.pid;
}

async function ensureService() {
  // 每次运行都尝试清理旧的 BrowserService，避免复用旧代码
  killPythonServiceIfAny();
  // 同时清理旧的 Camoufox 进程，保证浏览器本身也是干净的
  killCamoufoxIfAny();

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

async function createSession(profileId = 'default') {
  const url = `http://${HOST}:${PORT}/api/v1/sessions`;
  const body = {
    profile: {
      profile_id: profileId,
      // 其他字段使用服务端默认配置（增强反检测 + zh-CN）
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

  const sessionId = await createSession(profileId);

  console.log('');
  console.log('✅ 已创建浏览器会话:');
  console.log(`   session_id: ${sessionId}`);
  console.log(`   profile_id: ${profileId}  (所有站点 Cookie 自动保存/恢复)`);
  console.log('');
console.log('👀 请在前台确认 Camoufox 窗口已经弹出。');
console.log('   如需访问 1688，请在地址栏手动打开 https://www.1688.com，登录过程不再由脚本自动导航干预。');
}

main().catch((e) => {
  console.error('❌ 一键启动 Camoufox 失败:', e?.message || String(e));
  process.exit(1);
});
