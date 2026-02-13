import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { pathToFileURL } from 'node:url';

export type ProfileScanEntry = {
  profileId: string;
  profileDir: string;
  profileMtimeMs: number;
  fingerprintPath: string;
  fingerprintMtimeMs: number | null;
  fingerprint: {
    platform?: string;
    originalPlatform?: string;
    osVersion?: string;
    userAgent?: string;
    viewport?: { width?: number; height?: number };
    fingerprintSalt?: string;
  } | null;
};

export type ProfileScanResult = {
  ok: true;
  profilesRoot: string;
  fingerprintsRoot: string;
  entries: ProfileScanEntry[];
};

export type ProfileStore = {
  listProfiles: () => Promise<{ ok: true; root: string; profiles: string[] }>;
  scanProfiles: () => Promise<ProfileScanResult>;
  profileCreate: (input: { profileId: string }) => Promise<{ ok: true; profileId: string; profileDir: string }>;
  profileDelete: (input: { profileId: string; deleteFingerprint?: boolean }) => Promise<{ ok: true; profileId: string }>;
  fingerprintDelete: (input: { profileId: string }) => Promise<{ ok: true; profileId: string }>;
  fingerprintRegenerate: (input: {
    profileId: string;
    platform?: 'windows' | 'macos' | 'random';
  }) => Promise<{
    ok: true;
    profileId: string;
    fingerprintPath: string;
    fingerprint: {
      platform?: string;
      originalPlatform?: string;
      osVersion?: string;
      userAgent?: string;
      viewport?: { width?: number; height?: number };
      fingerprintSalt?: string;
    };
  }>;
};

type Options = {
  repoRoot: string;
  homeDir?: string;
};

function resolveHomeDir(opts: Options) {
  if (opts.homeDir) return opts.homeDir;
  const homeDir =
    process.platform === 'win32'
      ? (process.env.USERPROFILE || os.homedir() || '')
      : (process.env.HOME || os.homedir() || '');
  if (!homeDir) throw new Error('无法获取用户主目录：HOME/USERPROFILE 未设置');
  return homeDir;
}

function resolvePortableRoot(opts: Options) {
  const root = String(process.env.WEBAUTO_PORTABLE_ROOT || process.env.WEBAUTO_ROOT || '').trim();
  if (!root) return '';
  return path.join(root, '.webauto');
}

