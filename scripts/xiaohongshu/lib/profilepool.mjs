import fs from 'node:fs';
import path from 'node:path';
import { generateAndSaveFingerprint, getFingerprintPath } from '../../../libs/browser/fingerprint-manager.js';

function resolveHomeDir() {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  if (!homeDir) throw new Error('无法获取用户主目录：HOME/USERPROFILE 未设置');
  return homeDir;
}

function resolvePortableRoot() {
  const root = String(process.env.WEBAUTO_PORTABLE_ROOT || process.env.WEBAUTO_ROOT || '').trim();
  if (!root) return '';
  return path.join(root, '.webauto');
}

export function resolveProfilesRoot() {
  const envRoot = String(process.env.WEBAUTO_PATHS_PROFILES || '').trim();
  if (envRoot) return envRoot;
  const portable = resolvePortableRoot();
  if (portable) return path.join(portable, 'profiles');
  return path.join(resolveHomeDir(), '.webauto', 'profiles');
}

function escapeRegExp(s) {
  return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function listProfilesByPrefix(prefix) {
  const root = resolveProfilesRoot();
  const pfx = String(prefix || '').trim();
  if (!pfx) return [];

  let entries = [];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }

  const re = new RegExp(`^${escapeRegExp(pfx)}[-_](\\d+)$`);
  const out = [];
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const name = ent.name;
    const m = name.match(re);
    if (!m) continue;
    const n = Number(m[1]);
    if (!Number.isFinite(n)) continue;
    out.push({ profileId: name, n });
  }

  out.sort((a, b) => a.n - b.n);
  return out.map((x) => x.profileId);
}

function isDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Pool 列表：
 * - 兼容已有 profile（例如 xiaohongshu_fresh）作为 pool 的第一个成员
 * - 同时包含递增 profile（<prefix>-<n> / <prefix>_<n>）
 */
export function listProfilesForPool(prefix) {
  const root = resolveProfilesRoot();
  const pfx = String(prefix || '').trim();
  if (!pfx) return [];

  const baseDir = path.join(root, pfx);
  const base = isDir(baseDir) ? [pfx] : [];
  return [...base, ...listProfilesByPrefix(pfx)];
}

export function nextProfileId(prefix) {
  const pfx = String(prefix || '').trim();
  if (!pfx) throw new Error('profilepool: keyword(prefix) required');

  const existing = listProfilesByPrefix(pfx);
  if (existing.length === 0) return `${pfx}-1`;

  const last = existing[existing.length - 1];
  const m = String(last).match(/[-_](\d+)$/);
  const lastN = m ? Number(m[1]) : existing.length;
  const nextN = Number.isFinite(lastN) ? lastN + 1 : existing.length + 1;
  return `${pfx}-${nextN}`;
}

export function ensureProfileDir(profileId) {
  const id = String(profileId || '').trim();
  if (!id) throw new Error('profilepool: profileId required');
  const dir = path.join(resolveProfilesRoot(), id);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export async function ensureProfileFingerprint(profileId, options = {}) {
  const { platform = null } = options;
  const existingPath = getFingerprintPath(profileId);
  if (fs.existsSync(existingPath)) {
    return { fingerprintPath: existingPath, created: false };
  }
  const result = await generateAndSaveFingerprint(profileId, { platform });
  const fpPath = result?.path || existingPath;
  if (!fpPath || !fs.existsSync(fpPath)) {
    throw new Error(`fingerprint_not_created:${profileId}`);
  }
  return { fingerprintPath: fpPath, created: true };
}

export async function addProfile(prefix, options = {}) {
  const { platform = null } = options;
  const id = nextProfileId(prefix);
  const dir = ensureProfileDir(id);

  try {
    const { fingerprintPath } = await ensureProfileFingerprint(id, { platform });
    return { profileId: id, profileDir: dir, fingerprintPath };
  } catch (err) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {}
    throw err;
  }
}

export function assignShards(prefixOrProfiles) {
  const list = Array.isArray(prefixOrProfiles)
    ? prefixOrProfiles.map((x) => String(x || '').trim()).filter(Boolean)
    : listProfilesForPool(prefixOrProfiles);

  const profiles = Array.from(new Set(list));
  const shardCount = profiles.length;
  return profiles.map((profileId, shardIndex) => ({ profileId, shardIndex, shardCount }));
}
