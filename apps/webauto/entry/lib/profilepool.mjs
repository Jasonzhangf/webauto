import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

function resolvePortableRoot() {
  const root = String(process.env.WEBAUTO_PORTABLE_ROOT || process.env.WEBAUTO_ROOT || '').trim();
  return root ? path.join(root, '.webauto') : '';
}

export function resolveProfilesRoot() {
  const envProfiles = String(process.env.WEBAUTO_PATHS_PROFILES || '').trim();
  if (envProfiles) return envProfiles;
  const portableRoot = resolvePortableRoot();
  if (portableRoot) return path.join(portableRoot, 'profiles');
  return path.join(process.env.HOME || os.homedir(), '.webauto', 'profiles');
}

function resolveFingerprintsRoot() {
  const envFps = String(process.env.WEBAUTO_PATHS_FINGERPRINTS || '').trim();
  if (envFps) return envFps;
  const portableRoot = resolvePortableRoot();
  if (portableRoot) return path.join(portableRoot, 'fingerprints');
  return path.join(process.env.HOME || os.homedir(), '.webauto', 'fingerprints');
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

export function resolveNextProfileId(prefix) {
  const normalized = String(prefix || '').trim();
  if (!normalized) throw new Error('prefix is required');
  const { profiles } = listProfilesForPool(normalized);
  let maxIndex = 0;
  for (const profileId of profiles) {
    const match = profileId.match(/-(\d+)$/);
    if (!match) continue;
    const index = Number(match[1]);
    if (Number.isFinite(index)) maxIndex = Math.max(maxIndex, index);
  }
  return `${normalized}-${maxIndex + 1}`;
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

async function ensureFingerprint(profileId) {
  try {
    const modulePath = path.resolve(process.cwd(), 'dist', 'libs', 'browser', 'fingerprint-manager.js');
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
