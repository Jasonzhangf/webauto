// @ts-nocheck
import { getSession, saveSession } from '../lib/sessionAdapter.js';
import { ensureCookiesForUrl } from '../lib/cookieManager.js';
import { detectLoginAnchor, waitLoginAnchor } from '../lib/loginAnchor.js';

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
    s.page = page;
    await saveSession(sessionId, s);
  }
  return page;
}

export async function navigate(req, res) {
  const { sessionId, url, waitUntil = 'domcontentloaded', timeoutMs = 30000 } = req.body || {};
  if (!sessionId || !url) return res.status(400).json({ success: false, error: 'sessionId and url required' });
  try {
    const page = await getSafePage(sessionId);
    try { const s = await getSession(sessionId); if (s?.context) await ensureCookiesForUrl(s.context, url); } catch {}
    await page.goto(url, { waitUntil, timeout: timeoutMs });
    return res.json({ success: true, url: page.url() });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
}

export async function click(req, res) {
  const { sessionId, selector, bbox, text, clickOptions = {}, requireLoginAnchor = true, platform } = req.body || {};
  if (!sessionId) return res.status(400).json({ success: false, error: 'sessionId required' });
  try {
    const page = await getSafePage(sessionId);
    if (requireLoginAnchor) {
      const r = await detectLoginAnchor(page, { platform });
      if (!r.ok) return res.status(412).json({ success: false, error: 'login anchor not detected; aborting risky action' });
    }
    if (selector) {
      await page.click(selector, clickOptions);
    } else if (text) {
      const loc = page.locator(`text=${text}`);
      await loc.first().click(clickOptions);
    } else if (bbox) {
      const cx = Math.round((bbox.x1 + bbox.x2) / 2);
      const cy = Math.round((bbox.y1 + bbox.y2) / 2);
      await page.mouse.click(cx, cy, clickOptions);
    } else {
      return res.status(400).json({ success: false, error: 'selector or bbox or text required' });
    }
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
}

export async function type(req, res) {
  const { sessionId, selector, text, delay = 0, requireLoginAnchor = true, platform } = req.body || {};
  if (!sessionId || !selector || typeof text !== 'string') return res.status(400).json({ success: false, error: 'sessionId, selector and text required' });
  try {
    const page = await getSafePage(sessionId);
    if (requireLoginAnchor) {
      const r = await detectLoginAnchor(page, { platform });
      if (!r.ok) return res.status(412).json({ success: false, error: 'login anchor not detected; aborting risky action' });
    }
    await page.fill(selector, text, { timeout: 30000 });
    if (delay) await page.waitForTimeout(delay);
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
}

export async function evalInPage(req, res) {
  const { sessionId, script } = req.body || {};
  if (!sessionId || !script) return res.status(400).json({ success: false, error: 'sessionId and script required' });
  try {
    const page = await getSafePage(sessionId);
    const value = await page.evaluate((code) => {
      try { return { ok: true, val: (0, eval)(code) }; } catch (e) { return { ok: false, err: String(e) }; }
    }, script);
    if (!value.ok) return res.status(500).json({ success: false, error: value.err });
    return res.json({ success: true, value: value.val });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
}

export async function currentUrl(req, res) {
  const sessionId = req.query?.sessionId || req.body?.sessionId;
  if (!sessionId) return res.status(400).json({ success: false, error: 'sessionId required' });
  try {
    const page = await getSafePage(sessionId);
    return res.json({ success: true, url: page.url() });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
}

export async function highlight(req, res) {
  const { sessionId, selector, bbox, color = '#ff2d55', label = 'TARGET', durationMs = 5000, requireLoginAnchor = true, platform } = req.body || {};
  if (!sessionId) return res.status(400).json({ success: false, error: 'sessionId required' });
  try {
    const page = await getSafePage(sessionId);
    if (requireLoginAnchor) {
      const r = await detectLoginAnchor(page, { platform });
      if (!r.ok) return res.status(412).json({ success: false, error: 'login anchor not detected; aborting risky action' });
    }
    if (selector) {
      const ok = await page.evaluate(({ sel, color, label, durationMs }) => {
        const el = document.querySelector(sel);
        if (!el) return false;
        if (window.__webautoHighlight && typeof window.__webautoHighlight.createHighlight === 'function') {
          window.__webautoHighlight.createHighlight(el, { color, label, duration: durationMs, persist: false });
          return true;
        }
        return false;
      }, { sel: selector, color, label, durationMs });
      if (!ok) return res.status(500).json({ success: false, error: 'highlight service not available or element not found' });
    } else if (bbox) {
      await page.evaluate(({ bbox, color, label, durationMs }) => {
        if (window.__webautoHighlight && typeof window.__webautoHighlight.createHighlightFromRect === 'function') {
          window.__webautoHighlight.createHighlightFromRect({ x: bbox.x1, y: bbox.y1, width: bbox.x2 - bbox.x1, height: bbox.y2 - bbox.y1 }, { color, label, duration: durationMs });
        }
      }, { bbox, color, label, durationMs });
    } else {
      return res.status(400).json({ success: false, error: 'selector or bbox required' });
    }
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
}

export async function screenshot(req, res) {
  const { sessionId, fullPage = true } = req.body || {};
  if (!sessionId) return res.status(400).json({ success: false, error: 'sessionId required' });
  try {
    const page = await getSafePage(sessionId);
    const buf = await page.screenshot({ fullPage, type: 'png' });
    const base64 = `data:image/png;base64,${buf.toString('base64')}`;
    return res.json({ success: true, image: base64, timestamp: Date.now() });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
}

export async function checkLoginAnchor(req, res) {
  const { sessionId, platform } = req.body || {};
  if (!sessionId) return res.status(400).json({ success: false, error: 'sessionId required' });
  try {
    const page = await getSafePage(sessionId);
    const r = await detectLoginAnchor(page, { platform });
    return res.json({ success: true, detected: r.ok, selector: r.selector, platform: r.platform });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
}

export async function waitLoginAnchorEndpoint(req, res) {
  const { sessionId, platform, timeoutMs, intervalMs } = req.body || {};
  if (!sessionId) return res.status(400).json({ success: false, error: 'sessionId required' });
  try {
    const page = await getSafePage(sessionId);
    const r = await waitLoginAnchor(page, { platform, timeoutMs, intervalMs });
    return res.json({ success: r.ok, detected: r.ok, selector: r.selector, platform: r.platform });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
}
