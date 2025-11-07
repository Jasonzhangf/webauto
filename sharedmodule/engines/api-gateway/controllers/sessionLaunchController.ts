// @ts-nocheck
import { chromium, firefox, webkit } from 'playwright';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { saveSession, getSession } from '../lib/sessionAdapter.js';

function genSessionId() {
  return `sess-${Date.now()}-${Math.floor(Math.random()*1e6)}`;
}

const COOKIES_DIR = join(homedir(), '.webauto', 'cookies');

function sanitizeHost(host: string) {
  try { return String(host || '').toLowerCase().replace(/[^a-z0-9.\-]/g, '_'); } catch { return 'unknown'; }
}

function cookieFilesForUrl(url: string) {
  // Return an array of candidate cookie files for this URL's host, ordered by specificity
  // e.g. sub.a.example.com -> [sub.a.example.com.json, example.com.json]
  try {
    const u = new URL(url);
    const host = sanitizeHost(u.hostname || '');
    if (!host) return [];
    const files = [] as string[];
    files.push(join(COOKIES_DIR, `${host}.json`));
    const parts = host.split('.').filter(Boolean);
    if (parts.length >= 2) {
      const base = parts.slice(-2).join('.');
      if (base !== host) files.push(join(COOKIES_DIR, `${base}.json`));
    }
    // legacy fallback for 1688
    if (host.includes('1688.com')) {
      files.push(join(COOKIES_DIR, '1688-domestic.json'));
    }
    return files;
  } catch { return []; }
}

function ensureDir(p: string) {
  try { mkdirSync(p, { recursive: true }); } catch {}
}

async function loadCookiesFromFile(context, filePath: string) {
  try {
    if (!existsSync(filePath)) return false;
    const raw = JSON.parse(readFileSync(filePath, 'utf8'));
    const arr = Array.isArray(raw) ? raw : (Array.isArray(raw?.cookies) ? raw.cookies : null);
    if (!Array.isArray(arr)) return false;
    const shaped = arr.map(c => { const x={...c}; if (!x.path) x.path='/'; if (x.expires!==undefined && Number(x.expires)<=0) delete x.expires; return x; });
    await context.addCookies(shaped);
    return true;
  } catch {
    return false;
  }
}

async function saveCookiesForUrl(context, url: string) {
  try {
    const u = new URL(url);
    const host = sanitizeHost(u.hostname || '');
    if (!host) return false;
    const file = join(COOKIES_DIR, `${host}.json`);
    const cookies = await context.cookies();
    ensureDir(COOKIES_DIR);
    writeFileSync(file, JSON.stringify(cookies, null, 2));
    return true;
  } catch {
    return false;
  }
}

function overlayInitScript(sessionId: string) {
  // Minimal persistent top-right menu showing sessionId
  return `(() => {
    try {
      const ID = '__waMiniMenu';
      function install(){
        let box = document.getElementById(ID);
        if (!box) {
          box = document.createElement('div');
          box.id = ID;
          box.style.cssText = 'position:fixed;top:8px;right:8px;z-index:2147483647;background:rgba(0,0,0,0.6);color:#fff;padding:6px 10px;border-radius:8px;font:12px -apple-system,system-ui;cursor:default;user-select:text;';
          const lab = document.createElement('span'); lab.textContent = 'SID:'; lab.style.opacity='0.8'; lab.style.marginRight='6px';
          const val = document.createElement('span'); val.id='__waMiniMenu_sid'; val.textContent = ${JSON.stringify(sessionId)};
          box.appendChild(lab); box.appendChild(val);
          document.documentElement.appendChild(box);
        } else {
          const v = box.querySelector('#__waMiniMenu_sid');
          if (v) v.textContent = ${JSON.stringify(sessionId)}; else box.textContent = 'SID: ' + ${JSON.stringify(sessionId)};
        }
        window.__waMiniMenu = { update(id){ try{ const el = document.getElementById('__waMiniMenu_sid'); if (el) el.textContent=String(id||''); }catch{} } };
      }
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once:true }); else install();
    } catch {}
  })();`;
}

const _pageReloadOncePerHost = new WeakMap<any, Set<string>>();

async function installPageWatches(sessionId: string, context, page) {
  try {
    // Inject overlay early
    await context.addInitScript(overlayInitScript(sessionId));
  } catch {}

  const attachHandlers = async (pg) => {
    try {
      // Helper: ensure cookies present for current host; reload once per host to take effect
      const ensureCookies = async () => {
        try {
          const urlNow = pg.url(); if (!urlNow) return;
          const files = cookieFilesForUrl(urlNow);
          let injected = false;
          for (const f of files) {
            const ok = await loadCookiesFromFile(context, f);
            injected = injected || ok;
          }
          if (injected) {
            // reload once per host to apply
            const host = sanitizeHost(new URL(urlNow).hostname || '');
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
        try { await pg.evaluate(overlayInitScript(sessionId)); } catch {}
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
          await saveCookiesForUrl(context, pg.url());
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
    const files = cookieFilesForUrl(target);
    let loaded = false;
    for (const f of files) {
      const ok = await loadCookiesFromFile(s.context, f);
      loaded = loaded || ok;
    }
    if (loaded && s.page) { try { await s.page.reload({ waitUntil: 'domcontentloaded' }); } catch {} }
    return res.json({ success: !!loaded });
  } catch (e) { return res.status(500).json({ success: false, error: e.message }); }
}

export async function cookiesSave(req, res) {
  const { sessionId, url } = req.body || {};
  if (!sessionId) return res.status(400).json({ success: false, error: 'sessionId required' });
  try {
    const s = await getSession(sessionId);
    if (!s || !s.context) return res.status(404).json({ success: false, error: 'session not found' });
    const ok = await saveCookiesForUrl(s.context, url || (s.page?.url() || ''));
    return res.json({ success: !!ok });
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
