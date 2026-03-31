import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

function hasDrive(letter) {
  if (process.platform !== 'win32') return false;
  try {
    return fs.existsSync(`${String(letter || '').replace(/[^A-Za-z]/g, '').toUpperCase()}:\\`);
  } catch {
    return false;
  }
}

function normalizePathForPlatform(input, platform = process.platform) {
  const raw = String(input || '').trim();
  const isWinPath = platform === 'win32' || /^[A-Za-z]:[\\/]/.test(raw);
  const pathApi = isWinPath ? path.win32 : path;
  return isWinPath ? pathApi.normalize(raw) : path.resolve(raw);
}

function normalizeLegacyWebautoRoot(input, platform = process.platform) {
  const pathApi = platform === 'win32' ? path.win32 : path;
  const resolved = normalizePathForPlatform(input, platform);
  const base = pathApi.basename(resolved).toLowerCase();
  if (base === '.webauto' || base === 'webauto') return resolved;
  return pathApi.join(resolved, '.webauto');
}

function resolveHomeDir(platform = process.platform) {
  if (platform === 'win32') return process.env.USERPROFILE || os.homedir();
  return process.env.HOME || os.homedir();
}

export function resolveWebautoRoot(options = {}) {
  const env = options.env || process.env;
  const platform = String(options.platform || process.platform);
  const homeDir = String(options.homeDir || resolveHomeDir(platform));
  const pathApi = platform === 'win32' ? path.win32 : path;

  const explicitHome = String(env.WEBAUTO_HOME || '').trim();
  if (explicitHome) return normalizePathForPlatform(explicitHome, platform);

  const legacyRoot = String(env.WEBAUTO_ROOT || env.WEBAUTO_PORTABLE_ROOT || '').trim();
  if (legacyRoot) return normalizeLegacyWebautoRoot(legacyRoot, platform);

  if (platform === 'win32') {
    const dDriveExists = typeof options.hasDDrive === 'boolean' ? options.hasDDrive : hasDrive('D');
    return dDriveExists ? 'D:\\webauto' : pathApi.join(homeDir, '.webauto');
  }
  return pathApi.join(homeDir, '.webauto');
}

export function resolveProfilesRoot() {
  const envProfiles = String(process.env.WEBAUTO_PATHS_PROFILES || '').trim();
  if (envProfiles) return envProfiles;
  return path.join(resolveWebautoRoot(), 'profiles');
}

export function resolveFingerprintsRoot() {
  const envFps = String(process.env.WEBAUTO_PATHS_FINGERPRINTS || '').trim();
  if (envFps) return envFps;
  return path.join(resolveWebautoRoot(), 'fingerprints');
}

export function listProfiles() {
  const root = resolveProfilesRoot();
  if (!fs.existsSync(root)) return { root, profiles: [] };
  const profiles = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
  return { root, profiles };
}

export function listProfilesForPool(prefix) {
  const normalized = String(prefix || '').trim();
  const { root, profiles } = listProfiles();
  if (!normalized) return { root, profiles: [] };
  const poolProfiles = profiles.filter((profileId) => {
    if (profileId === normalized) return true;
    if (!profileId.startsWith(normalized)) return false;
    const suffix = profileId.slice(normalized.length);
    return /^-\d+$/.test(suffix);
  });
  return { root, profiles: poolProfiles };
}

export function resolveDefaultProfileId() {
  const { profiles } = listProfiles();
  if (profiles.length === 1) return profiles[0];
  const pool = listProfilesForPool('profile').profiles;
  if (pool.length === 1) return pool[0];
  return '';
}

export function resolveNextProfileId(prefix) {
  const normalized = String(prefix || '').trim();
  if (!normalized) throw new Error('prefix is required');
  const { profiles } = listProfilesForPool(normalized);
  const used = new Set();
  for (const profileId of profiles) {
    const match = profileId.match(/-(\d+)$/);
    if (!match) continue;
    const index = Number(match[1]);
    if (Number.isFinite(index) && index >= 0) used.add(index);
  }
  let next = 0;
  while (used.has(next)) next += 1;
  return `${normalized}-${next}`;
}

export async function ensureProfile(profileId) {
  const id = String(profileId || '').trim();
  if (!id) throw new Error('profileId is required');
  if (id.includes('/') || id.includes('\\')) throw new Error('invalid profileId');
  const root = resolveProfilesRoot();
  const profileDir = path.join(root, id);
  fs.mkdirSync(profileDir, { recursive: true });
  await ensureFingerprint(id);
  return { root, profileDir, profileId: id };
}

export function assertProfileExists(profileId) {
  const id = String(profileId || '').trim();
  if (!id) throw new Error('profileId is required');
  if (id.includes('/') || id.includes('\\')) throw new Error('invalid profileId');
  const root = resolveProfilesRoot();
  const profileDir = path.join(root, id);
  if (!fs.existsSync(profileDir) || !fs.statSync(profileDir).isDirectory()) {
    throw new Error(`profile not found: ${id}. create/login account profile first`);
  }
  return { root, profileDir, profileId: id };
}

async function ensureFingerprint(profileId) {
  try {
    const modulePath = path.resolve(process.cwd(), 'dist', 'modules', 'camo-backend', 'src', 'internal', 'fingerprint.js');
    if (!fs.existsSync(modulePath)) return { ok: false, reason: 'dist_missing' };
    const mod = await import(modulePath);
    const fpPath = path.join(resolveFingerprintsRoot(), `${profileId}.json`);
    if (fs.existsSync(fpPath)) return { ok: true, path: fpPath, created: false };
    await mod.generateAndSaveFingerprint(profileId);
    return { ok: true, path: fpPath, created: true };
  } catch {
    return { ok: false, reason: 'fingerprint_error' };
  }
}

export function output(data, jsonMode) {
  if (jsonMode) {
    console.log(JSON.stringify(data));
    return;
  }
  console.log(JSON.stringify(data, null, 2));
}
