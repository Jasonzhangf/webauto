#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';

function arg(k, def){
  const a = process.argv.find(x => x.startsWith(`--${k}=`));
  if (!a) return def; return a.slice(k.length+3);
}

function parseParams(){
  const out = {};
  for (const a of process.argv.slice(2)) {
    if (!a.startsWith('--')) continue;
    const i = a.indexOf('='); if (i<0) continue;
    const k = a.slice(2,i); const v = a.slice(i+1);
    if (['workflowPath','sessionId','url'].includes(k)) continue;
    out[k]=v;
  }
  return out;
}

async function main(){
  const workflowPath = arg('workflowPath');
  const sessionId = arg('sessionId');
  if (!workflowPath || !sessionId) {
    console.log('Usage: node scripts/run-workflow-via-api.mjs --workflowPath=<path> --sessionId=<SID> [--k=v ...]');
    process.exit(1);
  }
  const url = arg('url','http://127.0.0.1:7701/v1/workflows/run');
  const parameters = parseParams(); parameters.sessionId = sessionId; parameters.skipPreflows = (parameters.skipPreflows ?? 'true') !== 'false';
  const body = { workflowPath, parameters };
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(body) });
  const j = await res.json();
  console.log(JSON.stringify(j, null, 2));
}

main().catch(e=>{ console.error(e?.message||e); process.exit(1); });

