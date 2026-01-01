// @ts-nocheck
import express from 'express';
import { TreeDiscoveryEngine } from '../../../libs/containers/src/engine/TreeDiscoveryEngine.js';
import { RootDetector } from '../../../libs/containers/src/engine/RootDetector.js';
import { RuntimeController } from '../../../libs/containers/src/engine/RuntimeController.js';
import { EventBus } from '../../../libs/operations-framework/src/event-driven/EventBus.js';

import { applyWorkflowOverlay } from '../../../libs/containers/src/engine/WorkflowOverlay.js';
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
const globalEventBus = new EventBus();
const PORT = Number(process.env.PORT_CONTAINER || 7703);
const WF_PORT = Number(process.env.PORT_WORKFLOW || 7701);

const app = express();
app.use(express.json({ limit: '10mb' }));

type Ctx = {
  id: string,
  sessionId: string,
  rootDef: any,
  defs: any[],
  engine: {
    detector: any,
    discovery: any,
    runtime: any,
  }
};

const contexts = new Map<string, Ctx>();

function classesToSelector(s: { classes: string[] }) {
  if (!s || !Array.isArray(s.classes) || !s.classes.length) return '*';
  return s.classes.map(c => '.' + c.trim().replace(/^\./, '')).join('');
}

async function wfEval(sessionId: string, script: string) {
  const r = await fetch(`http://127.0.0.1:${WF_PORT}/v1/browser/eval`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId, script }) });
  if (!r.ok) throw new Error('workflow eval failed');
  const j = await r.json();
  return j.value;
}

async function wfHighlight(sessionId: string, bbox: { x1:number;y1:number;x2:number;y2:number }, label?: string, color = '#00C853') {
  const payload = { sessionId, bbox, label, color, durationMs: 0 };
  const r = await fetch(`http://127.0.0.1:${WF_PORT}/v1/browser/highlight`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  return r.ok;
}

function depsFor(sessionId: string) {
  return {
    // Discovery deps
    queryByClasses: async (scope: any, selector: { classes: string[] }) => {
      const sel = classesToSelector(selector);
      // Scope-aware query: if scope has selector/index, query under that element; else global
      const scopeSel = scope?.selector;
      const scopeIdx = Number(scope?.index ?? 0);
      const script = scopeSel ? 
        `(()=>{const roots=document.querySelectorAll('${scopeSel}');const root=roots[${scopeIdx}]||null;if(!root) return [];return Array.from(root.querySelectorAll('${sel}')).map((el,idx)=>({ _h:{selector:'${sel}', index:idx} }));})()`
        :
        `Array.from(document.querySelectorAll('${sel}')).map((el,idx)=>({ _h:{selector:'${sel}', index:idx} }))`;
      const elements = await wfEval(sessionId, script);
      return elements.map((e:any)=>e._h);
    },
    visible: async (h: any) => {
      const sel = h.selector; const idx = h.index|0;
      return await wfEval(sessionId, `(()=>{const els=document.querySelectorAll('${sel}');const el=els[${idx}]||null;if(!el) return false;const s=getComputedStyle(el);const r=el.getBoundingClientRect();return s.visibility!=='hidden' && s.display!=='none' && r.width>0 && r.height>0;})()`);
    },
    bboxOf: async (h: any) => {
      const sel = h.selector; const idx = h.index|0;
      return await wfEval(sessionId, `(()=>{const els=document.querySelectorAll('${sel}');const el=els[${idx}]||null;if(!el) return undefined;const r=el.getBoundingClientRect();return {x1:Math.floor(r.left),y1:Math.floor(r.top),x2:Math.floor(r.right),y2:Math.floor(r.bottom)};})()`);
    },
    pageContext: async () => ({ url: await wfEval(sessionId, `location.href`) })
  };
}

// ---------- Debug endpoints (picker + save + library) ----------
async function wfEvalJSONRaw(sessionId: string, code: string) {
  const r = await fetch(`http://127.0.0.1:${WF_PORT}/v1/dev/eval-code`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId, code }) });
  if (!r.ok) throw new Error('eval-code failed');
  const j = await r.json();
  return j.value;
}

