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
  } catch { return false; }
}

function overlayInitScript(sessionId) {
    return `(() => {
    try {
      const ID = '__waMiniMenu';
      const STYLE_ID = '__waMiniMenu_style';
      function ensureStyle(){
        try{
          if (document.getElementById(STYLE_ID)) return;
          const s = document.createElement('style'); s.id = STYLE_ID; s.textContent = '#'+ID+'{position:fixed !important;top:8px !important;right:8px !important;z-index:2147483647 !important;background:rgba(0,0,0,0.85) !important;color:#fff !important;padding:8px 12px !important;border-radius:8px !important;font:12px -apple-system,system-ui !important;cursor:default !important;user-select:text !important;box-shadow:0 2px 10px rgba(0,0,0,0.3) !important;border:1px solid rgba(255,255,255,0.2) !important;transition:opacity 0.3s ease !important;opacity:0;} #'+ID+'.show{opacity:1;}';
          document.head.appendChild(s);
        }catch{}
      }
      function install(){
        ensureStyle();
        let box = document.getElementById(ID);
        if (!box) {
          box = document.createElement('div'); box.id = ID; box.setAttribute('data-webauto', 'true');
          const lab = document.createElement('span'); lab.textContent = '🦊 Camoufox:'; lab.style.opacity='0.9'; lab.style.marginRight='6px';
          const val = document.createElement('span'); val.id='__waMiniMenu_sid'; val.textContent = ${JSON.stringify(sessionId)}; val.style.fontWeight='bold';
          box.appendChild(lab); box.appendChild(val);
          
          box.addEventListener('click', function(e) { e.preventDefault(); e.stopPropagation(); if (navigator.clipboard) { navigator.clipboard.writeText(${JSON.stringify(sessionId)}).then(() => { val.textContent = '已复制!'; setTimeout(() => { val.textContent = ${JSON.stringify(sessionId)}; }, 1500); }); } });
          
          const addToPage = () => {
            try { let target = document.body || document.documentElement; if (target) { target.appendChild(box); setTimeout(() => { box.classList.add('show'); }, 300); return true; } } catch(e) { return false; }
          };
          
          if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', addToPage); } else { addToPage(); }
        } else {
          const v = box.querySelector('#__waMiniMenu_sid'); if (v) v.textContent = ${JSON.stringify(sessionId)}; else box.textContent = '🦊 Camoufox: ${sessionId}'; box.classList.add('show');
        }
        
        try { window.__waMiniMenu = window.__waMiniMenu || {}; window.__waMiniMenu.update = function(id){ try{ const el = document.getElementById('__waMiniMenu_sid'); if (el) el.textContent=String(id||''); }catch{} }; window.__waMiniMenu.hide = function(){ try{ const el = document.getElementById(ID); if (el) el.classList.remove('show'); }catch{} }; window.__waMiniMenu.show = function(){ try{ const el = document.getElementById(ID); if (el) el.classList.add('show'); }catch{} }; } catch {}
        
        return { installed: true, sessionId: ${JSON.stringify(sessionId)} };
      }
      
      setTimeout(install, 1000);
      setInterval(() => { try{ if (!document.getElementById(ID)) install(); }catch{} }, 3000);
      
      return { installed: true, sessionId: ${JSON.stringify(sessionId)} };
    } catch(e) { console.error('[WebAuto] Menu installation error:', e.message); return { installed: false, error: String(e) }; }
  })();`;
}

