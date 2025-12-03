#!/usr/bin/env node
// Run three real sends from an existing 1688 search page, sequentially.
// Usage: node scripts/run-1688-three-send.mjs --sessionId=<id> [--message=你好] [--start=0]

import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

function parseArgs(){
  const args = process.argv.slice(2);
  const opt = { sessionId: null, message: '你好', start: 0, need: 3 };
  for(const a of args){
    if(a.startsWith('--sessionId=')) opt.sessionId = a.slice(12);
    else if(a.startsWith('--message=')) opt.message = a.slice(10);
    else if(a.startsWith('--start=')) opt.start = Number(a.slice(8));
    else if(a.startsWith('--need=')) opt.need = Number(a.slice(7));
  }
  return opt;
}

function runOne({ sessionId, index, message }){
  const p = join(process.cwd(),'scripts','one-shot-search-to-chat.mjs');
  const args = ['node', p, `--sessionId=${sessionId}`, `--index=${index}`, `--message=${message}`, '--send', '--waitMin=1000', '--waitMax=5000'];
  const r = spawnSync(args[0], args.slice(1), { encoding: 'utf8' });
  const out = (r.stdout||'').trim();
  try { return JSON.parse(out || '{}'); } catch { return { ok:false, parseError:true, raw: out }; }
}

async function main(){
  const opt = parseArgs();
  if(!opt.sessionId){
    console.error('missing --sessionId');
    process.exit(1);
  }
  let sent = 0; let i = opt.start; let attempts = 0;
  const results = [];
  while(sent < opt.need && attempts < 20){
    const r = runOne({ sessionId: opt.sessionId, index: i, message: opt.message });
    results.push({ index: i, r });
    if(r && r.ok && r.status === 'sent') sent++;
    i++; attempts++;
  }
  console.log(JSON.stringify({ ok: sent >= opt.need, sent, attempts, results }, null, 2));
}

main().catch(e=>{ console.error(e); process.exit(1); });

