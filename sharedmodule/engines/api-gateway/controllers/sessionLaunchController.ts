// @ts-nocheck
import { chromium, firefox, webkit } from 'playwright';
import { saveSession, getSession } from '../lib/sessionAdapter.js';
// 使用全局浏览器模块的 Cookie 管理器和 UI Overlay 作为唯一入口
import { CookieManager } from '../../../../libs/browser/cookie-manager.js';
import { buildOverlayScript } from '../../../../libs/browser/ui-overlay.js';

function genSessionId() {
  return `sess-${Date.now()}-${Math.floor(Math.random()*1e6)}`;
}

// 统一 Cookie 管理入口：仅通过 libs/browser/cookie-manager.js 操作持久化 Cookie
const cookieManager = new CookieManager();

const _pageReloadOncePerHost = new WeakMap<any, Set<string>>();

async function installPageWatches(sessionId: string, context, page) {
  try {
    // Inject overlay early（由浏览器模块集中提供脚本）
    await context.addInitScript(buildOverlayScript({ sessionId, profileId: 'default' }));
  } catch {}

  const attachHandlers = async (pg) => {
    try {
      // Helper: ensure cookies present for current host; reload once per host to take effect
      const ensureCookies = async () => {
        try {
          const urlNow = pg.url(); if (!urlNow) return;
          const injected = await cookieManager.injectCookiesForUrl(context, urlNow, 'default');
          if (injected?.success && injected.count > 0) {
            // reload once per host to apply
            const host = new URL(urlNow).hostname || '';
            let set = _pageReloadOncePerHost.get(pg);
            if (!set) { set = new Set(); _pageReloadOncePerHost.set(pg, set); }
            if (!set.has(host)) {
              set.add(host);
              try { await pg.reload({ waitUntil: 'domcontentloaded' }); } catch {}
            }
          }
        } catch {}
      };

      // On DOM ready, ensure overlay exists and inject cookies
      pg.on('domcontentloaded', async () => {
        try { await pg.evaluate(buildOverlayScript({ sessionId, profileId: 'default' })); } catch {}
        await ensureCookies();
      });

      // On load, persist cookies for this host (and also when login anchors detected)
      pg.on('load', async () => {
        try {
          const hasLoginAnchor = await pg.evaluate(() => {
            try {
              const sels = [
                '.userAvatarLogo img',
                'a[data-spm=dnick]',
                'a[href*="//work.1688.com/"]'
              ];
              return sels.some(s => !!document.querySelector(s));
            } catch { return false; }
          });
          // Always save cookies after load; anchors just improve confidence
          await cookieManager.saveCookiesForUrl(context, pg.url(), 'default');
        } catch {}
      });

      // On top-frame navigation (including redirects), ensure cookies injected
      pg.on('framenavigated', async (fr) => {
        try { if (fr === pg.mainFrame()) await ensureCookies(); } catch {}
      });
    } catch {}
  };

  // Existing pages
  try { for (const p of context.pages()) await attachHandlers(p); } catch {}
  // Future pages
  try { context.on('page', p => attachHandlers(p)); } catch {}
}

export async function launch(req, res) {
  const { browser = 'chromium', headless = false, sessionId: provided } = req.body || {};
  try {
    const sessionId = provided || genSessionId();
    let bw;
    if (browser === 'firefox') bw = await firefox.launch({ headless });
    else if (browser === 'webkit') bw = await webkit.launch({ headless });
    else bw = await chromium.launch({ headless });
    const context = await bw.newContext({});
    const page = await context.newPage();
    await installPageWatches(sessionId, context, page);
    await saveSession(sessionId, { browser: bw, context, page });
    return res.json({ success: true, sessionId });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
}

export async function overlayInstall(req, res) {
  const { sessionId } = req.body || {};
  if (!sessionId) return res.status(400).json({ success: false, error: 'sessionId required' });
  try {
    const s = await getSession(sessionId);
    if (!s || !s.context) return res.status(404).json({ success: false, error: 'session not found' });
    await installPageWatches(sessionId, s.context, s.page || (s.context.pages?.()[0]));
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
}

export async function cookiesInject(req, res) {
  const { sessionId, url } = req.body || {};
  if (!sessionId) return res.status(400).json({ success: false, error: 'sessionId required' });
  try {
    const s = await getSession(sessionId);
    if (!s || !s.context) return res.status(404).json({ success: false, error: 'session not found' });
    const target = url || (s.page?.url() || '');
    const injected = await cookieManager.injectCookiesForUrl(s.context, target, 'default');
    if (injected.success && injected.count > 0 && s.page) {
      try { await s.page.reload({ waitUntil: 'domcontentloaded' }); } catch {}
    }
    return res.json({ success: !!injected.success, count: injected.count || 0 });
  } catch (e) { return res.status(500).json({ success: false, error: e.message }); }
}

export async function cookiesSave(req, res) {
  const { sessionId, url } = req.body || {};
  if (!sessionId) return res.status(400).json({ success: false, error: 'sessionId required' });
  try {
    const s = await getSession(sessionId);
    if (!s || !s.context) return res.status(404).json({ success: false, error: 'session not found' });
    const result = await cookieManager.saveCookiesForUrl(s.context, url || (s.page?.url() || ''), 'default');
    return res.json({ success: !!result.success, path: result.path || null, count: result.count || 0 });
  } catch (e) { return res.status(500).json({ success: false, error: e.message }); }
}

export async function listCookies(req, res) {
  const sessionId = req.query?.sessionId || req.body?.sessionId;
  const url = req.query?.url || req.body?.url || null;
  if (!sessionId) return res.status(400).json({ success: false, error: 'sessionId required' });
  try {
    const s = await getSession(sessionId);
    if (!s || !s.context) return res.status(404).json({ success: false, error: 'session not found' });
    let cookies = await s.context.cookies();
    if (url) {
      const host = new URL(url).hostname;
      cookies = cookies.filter(c => (c.domain||'').includes(host.replace(/^www\./,'')) || host.endsWith((c.domain||'').replace(/^[.]/,'')));
    }
    return res.json({ success: true, count: cookies.length, cookies });
  } catch (e) { return res.status(500).json({ success: false, error: e.message }); }
}
