// @ts-nocheck
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export function loadLibrary() {
  const p = join(process.cwd(), 'container-library.json');
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}

export function getSiteKey(lib, pageUrl, websiteHint = null) {
  try {
    if (!lib) return null;
    if (websiteHint && lib[websiteHint]) return websiteHint;
    const u = new URL(pageUrl); const host = u.hostname || '';
    for (const k of Object.keys(lib)) { const site = lib[k]; if (site?.website && host.includes(site.website)) return k; }
    const keys = Object.keys(lib); return keys.length ? keys[0] : null;
  } catch { return null; }
}

export function getSelectorByName(lib, siteKey, containerName) {
  try { return lib?.[siteKey]?.containers?.[containerName]?.selector || null; } catch { return null; }
}

export function getChildren(lib, siteKey, containerName) {
  try { return lib?.[siteKey]?.containers?.[containerName]?.children || []; } catch { return []; }
}

// In-page helpers injected via page.evaluate
export const domHelpers = {
  pickFirstInScope: (p) => {
    const scope = p.scopeSel ? document.querySelector(p.scopeSel) : document;
    if (!scope) return null;
    const el = scope.querySelector(p.sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { found: true, rect: { x: r.x, y: r.y, width: r.width, height: r.height } };
  },
  setScopeAttr: (p) => {
    const scope = p.scopeSel ? document.querySelector(p.scopeSel) : document;
    if (!scope) return null;
    const el = scope.querySelector(p.sel);
    if (!el) return null;
    el.setAttribute(p.attrName, p.attrVal);
    return true;
  }
};
