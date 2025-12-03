#!/usr/bin/env node
// Vision engine test runner
// Saves all results under TEST_OUTPUT_DIR (default: /Users/fanzhang/.webauto/examples/test)

import fs from 'node:fs';
import path from 'node:path';

const OUT_ROOT = process.env.TEST_OUTPUT_DIR || '/Users/fanzhang/.webauto/examples/test';
const DEFAULT_ENDPOINT = process.env.VISION_ENDPOINT || 'http://127.0.0.1:7702';

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }
function ts() { return new Date().toISOString().replace(/[:.]/g, '-'); }
function dataUrlFromFile(file) { const b = fs.readFileSync(file); const ext = (path.extname(file).slice(1)||'png').toLowerCase(); const mime = ext==='jpg'?'image/jpeg':`image/${ext}`; return `data:${mime};base64,${b.toString('base64')}`; }

function parseArgs(argv) {
  const args = { endpoint: DEFAULT_ENDPOINT, query: '点击“搜索”按钮' };
  for (let i=2;i<argv.length;i++){
    const a = argv[i]; if(!a.startsWith('--')) continue;
    const eq = a.indexOf('='); const k = a.slice(2, eq>0?eq:undefined); const v = eq>0 ? a.slice(eq+1) : argv[++i];
    if(['image','template','region','query','endpoint','outdir','targetSquare','targetWidth','targetHeight','bbox','minWidth','maxWidth','expectContainers','expectItems','expectBBoxes','saveInput','save-input'].includes(k)) args[k]=v;
  }
  if (!args.image && !process.env.TEST_IMAGE) {
    console.error('Usage: node scripts/run-vision-tests.mjs --image <path> [--template <path>] [--region x,y,w,h] [--query "..."] [--endpoint http://127.0.0.1:7702] [--outdir /path]');
    process.exit(1);
  }
  return args;
}

function parseRegion(s){ if(!s) return null; const m=s.split(',').map(n=>Number(n)); if(m.length!==4||m.some(isNaN)) return null; return {x:m[0],y:m[1],width:m[2],height:m[3]}; }

async function annotateBBox(inputBuf, bboxes=[]) {
  const sharp = (await import('sharp')).default;
  const meta = await sharp(inputBuf).metadata();
  const w = meta.width || 0, h = meta.height || 0;
  const rects = bboxes.map(b=>`<rect x="${b[0]}" y="${b[1]}" width="${Math.max(1,b[2]-b[0])}" height="${Math.max(1,b[3]-b[1])}" fill="none" stroke="red" stroke-width="3"/>`).join('');
  const svg = Buffer.from(`<svg width="${w}" height="${h}">${rects}</svg>`);
  return await sharp(inputBuf).composite([{ input: svg, top: 0, left: 0 }]).png().toBuffer();
}