app.post('/v1/debug/picker/install', async (req, res) => {
  try {
    const { sessionId } = req.body || {};
    if (!sessionId) return res.status(400).json({ success:false, error:'sessionId required' });
    const r = await fetch(`http://127.0.0.1:${WF_PORT}/v1/dev/picker/install`, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ sessionId }) });
    if (!r.ok) return res.status(500).json({ success:false, error:'picker install failed' });
    return res.json({ success:true });
  } catch(e:any){ return res.status(500).json({ success:false, error:e.message }); }
});

app.post('/v1/debug/picker/toggle', async (req, res) => {
  try {
    const { sessionId, enabled } = req.body || {};
    if (!sessionId) return res.status(400).json({ success:false, error:'sessionId required' });
    const code = (enabled===false) ? 'window.__webautoPicker?.stop(); window.__webautoPicker?.getState?.();' : 'window.__webautoPicker?.start(); window.__webautoPicker?.getState?.();';
    const v = await wfEvalJSONRaw(sessionId, code);
    return res.json({ success:true, state: v?.val || v });
  } catch(e:any){ return res.status(500).json({ success:false, error:e.message }); }
});

app.get('/v1/debug/picker/state', async (req, res) => {
  try {
    const sessionId = (req.query?.sessionId as string) || '';
    if (!sessionId) return res.status(400).json({ success:false, error:'sessionId required' });
    const v = await wfEvalJSONRaw(sessionId, 'window.__webautoPicker?.getState?.()');
    return res.json({ success:true, state: v?.val || v });
  } catch(e:any){ return res.status(500).json({ success:false, error:e.message }); }
});

app.post('/v1/debug/highlight/test', async (req, res) => {
  try {
    const { sessionId, selector } = req.body || {};
    if (!sessionId || !selector || !selector.classes) return res.status(400).json({ success:false, error:'sessionId and selector.classes required' });
    const sel = '.' + (selector.classes as string[]).join('.');
    await wfEvalJSONRaw(sessionId, `window.__webautoPicker?.highlightAllRed?.(${JSON.stringify(sel)}); true`);
    return res.json({ success:true });
  } catch(e:any){ return res.status(500).json({ success:false, error:e.message }); }
});

// File helpers
function ensureDir(p:string){ try { mkdirSync(p, { recursive: true }); } catch {} }
function writeJSON(p:string, data:any){ ensureDir(dirname(p)); writeFileSync(p, JSON.stringify(data, null, 2)); }
function readJSON<T=any>(p:string, d?:any):T { try { const s = readFileSync(p,'utf8'); return JSON.parse(s); } catch { return d as T; } }
function listFiles(p:string):string[] { try { return readdirSync(p, { withFileTypes: true }).flatMap(e=> e.isDirectory()? listFiles(join(p, e.name)) : [join(p, e.name)] ); } catch { return []; } }
function djb2(s:string){ let h=5381; for(let i=0;i<s.length;i++) h=((h<<5)+h)^s.charCodeAt(i); return (h>>>0).toString(16); }

function sitePaths(site:string){
  const root = join(process.cwd(), 'libs/containers/staging', site);
  const contDir = join(root, 'containers');
  const index = join(root, 'index.json');
  return { root, contDir, index };
}

function regenerateIndex(site:string){
  const { contDir, index } = sitePaths(site);
  ensureDir(contDir);
  const files = listFiles(contDir).filter(f=>f.endsWith('.json'));
  const items:any[] = [];
  for (const f of files) {
    const def = readJSON<any>(f, null);
    if (!def) continue;
    const id = def?.id || (f.split('/').pop()||'').replace(/\.json$/,'');
    const firstSel = (def?.selectors?.[0]?.classes||[]).join('.') || '';
    items.push({ id, fileName: 'containers/' + f.slice(contDir.length+1), selector: firstSel ? ('.'+firstSel) : '' });
  }
  const data = { website: site, generatedAt: new Date().toISOString(), containerCount: items.length, containers: items, searchIndex: { byType: {}, byName: {}, byPriority: {} } };
  writeJSON(index, data);
  return data;
}

