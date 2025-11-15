// @ts-nocheck
import { getPageBySession, resolveTargetFrame } from '../lib/sessionUtils.js';

export async function click(req, res) {
  const { sessionId, containerSelector, childSelector, frame, scopeSelector, button = 'left', clicks = 1 } = req.body || {};
  if (!sessionId || !containerSelector) return res.status(400).json({ success:false, error:'sessionId and containerSelector required' });
  try {
    const { page } = await getPageBySession(sessionId);
    const target = frame ? (resolveTargetFrame(page, frame) || page) : page;
    const selector = childSelector ? `${containerSelector} ${childSelector}` : containerSelector;
    let h;
    if (scopeSelector) {
      const root = await target.$(scopeSelector);
      h = root ? await root.$(selector) : null;
    } else {
      h = await target.$(selector);
    }
    if (!h) return res.status(404).json({ success:false, error:`element not found: ${selector}` });
    if (childSelector) {
      await h.scrollIntoViewIfNeeded().catch(()=>{});
      await h.click({ button, clickCount: clicks, timeout: 8000 }).catch(async ()=>{ await target.evaluate(el=>el.click(), h); });
    } else {
      const box = await h.boundingBox();
      if (!box) return res.status(500).json({ success:false, error:'no bounding box' });
      await target.mouse.click(Math.round(box.x+box.width/2), Math.round(box.y+box.height/2), { button, clickCount: clicks });
    }
    return res.json({ success:true });
  } catch (e) { return res.status(500).json({ success:false, error:e.message }); }
}

export async function type(req, res) {
  const { sessionId, containerSelector, childSelector, text, frame, scopeSelector, delay = 0 } = req.body || {};
  if (!sessionId || !containerSelector || !childSelector || typeof text !== 'string') return res.status(400).json({ success:false, error:'sessionId, containerSelector, childSelector and text required' });
  try {
    const { page } = await getPageBySession(sessionId);
    const target = frame ? (resolveTargetFrame(page, frame) || page) : page;
    const selector = `${containerSelector} ${childSelector}`;
    let handle;
    if (scopeSelector) {
      const root = await target.$(scopeSelector);
      handle = root ? await root.$(selector) : null;
    } else {
      handle = await target.$(selector);
    }
    if (!handle) return res.status(404).json({ success:false, error:`element not found: ${selector}` });
    // Try playwright fill for form fields
    const tag = await handle.evaluate(el=> (el.tagName||'').toLowerCase());
    const isInput = ['input','textarea'].includes(tag);
    const isEditable = await handle.evaluate(el=> el.getAttribute && (el.getAttribute('contenteditable')==='true' || el.isContentEditable===true));
    await handle.scrollIntoViewIfNeeded().catch(()=>{});
    if (isInput) {
      await target.fill(selector, text, { timeout: 8000 }).catch(async ()=>{
        await handle.focus(); await target.keyboard.type(text, { delay });
      });
    } else if (isEditable) {
      await handle.evaluate((el, t)=>{ try{ el.focus(); el.innerText=t; el.dispatchEvent(new InputEvent('input', {bubbles:true})); }catch{} }, text);
    } else {
      // Fallback: click then type
      await handle.click({ timeout: 4000 }).catch(()=>{});
      await target.keyboard.type(text, { delay });
    }
    return res.json({ success:true });
  } catch (e) { return res.status(500).json({ success:false, error:e.message }); }
}

export async function scroll(req, res) {
  const { sessionId, containerSelector, frame, scopeSelector, deltaY = 300 } = req.body || {};
  if (!sessionId || !containerSelector) return res.status(400).json({ success:false, error:'sessionId and containerSelector required' });
  try {
    const { page } = await getPageBySession(sessionId);
    const target = frame ? (resolveTargetFrame(page, frame) || page) : page;
    const ok = await target.evaluate((sel, scopeSel, dy)=>{
      const scope = scopeSel ? document.querySelector(scopeSel) : document;
      const el = scope ? scope.querySelector(sel) : null;
      if (!el) return false;
      try { el.scrollBy({ top: dy, behavior: 'smooth' }); } catch { try{ el.scrollTop += dy; }catch{} }
      return true;
    }, containerSelector, scopeSelector||null, deltaY);
    if (!ok) return res.status(404).json({ success:false, error:'container not found' });
    return res.json({ success:true });
  } catch (e) { return res.status(500).json({ success:false, error:e.message }); }
}

