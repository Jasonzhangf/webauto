// apps/desktop-console/src/main/env-check.mts
// Environment and service health check utilities
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export type CamoCheckResult = {
  installed: boolean;
  version?: string;
  path?: string;
  error?: string;
};

export type ServicesCheckResult = {
  unifiedApi: boolean;
  camoRuntime: boolean;
  searchGate?: boolean;
};

export type GeoIPCheckResult = {
  installed: boolean;
  path?: string;
};

function resolveWebautoRoot() {
  const portableRoot = String(process.env.WEBAUTO_PORTABLE_ROOT || process.env.WEBAUTO_ROOT || '').trim();
  return portableRoot ? path.join(portableRoot, '.webauto') : path.join(os.homedir(), '.webauto');
}

function resolveNpxBin() {
  if (process.platform !== 'win32') return 'npx';
  const resolved = resolveOnPath(['npx.cmd', 'npx.exe', 'npx.bat', 'npx.ps1']);
  return resolved || 'npx.cmd';
}

function resolveOnPath(candidates: string[]): string | null {
  const pathEnv = process.env.PATH || process.env.Path || '';
  const dirs = pathEnv.split(path.delimiter).filter(Boolean);
  for (const dir of dirs) {
    for (const name of candidates) {
      const full = path.join(dir, name);
      if (existsSync(full)) return full;
    }
  }
  return null;
}

function resolveCamoVersionFromText(stdout: string, stderr: string) {
  const merged = `${String(stdout || '')}\n${String(stderr || '')}`.trim();
  if (!merged) return 'unknown';
  const lines = merged.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (!/version/i.test(lines[i])) continue;
    const m = lines[i].match(/\d+\.\d+\.\d+(?:[-+][A-Za-z0-9._-]+)?/);
    if (m?.[0]) return m[0];
  }
  return 'unknown';
}

function quoteCmdArg(value: string) {
  if (!value) return '""';
  if (!/[\s"]/u.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

function runVersionCheck(command: string, args: string[], explicitPath?: string): CamoCheckResult {
  try {
    const lower = String(command || '').toLowerCase();
    let ret;
    if (process.platform === 'win32' && (lower.endsWith('.cmd') || lower.endsWith('.bat'))) {
      const cmdLine = [quoteCmdArg(command), ...args.map(quoteCmdArg)].join(' ');
      ret = spawnSync('cmd.exe', ['/d', '/s', '/c', cmdLine], {
        encoding: 'utf8',
        timeout: 8000,
        windowsHide: true,
      });
    } else if (process.platform === 'win32' && lower.endsWith('.ps1')) {
      ret = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', command, ...args], {
        encoding: 'utf8',
        timeout: 8000,
        windowsHide: true,
      });
    } else {
      ret = spawnSync(command, args, {
        encoding: 'utf8',
        timeout: 8000,
        windowsHide: true,
      });
    }
    if (ret.status !== 0) {
      return {
        installed: false,
        error: String(ret.stderr || ret.stdout || '').trim() || `exit ${ret.status}`,
      };
    }
    return {
      installed: true,
      path: explicitPath || command,
      version: resolveCamoVersionFromText(String(ret.stdout || ''), String(ret.stderr || '')),
    };
  } catch (err) {
    return { installed: false, error: String(err) };
  }
}

function resolvePathFromOutput(stdout: string) {
  const lines = String(stdout || '')
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (line.startsWith('/') || /^[A-Z]:\\/i.test(line)) return line;
  }
  return '';
}

/**
 * Check if camo CLI can be resolved.
 * Supports PATH/global install, local dependency bin, and npx package fallback.
 */
