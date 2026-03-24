/**
 * health-check.mjs - 可靠的健康检查模块
 * 
 * 真正的健康 = 所有依赖服务正常 + 输入操作能响应 + 无死锁
 */

import { spawnSync } from 'node:child_process';
import { BROWSER_SERVICE_URL } from '../../../../modules/camo-runtime/src/utils/config.mjs';

const HEALTH_CHECK_TIMEOUT_MS = 5000;
const INPUT_TEST_TIMEOUT_MS = 3000;

/**
 * 检查 browser-service HTTP 服务
 */
async function checkBrowserServiceHttp() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);
  try {
    const res = await fetch(`${BROWSER_SERVICE_URL}/health`, {
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` };
    }
    const data = await res.json();
    return { ok: true, ...data };
  } catch (error) {
    clearTimeout(timer);
    return { ok: false, error: error?.name === 'AbortError' ? 'timeout' : String(error?.message || error) };
  }
}

/**
 * 检查 browser-service 是否有活跃的 session
 */
async function checkBrowserServiceSession(profileId) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);
  try {
    const res = await fetch(`${BROWSER_SERVICE_URL}/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'getStatus', args: {} }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const data = await res.json();
    if (!data?.ok) {
      return { ok: false, error: 'getStatus_failed', sessions: [] };
    }
    const sessions = data?.sessions || [];
    if (!profileId) {
      return { ok: true, sessions, sessionCount: sessions.length };
    }
    const targetSession = sessions.find((s) => s.profileId === profileId);
    if (!targetSession) {
      return { ok: false, error: 'session_not_found', profileId, sessions };
    }
    return { ok: true, session: targetSession, sessions };
  } catch (error) {
    clearTimeout(timer);
    return { ok: false, error: String(error?.message || error) };
  }
}

/**
 * 检查输入操作是否正常响应（验证 inputActionLock 未被锁住）
 * 通过发送一个 Tab 键来验证
 */
async function checkInputResponsiveness(profileId) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), INPUT_TEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${BROWSER_SERVICE_URL}/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'keyboard:press',
        args: { profileId, key: 'Tab' },
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const data = await res.json();
    if (!data?.ok) {
      return { ok: false, error: 'keyboard_press_failed', response: data };
    }
    return { ok: true };
  } catch (error) {
    clearTimeout(timer);
    const name = error?.name || '';
    const msg = String(error?.message || error);
    if (name === 'AbortError' || msg.includes('abort')) {
      return { ok: false, error: 'input_timeout_deadlock', message: '输入操作超时，可能 inputActionLock 被锁住' };
    }
    return { ok: false, error: msg };
  }
}

/**
 * 检查浏览器进程是否存在
 */
function checkBrowserProcess(profileId) {
  if (process.platform === 'win32') {
    // Windows: 使用 tasklist
    const result = spawnSync('tasklist', ['/FI', 'IMAGENAME eq camoufox.exe'], {
      encoding: 'utf8',
      windowsHide: true,
    });
    const hasProcess = String(result.stdout || '').toLowerCase().includes('camoufox');
    return { ok: hasProcess, platform: 'win32' };
  }
  // POSIX: 使用 pgrep
  const pattern = profileId ? `camoufox.*${profileId}` : 'camoufox';
  const result = spawnSync('pgrep', ['-f', pattern], {
    encoding: 'utf8',
  });
  const stdout = String(result.stdout || '').trim();
  const pids = stdout.split(/\n/).filter(Boolean);
  return {
    ok: pids.length > 0,
    pids: pids.slice(0, 5),
    count: pids.length,
  };
}

/**
 * 检查僵尸进程
 */
function checkZombieWorkers() {
  if (process.platform === 'win32') {
    return { ok: true, zombies: [] };
  }
  const result = spawnSync('pgrep', ['-f', 'apps/webauto/entry/xhs-(unified|collect)\\.mjs'], {
    encoding: 'utf8',
  });
  const stdout = String(result.stdout || '').trim();
  if (!stdout) {
    return { ok: true, zombies: [] };
  }
  const pids = stdout.split(/\n/).map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n > 0);
  return {
    ok: pids.length === 0,
    zombies: pids,
    count: pids.length,
  };
}

/**
 * 完整的健康检查
 * @param {object} options
 * @param {string} options.profileId - 要检查的 profile
 * @param {boolean} options.skipInputTest - 跳过输入测试（避免干扰页面）
 * @returns {object} 健康检查结果
 */
export async function performHealthCheck(options = {}) {
  const { profileId, skipInputTest = false } = options;
  const startTime = Date.now();
  const checks = {};

  // 1. browser-service HTTP
  checks.browserServiceHttp = await checkBrowserServiceHttp();

  // 2. browser-service session
  if (checks.browserServiceHttp.ok) {
    checks.browserServiceSession = await checkBrowserServiceSession(profileId);
  } else {
    checks.browserServiceSession = { ok: false, skipped: true, reason: 'http_failed' };
  }

  // 3. 输入操作响应（关键：验证无死锁）
  if (!skipInputTest && checks.browserServiceSession.ok && profileId) {
    checks.inputResponsiveness = await checkInputResponsiveness(profileId);
  } else if (skipInputTest) {
    checks.inputResponsiveness = { ok: true, skipped: true, reason: 'skipInputTest' };
  } else {
    checks.inputResponsiveness = { ok: false, skipped: true, reason: 'no_session' };
  }

  // 4. 浏览器进程
  checks.browserProcess = checkBrowserProcess(profileId);

  // 5. 僵尸进程检测
  checks.zombieWorkers = checkZombieWorkers();

  // 综合判断
  const allOk = Object.values(checks).every((c) => c.ok === true);
  const criticalFailures = Object.entries(checks)
    .filter(([_, c]) => c.ok === false)
    .map(([name, _]) => name);

  return {
    ok: allOk,
    elapsedMs: Date.now() - startTime,
    checks,
    criticalFailures: criticalFailures.length > 0 ? criticalFailures : null,
    summary: allOk
      ? '健康：所有检查通过'
      : `不健康：${criticalFailures.join(', ')} 失败`,
  };
}

/**
 * 快速健康检查（只检查 HTTP + 进程，不测试输入）
 */
export async function quickHealthCheck(profileId) {
  const startTime = Date.now();
  
  const http = await checkBrowserServiceHttp();
  if (!http.ok) {
    return { ok: false, elapsedMs: Date.now() - startTime, error: 'browser_service_http', details: http };
  }
  
  const process = checkBrowserProcess(profileId);
  if (!process.ok) {
    return { ok: false, elapsedMs: Date.now() - startTime, error: 'browser_process', details: process };
  }
  
  const zombies = checkZombieWorkers();
  if (!zombies.ok) {
    return { ok: false, elapsedMs: Date.now() - startTime, error: 'zombie_workers', details: zombies };
  }
  
  return {
    ok: true,
    elapsedMs: Date.now() - startTime,
    profileId,
    processCount: process.count,
  };
}

/**
 * 断言健康（不健康则抛错）
 */
export async function assertHealthy(options = {}) {
  const result = await performHealthCheck(options);
  if (!result.ok) {
    const error = new Error(`Health check failed: ${result.criticalFailures?.join(', ')}`);
    error.healthCheckResult = result;
    throw error;
  }
  return result;
}

export default {
  performHealthCheck,
  quickHealthCheck,
  assertHealthy,
  checkBrowserServiceHttp,
  checkBrowserServiceSession,
  checkInputResponsiveness,
  checkBrowserProcess,
  checkZombieWorkers,
};