export async function hover(req, res) {
  const { sessionId, containerSelector, childSelector, frame, scopeSelector } = req.body || {};
  if (!sessionId || !containerSelector) return res.status(400).json({ success:false, error:'sessionId and containerSelector required' });
  try {
    const { page } = await getPageBySession(sessionId);
    const target = frame ? (resolveTargetFrame(page, frame) || page) : page;
    const selector = childSelector ? `${containerSelector} ${childSelector}` : containerSelector;
    let h;
    if (scopeSelector) {
      const root = await target.$(scopeSelector);
      h = root ? await root.$(selector) : null;
    } else {
      h = await target.$(selector);
    }
    if (!h) return res.status(404).json({ success:false, error:`element not found: ${selector}` });
    const box = await h.boundingBox(); if (!box) return res.status(500).json({ success:false, error:'no bounding box' });
    await target.mouse.move(Math.round(box.x+box.width/2), Math.round(box.y+box.height/2), { steps: 8 });
    return res.json({ success:true });
  } catch (e) { return res.status(500).json({ success:false, error:e.message }); }
}

export async function bbox(req, res) {
  const { sessionId, containerSelector, childSelector, frame, scopeSelector } = req.body || {};
  if (!sessionId || !containerSelector) return res.status(400).json({ success:false, error:'sessionId and containerSelector required' });
  try {
    const { page } = await getPageBySession(sessionId);
    const target = frame ? (resolveTargetFrame(page, frame) || page) : page;
    const selector = childSelector ? `${containerSelector} ${childSelector}` : containerSelector;
    let h;
    if (scopeSelector) {
      const root = await target.$(scopeSelector);
      h = root ? await root.$(selector) : null;
    } else {
      h = await target.$(selector);
    }
    if (!h) return res.status(404).json({ success:false, error:`element not found: ${selector}` });
    const box = await h.boundingBox();
    return res.json({ success:true, rect: box });
  } catch (e) { return res.status(500).json({ success:false, error:e.message }); }
}

export async function screenshot(req, res) {
  const { sessionId, containerSelector, childSelector, frame, scopeSelector, type = 'png', quality } = req.body || {};
  if (!sessionId || !containerSelector) return res.status(400).json({ success:false, error:'sessionId and containerSelector required' });
  try {
    const { page } = await getPageBySession(sessionId);
    const target = frame ? (resolveTargetFrame(page, frame) || page) : page;
    const selector = childSelector ? `${containerSelector} ${childSelector}` : containerSelector;
    let h;
    if (scopeSelector) {
      const root = await target.$(scopeSelector);
      h = root ? await root.$(selector) : null;
    } else {
      h = await target.$(selector);
    }
    if (!h) return res.status(404).json({ success:false, error:`element not found: ${selector}` });
    const box = await h.boundingBox(); if (!box) return res.status(500).json({ success:false, error:'no bounding box' });
    const buf = await target.screenshot({ type, clip: { x: Math.max(0, box.x), y: Math.max(0, box.y), width: Math.max(1, box.width), height: Math.max(1, box.height) }, quality });
    const base64 = `data:image/${type};base64,${buf.toString('base64')}`;
    return res.json({ success:true, image: base64 });
  } catch (e) { return res.status(500).json({ success:false, error:e.message }); }
}

export async function get(req, res) {
  const { sessionId, containerSelector, childSelector, frame, scopeSelector, attr } = req.body || {};
  if (!sessionId || !containerSelector) return res.status(400).json({ success:false, error:'sessionId and containerSelector required' });
  try {
    const { page } = await getPageBySession(sessionId);
    const target = frame ? (resolveTargetFrame(page, frame) || page) : page;
    const selector = childSelector ? `${containerSelector} ${childSelector}` : containerSelector;
    const out = await target.evaluate((sel, scopeSel, attr)=>{
      const scope = scopeSel ? document.querySelector(scopeSel) : document;
      const el = scope ? scope.querySelector(sel) : null;
      if (!el) return { exists:false };
      const text = (el.innerText||el.textContent||'').trim();
      const val = attr ? el.getAttribute(attr) : null;
      return { exists:true, text, attr: val };
    }, selector, scopeSelector||null, attr||null);
    return res.json({ success:true, ...out });
  } catch (e) { return res.status(500).json({ success:false, error:e.message }); }
}
