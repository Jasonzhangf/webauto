// @ts-nocheck
import { getSession } from '../lib/sessionAdapter.js';

async function getSafePage(sessionId) {
  const s = await getSession(sessionId);
  if (!s) throw new Error('session not found');
  let page = s.page;
  if (!(page && typeof page.evaluate === 'function')) {
    const pages = typeof s.context?.pages === 'function' ? s.context.pages() : [];
    if (pages && pages.length) {
      page = pages[pages.length - 1];
    } else if (typeof s.context?.newPage === 'function') {
      page = await s.context.newPage();
    } else {
      throw new Error('page not available');
    }
  }
  return { page, context: s.context };
}

function resolveTargetFrame(page, frameCfg = {}) {
  try {
    const frames = page.frames();
    if (!frameCfg || typeof frameCfg !== 'object' || frames.length === 0) return null;
    if (frameCfg.urlPattern) {
      try { const re = new RegExp(frameCfg.urlPattern); const f = frames.find(fr => re.test(fr.url())); if (f) return f; } catch {}
    }
    if (frameCfg.urlIncludes) {
      const f = frames.find(fr => fr.url().includes(frameCfg.urlIncludes)); if (f) return f;
    }
    if (frameCfg.name) {
      const f = frames.find(fr => fr.name && fr.name() === frameCfg.name); if (f) return f;
    }
    if (typeof frameCfg.index === 'number' && frames[frameCfg.index]) return frames[frameCfg.index];
  } catch {}
  return null;
}

export async function snapshot(req, res) {
  const sessionId = req.query?.sessionId || req.body?.sessionId;
  const frame = req.query?.frame || req.body?.frame || {};
  const maxHtmlLength = Number(req.query?.maxHtmlLength || req.body?.maxHtmlLength || 500000);
  if (!sessionId) return res.status(400).json({ success: false, error: 'sessionId required' });
  try {
    const { page } = await getSafePage(sessionId);
    const target = frame ? (resolveTargetFrame(page, frame) || page) : page;
    const url = target.url();
    const title = await target.title().catch(()=> '');
    let html = await target.content();
    const htmlLength = html.length;
    if (html.length > maxHtmlLength) html = html.slice(0, maxHtmlLength);
    const scriptInfo = await target.evaluate(() => {
      const res = { inline: [], external: [] };
      try {
        const scripts = Array.from(document.querySelectorAll('script'));
        for (const [i,s] of scripts.entries()) {
          if (s.src) res.external.push({ index: i, src: new URL(s.src, location.href).href });
          else { const code = s.textContent || ''; res.inline.push({ index: i, length: code.length }); }
        }
      } catch {}
      return res;
    });
    return res.json({ success: true, snapshot: { url, title, html, htmlLength, truncated: htmlLength > html.length, scripts: scriptInfo, takenAt: new Date().toISOString() } });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
}

export async function html(req, res) {
  const sessionId = req.query?.sessionId || req.body?.sessionId;
  const frame = req.query?.frame || req.body?.frame || {};
  const maxHtmlLength = Number(req.query?.maxHtmlLength || req.body?.maxHtmlLength || 500000);
  if (!sessionId) return res.status(400).json({ success: false, error: 'sessionId required' });
  try {
    const { page } = await getSafePage(sessionId);
    const target = frame ? (resolveTargetFrame(page, frame) || page) : page;
    const url = target.url();
    let html = await target.content();
    if (html.length > maxHtmlLength) html = html.slice(0, maxHtmlLength);
    return res.json({ success: true, url, html });
  } catch (e) { return res.status(500).json({ success:false, error: e.message }); }
}

export async function scripts(req, res) {
  const sessionId = req.query?.sessionId || req.body?.sessionId;
  const frame = req.query?.frame || req.body?.frame || {};
  if (!sessionId) return res.status(400).json({ success: false, error: 'sessionId required' });
  try {
    const { page } = await getSafePage(sessionId);
    const target = frame ? (resolveTargetFrame(page, frame) || page) : page;
    const data = await target.evaluate(() => {
      const res = { inline: [], external: [] };
      try {
        const scripts = Array.from(document.querySelectorAll('script'));
        for (const [i,s] of scripts.entries()) {
          if (s.src) res.external.push({ index: i, src: new URL(s.src, location.href).href });
          else { const code = s.textContent || ''; res.inline.push({ index: i, length: code.length, head: code.slice(0,200), tail: code.slice(-200) }); }
        }
      } catch {}
      return res;
    });
    return res.json({ success: true, scripts: data });
  } catch (e) { return res.status(500).json({ success:false, error: e.message }); }
}

export async function text(req, res) {
  const sessionId = req.query?.sessionId || req.body?.sessionId;
  const frame = req.query?.frame || req.body?.frame || {};
  if (!sessionId) return res.status(400).json({ success: false, error: 'sessionId required' });
  try {
    const { page } = await getSafePage(sessionId);
    const target = frame ? (resolveTargetFrame(page, frame) || page) : page;
    const url = target.url();
    const text = await target.evaluate(() => document.body ? (document.body.innerText || '').trim() : '');
    return res.json({ success: true, url, text });
  } catch (e) { return res.status(500).json({ success:false, error: e.message }); }
}

export async function element(req, res) {
  const sessionId = req.query?.sessionId || req.body?.sessionId;
  const selector = req.query?.selector || req.body?.selector;
  const frame = req.query?.frame || req.body?.frame || {};
  if (!sessionId || !selector) return res.status(400).json({ success:false, error:'sessionId and selector required' });
  try {
    const { page } = await getSafePage(sessionId);
    const target = frame ? (resolveTargetFrame(page, frame) || page) : page;
    const out = await target.evaluate((sel)=>{
      const el = document.querySelector(sel);
      if (!el) return { exists:false };
      const r = el.getBoundingClientRect();
      const text = (el.innerText||el.textContent||'').trim();
      const html = el.outerHTML.slice(0, 1000);
      return { exists:true, rect:{x:r.x,y:r.y,width:r.width,height:r.height}, text, html };
    }, selector);
    return res.json({ success:true, ...out });
  } catch (e) { return res.status(500).json({ success:false, error:e.message }); }
}
