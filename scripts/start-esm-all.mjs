#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as sleep } from 'node:timers/promises';

const PORTS = { unified: 7701, browser: 7704 };

async function portFree(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(400) });
    return !res.ok;
  } catch { return true; }
}

async function killPidOnPort(port) {
  try {
    const p = spawn('lsof', ['-ti', `:${port}`]);
    const [out] = await once(p.stdout, 'data');
    const pid = Number(out.toString().trim());
    if (pid) { process.kill(pid, 'SIGTERM'); console.log(`[killed] port ${port} PID ${pid}`); await sleep(1000); }
  } catch {}
}

async function waitUp(name, port, timeout = 25_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1000) });
      if (r.ok) { console.log(`[up] ${name}`); return; }
    } catch {}
    await sleep(300);
  }
  throw new Error(`${name} start timeout`);
}

async function start(name, cmd, args, opts = {}) {
  console.log(`[start] ${name}`);
  const child = spawn(cmd, args, { stdio: 'inherit', shell: false, ...opts });
  return new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', c => (c ? reject(new Error(`${name} exit ${c}`)) : resolve()));
  });
}

async function main() {
  process.chdir('/Users/fanzhang/Documents/github/webauto');

  /* 1️⃣ unified-api */
  if (!(await portFree(PORTS.unified))) await killPidOnPort(PORTS.unified);
  start('unified-api','node',['dist/services/unified-api/index.js']).catch(() => {});
  await waitUp('unified-api', PORTS.unified);

  /* 2️⃣ browser-service --headful 弹出窗口 */
  if (!(await portFree(PORTS.browser))) await killPidOnPort(PORTS.browser);
  start('browser-service','node',['runtime/infra/utils/scripts/service/start-browser-service.mjs','--headful']).catch(() => {});
  await waitUp('browser-service', PORTS.browser);

  /* 3️⃣ 浮窗 */
  process.chdir('apps/floating-panel');
  start('floating-panel','npm',['run','start']).catch(() => {});
  echo "请手动在浮窗确认容器树/DOM 树是否正常。";

  await sleep(2000);
  console.log('\n=== 一键 ESM 化启动完成 ===');
  console.log('浏览器窗口已弹出；在浮窗查看“容器树”“DOM树”填充即通过。');
}

main().catch(err => { console.error(err); process.exit(1); });