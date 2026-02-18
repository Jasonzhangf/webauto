#!/usr/bin/env node
import minimist from 'minimist';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { existsSync } from 'node:fs';

function run(cmd, args) {
  return spawnSync(cmd, args, { encoding: 'utf8' });
}

function resolveNpxBin() {
  return process.platform === 'win32' ? 'npx.cmd' : 'npx';
}

function checkCamoufoxInstalled() {
  const cmd = process.platform === 'win32' ? 'python' : 'python3';
  const ret = run(cmd, ['-m', 'camoufox', 'path']);
  return ret.status === 0;
}

function installCamoufox() {
  const ret = run(resolveNpxBin(), ['--yes', '--package=camoufox', 'camoufox', 'fetch']);
  return ret.status === 0;
}

function checkGeoIPInstalled() {
  return existsSync(path.join(os.homedir(), '.webauto', 'geoip', 'GeoLite2-City.mmdb'));
}

function installGeoIP() {
  const ret = run(resolveNpxBin(), ['--yes', '--package=@web-auto/camo', 'camo', 'init', 'geoip']);
  return ret.status === 0;
}

async function checkBackendHealth() {
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
  const downloadGeoip = argv['download-geoip'] === true;
  const ensureBackend = argv['ensure-backend'] === true;
  const provider = String(process.env.WEBAUTO_BROWSER_PROVIDER || 'camo').trim().toLowerCase();
  let camoufoxInstalled = checkCamoufoxInstalled();
  let geoipInstalled = checkGeoIPInstalled();

  if (!camoufoxInstalled && download) {
    camoufoxInstalled = installCamoufox();
  }
  if (!geoipInstalled && downloadGeoip) {
    geoipInstalled = installGeoIP();
  }

  let backendEnsured = false;
  let ensureBackendError = null;
  if (ensureBackend) {
    try {
      const mod = await import('../../../modules/camo-runtime/src/utils/browser-service.mjs');
      await mod.ensureBrowserService();
      backendEnsured = true;
    } catch (error) {
      ensureBackendError = error?.message || String(error);
    }
  }

  const backendHealthy = await checkBackendHealth();
  const dependencyReady = camoufoxInstalled || backendHealthy;
  const geoipReady = downloadGeoip ? geoipInstalled : true;
  const ok = dependencyReady && geoipReady;

  const result = {
    ok,
    camoufoxInstalled,
    provider,
    backendEnsured,
    ensureBackendError,
    backendHealthy,
    geoipInstalled,
    message: ok ? 'Camo 后端就绪' : (downloadGeoip && !geoipInstalled ? 'GeoIP 未安装' : 'Camoufox 未安装'),
  };

  console.log(JSON.stringify(result));
  if (!ok) process.exit(1);
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: err?.message || String(err) }));
  process.exit(1);
});
