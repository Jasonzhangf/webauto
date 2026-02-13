import path from 'node:path';

/**
 * Phase 1 Block: Cookie 监控与稳定保存
 *
 * 规则：
 * - 不论是否登录成功，都要每 15 秒扫描一次 cookie
 * - 只有在“登录锚点确认成功”后：cookie 发生变化并且稳定（连续 stableCount 次一致）才保存
 * - 保存走 Browser Service 的 saveCookiesIfStable（避免自己造格式）
 */

export interface Phase1MonitorCookieInput {
  profile: string;
  unifiedApiUrl?: string;
  browserServiceUrl?: string;
  scanIntervalMs?: number; // default 15000
  stableCount?: number; // default 3
  cookiePath?: string; // default ~/.webauto/cookies/{profile}.json
}

export interface Phase1MonitorCookieOutput {
  success: boolean;
  profile: string;
  loggedIn: boolean;
  saved: boolean;
  cookiePath: string;
  scanRounds: number;
  autoCookiesStarted: boolean;
}

async function controllerAction(action: string, payload: any, apiUrl: string) {
  const res = await fetch(`${apiUrl}/v1/controller/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload }),
    signal: AbortSignal.timeout(20000),
  });
  const data = await res.json().catch(() => ({}));
  return data.data || data;
}

async function browserServiceCommand(action: string, args: any, serviceUrl: string) {
  const res = await fetch(`${serviceUrl}/command`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, args }),
    signal: AbortSignal.timeout(20000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.ok === false) throw new Error(data?.error || 'browser-service error');
  return data;
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function resolveDefaultCookiePath(profile: string) {
  const envRoot = String(process.env.WEBAUTO_PATHS_COOKIES || '').trim();
  if (envRoot) return path.join(envRoot, `${profile}.json`);

  const portableRoot = String(process.env.WEBAUTO_PORTABLE_ROOT || process.env.WEBAUTO_ROOT || '').trim();
  if (portableRoot) return path.join(portableRoot, '.webauto', 'cookies', `${profile}.json`);

  const homeDir = process.platform === 'win32'
    ? String(process.env.USERPROFILE || '').trim()
    : String(process.env.HOME || '').trim();
  if (homeDir) return path.join(homeDir, '.webauto', 'cookies', `${profile}.json`);

  return path.join('.webauto', 'cookies', `${profile}.json`);
}

function hashCookiePairs(pairs: Array<{ name: string; value: string }>): string {
  const normalized = pairs
    .map((c) => `${c.name}=${c.value}`)
    .sort()
    .join('|');
  // cheap hash; only used for change detection
  let h = 0;
  for (let i = 0; i < normalized.length; i++) {
    h = (h * 31 + normalized.charCodeAt(i)) >>> 0;
  }
  return h.toString(16);
}

function extractSessions(payload: any): any[] {
  if (!payload) return [];
  if (Array.isArray(payload.sessions)) return payload.sessions;
  if (Array.isArray(payload.data?.sessions)) return payload.data.sessions;
  if (Array.isArray(payload.result?.sessions)) return payload.result.sessions;
  if (payload.data) return extractSessions(payload.data);
  return [];
}

async function listSessions(apiUrl: string) {
  const raw = await controllerAction('session:list', {}, apiUrl);
  return extractSessions(raw);
}

function hasSession(sessions: any[], profile: string) {
  return sessions.some((s) => s?.profileId === profile || s?.session_id === profile);
}

async function getDocumentCookiePairs(apiUrl: string, profile: string) {
  // 只读扫描：使用 document.cookie 的可见部分做“变化检测”即可。
  const raw = await controllerAction(
    'browser:execute',
    {
      profile,
      script: `(() => document.cookie.split(';').map(s => s.trim()).filter(Boolean))()`,
    },
    apiUrl,
  );

  const arr = raw?.result || raw?.data?.result;
  const list = Array.isArray(arr) ? arr : [];
  const pairs: Array<{ name: string; value: string }> = [];
  for (const item of list) {
    const idx = String(item).indexOf('=');
    if (idx <= 0) continue;
    pairs.push({ name: String(item).slice(0, idx), value: String(item).slice(idx + 1) });
  }
  return pairs;
}

async function fetchContainerTree(apiUrl: string, profile: string) {
  let currentUrl = '';
  try {
    const urlRes = await controllerAction(
      'browser:execute',
      { profile, script: 'location.href' },
      apiUrl,
    );
    currentUrl = urlRes?.result || urlRes?.data?.result || '';
  } catch {
    currentUrl = '';
  }

  try {
    const res = await controllerAction(
      'containers:match',
      {
        profile,
        ...(currentUrl ? { url: currentUrl } : {}),
        maxDepth: 2,
        maxChildren: 5,
      },
      apiUrl,
    );
    return res?.snapshot?.container_tree || res?.container_tree || res?.data?.snapshot?.container_tree || null;
  } catch {
    return null;
  }
}

function findContainer(node: any, pattern: RegExp): any {
  if (!node) return null;
  if (pattern.test(node.id || node.defId || '')) return node;
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      const found = findContainer(child, pattern);
      if (found) return found;
    }
  }
  return null;
}

async function isLoggedIn(apiUrl: string, profile: string): Promise<boolean> {
  const tree = await fetchContainerTree(apiUrl, profile);
  if (!tree) return false;

  const loginAnchor = findContainer(tree, /\.login_anchor$/);
  if (loginAnchor) return true;

  const loginGuard = findContainer(tree, /xiaohongshu_login\.login_guard$/);
  if (loginGuard) return false;

  return false;
}

export async function execute(input: Phase1MonitorCookieInput): Promise<Phase1MonitorCookieOutput> {
  const {
    profile,
    unifiedApiUrl = 'http://127.0.0.1:7701',
    browserServiceUrl = 'http://127.0.0.1:7704',
    scanIntervalMs = 15000,
    stableCount = 3,
    cookiePath,
  } = input;
  const resolvedCookiePath = cookiePath || resolveDefaultCookiePath(profile);

  let lastHash = '';
  let stableRounds = 0;
  let scanRounds = 0;
  let lastLoggedIn = false;
  let autoCookiesStarted = false;

  while (true) {
    scanRounds += 1;

    const sessions = await listSessions(unifiedApiUrl).catch((): any[] => []);
    if (!hasSession(sessions, profile)) {
      throw new Error(`[Phase1MonitorCookie] session closed: ${profile}`);
    }

    const loggedIn = await isLoggedIn(unifiedApiUrl, profile);
    lastLoggedIn = loggedIn;

    const pairs = await getDocumentCookiePairs(unifiedApiUrl, profile);
    const currentHash = hashCookiePairs(pairs);

    console.log(
      `[Phase1MonitorCookie] round=${scanRounds} loggedIn=${loggedIn} cookieCount=${pairs.length} hash=${currentHash}`,
    );

    if (currentHash === lastHash) {
      stableRounds += 1;
    } else {
      stableRounds = 0;
      lastHash = currentHash;
    }

    // 只有登录成功时才保存，并且必须“变化后稳定”
    if (loggedIn && stableRounds >= stableCount) {
      console.log('[Phase1MonitorCookie] Cookie stable, saving...');
      let saveResult: any = null;
      try {
        saveResult = await browserServiceCommand(
          'saveCookiesIfStable',
          { profileId: profile, path: resolvedCookiePath, minDelayMs: 2000 },
          browserServiceUrl,
        );
      } catch (err) {
        console.warn(`[Phase1MonitorCookie] saveCookiesIfStable failed: ${(err as Error)?.message || String(err)}`);
      }

      if (!Boolean(saveResult?.saved)) {
        // Fallback: force save once so downstream checks can find explicit cookie file.
        let forced: any = null;
        try {
          forced = await browserServiceCommand('saveCookies', { profileId: profile, path: resolvedCookiePath }, browserServiceUrl);
        } catch {
          forced = null;
        }
        const forcedCount = Number(forced?.count ?? forced?.body?.count ?? -1);
        if (forcedCount >= 0) {
          saveResult = { ...(saveResult || {}), saved: true, count: forcedCount };
          console.log(`[Phase1MonitorCookie] saveCookies fallback count=${forcedCount}`);
        }
      }

      if (!Boolean(saveResult?.saved)) {
        console.warn('[Phase1MonitorCookie] cookie not saved yet, continue scanning');
        await delay(scanIntervalMs);
        continue;
      }

      // 进入常驻模式：开启 Browser Service 自动保存 cookie，不阻塞后续 Phase2
      if (!autoCookiesStarted) {
        await browserServiceCommand('autoCookies:start', { profileId: profile, intervalMs: scanIntervalMs }, browserServiceUrl);
        autoCookiesStarted = true;
        console.log(`[Phase1MonitorCookie] autoCookies:start enabled intervalMs=${scanIntervalMs}`);
      }

      return {
        success: true,
        profile,
        loggedIn: true,
        saved: true,
        cookiePath: resolvedCookiePath,
        scanRounds,
        autoCookiesStarted,
      };
    }

    await delay(scanIntervalMs);
  }
}
