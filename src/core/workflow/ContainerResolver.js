// Simple container resolver for workflow nodes (JS)
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

function _listContainerJsonFiles(rootDir) {
  const out = [];
  try {
    const items = readdirSync(rootDir, { withFileTypes: true });
    for (const it of items) {
      const abs = join(rootDir, it.name);
      if (it.isDirectory()) {
        out.push(..._listContainerJsonFiles(abs));
      } else if (it.isFile() && it.name === 'container.json') {
        out.push(abs);
      }
    }
  } catch {}
  return out;
}

function _selectPrimarySelector(v2) {
  try {
    const arr = Array.isArray(v2.selectors) ? v2.selectors : [];
    if (!arr.length) return null;
    // 优先 primary
    const pri = arr.find(s => String(s.variant||'primary').toLowerCase() === 'primary') || arr[0];
    if (pri && pri.css) return String(pri.css);
    if (pri && pri.id) return `#${pri.id}`;
    const classes = pri?.classes || [];
    if (!Array.isArray(classes) || !classes.length) return null;
    return '.' + classes.join('.');
  } catch { return null; }
}

function _loadFromIndex() {
  const idxPath = join(process.cwd(), 'container-library.index.json');
  if (!existsSync(idxPath)) return null;
  try {
    const idx = JSON.parse(readFileSync(idxPath, 'utf8')) || {};
    const registry = {};
    for (const [siteKey, info] of Object.entries(idx)) {
      const sitePath = join(process.cwd(), info.path || '');
      const website = info.website || '';
      const files = _listContainerJsonFiles(sitePath);
      const containers = {};
      for (const file of files) {
        try {
          const raw = JSON.parse(readFileSync(file, 'utf8')) || {};
          // 计算 containerId = 相对路径（去掉末尾 /container.json），路径分隔转点
          const rel = relative(sitePath, file).replace(/\\/g, '/');
          const containerId = rel.replace(/\/container\.json$/,'').split('/').join('.');
          const selector = raw.selector || _selectPrimarySelector(raw) || '';
          containers[containerId] = {
            selector,
            description: raw.name || containerId,
            children: Array.isArray(raw.children) ? raw.children : [],
            actions: raw.actions || undefined,
          };
        } catch {}
      }
      registry[siteKey] = { website, containers };
    }
    return registry;
  } catch { return null; }
}

