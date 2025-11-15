// @ts-nocheck
import { getSession, saveSession } from '../lib/sessionAdapter.js';

async function getContext(sessionId) {
  const s = await getSession(sessionId);
  if (!s) throw new Error('session not found');
  if (!s.context) throw new Error('context not available');
  return s;
}

export async function tabClose(req, res) {
  const { sessionId, hostIncludes, urlPattern, closeAll = false } = req.body || {};
  if (!sessionId) return res.status(400).json({ success: false, error: 'sessionId required' });
  try {
    const s = await getContext(sessionId);
    const pages = s.context.pages?.() || [];
    const matched = [];
    for (const p of pages) {
      try {
        const u = p.url() || '';
        let ok = false;
        if (hostIncludes && u.includes(hostIncludes)) ok = true;
        if (!ok && urlPattern) { try { const re=new RegExp(urlPattern); ok = re.test(u); } catch {} }
        if (ok) matched.push(p);
      } catch {}
    }
    let count = 0;
    if (matched.length) {
      if (closeAll) { for (const p of matched) { try { await p.close(); count++; } catch {} } }
      else { try { await matched[matched.length-1].close(); count = 1; } catch {} }
    }
    return res.json({ success: true, closedCount: count });
  } catch (e) { return res.status(500).json({ success:false, error:e.message }); }
}

export async function tabAttach(req, res) {
  const { sessionId, urlPattern, bringToFront = true, waitUntil = 'domcontentloaded', timeout = 15000 } = req.body || {};
  if (!sessionId || !urlPattern) return res.status(400).json({ success:false, error:'sessionId and urlPattern required' });
  try {
    const s = await getContext(sessionId);
    const re = new RegExp(urlPattern);
    const pages = s.context.pages?.() || [];
    const matches = pages.filter(p => { try { return re.test(p.url()||''); } catch { return false; } });
    const page = matches.length ? matches[matches.length-1] : null;
    if (!page) return res.status(404).json({ success:false, error:'no page matches urlPattern' });
    if (bringToFront) { try { await page.bringToFront(); } catch {} }
    try { await page.waitForLoadState(waitUntil, { timeout }); } catch {}
    // update session's active page pointer
    s.page = page; await saveSession(sessionId, s);
    return res.json({ success:true, url: page.url() });
  } catch (e) { return res.status(500).json({ success:false, error:e.message }); }
}

export async function tabCloseUnmatched(req, res) {
  const { sessionId, keepUrlPattern, alsoCloseBlank = true } = req.body || {};
  if (!sessionId || !keepUrlPattern) return res.status(400).json({ success:false, error:'sessionId and keepUrlPattern required' });
  try {
    const s = await getContext(sessionId);
    const re = new RegExp(keepUrlPattern);
    const pages = s.context.pages?.() || [];
    let count = 0; let kept = 0;
    for (const p of pages) {
      try {
        const u = p.url() || '';
        const isBlank = u === 'about:blank' || u === '';
        const keep = re.test(u);
        if (keep) { kept++; continue; }
        if (isBlank && !alsoCloseBlank) continue;
        await p.close();
        count++;
      } catch {}
    }
    return res.json({ success:true, closedCount: count, keptCount: kept });
  } catch (e) { return res.status(500).json({ success:false, error:e.message }); }
}