app.post('/v1/debug/container/save', async (req, res) => {
  try {
    const { site, def, rootId, parentId } = req.body || {};
    if (!site || !def || !def.id || !def.selectors) return res.status(400).json({ success:false, error:'site and def{id,selectors} required' });
    const { contDir } = sitePaths(site);
    ensureDir(contDir);
    const cls = (def.selectors?.[0]?.classes||[]).join('.');
    const hash = djb2(cls || def.id);
    const fileRel = `${def.id}_${hash}.json`;
    const fileAbs = join(contDir, fileRel);
    writeJSON(fileAbs, def);
    // Optionally update parent children
    if (parentId) {
      const files = listFiles(contDir).filter(f=>f.endsWith('.json'));
      let parentFile = '';
      for (const f of files) { const d = readJSON<any>(f,null); if (d?.id === parentId) { parentFile = f; break; } }
      if (parentFile) {
        const pd = readJSON<any>(parentFile, {});
        pd.children = Array.from(new Set([...(pd.children||[]), def.id]));
        writeJSON(parentFile, pd);
      }
    }
    const idx = regenerateIndex(site);
    return res.json({ success:true, fileName: `containers/${fileRel}`, indexUpdated:true, count: idx.containerCount });
  } catch(e:any){ return res.status(500).json({ success:false, error:e.message }); }
});

app.get('/v1/debug/library/roots', async (req,res)=>{
  try{
    const site = (req.query?.site as string) || '';
    if (!site) return res.status(400).json({ success:false, error:'site required' });
    const { contDir } = sitePaths(site);
    const files = listFiles(contDir).filter(f=>f.endsWith('.json'));
    const defs = files.map(f=> readJSON<any>(f, null)).filter(Boolean);
    const allIds = new Set(defs.map(d=>d.id));
    const referenced = new Set<string>();
    defs.forEach(d=> (d.children||[]).forEach((cid:string)=> referenced.add(cid)));
    const roots = Array.from(allIds).filter(id=> !referenced.has(id));
    return res.json({ success:true, roots });
  } catch(e:any){ return res.status(500).json({ success:false, error:e.message }); }
});

app.get('/v1/debug/library/tree', async (req,res)=>{
  try{
    const site = (req.query?.site as string) || '';
    const rootId = (req.query?.rootId as string) || '';
    if (!site || !rootId) return res.status(400).json({ success:false, error:'site and rootId required' });
    const { contDir } = sitePaths(site);
    const files = listFiles(contDir).filter(f=>f.endsWith('.json'));
    const defs = new Map(files.map(f=>{ const d = readJSON<any>(f,null); return [d?.id, d]; }));
    function build(id:string){ const d = defs.get(id); if(!d) return null; return { id, children: (d.children||[]).map(build).filter(Boolean) } }
    const tree = build(rootId);
    return res.json({ success:true, tree });
  } catch(e:any){ return res.status(500).json({ success:false, error:e.message }); }
});

app.get('/v1/debug/library/container/:id', async (req,res)=>{
  try{
    const site = (req.query?.site as string) || '';
    const id = req.params.id;
    if (!site || !id) return res.status(400).json({ success:false, error:'site and id required' });
    const { contDir } = sitePaths(site);
    const files = listFiles(contDir).filter(f=>f.endsWith('.json'));
    for (const f of files){ const d = readJSON<any>(f,null); if (d?.id===id) return res.json({ success:true, def:d }); }
    return res.status(404).json({ success:false, error:'not found' });
  } catch(e:any){ return res.status(500).json({ success:false, error:e.message }); }
});

