// @ts-nocheck
import { getSession } from '../lib/sessionAdapter.js';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

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

function resolveFrame(page, frame) {
  try {
    if (!frame) return page;
    const frames = page.frames();
    if (frame.urlPattern) { const re=new RegExp(frame.urlPattern); const f=frames.find(fr=>re.test(fr.url())); if (f) return f; }
    if (frame.urlIncludes) { const f=frames.find(fr=>fr.url().includes(frame.urlIncludes)); if (f) return f; }
    if (typeof frame.index==='number' && frames[frame.index]) return frames[frame.index];
  } catch {}
  return page;
}

export async function runScript(req, res) {
  const { sessionId, filePath, inlineScript, frame } = req.body || {};
  if (!sessionId || (!filePath && !inlineScript)) return res.status(400).json({ success: false, error: 'sessionId and filePath|inlineScript required' });
  try {
    const page = await getPage(sessionId);
    const target = resolveFrame(page, frame);
    let code = inlineScript || null;
    if (!code && filePath) {
      const abs = filePath.startsWith('.') || filePath.startsWith('/') ? join(process.cwd(), filePath) : join(process.cwd(), filePath);
      if (!existsSync(abs)) return res.status(404).json({ success: false, error: 'file not found' });
      code = readFileSync(abs,'utf8');
    }
    const value = await target.evaluate((scriptCode)=>{ try{ var fn=new Function(scriptCode); return { ok:true, val: fn() }; }catch(e){ return { ok:false, err: String(e) }; } }, code);
    if (!value.ok) return res.status(500).json({ success:false, error: value.err });
    return res.json({ success:true, data: value.val });
  } catch (e) { return res.status(500).json({ success:false, error: e.message }); }
}

export async function containerExtract(req, res) {
  const { sessionId, container, frame } = req.body || {};
  if (!sessionId || !container || !container.list) return res.status(400).json({ success:false, error:'sessionId and container.list required' });
  try {
    const page = await getPage(sessionId);
    const target = resolveFrame(page, frame);
    const data = await target.evaluate((conf)=>{
      const getVal = (root, spec) => {
        if (!spec) return null;
        if (typeof spec === 'string') {
          const at = spec.split('@');
          const sel = at[0];
          const attr = at[1] || null;
          const el = sel ? root.querySelector(sel) : root;
          if (!el) return null;
          if (attr === 'text') return (el.innerText||el.textContent||'').trim();
          if (attr) return el.getAttribute(attr);
          return (el.innerText||el.textContent||'').trim();
        }
        if (typeof spec === 'object') {
          const out = {};
          for (const k of Object.keys(spec)) out[k] = getVal(root, spec[k]);
          return out;
        }
        return null;
      };
      const list = Array.from(document.querySelectorAll(conf.list));
      const items = list.map(item => {
        const obj = {};
        const fields = conf.item || {};
        for (const k of Object.keys(fields)) obj[k] = getVal(item, fields[k]);
        return obj;
      });
      return { items, total: list.length, pageUrl: location.href };
    }, container);
    return res.json({ success:true, ...data });
  } catch (e) { return res.status(500).json({ success:false, error:e.message }); }
}

export async function extract1688Search(req, res) {
  const { sessionId, frame } = req.body || {};
  if (!sessionId) return res.status(400).json({ success:false, error:'sessionId required' });
  try {
    const page = await getPage(sessionId);
    const target = resolveFrame(page, frame);
    const data = await target.evaluate(()=>{
      const list = document.querySelectorAll('.sm-offer-item, .offer-item, .sm-offer, [class*="offer"]');
      const items = [];
      for (let i=0;i<list.length;i++){
        const item = list[i];
        const pick = (sel, attr) => { const el = item.querySelector(sel); if (!el) return null; if (attr==='text') return (el.innerText||el.textContent||'').trim(); if (attr) return el.getAttribute(attr); return (el.innerText||el.textContent||'').trim(); };
        const title = pick('h4 a, [class*="title"] a, a[title]', 'text');
        const price = pick('[class*="price"], [data-price]','text');
        const img = pick('img','src');
        const offerUrl = pick('a[href*=".1688.com/"]','href');
        const wangSpan = item.querySelector('span.J_WangWang, span[class*="WangWang"]');
        const wangLink = wangSpan ? (wangSpan.querySelector('a.ww-link')?.href || null) : null;
        const dataNick = wangSpan ? (wangSpan.getAttribute('data-nick')||null) : null;
        let offerId=null; try{ const m=(offerUrl||'').match(/(offer|offerId)[=\/](\d+)/i); if(m) offerId=m[2]; }catch{}
        items.push({ index:i, title, price, img, offerUrl, wangLink, dataNick, offerId });
      }
      return { items, total: items.length, pageUrl: location.href };
    });
    return res.json({ success:true, ...data });
  } catch (e) { return res.status(500).json({ success:false, error:e.message }); }
}