async function annotatePoint(inputBuf, pt=[0,0], box=30){
  const [x,y]=pt; const half=Math.floor(box/2);
  const b=[x-half,y-half,x+half,y+half];
  return annotateBBox(inputBuf, [b]);
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
  const outRoot = args.outdir || OUT_ROOT;
  const outDir = path.join(outRoot, `${path.basename(imagePath, path.extname(imagePath))}-${ts()}`);
  ensureDir(outDir);

  const inputBuf = fs.readFileSync(imagePath);
  const inputDataUrl = dataUrlFromFile(imagePath);
  // default: do NOT save input; enable with --save-input
  const saveInput = !!args.saveInput || !!args['save-input'];
  if (saveInput) fs.writeFileSync(path.join(outDir, 'input.png'), inputBuf);

  // Check vision health first
  const ok = await waitHealth(`${endpoint}/health`, 20000);
  if(!ok) {
    console.error('❌ Vision Engine not reachable at', endpoint);
    console.error('已保存输入文件到', path.join(outDir,'input.png'));
    process.exit(2);
  }

  // 1) Full image recognition
  const params = {};
  if (args.targetSquare) params.targetSquare = Number(args.targetSquare);
  if (args.targetWidth) params.targetWidth = Number(args.targetWidth);
  if (args.targetHeight) params.targetHeight = Number(args.targetHeight);
  if (args.bbox) params.bbox = Number(args.bbox);
  if (args.expectContainers) params.expectContainers = String(args.expectContainers).toLowerCase() !== 'false';
  if (args.expectItems) params.expectItems = String(args.expectItems).toLowerCase() !== 'false';
  if (args.expectBBoxes) params.expectBBoxes = String(args.expectBBoxes).toLowerCase() !== 'false';
  const bodyFull = { image: inputDataUrl, query: args.query, parameters: params };
  const t0 = performance.now();
  const r1 = await fetch(`${endpoint}/recognize`, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(bodyFull) });
  const j1 = await r1.json();
  const t1 = performance.now();
  j1._clientTimingMs = Math.round(t1 - t0);
  fs.writeFileSync(path.join(outDir, 'recognize-full.json'), JSON.stringify(j1, null, 2));
  // gather all boxes
  const boxes=[];
  if (Array.isArray(j1?.elements)) {
    for (const e of j1.elements) if (Array.isArray(e?.bbox)) boxes.push(e.bbox);
  }
  const cb = j1?.metadata?.containerBBoxes?.originalPixel || {};
  if (Array.isArray(cb?.list)) boxes.push(cb.list);
  if (Array.isArray(cb?.content)) boxes.push(cb.content);
  const ib = j1?.metadata?.itemsBBoxes?.originalPixel || j1?.metadata?.items?.originalPixel || {};
  if (Array.isArray(ib)) { for (const b of ib) if (Array.isArray(b)) boxes.push(b); }
  else {
    if (Array.isArray(ib?.items)) for (const b of ib.items) if (Array.isArray(b)) boxes.push(b);
  }
  if (boxes.length) {
    const ann = await annotateBBox(inputBuf, boxes);
    fs.writeFileSync(path.join(outDir, 'recognize-full-annotated.png'), ann);
  }

  // 2) Region (if provided)
  const region = parseRegion(args.region);
  if (region) {
    const bodyReg = { image: inputDataUrl, query: args.query, region, parameters: params };
    const r2 = await fetch(`${endpoint}/recognize`, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(bodyReg) });
    const j2 = await r2.json();
    fs.writeFileSync(path.join(outDir, 'recognize-region.json'), JSON.stringify(j2, null, 2));
    if (j2?.elements?.[0]?.bbox) {
      const ann = await annotateBBox(inputBuf, [j2.elements[0].bbox]);
      fs.writeFileSync(path.join(outDir, 'recognize-region-annotated.png'), ann);
      const [x1,y1,x2,y2] = j2.elements[0].bbox;
      const w = Math.max(1, x2-x1), h = Math.max(1, y2-y1);
      const sharp = (await import('sharp')).default;
      const crop = await sharp(inputBuf).extract({ left: x1, top: y1, width: w, height: h }).png().toBuffer();
      fs.writeFileSync(path.join(outDir, 'recognize-region-crop.png'), crop);
    }

    const r2c = await fetch(`${endpoint}/recognize/crop`, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(bodyReg) });
    const j2c = await r2c.json();
    fs.writeFileSync(path.join(outDir, 'recognize-crop.json'), JSON.stringify(j2c, null, 2));
    if (j2c?.elements?.[0]?.bbox) {
      const ann = await annotateBBox(inputBuf, [j2c.elements[0].bbox]);
      fs.writeFileSync(path.join(outDir, 'recognize-crop-annotated.png'), ann);
      const [x1,y1,x2,y2] = j2c.elements[0].bbox;
      const w = Math.max(1, x2-x1), h = Math.max(1, y2-y1);
      const sharp = (await import('sharp')).default;
      const crop = await sharp(inputBuf).extract({ left: x1, top: y1, width: w, height: h }).png().toBuffer();
      fs.writeFileSync(path.join(outDir, 'recognize-crop-crop.png'), crop);
    }
  }

  // 3) Image search (template) - disabled
  if (false && args.template) {
    const tplBuf = fs.readFileSync(args.template);
    const tplData = dataUrlFromFile(args.template);
    const p2 = { targetWidth: 640, stride: 4 };
    if (args.minWidth) p2.minWidth = Number(args.minWidth);
    if (args.maxWidth) p2.maxWidth = Number(args.maxWidth);
    const bodySearch = { image: inputDataUrl, template: tplData, parameters: p2 };
    const r3 = await fetch(`${endpoint}/search-image`, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(bodySearch) });
    const j3 = await r3.json();
    fs.writeFileSync(path.join(outDir, 'search-image.json'), JSON.stringify(j3, null, 2));
    if (j3?.coordinate) {
      const [cx,cy] = j3.coordinate;
      // Prefer LM path metadata template size; fallback to legacy resized.template adjusted by scale
      let tplW = j3?.metadata?.templateSize?.width || null;
      let tplH = j3?.metadata?.templateSize?.height || null;
      if (!tplW || !tplH) {
        const tw = j3?.resized?.template?.width, th = j3?.resized?.template?.height, sc = j3?.resized?.scale || 1;
        if (tw && th) { tplW = Math.round(tw / sc); tplH = Math.round(th / sc); }
      }
      if (!tplW || !tplH) { tplW = 30; tplH = 30; }
      const halfW = Math.max(1, Math.floor(tplW / 2));
      const halfH = Math.max(1, Math.floor(tplH / 2));
      const x1 = Math.max(0, cx-halfW);
      const y1 = Math.max(0, cy-halfH);
      const x2 = cx + halfW;
      const y2 = cy + halfH;
      let w = Math.max(1, x2-x1), h = Math.max(1, y2-y1);
      const sharp = (await import('sharp')).default;
      // Draw a green rectangle corresponding to the template size
      const meta = await sharp(inputBuf).metadata();
      const imgW = meta.width || 0, imgH = meta.height || 0;
      // Clamp crop within image bounds
      if (x1 + w > imgW) w = Math.max(1, imgW - x1);
      if (y1 + h > imgH) h = Math.max(1, imgH - y1);
      const rect = `<rect x="${x1}" y="${y1}" width="${w}" height="${h}" fill="none" stroke="lime" stroke-width="4"/>`;
      const svg = Buffer.from(`<svg width="${imgW}" height="${imgH}">${rect}</svg>`);
      const ann = await sharp(inputBuf).composite([{ input: svg, top: 0, left: 0 }]).png().toBuffer();
      fs.writeFileSync(path.join(outDir, 'search-image-annotated.png'), ann);
      const crop = await sharp(inputBuf).extract({ left: x1, top: y1, width: w, height: h }).png().toBuffer();
      fs.writeFileSync(path.join(outDir, 'search-image-crop.png'), crop);
    }
  }

  console.log('✅ Test outputs saved to:', outDir);
}

main().catch(e=>{ console.error(e); process.exit(1); });