app.post('/v1/debug/library/container/update', async (req,res)=>{
  try{
    const { site, def } = req.body || {};
    if (!site || !def || !def.id) return res.status(400).json({ success:false, error:'site and def{id} required' });
    const { contDir } = sitePaths(site);
    const files = listFiles(contDir).filter(f=>f.endsWith('.json'));
    let fileAbs = '';
    for (const f of files){ const d = readJSON<any>(f,null); if (d?.id===def.id){ fileAbs = f; break; } }
    if (!fileAbs){ const cls = (def.selectors?.[0]?.classes||[]).join('.'); const hash=djb2(cls||def.id); fileAbs = join(contDir, `${def.id}_${hash}.json`); }
    writeJSON(fileAbs, def);
    const idx = regenerateIndex(site);
    return res.json({ success:true, fileName: fileAbs.slice(contDir.length+1), indexUpdated:true, count: idx.containerCount });
  } catch(e:any){ return res.status(500).json({ success:false, error:e.message }); }
});

// Resolve first visible handle for a container id using its selectors under a given scope handle
async function resolveHandleForContainer(sessionId: string, site: string, containerId: string, scopeHandle?: any): Promise<any|null> {
  const { contDir } = sitePaths(site);
  const files = listFiles(contDir).filter(f=>f.endsWith('.json'));
  let def:any = null;
  for (const f of files){ const d = readJSON<any>(f,null); if (d?.id===containerId){ def = d; break; } }
  if (!def) return null;
  const selectors = Array.isArray(def.selectors) ? def.selectors : [];
  for (const sel of selectors){
    const handles = await depsFor(sessionId).queryByClasses(scopeHandle || { selector:'document', index:0 }, sel);
    for (const h of handles){
      const vis = await depsFor(sessionId).visible(h).catch(()=>false);
      if (vis) return h;
    }
  }
  return null;
}

function buildTreeMap(site:string){
  const { contDir } = sitePaths(site);
  const files = listFiles(contDir).filter(f=>f.endsWith('.json'));
  const defs = new Map<string, any>();
  files.forEach(f=>{ const d = readJSON<any>(f,null); if (d?.id) defs.set(d.id, d); });
  const parents = new Map<string, string>();
  defs.forEach((d, id)=> (d.children||[]).forEach((cid:string)=> parents.set(cid, id)) );
  function pathToRoot(id:string){ const path = []; let cur = id; const guard = new Set<string>(); while (cur && !guard.has(cur)) { guard.add(cur); path.unshift(cur); const p = parents.get(cur); cur = p || ''; } return path; }
  return { defs, parents, pathToRoot };
}

// Preview path: highlight root->...->parent chain (amber), then candidate selector (red)
app.post('/v1/debug/container/path/preview', async (req, res) => {
  try {
    const { sessionId, site, rootId, parentId, selector } = req.body || {};
    if (!sessionId || !site || !parentId || !selector || !selector.classes) return res.status(400).json({ success:false, error:'sessionId, site, parentId, selector.classes required' });
    const sel = { classes: selector.classes as string[] };
    const tree = buildTreeMap(site);
    // compute path root->...->parent
    const pth = rootId ? (function(){ const pr = tree.pathToRoot(parentId); if (pr[0]!==rootId) return pr; return pr; })() : tree.pathToRoot(parentId);
    // resolve and highlight chain
    let scope:any = { selector:'document', index:0 };
    for (const cid of pth){
      const h = await resolveHandleForContainer(sessionId, site, cid, scope);
      if (!h) continue;
      scope = h; // next scope constrained by this container
      const bb = await depsFor(sessionId).bboxOf(h);
      if (bb) await wfHighlight(sessionId, bb, `PATH:${cid}`, '#FFC400'); // amber
    }
    // final selector preview within parent scope
    const handles = await depsFor(sessionId).queryByClasses(scope, sel);
    for (const h of handles){ const bb = await depsFor(sessionId).bboxOf(h); if (bb) await wfHighlight(sessionId, bb, 'CANDIDATE', '#FF3B30'); }
    return res.json({ success:true, path: pth });
  } catch(e:any){ return res.status(500).json({ success:false, error:e.message }); }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime()*1000|0, contexts: contexts.size });
});

