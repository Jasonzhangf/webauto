#!/usr/bin/env node
// Quick start: build API, boot it in background, launch a browser session, print sessionId
import { setTimeout as wait } from 'node:timers/promises';
import { execSync, spawn } from 'node:child_process';

function arg(k, def) {
  const p = process.argv.find(a => a.startsWith(`--${k}=`));
  if (!p) return def;
  return p.slice(k.length + 3);
}

async function startApi() {
  try { execSync('npm run -s build:services', { stdio: 'inherit' }); } catch {}
  const child = spawn('node', ['dist/sharedmodule/engines/api-gateway/server.js'], { detached: true, stdio: 'ignore' });
  child.unref();
  for (let i=0;i<20;i++) { await wait(250); }
}

async function httpPost(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body||{}) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

async function main(){
  const sessionId = arg('sessionId');
  const headless = arg('headless','false') === 'true';
  const browser = arg('browser','chromium');
  await startApi();
  const j = await httpPost('http://127.0.0.1:7701/v1/browser/session/launch', { browser, headless, sessionId });
  if (!j || !j.success) throw new Error('launch failed');
  console.log('SESSION', j.sessionId);
  console.log('Tip: the page top-right shows SID. Use it to attach.');
}

main().catch(e=>{ console.error('Quick start failed:', e?.message||e); process.exit(1); });

