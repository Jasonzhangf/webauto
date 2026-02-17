#!/usr/bin/env node
import minimist from 'minimist';
import { spawnSync } from 'node:child_process';

function run(cmd, args) {
  return spawnSync(cmd, args, { encoding: 'utf8' });
}

function checkCamoufoxInstalled() {
  const ret = run('npx', ['camoufox', 'path']);
  return ret.status === 0;
}

function installCamoufox() {
  const ret = run('npx', ['camoufox', 'fetch']);
  return ret.status === 0;
}

async function checkBrowserService() {
  try {
    const res = await fetch('http://127.0.0.1:7704/health', { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function main() {
  const argv = minimist(process.argv.slice(2));
  const download = argv['download-browser'] === true;
  let camoufoxInstalled = checkCamoufoxInstalled();

  if (!camoufoxInstalled && download) {
    camoufoxInstalled = installCamoufox();
  }

  const browserServiceHealthy = await checkBrowserService();
  const ok = camoufoxInstalled;

  const result = {
    ok,
    camoufoxInstalled,
    browserServiceHealthy,
    message: camoufoxInstalled ? 'Camoufox 就绪' : 'Camoufox 未安装',
  };

  console.log(JSON.stringify(result));
  if (!ok) process.exit(1);
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: err?.message || String(err) }));
  process.exit(1);
});
