#!/usr/bin/env node
// 重启浏览器远程服务栈：
// 1) Node 侧 remote-service (7704，libs/browser/remote-service.js)
// 2) Python BrowserService (Camoufox 后端，默认 8888，services/browser_launcher.py)
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { loadBrowserServiceConfig } from '../../../libs/browser/browser-service-config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(__dirname, '../../..');

function run(cmd, args, env) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [cmd, ...args], { stdio: 'inherit', env: { ...process.env, ...(env||{}) } });
    p.on('exit', (code)=> resolve(code||0));
  });
}

async function main(){
  const cfg = loadBrowserServiceConfig();
  const port = Number(cfg.port || 7704);
  const host = String(cfg.host || '0.0.0.0');
  await run(join(root,'utils/scripts/service/stop-browser-service.mjs'), []);
  await run(join(root,'utils/scripts/service/start-browser-service.mjs'), ['--host', host, '--port', String(port)]);

  // 同时重启 Python BrowserService（Camoufox 后端），保证 browser_interface.py 等改动立即生效
  await run(join(root,'utils/scripts/service/restart-python-browser-service.mjs'), []);
}

main().catch(e=>{ console.error('[restart] failed:', e?.message||String(e)); process.exit(1); });
