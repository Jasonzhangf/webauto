#!/usr/bin/env node
// 一键启动 Camoufox 浏览器服务并打开一个基础会话
// - 启动 Python 浏览器服务 (BrowserService + CamoufoxBrowserWrapper)
// - 通过 REST API 创建一个使用默认 profile 的会话
// - 会话创建后，会在前台弹出一个 Camoufox 空白窗口（about:blank）

import { spawn } from 'node:child_process';
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
  if (await isHealthy()) {
    return null;
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
  console.log('👀 请在前台确认 Camoufox 窗口已经弹出（about:blank）。');
  console.log('   后续浏览器控制请通过 /api/v1/sessions/{session_id}/... 这些 REST 接口完成。');
}

main().catch((e) => {
  console.error('❌ 一键启动 Camoufox 失败:', e?.message || String(e));
  process.exit(1);
});