function installPageWatches(sessionId, context, page) {
    const sidOverlayEnabled = !(process.env.SID_OVERLAY === '0');
    const attachHandlers = async (pg) => {
        try {
            const ensureCookies = async () => {
                try {
                    const urlNow = pg.url();
                    if (!urlNow) return;
                    const files = cookieFilesForUrl(urlNow);
                    let injected = false;
                    for (const f of files) {
                        const ok = await loadCookiesFromFile(context, f);
                        injected = injected || ok;
                    }
                    if (injected) {
                        console.log(`[WebAuto] Camoufox cookies loaded for ${new URL(urlNow).hostname}`);
                    }
                } catch { }
            };
            
            pg.on('domcontentloaded', async () => {
                try {
                    if (sidOverlayEnabled) {
                        setTimeout(async () => {
                            try {
                                const result = await pg.evaluate(overlayInitScript(sessionId));
                                console.log('[WebAuto] Camoufox menu injected for session', sessionId, ':', result);
                            } catch { }
                        }, 1000);
                    }
                } catch { }
                await ensureCookies();
            });
            
            pg.on('load', async () => {
                try {
                    const urlNow = pg.url();
                    if (urlNow) {
                        try {
                            const u = new URL(urlNow);
                            const host = sanitizeHost(u.hostname);
                            const targetFile = join(COOKIES_DIR, `${host}.json`);
                            ensureDir(COOKIES_DIR);
                            const cookies = await context.cookies();
                            writeFileSync(targetFile, JSON.stringify({ cookies, savedAt: Date.now(), url: urlNow }, null, 2));
                            console.log(`[WebAuto] Camoufox cookies saved for ${host}`);
                        } catch { }
                    }
                } catch { }
            });
        } catch { }
    };
    
    if (page) {
        attachHandlers(page);
    }
    context.on('page', attachHandlers);
}

export async function launch(req, res) {
  const { browser = 'chromium', headless = false, sessionId: provided, url, options = {} } = req.body || {};
  try {
    const sessionId = provided || genSessionId();
    let bw;
    
    console.log(`[WebAuto] Launching browser: ${browser} for session ${sessionId}`);
    
    // 🔥 关键修复：强制使用 Firefox 启动 Camoufox
    if (browser === 'camoufox') {
      console.log(`[WebAuto] 🦊 TRUE Camoufox - using Firefox launcher`);
      const camoufoxPath = process.env.CAMOUFOX_PATH || '/Users/fanzhang/Library/Caches/camoufox/Camoufox.app/Contents/MacOS/camoufox';
      
      // 使用 Firefox，不是 Chromium！
      bw = await firefox.launch({ 
        headless, 
        executablePath: camoufoxPath,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage'
        ],
        ...options 
      });
      
      console.log(`[WebAuto] 🦊 Camoufox (Firefox) launched successfully`);
      
    } else if (browser === 'firefox') {
      bw = await firefox.launch({ headless, ...options });
    } else if (browser === 'webkit') {
      bw = await webkit.launch({ headless, ...options });
    } else {
      bw = await chromium.launch({ headless, ...options });
    }
    
    const context = await bw.newContext({});
    const page = await context.newPage();
    
    if (url) {
      console.log(`[WebAuto] Navigating to ${url}`);
      await page.goto(url, { waitUntil: 'domcontentloaded' });
    }
    
    await installPageWatches(sessionId, context, page);
    await saveSession(sessionId, { browser: bw, context, page });
    
    console.log(`[WebAuto] Session ${sessionId} created successfully with ${browser}`);
    return res.json({ success: true, sessionId });
  } catch (e) {
    console.error(`[WebAuto] Session launch failed:`, e);
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
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
}

export async function cookiesSave(req, res) {
  const { sessionId, url } = req.body || {};
  if (!sessionId) return res.status(400).json({ success: false, error: 'sessionId required' });
  try {
    const s = await getSession(sessionId);
    if (!s || !s.context) return res.status(404).json({ success: false, error: 'session not found' });
    const target = url || (s.page?.url() || '');
    if (target) {
      try {
        const u = new URL(target);
        const host = sanitizeHost(u.hostname);
        const targetFile = join(COOKIES_DIR, `${host}.json`);
        ensureDir(COOKIES_DIR);
        const cookies = await s.context.cookies();
        writeFileSync(targetFile, JSON.stringify({ cookies, savedAt: Date.now(), url: target }, null, 2));
      } catch { }
    }
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
}

export async function listCookies(req, res) {
  const { sessionId, url } = req.body || {};
  if (!sessionId) return res.status(400).json({ success: false, error: 'sessionId required' });
  try {
    const s = await getSession(sessionId);
    if (!s || !s.context) return res.status(404).json({ success: false, error: 'session not found' });
    const target = url || (s.page?.url() || '');
    if (target) {
      try {
        const u = new URL(target);
        const host = sanitizeHost(u.hostname);
        const targetFile = join(COOKIES_DIR, `${host}.json`);
        if (existsSync(targetFile)) {
          const data = JSON.parse(readFileSync(targetFile, 'utf8'));
          return res.json({ success: true, data });
        }
      } catch { }
    }
    return res.json({ success: true, cookies: await s.context.cookies() });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
}
