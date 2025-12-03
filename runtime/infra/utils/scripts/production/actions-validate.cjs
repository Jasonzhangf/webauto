#!/usr/bin/env node
/**
 * Validate actions-system JSON files with a light structural check.
 * Checks: presence of arrays, unique keys, required fields per item.
 */
const fs = require('fs');
const path = require('path');

function load(fp){ try { return JSON.parse(fs.readFileSync(fp, 'utf8')); } catch (e){ return null; } }
function uniqKeys(items){ const seen=new Set(); for (const it of items){ if (it && it.key){ if (seen.has(it.key)) return { ok:false, dup: it.key }; seen.add(it.key); } } return { ok: true }; }
function checkList(file, rootKey){
  const j = load(file);
  if (!j) return { ok: false, error: `invalid JSON: ${file}` };
  const arr = j[rootKey];
  if (!Array.isArray(arr)) return { ok: false, error: `${rootKey} not array: ${file}` };
  for (const [i, it] of arr.entries()){
    if (!it || typeof it !== 'object') return { ok: false, error: `${rootKey}[${i}] not object: ${file}` };
    if (!it.key || !it.node) return { ok: false, error: `${rootKey}[${i}] missing key/node: ${file}` };
  }
  const uq = uniqKeys(arr);
  if (!uq.ok) return { ok: false, error: `duplicate key '${uq.dup}' in ${file}` };
  return { ok: true };
}

function* walkFiles(dir){
  for (const name of fs.readdirSync(dir)){
    const fp = path.join(dir, name);
    const stat = fs.statSync(fp);
    if (stat.isDirectory()) yield* walkFiles(fp);
    else if (name.endsWith('.json')) yield fp;
  }
}

async function main(){
  const root = path.join(process.cwd(), 'actions-system');
  const targets = [];
  for (const fp of walkFiles(root)){
    if (/\/schemas\//.test(fp)) continue; // skip schemas themselves
    targets.push(fp);
  }
  let ok = true;
  for (const fp of targets){
    const base = path.basename(fp);
    if (base === 'index.json' && /\/events\//.test(fp)){
      const r = checkList(fp, 'events'); if (!r.ok){ ok=false; console.error('❌', r.error); } else { console.log('✅ OK', fp); }
    } else if (base === 'index.json' && /\/operations\//.test(fp)){
      const r = checkList(fp, 'operations'); if (!r.ok){ ok=false; console.error('❌', r.error); } else { console.log('✅ OK', fp); }
    } else if (/\/sites\/[^/]+\/events\.json$/.test(fp)){
      const r = checkList(fp, 'events'); if (!r.ok){ ok=false; console.error('❌', r.error); } else { console.log('✅ OK', fp); }
    } else if (/\/sites\/[^/]+\/operations\.json$/.test(fp)){
      const r = checkList(fp, 'operations'); if (!r.ok){ ok=false; console.error('❌', r.error); } else { console.log('✅ OK', fp); }
    }
  }
  if (!ok) process.exit(1);
}

main().catch(e=>{ console.error(e); process.exit(1); });

