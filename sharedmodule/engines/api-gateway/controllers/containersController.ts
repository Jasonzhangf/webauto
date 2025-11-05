// @ts-nocheck
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { getSession } from '../lib/sessionAdapter.js';

function readContainerLibrary() {
  const libPath = join(process.cwd(), 'container-library.json');
  if (!existsSync(libPath)) return null;
  try { return JSON.parse(readFileSync(libPath, 'utf8')); } catch { return null; }
}

function resolveContainerSelectorFromLibrary(pageUrl, containerName, websiteHint = null) {
  try {
    const lib = readContainerLibrary();
    if (!lib) return null;
    const url = new URL(pageUrl);
    const host = url.hostname || '';
    let siteKey = null;
    if (websiteHint && lib[websiteHint]) siteKey = websiteHint;
    else {
      for (const key of Object.keys(lib)) {
        const site = lib[key];
        if (site?.website && host.includes(site.website)) { siteKey = key; break; }
      }
      if (!siteKey) { const keys = Object.keys(lib); if (keys.length === 1) siteKey = keys[0]; }
    }
    if (!siteKey) return null;
    const containers = lib[siteKey]?.containers || {};
    const entry = containers[containerName];
    if (entry?.selector) return entry.selector;
  } catch {}
  return null;
}

async function getPage(sessionId) {
  const s = await getSession(sessionId);
  if (!s) throw new Error('session not found');
  let page = s.page;
  if (!(page && typeof page.evaluate === 'function')) {
    const pages = typeof s.context?.pages === 'function' ? s.context.pages() : [];
    if (pages && pages.length) page = pages[pages.length - 1];
  }
  if (!page) throw new Error('page not available');
  return page;
}

export async function list(req, res) {
  const lib = readContainerLibrary();
  if (!lib) return res.json({ success: true, sites: [] });
  const sites = Object.keys(lib).map(k => ({ key: k, website: lib[k]?.website || '', containers: Object.keys(lib[k]?.containers || {}) }));
  return res.json({ success: true, sites });
}

export async function resolve(req, res) {
  const { pageUrl, containerName, website } = req.body || {};
  if (!pageUrl || !containerName) return res.status(400).json({ success: false, error: 'pageUrl and containerName required' });
  const selector = resolveContainerSelectorFromLibrary(pageUrl, containerName, website || null);
  return res.json({ success: true, selector });
}

export async function validate(req, res) {
  const { sessionId, containerSelector, frame } = req.body || {};
  if (!sessionId || !containerSelector) return res.status(400).json({ success: false, error: 'sessionId and containerSelector required' });
  try {
    const page = await getPage(sessionId);
    let target = page;
    if (frame) {
      const f = (() => {
        const frames = page.frames();
        if (!frames.length) return null;
        if (frame.urlPattern) { try{ const re=new RegExp(frame.urlPattern); return frames.find(fr=>re.test(fr.url())); }catch{} }
        if (frame.urlIncludes) { const r = frames.find(fr=>fr.url().includes(frame.urlIncludes)); if (r) return r; }
        if (typeof frame.index==='number' && frames[frame.index]) return frames[frame.index];
        return null;
      })();
      target = f || page;
    }
    const ok = await target.$(containerSelector);
    let rect = null;
    try { if (ok) rect = await ok.boundingBox(); } catch {}
    return res.json({ success: true, found: !!ok, rect });
  } catch (e) { return res.status(500).json({ success:false, error: e.message }); }
}

export async function highlight(req, res) {
  const { sessionId, containerSelector, frame, color = '#ff9500', label = 'CONTAINER', durationMs = 3000 } = req.body || {};
  if (!sessionId || !containerSelector) return res.status(400).json({ success: false, error: 'sessionId and containerSelector required' });
  try {
    const page = await getPage(sessionId);
    const target = (()=>{
      try{
        const frames=page.frames();
        if (frame?.urlPattern) { const re=new RegExp(frame.urlPattern); const f=frames.find(fr=>re.test(fr.url())); if (f) return f; }
        if (frame?.urlIncludes) { const f=frames.find(fr=>fr.url().includes(frame.urlIncludes)); if (f) return f; }
      }catch{}
      return page;
    })();
    const applied = await target.evaluate((sel, color, label, ms)=>{
      const el=document.querySelector(sel); if(!el) return false;
      const r=el.getBoundingClientRect();
      const box=document.createElement('div'); box.style.cssText='position:fixed;left:'+(r.x-3)+'px;top:'+(r.y-3)+'px;width:'+(r.width+6)+'px;height:'+(r.height+6)+'px;border:3px solid '+color+';border-radius:8px;background:rgba(255,149,0,0.08);pointer-events:none;z-index:2147483647';
      const tag=document.createElement('div'); tag.textContent=label; tag.style.cssText='position:fixed;left:'+r.x+'px;top:'+(r.y-18)+'px;padding:1px 4px;background:'+color+';color:#fff;border-radius:3px;font:12px -apple-system,system-ui;z-index:2147483647';
      document.body.appendChild(box); document.body.appendChild(tag);
      setTimeout(()=>{ try{box.remove(); tag.remove();}catch{} }, ms);
      return true;
    }, containerSelector, color, label, durationMs);
    return res.json({ success: !!applied });
  } catch (e) { return res.status(500).json({ success:false, error: e.message }); }
}