export function loadLibrary() {
  // 优先从目录索引加载（统一库）
  const v2 = _loadFromIndex();
  if (v2) return v2;
  // 兼容旧 monolith
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

export async function queryInScope(page, { selector, scopeSelector }) {
  return await page.evaluate((p) => {
    const scope = p.scopeSel ? document.querySelector(p.scopeSel) : document;
    if (!scope) return { found: false };
    const el = scope.querySelector(p.sel);
    if (!el) return { found: false };
    const r = el.getBoundingClientRect();
    return { found: true, rect: { x: r.x, y: r.y, width: r.width, height: r.height } };
  }, { sel: selector, scopeSel: scopeSelector || null });
}

export async function highlightInline(page, { selector, scopeSelector, label = 'CONTAINER', color = '#34c759', durationMs = 0, noScroll = false }) {
  return await page.evaluate((p) => {
    const scope = p.scopeSel ? document.querySelector(p.scopeSel) : document;
    if (!scope) return false;
    const el = scope.querySelector(p.sel);
    if (!el) return false;
    try {
      if (!p.noScroll) el.scrollIntoView({ behavior: 'instant', block: 'center' });
      if (!document.getElementById('__waHL_style')) {
        const st = document.createElement('style'); st.id='__waHL_style';
        st.textContent = `
          .wa-hl-inline{ outline:2px solid var(--wa-color,#34c759) !important; outline-offset:2px !important; border-radius:6px !important; position:relative !important; }
          .wa-hl-inline[data-wa-label]:after{ content: attr(data-wa-label); position:absolute; left:0; top:-18px; background: var(--wa-color,#34c759); color:#fff; padding:1px 6px; border-radius:4px; font:12px -apple-system,system-ui; z-index:2147483647 }
        `; document.head.appendChild(st);
      }
      el.classList.add('wa-hl-inline'); el.style.setProperty('--wa-color', p.color);
      el.setAttribute('data-wa-label', p.label);
      if (p.ms && p.ms>0) setTimeout(()=>{ try{ el.classList.remove('wa-hl-inline'); el.removeAttribute('data-wa-label'); }catch{} }, p.ms);
      return true;
    } catch { return false; }
  }, { sel: selector, scopeSel: scopeSelector || null, label, color, ms: durationMs || 0, noScroll: !!noScroll });
}

export async function selectByIndex(page, { selector, scopeSelector, index = 0 }) {
  const scopeId = `scope-${Date.now()}-${Math.floor(Math.random()*1e6)}`;
  const out = await page.evaluate((p) => {
    const scope = p.scopeSel ? document.querySelector(p.scopeSel) : document;
    if (!scope) return null;
    const items = Array.from(scope.querySelectorAll(p.sel));
    const el = items[p.idx]; if (!el) return null;
    el.setAttribute('data-wa-scope', p.scopeId);
    try{ el.scrollIntoView({ behavior: 'instant', block: 'center' }); }catch{}
    return { newScopeSelector: `[data-wa-scope="${p.scopeId}"]`, count: items.length };
  }, { sel: selector, scopeSel: scopeSelector || null, idx: Number(index)||0, scopeId });
  return out || null;
}

// ---------- New: container engine helpers for child enumeration & sequencing ----------

function _sortRects(rects = [], mode = 'dom') {
  if (!Array.isArray(rects)) return [];
  const m = String(mode||'dom').toLowerCase();
  if (m === 'top') return rects.slice().sort((a,b)=> (a.rect.y - b.rect.y));
  if (m === 'bottom') return rects.slice().sort((a,b)=> (b.rect.y - a.rect.y));
  if (m === 'left') return rects.slice().sort((a,b)=> (a.rect.x - b.rect.x));
  if (m === 'right') return rects.slice().sort((a,b)=> (b.rect.x - a.rect.x));
  if (m === 'score') return rects.slice().sort((a,b)=> (b.score - a.score));
  return rects; // dom order
}

export async function enumerateChildren(page, { parentScopeSelector, childSelector, frame = null, filterVisible = true, sort = 'dom', addAttrPrefix = 'wa-child' }) {
  const target = frame ? (function(){
    try{
      const frames = page.frames();
      if (frame.urlPattern) { const re=new RegExp(frame.urlPattern); const f=frames.find(fr=>re.test(fr.url())); if (f) return f; }
      if (frame.urlIncludes) { const f=frames.find(fr=>fr.url().includes(frame.urlIncludes)); if (f) return f; }
      if (typeof frame.index==='number' && frames[frame.index]) return frames[frame.index];
    }catch{}
    return page;
  })() : page;

  const list = await target.evaluate((p)=>{
    function vis(n){ try{ const s=getComputedStyle(n); if(s.display==='none'||s.visibility==='hidden'||Number(s.opacity)===0) return false; const r=n.getBoundingClientRect(); return r.width>8&&r.height>8&&r.y<innerHeight; }catch{return false} }
    const parent = p.parentSel ? document.querySelector(p.parentSel) : document; if(!parent) return [];
    const nodes = Array.prototype.slice.call(parent.querySelectorAll(p.childSel));
    const out = [];
    for (let i=0;i<nodes.length;i++){
      const el = nodes[i];
      const r = el.getBoundingClientRect();
      if (p.filter && !vis(el)) continue;
      const id = `${p.prefix}-${Date.now()}-${Math.floor(Math.random()*1e6)}-${i}`;
      try { el.setAttribute('data-wa-scope', id); } catch {}
      const score = (r.y) + (r.width * 0.001);
      out.push({ selector: `[data-wa-scope="${id}"]`, rect: { x:r.x, y:r.y, width:r.width, height:r.height }, score, index:i });
    }
    return out;
  }, { parentSel: parentScopeSelector||null, childSel: childSelector, filter: !!filterVisible, prefix: addAttrPrefix });

  return _sortRects(list, sort);
}

export async function performClickSequential(page, { selectors = [], frame = null, delayMs = 0 }) {
  const target = frame ? (function(){
    try{
      const frames = page.frames();
      if (frame.urlPattern) { const re=new RegExp(frame.urlPattern); const f=frames.find(fr=>re.test(fr.url())); if (f) return f; }
      if (frame.urlIncludes) { const f=frames.find(fr=>fr.url().includes(frame.urlIncludes)); if (f) return f; }
      if (typeof frame.index==='number' && frames[frame.index]) return frames[frame.index];
    }catch{}
    return page;
  })() : page;
  for (const sel of selectors) {
    try {
      await target.evaluate((s)=>{ const el=document.querySelector(s); if(!el) return false; const seq=['pointerover','mouseover','mousemove','pointerdown','mousedown','mouseup','pointerup','click']; for(const t of seq) el.dispatchEvent(new MouseEvent(t,{bubbles:true})); return true; }, sel.selector||sel);
      if (delayMs>0) await page.waitForTimeout(delayMs);
    } catch {}
  }
  return true;
}

// -------- Scoped selector composition (engine-level; prevents comma-leak) --------

export function scopeCompose(parentSelector = null, childSelector = '') {
  try {
    const parent = String(parentSelector || '').trim();
    const child = String(childSelector || '').trim();
    if (!parent) return child;
    if (!child) return parent;
    // split by commas, respecting simple quotes and brackets (lightweight)
    const parts = [];
    let buf = '';
    let depthRound = 0, depthSquare = 0, depthCurly = 0;
    let inSingle = false, inDouble = false;
    for (let i = 0; i < child.length; i++) {
      const ch = child[i];
      if (ch === "'" && !inDouble && depthRound===0 && depthSquare===0 && depthCurly===0) inSingle = !inSingle;
      else if (ch === '"' && !inSingle && depthRound===0 && depthSquare===0 && depthCurly===0) inDouble = !inDouble;
      else if (!inSingle && !inDouble) {
        if (ch === '(') depthRound++;
        else if (ch === ')') depthRound = Math.max(0, depthRound-1);
        else if (ch === '[') depthSquare++;
        else if (ch === ']') depthSquare = Math.max(0, depthSquare-1);
        else if (ch === '{') depthCurly++;
        else if (ch === '}') depthCurly = Math.max(0, depthCurly-1);
      }
      if (ch === ',' && !inSingle && !inDouble && depthRound===0 && depthSquare===0 && depthCurly===0) {
        if (buf.trim()) parts.push(buf.trim());
        buf = '';
      } else {
        buf += ch;
      }
    }
    if (buf.trim()) parts.push(buf.trim());
    return parts.map(p => `${parent} ${p}`).join(', ');
  } catch { return childSelector; }
}
