import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

function loadJSON(fp){ try{ return JSON.parse(readFileSync(fp,'utf8')); }catch(e){ return null; } }

function uniqByKey(arr){
  const map = new Map();
  for (const it of Array.isArray(arr) ? arr : []) {
    if (it && it.key) map.set(it.key, it);
  }
  return Array.from(map.values());
}

function siteCandidates(site){
  if (!site) return [];
  const short = site.includes('.') ? site.split('.')[0] : site;
  return [site, short];
}

function tryLoadSiteList(kind, site){
  if (!site) return [];
  const cands = siteCandidates(site);
  for (const s of cands) {
    const p = join(process.cwd(), 'actions-system', 'sites', s, `${kind}.json`);
    if (existsSync(p)) {
      const j = loadJSON(p) || {}; const key = kind === 'events' ? 'events' : 'operations';
      return j[key] || [];
    }
  }
  return [];
}

function loadEvents(site){
  const basePath = join(process.cwd(), 'actions-system', 'events', 'index.json');
  const base = existsSync(basePath) ? (loadJSON(basePath)?.events || []) : [];
  const siteList = tryLoadSiteList('events', site || process.env.ACTIONS_SITE);
  return { events: uniqByKey([ ...base, ...siteList ]) };
}

function loadOperations(site){
  const basePath = join(process.cwd(), 'actions-system', 'operations', 'index.json');
  const base = existsSync(basePath) ? (loadJSON(basePath)?.operations || []) : [];
  const siteList = tryLoadSiteList('operations', site || process.env.ACTIONS_SITE);
  return { operations: uniqByKey([ ...base, ...siteList ]) };
}

export { loadEvents, loadOperations };