app.post('/v1/containers/context/create', async (req, res) => {
  try {
    const { sessionId, rootDef, overlay, defs } = req.body || {};
    if (!sessionId || !rootDef) return res.status(400).json({ success:false, error:'sessionId and rootDef required' });

    const defsApplied = applyWorkflowOverlay(defs || [rootDef], overlay || undefined);
    const detector = new RootDetector({
      queryByClasses: depsFor(sessionId).queryByClasses,
      documentHandle: async () => ({ selector: 'document', index: 0 })
    });
    const discovery = new TreeDiscoveryEngine(defsApplied, depsFor(sessionId));
    const runtime = new RuntimeController(defsApplied, discovery, runtimeDeps(sessionId));

    const ctxId = Math.random().toString(36).slice(2);
    const ctx: Ctx = { id: ctxId, sessionId, rootDef, defs: defsApplied, engine: { detector, discovery, runtime } };
    contexts.set(ctxId, ctx);

    // detect root and start
    const rd = await detector.detect(rootDef);
    if (!rd.found) return res.json({ success:true, contextId: ctxId, started:false, message:'root not detected' });
    await runtime.start(rootDef.id, rd.handle, (overlay?.runMode || 'sequential'));
    return res.json({ success:true, contextId: ctxId, started:true });
  } catch (e:any) {
    return res.status(500).json({ success:false, error: e.message || String(e) });
  }
});

app.get('/v1/containers/context/:id/graph', (req, res) => {
  const ctx = contexts.get(req.params.id);
  if (!ctx) return res.status(404).json({ success:false, error:'context not found' });
  const g = ctx.engine.runtime.currentGraph();
  // Map → plain object for JSON
  const nodes:any = {};
  for (const [k,v] of g.nodes.entries()) nodes[k] = v;
  return res.json({ success:true, graph: { nodes, edges: g.edges } });
});

app.get('/v1/containers/context/:id/focus', (req, res) => {
  const ctx = contexts.get(req.params.id);
  if (!ctx) return res.status(404).json({ success:false, error:'context not found' });
  const f = ctx.engine.runtime.currentFocus();
  return res.json({ success:true, focus: f });
});

// Static devtools (simple placeholder; add files under devtools/)
app.use('/devtools', express.static(join(process.cwd(), 'services/engines/container-engine/devtools')));

app.listen(PORT, () => {
  console.log(`Container Engine listening on http://localhost:${PORT}`);
});

function runtimeDeps(sessionId: string) {
  return {
    eventBus: globalEventBus,
    highlight: async (handleOrBBox: any, opts?: any) => {
      // if handle, convert to bbox; else use provided bbox
      let bbox = handleOrBBox;
      if (!(bbox && typeof bbox.x1 === 'number')) {
        const h = handleOrBBox;
        bbox = await depsFor(sessionId).bboxOf(h);
      }
      return wfHighlight(sessionId, bbox, opts?.label, opts?.color || '#00C853');
    },
    wait: async (ms: number) => new Promise(r => setTimeout(r, ms)),
    perform: async (node: any, op: any) => {
      if (op.def.type === 'click') {
        const bbox = await depsFor(sessionId).bboxOf(node.handle);
        if (!bbox) throw new Error('no bbox');
        const cx = Math.floor((bbox.x1 + bbox.x2)/2);
        const cy = Math.floor((bbox.y1 + bbox.y2)/2);
        await fetch(`http://127.0.0.1:${WF_PORT}/v1/mouse/click`, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ sessionId, x: cx, y: cy, button: 'left' }) });
        return { success: true };
      }
      if (op.def.type === 'scroll') {
        const dy = Number(op.def.config?.distance ?? 800);
        await wfEval(sessionId, `window.scrollBy(0, ${dy}); true`);
        return { success: true };
      }
      if (op.def.type === 'type') {
        // no-op placeholder: integrate with keyboard controller if selector available
        return { success: true };
      }
      return { success: true };
    }
  };
}
