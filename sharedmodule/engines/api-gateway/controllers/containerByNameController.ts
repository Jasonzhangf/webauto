// @ts-nocheck
import { getSession } from '../lib/sessionAdapter.js';
import { loadLibrary, getSiteKey, getSelectorByName, getChildren, domHelpers } from '../lib/containerResolver.js';

async function getPageContext(sessionId) {
  const s = await getSession(sessionId);
  if (!s) throw new Error('session not found');
  const page = s.page || (s.context?.pages?.()||[]).slice(-1)[0];
  if (!page) throw new Error('page not available');
  return { page, context: s.context };
}

export async function validateByName(req, res) {
  const { sessionId, containerName, scopeSelector, frame } = req.body || {};
  if (!sessionId || !containerName) return res.status(400).json({ success:false, error:'sessionId and containerName required' });
  try {
    const { page } = await getPageContext(sessionId);
    const lib = loadLibrary(); const pageUrl = page.url();
    const siteKey = getSiteKey(lib, pageUrl, null);
    const sel = getSelectorByName(lib, siteKey, containerName);
    if (!sel) return res.json({ success:true, found:false, selector:null });
    const found = await page.evaluate(domHelpers.pickFirstInScope, { sel, scopeSel: scopeSelector||null });
    return res.json({ success:true, found: !!(found && found.found), selector: sel, rect: found?.rect||null, siteKey, children: getChildren(lib, siteKey, containerName) });
  } catch (e) { return res.status(500).json({ success:false, error:e.message }); }
}

export async function highlightByName(req, res) {
  const { sessionId, containerName, scopeSelector, color = '#ff9500', label, durationMs = 3000 } = req.body || {};
  if (!sessionId || !containerName) return res.status(400).json({ success:false, error:'sessionId and containerName required' });
  try {
    const { page } = await getPageContext(sessionId);
    const lib = loadLibrary(); const pageUrl = page.url();
    const siteKey = getSiteKey(lib, pageUrl, null);
    const sel = getSelectorByName(lib, siteKey, containerName);
    if (!sel) return res.json({ success:false, error:'selector not found in library' });
    const ok = await page.evaluate((p)=>{
      const scope = p.scopeSel ? document.querySelector(p.scopeSel) : document;
      if (!scope) return false; const el = scope.querySelector(p.sel); if(!el) return false;
      try{ el.scrollIntoView({behavior:'instant', block:'center'}); }catch{}
      // inline outline + label
      try{ el.classList.add('wa-hl-inline'); el.style.outline=`2px solid ${p.color}`; el.style.outlineOffset='2px'; el.style.borderRadius='6px'; el.style.position= getComputedStyle(el).position==='static' ? 'relative' : getComputedStyle(el).position; }catch{}
      try{
        const tag=document.createElement('div'); tag.textContent=p.label||'CONTAINER'; tag.style.cssText=`position:absolute;left:0;top:-18px;background:${p.color};color:#fff;padding:1px 6px;border-radius:4px;font:12px -apple-system,system-ui;z-index:2147483647`;
        el.appendChild(tag); setTimeout(()=>{ try{ tag.remove(); }catch{} }, p.ms);
      }catch{}
      return true;
    }, { sel, scopeSel: scopeSelector||null, color, label: label||containerName, ms: durationMs });
    return res.json({ success: !!ok, selector: sel });
  } catch (e) { return res.status(500).json({ success:false, error:e.message }); }
}

export async function selectByName(req, res) {
  const { sessionId, containerName, scopeSelector, index = 0 } = req.body || {};
  if (!sessionId || !containerName) return res.status(400).json({ success:false, error:'sessionId and containerName required' });
  try {
    const { page } = await getPageContext(sessionId);
    const lib = loadLibrary(); const pageUrl = page.url();
    const siteKey = getSiteKey(lib, pageUrl, null);
    const sel = getSelectorByName(lib, siteKey, containerName);
    if (!sel) return res.json({ success:false, error:'selector not found in library' });
    const scopeId = `scope-${Date.now()}-${Math.floor(Math.random()*1e6)}`;
    const ok = await page.evaluate((p)=>{
      const scope = p.scopeSel ? document.querySelector(p.scopeSel) : document;
      if (!scope) return null;
      const list = Array.from(scope.querySelectorAll(p.sel));
      const el = list[p.idx]; if (!el) return null;
      el.setAttribute('data-wa-scope', p.scopeId);
      try{ el.scrollIntoView({behavior:'instant', block:'center'}); }catch{}
      return { count: list.length };
    }, { sel, scopeSel: scopeSelector||null, idx: Number(index)||0, scopeId });
    if (!ok) return res.json({ success:false, error:'no candidate to select' });
    const newScopeSelector = `[data-wa-scope="${scopeId}"]`;
    return res.json({ success:true, newScopeSelector, selector: sel, count: ok.count });
  } catch (e) { return res.status(500).json({ success:false, error:e.message }); }
}

export async function clickByName(req, res) {
  const { sessionId, containerName, scopeSelector } = req.body || {};
  if (!sessionId || !containerName) return res.status(400).json({ success:false, error:'sessionId and containerName required' });
  try {
    const { page } = await getPageContext(sessionId);
    const lib = loadLibrary(); const pageUrl = page.url();
    const siteKey = getSiteKey(lib, pageUrl, null);
    const sel = getSelectorByName(lib, siteKey, containerName);
    if (!sel) return res.json({ success:false, error:'selector not found in library' });
    const ok = await page.evaluate((p)=>{
      const scope = p.scopeSel ? document.querySelector(p.scopeSel) : document;
      if (!scope) return false; const el = scope.querySelector(p.sel); if (!el) return false;
      try{ el.scrollIntoView({behavior:'instant', block:'center'}); }catch{}
      el.dispatchEvent(new MouseEvent('pointerover',{bubbles:true}));
      el.dispatchEvent(new MouseEvent('mouseover',{bubbles:true}));
      el.dispatchEvent(new MouseEvent('mousemove',{bubbles:true}));
      el.dispatchEvent(new MouseEvent('pointerdown',{bubbles:true}));
      el.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));
      el.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));
      el.dispatchEvent(new MouseEvent('pointerup',{bubbles:true}));
      el.dispatchEvent(new MouseEvent('click',{bubbles:true}));
      return true;
    }, { sel, scopeSel: scopeSelector||null });
    return res.json({ success: !!ok });
  } catch (e) { return res.status(500).json({ success:false, error:e.message }); }
}