function isWithinDir(root: string, target: string) {
  const rel = path.relative(root, target);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function validateProfileId(profileId: string) {
  const id = String(profileId || '').trim();
  if (!id) throw new Error('profileId 不能为空');
  if (id === '.' || id === '..') throw new Error('profileId 非法');
  if (/[\\/]/.test(id)) throw new Error('profileId 不能包含路径分隔符');
  return id;
}

function resolveRoots(opts: Options) {
  const homeDir = resolveHomeDir(opts);
  const envProfiles = String(process.env.WEBAUTO_PATHS_PROFILES || '').trim();
  const envFingerprints = String(process.env.WEBAUTO_PATHS_FINGERPRINTS || '').trim();
  const portable = resolvePortableRoot(opts);
  return {
    profilesRoot: envProfiles || (portable ? path.join(portable, 'profiles') : path.join(homeDir, '.webauto', 'profiles')),
    fingerprintsRoot: envFingerprints || (portable ? path.join(portable, 'fingerprints') : path.join(homeDir, '.webauto', 'fingerprints')),
  };
}

function resolveProfileDir(opts: Options, profileId: string) {
  const { profilesRoot } = resolveRoots(opts);
  const profileDir = path.join(profilesRoot, profileId);
  if (!isWithinDir(profilesRoot, profileDir)) throw new Error('unsafe profile path');
  return { profilesRoot, profileDir };
}

function resolveFingerprintPath(opts: Options, profileId: string) {
  const { fingerprintsRoot } = resolveRoots(opts);
  const fingerprintPath = path.join(fingerprintsRoot, `${profileId}.json`);
  if (!isWithinDir(fingerprintsRoot, fingerprintPath)) throw new Error('unsafe fingerprint path');
  return { fingerprintsRoot, fingerprintPath };
}

export function createProfileStore(opts: Options): ProfileStore {
  let cachedFingerprintMod: any = null;
  async function getFingerprintModule() {
    if (cachedFingerprintMod) return cachedFingerprintMod;
    const p = path.join(opts.repoRoot, 'dist', 'libs', 'browser', 'fingerprint-manager.js');
    cachedFingerprintMod = await import(pathToFileURL(p).href);
    return cachedFingerprintMod;
  }

  async function listProfiles() {
    const { profilesRoot } = resolveRoots(opts);
    const entries: string[] = [];
    try {
      const dirs = await fs.readdir(profilesRoot, { withFileTypes: true });
      for (const ent of dirs) {
        if (!ent.isDirectory()) continue;
        const name = ent.name;
        if (!name || name.startsWith('.')) continue;
        entries.push(name);
      }
    } catch {
      // ignore
    }
    entries.sort((a, b) => a.localeCompare(b));
    return { ok: true as const, root: profilesRoot, profiles: entries };
  }

  async function scanProfiles(): Promise<ProfileScanResult> {
    const { profilesRoot, fingerprintsRoot } = resolveRoots(opts);
    const entries: ProfileScanEntry[] = [];

    const dirs = await fs.readdir(profilesRoot, { withFileTypes: true }).catch(() => []);
    for (const ent of dirs) {
      if (!ent.isDirectory()) continue;
      const profileId = ent.name;
      if (!profileId || profileId.startsWith('.')) continue;

      const profileDir = path.join(profilesRoot, profileId);
      const profileStat = await fs.stat(profileDir).catch(() => null);

      const fingerprintPath = path.join(fingerprintsRoot, `${profileId}.json`);
      const fpStat = await fs.stat(fingerprintPath).catch(() => null);
      let fingerprint: ProfileScanEntry['fingerprint'] = null;
      if (fpStat?.isFile()) {
        try {
          const raw = await fs.readFile(fingerprintPath, 'utf8');
          const parsed = JSON.parse(raw || '{}');
          if (parsed && typeof parsed === 'object') fingerprint = parsed as any;
        } catch {
          fingerprint = null;
        }
      }

      entries.push({
        profileId,
        profileDir,
        profileMtimeMs: profileStat?.mtimeMs || 0,
        fingerprintPath,
        fingerprintMtimeMs: fpStat?.mtimeMs || null,
        fingerprint,
      });
    }

    entries.sort((a, b) => {
      if (a.profileMtimeMs !== b.profileMtimeMs) return b.profileMtimeMs - a.profileMtimeMs;
      return a.profileId.localeCompare(b.profileId);
    });

    return { ok: true, profilesRoot, fingerprintsRoot, entries };
  }

  async function profileCreate(input: { profileId: string }) {
    const profileId = validateProfileId(input?.profileId);
    const { profileDir } = resolveProfileDir(opts, profileId);
    await fs.mkdir(profileDir, { recursive: true });
    return { ok: true as const, profileId, profileDir };
  }

  async function profileDelete(input: { profileId: string; deleteFingerprint?: boolean }) {
    const profileId = validateProfileId(input?.profileId);
    const { profileDir } = resolveProfileDir(opts, profileId);
    await fs.rm(profileDir, { recursive: true, force: true });
    if (input?.deleteFingerprint) {
      const { fingerprintPath } = resolveFingerprintPath(opts, profileId);
      await fs.rm(fingerprintPath, { force: true });
    }
    return { ok: true as const, profileId };
  }

  async function fingerprintDelete(input: { profileId: string }) {
    const profileId = validateProfileId(input?.profileId);
    const { fingerprintPath } = resolveFingerprintPath(opts, profileId);
    await fs.rm(fingerprintPath, { force: true });
    return { ok: true as const, profileId };
  }

  async function fingerprintRegenerate(input: { profileId: string; platform?: 'windows' | 'macos' | 'random' }) {
    const profileId = validateProfileId(input?.profileId);
    const mod = await getFingerprintModule();
    const platform = input?.platform === 'windows' || input?.platform === 'macos' ? input.platform : null;
    const { fingerprintPath } = resolveFingerprintPath(opts, profileId);
    const fingerprint = mod.generateFingerprint(profileId, { platform });
    const saved = await mod.saveFingerprint(fingerprintPath, fingerprint);
    if (!saved) throw new Error('failed to save fingerprint');
    return {
      ok: true as const,
      profileId,
      fingerprintPath,
      fingerprint: {
        platform: fingerprint?.platform,
        originalPlatform: fingerprint?.originalPlatform,
        osVersion: fingerprint?.osVersion,
        userAgent: fingerprint?.userAgent,
        viewport: fingerprint?.viewport,
        fingerprintSalt: fingerprint?.fingerprintSalt,
      },
    };
  }

  return {
    listProfiles,
    scanProfiles,
    profileCreate,
    profileDelete,
    fingerprintDelete,
    fingerprintRegenerate,
  };
}
