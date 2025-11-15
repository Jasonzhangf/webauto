#!/usr/bin/env node
// Run the 1688 single-chat relay workflow N times in sequence with dedup enabled
import { setTimeout as wait } from 'node:timers/promises';

async function getLatestSession(host){
  try{ const j = await fetch(host + '/v1/sessions').then(r=>r.json()); const arr=j.sessions||[]; return arr[arr.length-1]||null; }catch{return null}
}

function parseArgs(){
  const args = process.argv.slice(2);
  const opt = { keyword: '钢化膜', message: '你好', count: 3, host: 'http://127.0.0.1:7701', delayMin: 1000, delayMax: 5000, workflow: 'sharedmodule/libraries/workflows/1688/relay/1688-search-wangwang-chat-compose.json', sessionId: null, useLatestSession: false };
  for(const a of args){
    if(a.startsWith('--keyword=')) opt.keyword = a.slice(10);
    else if(a.startsWith('--message=')) opt.message = a.slice(10);
    else if(a.startsWith('--count=')) opt.count = Number(a.slice(8));
    else if(a.startsWith('--host=')) opt.host = a.slice(7);
    else if(a.startsWith('--delay-min=')) opt.delayMin = Number(a.slice(12));
    else if(a.startsWith('--delay-max=')) opt.delayMax = Number(a.slice(12));
    else if(a.startsWith('--workflow=')) opt.workflow = a.slice(11);
    else if(a.startsWith('--sessionId=')) opt.sessionId = a.slice(12);
    else if(a === '--use-latest-session') opt.useLatestSession = true;
  }
  return opt;
}

async function run(){
  const opt = parseArgs();
  if(!opt.sessionId && opt.useLatestSession){ opt.sessionId = await getLatestSession(opt.host); }
  const results = [];
  for(let i=0;i<opt.count;i++){
    const body = {
      workflowPath: opt.workflow,
      parameters: { keyword: opt.keyword, chatMessage: opt.message, startIndex: i, sessionId: opt.sessionId },
      options: { forceNoCleanup: true }
    };
    const out = await fetch(opt.host + '/v1/workflows/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r=>r.json()).catch(e=>({ success:false, error:String(e) }));
    results.push(out);
    const jitter = Math.max(0, Math.floor(opt.delayMin + Math.random() * (opt.delayMax - opt.delayMin)));
    await wait(jitter);
  }
  console.log(JSON.stringify({ success: results.every(r=>r && r.success), runs: results.length, results }, null, 2));
}

run().catch(e=>{ console.error(e); process.exit(1); });
