#!/usr/bin/env node
// 一键启动浏览器（后台服务 + 会话 + 可选导航，基于配置文件）
import { spawn } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';
import { loadBrowserServiceConfig } from '../../../libs/browser/browser-service-config.js';

function parseArgs(argv){
  const cfg = loadBrowserServiceConfig();
  const args = { port: Number(cfg.port || 7704), host: String(cfg.host || '0.0.0.0'), headless: false, profile: 'default', url: '', restart: false };
  for (let i=2;i<argv.length;i++){
    const a = argv[i];
    if (a === '--port') { args.port = Number(argv[++i]); continue; }
    if (a === '--host') { args.host = String(argv[++i] || "0.0.0.0"); continue; }
    if (a === '--profile') { args.profile = argv[++i] || "default"; continue; }
    if (a === '--headless') { args.headless = true; continue; }
    if (a === '--url') { args.url = argv[++i] || ''; continue; }
    if (a === '--restart' || a === '--force-restart') { args.restart = true; continue; }
  }
  return args;
}

function runNode(file, args=[]) {
  return new Promise((resolve)=>{
    const p = spawn(process.execPath, [file, ...args], { stdio: 'inherit' });
    p.on('exit', code => resolve(code||0));
  });
}

async function waitHealth(url, timeoutMs=15000){
  const t0 = Date.now();
  while (Date.now()-t0 < timeoutMs){
    try { const r = await fetch(url); if (r.ok) return true; } catch {}
    await wait(300);
  }
  return false;
}

async function post(url, body){
  const r = await fetch(url, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(body||{}) });
  const text = await r.text();
  if (!r.ok) throw new Error(`${url} -> ${r.status} ${text}`);
  try { return JSON.parse(text); } catch { return { ok: false, raw: text }; }
}

async function main(){
  const { port, host, headless, profile, url, restart } = parseArgs(process.argv);
  const baseHost = host === '0.0.0.0' ? '127.0.0.1' : host;
  const base = `http://${baseHost}:${port}`;

  if (restart) {
    await runNode('utils/scripts/service/restart-browser-service.mjs', []);
  }

  // 确保服务在后台运行
  let healthy = await waitHealth(`${base}/health`, 1000);
  if (!healthy){
    const child = spawn(process.execPath, ['libs/browser/remote-service.js', '--host', String(host), '--port', String(port)], {
      detached: true, stdio: 'ignore', env: { ...process.env }
    });
    child.unref();
    healthy = await waitHealth(`${base}/health`, 8000);
  }
  if (!healthy){
    console.error(`[one-click] browser service not healthy on :${port}`);
    process.exit(1);
  }

  // 启动浏览器会话
  const startRes = await post(`${base}/command`, { action:'start', args:{ headless, profileId: profile, url } });
  if (!(startRes && startRes.ok)) throw new Error('start failed');
  console.log(`[one-click] browser started: profile=${profile}, headless=${headless}`);

  // 启用自动 Cookie 动态注入/保存
  try { await post(`${base}/command`, { action:'autoCookies:start', args:{ profileId: profile, intervalMs: 2500 } }); } catch {}

  // 可选导航
  if (url){
    const gotoRes = await post(`${base}/command`, { action:'goto', args:{ url, profileId: profile, waitTime: 2, keepOpen: !headless } }).catch(e=>{ console.warn('[one-click] goto failed:', e?.message||String(e)); return null; });
    if (gotoRes && gotoRes.ok) {
      console.log(`[one-click] navigated: ${url} (title=${gotoRes.info?.title||''})`);
      // 访问后尝试保存 Cookie（标准路径）
      const cookiePath = url.includes('weibo.com')
        ? '~/.webauto/cookies/weibo-domestic.json'
        : '~/.webauto/cookies/visited-default.json';
      try {
        const saved = await post(`${base}/command`, { action:'saveCookies', args:{ path: cookiePath, profileId: profile } });
        console.log(`[one-click] cookies saved -> ${cookiePath} (${saved.ok?'ok':'fail'})`);
      } catch (e) {
        console.warn('[one-click] saveCookies failed:', e?.message||String(e));
      }
    }
  }

  console.log(`[one-click] ready. Health: ${base}/health, Events: ${base}/events`);
}

main().catch(e=>{ console.error('[one-click] failed:', e?.message||String(e)); process.exit(1); });
