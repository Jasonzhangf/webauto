#!/usr/bin/env node
// 重启 TypeScript 浏览器远程服务栈（libs/browser/remote-service.js）
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { loadBrowserServiceConfig } from '../../../../libs/browser/browser-service-config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(__dirname, '../../../..');

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
  await run(join(root,'runtime/infra/utils/scripts/service/stop-browser-service.mjs'), []);
  await run(join(root,'runtime/infra/utils/scripts/service/start-browser-service.mjs'), ['--host', host, '--port', String(port)]);
}

main().catch(e=>{ console.error('[restart] failed:', e?.message||String(e)); process.exit(1); });
