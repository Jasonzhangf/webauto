// @ts-nocheck
import { getSession } from '../lib/sessionAdapter.js';

export async function getPageBySession(sessionId) {
  const s = await getSession(sessionId);
  if (!s) throw new Error('session not found');
  let page = s.page;
  if (!(page && typeof page.evaluate === 'function')) {
    const pages = typeof s.context?.pages === 'function' ? s.context.pages() : [];
    if (pages && pages.length) page = pages[pages.length - 1];
  }
  if (!page) throw new Error('page not available');
  return { s, page };
}

export function resolveTargetFrame(page, frameCfg = {}) {
  try {
    const frames = page.frames();
    if (!frameCfg || typeof frameCfg !== 'object' || frames.length === 0) return null;
    if (frameCfg.urlPattern) { try { const re=new RegExp(frameCfg.urlPattern); const f=frames.find(fr=>re.test(fr.url())); if (f) return f; } catch {} }
    if (frameCfg.urlIncludes) { const f=frames.find(fr=>fr.url().includes(frameCfg.urlIncludes)); if (f) return f; }
    if (frameCfg.name) { const f=frames.find(fr=>fr.name && fr.name()===frameCfg.name); if (f) return f; }
    if (typeof frameCfg.index==='number' && frames[frameCfg.index]) return frames[frameCfg.index];
  } catch {}
  return null;
}

