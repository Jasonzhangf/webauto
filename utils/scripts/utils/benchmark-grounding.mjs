#!/usr/bin/env node
// Benchmark GUI grounding latency vs. input image size (targetSquare)
// Usage:
//   node scripts/benchmark-grounding.mjs \
//     --image /path/to/screenshot.png \
//     --query "点击“搜索”按钮" \
//     --endpoint http://127.0.0.1:7702 \
//     --sizes 0,256,384,512,640,768,1024,1280 \
//     --repeat 2 \
//     --outdir /Users/fanzhang/.webauto/examples/test

import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_ENDPOINT = process.env.VISION_ENDPOINT || 'http://127.0.0.1:7702';
const DEFAULT_OUTDIR = process.env.TEST_OUTPUT_DIR || '/Users/fanzhang/.webauto/examples/test';

function ensureDir(p){ fs.mkdirSync(p,{recursive:true}); }
function ts(){ return new Date().toISOString().replace(/[:.]/g,'-'); }
function dataUrlFromFile(file){ const b=fs.readFileSync(file); const ext=(path.extname(file).slice(1)||'png').toLowerCase(); const mime=ext==='jpg'?'image/jpeg':`image/${ext}`; return `data:${mime};base64,${b.toString('base64')}`; }

function parseArgs(argv){
  const args={ endpoint: DEFAULT_ENDPOINT, query: '点击“搜索”按钮', sizes: '0,256,384,512,640,768,1024', repeat: 2, outdir: DEFAULT_OUTDIR };
  for(let i=2;i<argv.length;i++){
    const a=argv[i]; if(!a.startsWith('--')) continue; const eq=a.indexOf('=');
    const k=a.slice(2, eq>0?eq:undefined); const v=eq>0?a.slice(eq+1):argv[++i];
    if(['image','query','endpoint','sizes','repeat','outdir'].includes(k)) args[k]=v;
  }
  if(!args.image && !process.env.TEST_IMAGE){
    console.error('Usage: node scripts/benchmark-grounding.mjs --image <path> [--query ...] [--endpoint ...] [--sizes 0,256,512,...] [--repeat N] [--outdir /path]');
    process.exit(1);
  }
  return args;
}

async function waitHealth(url, timeoutMs=20000){
  const t0=Date.now();
  while(Date.now()-t0<timeoutMs){
    try{ const r=await fetch(url); if(r.ok) return true; }catch{}
    await new Promise(r=>setTimeout(r,1000));
  }
  return false;
}

async function main(){
  const args = parseArgs(process.argv);
  const endpoint = args.endpoint || DEFAULT_ENDPOINT;
  const imagePath = args.image || process.env.TEST_IMAGE;
  const sizes = String(args.sizes||'').split(',').map(s=>Number(s.trim())).filter(s=>!isNaN(s));
  const repeat = Math.max(1, Number(args.repeat||1));
  const outRoot = args.outdir || DEFAULT_OUTDIR;
  const outDir = path.join(outRoot, `grounding-benchmark-${ts()}`);
  ensureDir(outDir);

  const ok = await waitHealth(`${endpoint}/health`, 20000);
  if(!ok){ console.error('❌ Vision Engine not reachable at', endpoint); process.exit(2); }

  const inputDataUrl = dataUrlFromFile(imagePath);
  fs.writeFileSync(path.join(outDir,'input.png'), fs.readFileSync(imagePath));

  const summary=[];
  for(const size of sizes){
    const label = size>0 ? `targetSquare=${size}` : 'original';
    const times=[]; let last=null; let okCount=0;
    for(let r=1;r<=repeat;r++){
      const body = { image: inputDataUrl, query: args.query };
      if(size>0) body.parameters = { targetSquare: size };
      const t0 = performance.now();
      const resp = await fetch(`${endpoint}/recognize`, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(body) });
      const t1 = performance.now();
      const dt = t1 - t0; times.push(dt);
      let j={}; try{ j=await resp.json(); }catch{}
      last=j; okCount += (j && j.success!==false) ? 1 : 0;
      // Save per-run raw json (first run for each size)
      if(r===1){ fs.writeFileSync(path.join(outDir, `${label.replace(/[^a-z0-9=]/gi,'_')}.json`), JSON.stringify(j,null,2)); }
    }
    const mean = times.reduce((a,b)=>a+b,0)/times.length;
    const stdev = Math.sqrt(times.reduce((a,b)=>a+Math.pow(b-mean,2),0)/times.length);
    summary.push({ label, size, repeat, ok: okCount, times_ms: times.map(x=>Math.round(x)), mean_ms: Math.round(mean), stdev_ms: Math.round(stdev) });
    console.log(`${label}: mean=${Math.round(mean)}ms stdev=${Math.round(stdev)}ms ok=${okCount}/${repeat}`);
  }
  fs.writeFileSync(path.join(outDir,'summary.json'), JSON.stringify({ endpoint, image: imagePath, query: args.query, sizes, repeat, results: summary }, null, 2));
  console.log('✅ Benchmark outputs saved to:', outDir);
}

main().catch(e=>{ console.error(e); process.exit(1); });

