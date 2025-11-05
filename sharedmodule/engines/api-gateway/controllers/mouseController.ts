// @ts-nocheck
import { getSession } from '../lib/sessionAdapter.js';

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

export async function move(req, res) {
  const { sessionId, x, y, steps = 1 } = req.body || {};
  if (!sessionId || typeof x !== 'number' || typeof y !== 'number') return res.status(400).json({ success:false, error:'sessionId,x,y required' });
  try { const page = await getPage(sessionId); await page.mouse.move(x,y,{ steps }); return res.json({ success:true }); } catch (e) { return res.status(500).json({ success:false, error:e.message }); }
}

export async function click(req, res) {
  const { sessionId, x, y, button = 'left', clicks = 1 } = req.body || {};
  if (!sessionId || typeof x !== 'number' || typeof y !== 'number') return res.status(400).json({ success:false, error:'sessionId,x,y required' });
  try { const page = await getPage(sessionId); await page.mouse.click(x,y,{ button, clickCount: clicks }); return res.json({ success:true }); } catch (e) { return res.status(500).json({ success:false, error:e.message }); }
}

export async function wheel(req, res) {
  const { sessionId, deltaX = 0, deltaY = 100 } = req.body || {};
  if (!sessionId) return res.status(400).json({ success:false, error:'sessionId required' });
  try { const page = await getPage(sessionId); await page.mouse.wheel(deltaX, deltaY); return res.json({ success:true }); } catch (e) { return res.status(500).json({ success:false, error:e.message }); }
}

export async function hover(req, res) {
  const { sessionId, x, y } = req.body || {};
  if (!sessionId || typeof x !== 'number' || typeof y !== 'number') return res.status(400).json({ success:false, error:'sessionId,x,y required' });
  try { const page = await getPage(sessionId); await page.mouse.move(x, y, { steps: 8 }); return res.json({ success:true }); } catch (e) { return res.status(500).json({ success:false, error:e.message }); }
}

export async function drag(req, res) {
  const { sessionId, from, to, steps = 20, holdMs = 50 } = req.body || {};
  if (!sessionId || !from || !to) return res.status(400).json({ success:false, error:'sessionId, from{x,y}, to{x,y} required' });
  try {
    const page = await getPage(sessionId);
    await page.mouse.move(from.x, from.y, { steps: 5 });
    await page.mouse.down();
    if (holdMs) await page.waitForTimeout(holdMs).catch(()=>{});
    await page.mouse.move(to.x, to.y, { steps });
    await page.mouse.up();
    return res.json({ success:true });
  } catch (e) { return res.status(500).json({ success:false, error:e.message }); }
}
