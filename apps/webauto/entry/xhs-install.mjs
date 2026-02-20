#!/usr/bin/env node
import minimist from 'minimist';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function run(cmd, args) {
  const lower = String(cmd || '').toLowerCase();
  const spawnOptions = {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 120000,
  };
  if (process.platform === 'win32' && (lower.endsWith('.cmd') || lower.endsWith('.bat'))) {
    const cmdLine = [quoteCmdArg(cmd), ...args.map(quoteCmdArg)].join(' ');
    return spawnSync('cmd.exe', ['/d', '/s', '/c', cmdLine], spawnOptions);
  }
  if (process.platform === 'win32' && lower.endsWith('.ps1')) {
    return spawnSync(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', cmd, ...args],
      spawnOptions,
    );
  }
  return spawnSync(cmd, args, spawnOptions);
}

function quoteCmdArg(value) {
  if (!value) return '""';
  if (!/[\s"]/u.test(value)) return value;
  return `"${String(value).replace(/"/g, '""')}"`;
}

function resolveOnPath(candidates, pathEnv = process.env.PATH || process.env.Path || '', delimiter = path.delimiter) {
  const dirs = String(pathEnv)
    .split(delimiter)
    .map((x) => x.trim())
    .filter(Boolean);
  for (const dir of dirs) {
    for (const name of candidates) {
      const full = path.join(dir, name);
      if (existsSync(full)) return full;
    }
  }
  return null;
}

function resolveNpxBin(platform = process.platform, pathEnv = process.env.PATH || process.env.Path || '') {
  if (platform !== 'win32') return 'npx';
  const resolved = resolveOnPath(
    ['npx.cmd', 'npx.exe', 'npx.bat', 'npx.ps1'],
    pathEnv,
    ';',
  );
  return resolved || 'npx.cmd';
}

function checkCamoufoxInstalled() {
  const candidates =
    process.platform === 'win32'
      ? [
          { cmd: 'python', args: ['-m', 'camoufox', 'path'] },
          { cmd: 'py', args: ['-3', '-m', 'camoufox', 'path'] },
        ]
      : [{ cmd: 'python3', args: ['-m', 'camoufox', 'path'] }];
  for (const candidate of candidates) {
    const ret = run(candidate.cmd, candidate.args);
    if (ret.status === 0) return true;
  }
  return false;
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

const isEntrypoint = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntrypoint) {
  main().catch((err) => {
    console.error(JSON.stringify({ ok: false, error: err?.message || String(err) }));
    process.exit(1);
  });
}

export const __internals = {
  resolveOnPath,
  resolveNpxBin,
};
