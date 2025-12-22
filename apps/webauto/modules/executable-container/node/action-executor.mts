import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadEvents, loadOperations } from './actions-loader.mjs';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

function resolveNodePath(nodeName){
  const map = {
    'EventDrivenOptionalClickNode': 'src/core/workflow/nodes/EventDrivenOptionalClickNode.js',
    'JavaScriptExecutionNode': 'src/core/workflow/nodes/JavaScriptExecutionNode.js',
    'PlaywrightClickNode': 'src/core/workflow/nodes/PlaywrightClickNode.js',
    'PlaywrightKeySequenceNode': 'src/core/workflow/nodes/PlaywrightKeySequenceNode.js'
  };
  return map[nodeName] || null;
}

async function loadNodeClass(nodeName){
  const rel = resolveNodePath(nodeName);
  if (!rel) throw new Error(`Unknown node: ${nodeName}`);
  const abs = path.join(process.cwd(), rel);
  const mod = await import(pathToFileURL(abs).toString());
  return mod.default || mod;
}

function findByKey(arr, key){
  return (arr || []).find(x => x && x.key === key) || null;
}

async function ensureTmpSelector(page, selector){
  try { await page.evaluate((s)=>{ window.__webautoTmpSelector = s; }, selector); } catch {}
}

async function ensureTmpValue(page, value){
  try { await page.evaluate((v)=>{ window.__webautoTmpValue = v; }, value); } catch {}
}

function resolveSiteFolder(site){
  if (!site) return null;
  // if it's a domain like weibo.com, use it directly; also try short name mapping via containers/catalog.json
  const catalogPath = join(process.cwd(), 'containers', 'catalog.json');
  if (existsSync(catalogPath)){
    try {
      const cat = JSON.parse(readFileSync(catalogPath,'utf8'));
      // match domains array
      for (const [short, info] of Object.entries(cat.sites||{})){
        const domains = info.domains || [];
        if ((domains||[]).some(d => site.includes(d)) || short === site || info.preferredFolder === site){
          return info.preferredFolder || (domains[0] || short);
        }
      }
    } catch {}
  }
  return site;
}

function tryReadJSON(fp){ try { return JSON.parse(readFileSync(fp,'utf8')); } catch { return null; } }

function loadContainerIndex(site){
  const folder = resolveSiteFolder(site) || site;
  const bases = [
    join(process.cwd(), 'containers', 'approved', folder, 'index.json'),
    join(process.cwd(), 'containers', 'staging', folder, 'index.json'),
    join(process.cwd(), 'containers', 'validated', folder, 'index.json'),
    join(process.cwd(), 'containers', 'test', folder, 'index.json'),
  ];
  for (const p of bases){
    if (existsSync(p)){
      const j = tryReadJSON(p); if (j) return j;
    }
  }
  return null;
}

function resolveContainerSelectorById(indexObj, containerId){
  try{
    const items = (indexObj && Array.isArray(indexObj.containers)) ? indexObj.containers : [];
    const found = items.find(x => x && x.id === containerId);
    return found ? (found.selector || null) : null;
  }catch{ return null; }
}

function combineDescendantSelectors(containerSelector, descendantSelectors){
  const c = (containerSelector || '').trim();
  const list = Array.isArray(descendantSelectors) ? descendantSelectors.filter(Boolean) : [];
  if (!c || !list.length) return list;
  return list.map(d => `${c} ${d}`);
}

async function executeWithNode(page, engine, nodeName, params){
  const NodeClass = await loadNodeClass(nodeName);
  const node = new NodeClass();
  const context = { page, logger: console, config: params || {}, engine };
  return await node.execute(context);
}

async function executeEvent(page, engine, site, key, selector){
  const lib = loadEvents(site);
  const ev = findByKey(lib.events, key);
  if (!ev) throw new Error(`event not found: ${key}`);
  const params = Object.assign({}, ev.params || {});
  // ensure selector is first candidate
  if (selector) {
    const arr = Array.isArray(params.selectors) ? params.selectors.slice() : [];
    params.selectors = [selector, ...arr.filter(s => s !== selector)];
  }
  await ensureTmpSelector(page, selector);
  return await executeWithNode(page, engine, ev.node, params);
}

async function executeOperation(page, engine, site, key, selector){
  const lib = loadOperations(site);
  const op = findByKey(lib.operations, key);
  if (!op) throw new Error(`operation not found: ${key}`);
  const params = Object.assign({}, op.params || {});
  let usingContainerSelector = false;
  // container-aware: combine container + descendant selectors
  if (Array.isArray(params.descendantSelectors) && params.descendantSelectors.length) {
    let containerSelector = null;
    // priority 1: explicit containerId in params
    if (params.containerId && site) {
      const idx = loadContainerIndex(site);
      const resolved = resolveContainerSelectorById(idx, params.containerId);
      if (resolved) containerSelector = resolved;
    }
    // priority 2: selector provided by UI treated as container root
    if (!containerSelector && selector) containerSelector = selector;
    if (containerSelector) {
      const combined = combineDescendantSelectors(containerSelector, params.descendantSelectors);
      const arr = Array.isArray(params.selectors) ? params.selectors.slice() : [];
      params.selectors = [...combined, ...arr];
      usingContainerSelector = true;
    }
  }
  // when not container-aware, just ensure selector is in the list
  if (!usingContainerSelector && selector) {
    const arr = Array.isArray(params.selectors) ? params.selectors.slice() : [];
    params.selectors = [selector, ...arr.filter(s => s !== selector)];
  }
  await ensureTmpSelector(page, selector);
  if (typeof params.value !== 'undefined') await ensureTmpValue(page, params.value);
  return await executeWithNode(page, engine, op.node, params);
}

export { executeEvent, executeOperation };
