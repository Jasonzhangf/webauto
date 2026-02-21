#!/usr/bin/env node
import minimist from 'minimist';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { existsSync, rmSync } from 'node:fs';
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

function resolveWebautoRoot() {
  const portableRoot = String(process.env.WEBAUTO_PORTABLE_ROOT || process.env.WEBAUTO_ROOT || '').trim();
  if (portableRoot) return path.join(portableRoot, '.webauto');
  return path.join(os.homedir(), '.webauto');
}

function resolveGeoIPPath() {
  return path.join(resolveWebautoRoot(), 'geoip', 'GeoLite2-City.mmdb');
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
  return existsSync(resolveGeoIPPath());
}

function installGeoIP() {
  const ret = run(resolveNpxBin(), ['--yes', '--package=@web-auto/camo', 'camo', 'init', 'geoip']);
  return ret.status === 0;
}

function uninstallCamoufox() {
  const ret = run(resolveNpxBin(), ['--yes', '--package=camoufox', 'camoufox', 'remove']);
  return ret.status === 0;
}

function uninstallGeoIP() {
  const geoipDir = path.join(resolveWebautoRoot(), 'geoip');
  try {
    rmSync(geoipDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
  return !checkGeoIPInstalled();
}

function resolveModeAndSelection(argv = {}) {
  const legacyDownloadBrowser = argv['download-browser'] === true;
  const legacyDownloadGeoip = argv['download-geoip'] === true;
  const checkBrowserOnly = argv['check-browser-only'] === true;

  let mode = 'check';
  if (argv.auto === true) mode = 'auto';
  else if (argv.reinstall === true) mode = 'reinstall';
  else if (argv.uninstall === true || argv.remove === true) mode = 'uninstall';
  else if (argv.install === true || legacyDownloadBrowser || legacyDownloadGeoip) mode = 'install';

  const explicitBrowser = argv.browser === true || legacyDownloadBrowser || checkBrowserOnly;
  const explicitGeoip = argv.geoip === true || legacyDownloadGeoip;
  const explicitAll = argv.all === true;
  const explicitAny = explicitBrowser || explicitGeoip || explicitAll;

  let browser = false;
  let geoip = false;
  if (mode === 'check') {
    browser = explicitBrowser || explicitAll || !explicitAny;
    geoip = explicitGeoip || explicitAll;
  } else {
    browser = explicitBrowser || explicitAll || !explicitAny;
    geoip = explicitGeoip || explicitAll || !explicitAny;
  }

  return { mode, browser, geoip };
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
  const argv = minimist(process.argv.slice(2), {
    boolean: [
      'auto',
      'install',
      'uninstall',
      'remove',
      'reinstall',
      'check-browser-only',
      'download-browser',
      'download-geoip',
      'browser',
      'geoip',
      'all',
      'ensure-backend',
      'json',
    ],
  });
  const { mode, browser, geoip } = resolveModeAndSelection(argv);
  const ensureBackend = argv['ensure-backend'] === true;
  const provider = String(process.env.WEBAUTO_BROWSER_PROVIDER || 'camo').trim().toLowerCase();
  const before = {
    camoufoxInstalled: checkCamoufoxInstalled(),
    geoipInstalled: checkGeoIPInstalled(),
    backendHealthy: await checkBackendHealth(),
  };
  const actions = {
    browserInstalled: false,
    browserUninstalled: false,
    geoipInstalled: false,
    geoipUninstalled: false,
  };

  let camoufoxInstalled = before.camoufoxInstalled;
  let geoipInstalled = before.geoipInstalled;
  let operationError = null;

  if (mode === 'auto' || mode === 'install') {
    if (browser && !camoufoxInstalled) {
      actions.browserInstalled = installCamoufox();
      camoufoxInstalled = checkCamoufoxInstalled();
      if (!camoufoxInstalled) operationError = operationError || 'camoufox_install_failed';
    }
    if (geoip && !geoipInstalled) {
      actions.geoipInstalled = installGeoIP();
      geoipInstalled = checkGeoIPInstalled();
      if (!geoipInstalled) operationError = operationError || 'geoip_install_failed';
    }
  }

  if (mode === 'uninstall' || mode === 'reinstall') {
    if (browser) {
      actions.browserUninstalled = uninstallCamoufox();
      camoufoxInstalled = checkCamoufoxInstalled();
      if (camoufoxInstalled) operationError = operationError || 'camoufox_uninstall_failed';
    }
    if (geoip) {
      actions.geoipUninstalled = uninstallGeoIP();
      geoipInstalled = checkGeoIPInstalled();
      if (geoipInstalled) operationError = operationError || 'geoip_uninstall_failed';
    }
  }

  if (mode === 'reinstall') {
    if (browser) {
      actions.browserInstalled = installCamoufox();
      camoufoxInstalled = checkCamoufoxInstalled();
      if (!camoufoxInstalled) operationError = operationError || 'camoufox_install_failed';
    }
    if (geoip) {
      actions.geoipInstalled = installGeoIP();
      geoipInstalled = checkGeoIPInstalled();
      if (!geoipInstalled) operationError = operationError || 'geoip_install_failed';
    }
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

  const after = {
    camoufoxInstalled,
    geoipInstalled,
    backendHealthy: await checkBackendHealth(),
  };
  const browserReady =
    mode === 'uninstall'
      ? !browser || !after.camoufoxInstalled
      : !browser || after.camoufoxInstalled || after.backendHealthy;
  const geoipReady = mode === 'uninstall' ? !geoip || !after.geoipInstalled : !geoip || after.geoipInstalled;
  const ok =
    browserReady &&
    geoipReady &&
    operationError === null &&
    (!ensureBackend || backendEnsured || after.backendHealthy);

  const result = {
    ok,
    mode,
    selection: {
      browser,
      geoip,
      ensureBackend,
    },
    before,
    actions,
    after,
    camoufoxInstalled: after.camoufoxInstalled,
    provider,
    backendEnsured,
    ensureBackendError,
    backendHealthy: after.backendHealthy,
    geoipInstalled: after.geoipInstalled,
    operationError,
    message: ok
      ? '资源状态就绪'
      : operationError
        ? `资源操作失败: ${operationError}`
        : browser && !after.camoufoxInstalled
          ? 'Camoufox 未安装'
          : geoip && !after.geoipInstalled
            ? 'GeoIP 未安装'
            : '资源状态未就绪',
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
  resolveWebautoRoot,
  resolveGeoIPPath,
  resolveModeAndSelection,
};