export async function checkCamoCli(): Promise<CamoCheckResult> {
  const camoCandidates = process.platform === 'win32'
    ? ['camo.cmd', 'camo.exe', 'camo.bat', 'camo.ps1']
    : ['camo'];
  for (const candidate of camoCandidates) {
    const pathCheck = runVersionCheck(candidate, ['help'], `PATH:${candidate}`);
    if (pathCheck.installed) return pathCheck;
  }

  const cwd = process.cwd();
  const localRoots = [
    path.resolve(cwd, 'node_modules', '.bin'),
    path.resolve(cwd, '..', 'node_modules', '.bin'),
    path.resolve(cwd, '..', '..', 'node_modules', '.bin'),
  ];
  for (const localRoot of localRoots) {
    for (const suffix of camoCandidates) {
      const candidate = path.resolve(localRoot, suffix);
      if (!existsSync(candidate)) continue;
      const ret = runVersionCheck(candidate, ['help'], candidate);
      if (ret.installed) return ret;
    }
  }

  const npxCheck = runVersionCheck(
    resolveNpxBin(),
    ['--yes', '--package=@web-auto/camo', 'camo', 'help'],
    'npx:@web-auto/camo',
  );
  if (npxCheck.installed) return npxCheck;

  return {
    installed: false,
    error: 'camo not found in PATH/local bin, and npx @web-auto/camo failed',
  };
}

/**
 * Check if required services are running
 */
export async function checkServices(): Promise<ServicesCheckResult> {
  const [unifiedApi, camoRuntime, searchGate] = await Promise.all([
    fetch('http://127.0.0.1:7701/health', { signal: AbortSignal.timeout(3000) })
      .then((r) => r.ok)
      .catch(() => false),
    fetch('http://127.0.0.1:7704/health', { signal: AbortSignal.timeout(3000) })
      .then((r) => r.ok)
      .catch(() => false),
    fetch('http://127.0.0.1:7790/health', { signal: AbortSignal.timeout(3000) })
      .then((r) => r.ok)
      .catch(() => false),
  ]);

  return { unifiedApi, camoRuntime, searchGate };
}

export async function checkFirefox(): Promise<{ installed: boolean; path?: string }> {
  const candidates =
    process.platform === 'win32'
      ? [
          { command: 'python', args: ['-m', 'camoufox', 'path'] },
          { command: 'py', args: ['-3', '-m', 'camoufox', 'path'] },
          { command: resolveNpxBin(), args: ['--yes', '--package=camoufox', 'camoufox', 'path'] },
        ]
      : [
          { command: 'python3', args: ['-m', 'camoufox', 'path'] },
          { command: resolveNpxBin(), args: ['--yes', '--package=camoufox', 'camoufox', 'path'] },
        ];
  for (const candidate of candidates) {
    try {
      const ret = spawnSync(candidate.command, candidate.args, {
        encoding: 'utf8',
        timeout: 8000,
        windowsHide: true,
      });
      if (ret.status !== 0) continue;
      const resolvedPath = resolvePathFromOutput(String(ret.stdout || ''));
      return resolvedPath ? { installed: true, path: resolvedPath } : { installed: true };
    } catch {
      // continue probing next candidate
    }
  }
  return { installed: false };
}

export async function checkGeoIP(): Promise<GeoIPCheckResult> {
  const geoIpPath = path.join(resolveWebautoRoot(), 'geoip', 'GeoLite2-City.mmdb');
  if (existsSync(geoIpPath)) {
    return { installed: true, path: geoIpPath };
  }
  return { installed: false };
}

/**
 * Full environment check
 */
export async function checkEnvironment(): Promise<{
  camo: CamoCheckResult;
  services: ServicesCheckResult;
  firefox: { installed: boolean; path?: string };
  geoip: GeoIPCheckResult;
  allReady: boolean;
}> {
  const [camo, services, firefox, geoip] = await Promise.all([
    checkCamoCli(),
    checkServices(),
    checkFirefox(),
    checkGeoIP(),
  ]);

  const allReady =
    camo.installed &&
    services.unifiedApi &&
    firefox.installed;
  return { camo, services, firefox, geoip, allReady };
}
