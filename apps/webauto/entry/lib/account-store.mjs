import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  ensureProfile,
  resolveFingerprintsRoot,
  resolveNextProfileId,
  resolveProfilesRoot,
} from './profilepool.mjs';

const INDEX_FILE = 'index.json';
const META_FILE = 'meta.json';
const DEFAULT_PLATFORM = 'xiaohongshu';
const STATUS_ACTIVE = 'active';
const STATUS_VALID = 'valid';
const STATUS_INVALID = 'invalid';

function nowIso() {
  return new Date().toISOString();
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function toSlug(input) {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizePlatform(input) {
  const raw = String(input || DEFAULT_PLATFORM).trim().toLowerCase();
  if (!raw || raw === 'xhs') return DEFAULT_PLATFORM;
  return raw;
}

function normalizeText(input) {
  const value = String(input ?? '').trim();
  return value || null;
}

function normalizeAlias(input) {
  const alias = normalizeText(input);
  return alias ? alias.slice(0, 80) : null;
}

function toTimeMs(value) {
  if (!value) return 0;
  const ms = Date.parse(String(value));
  return Number.isFinite(ms) ? ms : 0;
}

function pickNewerRecord(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  const aTime = Math.max(toTimeMs(a.updatedAt), toTimeMs(a.detectedAt), toTimeMs(a.createdAt));
  const bTime = Math.max(toTimeMs(b.updatedAt), toTimeMs(b.detectedAt), toTimeMs(b.createdAt));
  if (aTime !== bTime) return bTime > aTime ? b : a;
  const aSeq = Number(a.seq) || 0;
  const bSeq = Number(b.seq) || 0;
  return bSeq >= aSeq ? b : a;
}

function normalizeStatus(input) {
  const status = String(input || STATUS_ACTIVE).trim().toLowerCase();
  if (!status) return STATUS_ACTIVE;
  if (
    status === 'active'
    || status === 'disabled'
    || status === 'archived'
    || status === 'pending'
    || status === STATUS_VALID
    || status === STATUS_INVALID
  ) return status;
  return STATUS_ACTIVE;
}

function formatSeq(seq) {
  return String(seq).padStart(4, '0');
}

function resolveAutoTag(platform) {
  const normalized = normalizePlatform(platform);
  return normalized === 'xiaohongshu'
    ? 'xhs'
    : (toSlug(normalized).split('-')[0] || 'acct');
}

function buildAutoAccountId(platform, seq) {
  return `${resolveAutoTag(platform)}-${formatSeq(seq)}`;
}

function normalizeId(id, fallbackPlatform, seq) {
  const cleaned = toSlug(id || '');
  if (cleaned) return cleaned;
  return buildAutoAccountId(fallbackPlatform, seq);
}

function ensureSafeName(name, field) {
  const value = String(name || '').trim();
  if (!value) throw new Error(`${field} is required`);
  if (value.includes('/') || value.includes('\\')) throw new Error(`${field} is invalid`);
  if (value === '.' || value === '..') throw new Error(`${field} is invalid`);
  return value;
}

function resolvePortableRoot() {
  const root = String(process.env.WEBAUTO_PORTABLE_ROOT || process.env.WEBAUTO_ROOT || '').trim();
  return root ? path.join(root, '.webauto') : '';
}

export function resolveWebautoRoot() {
  const portableRoot = resolvePortableRoot();
  if (portableRoot) return portableRoot;
  const home = process.env.HOME || process.env.USERPROFILE || os.homedir();
  return path.join(home, '.webauto');
}

export function resolveAccountsRoot() {
  const envRoot = String(process.env.WEBAUTO_PATHS_ACCOUNTS || '').trim();
  if (envRoot) return envRoot;
  return path.join(resolveWebautoRoot(), 'accounts');
}

function resolveIndexPath() {
  return path.join(resolveAccountsRoot(), INDEX_FILE);
}

function resolveAccountDir(id) {
  return path.join(resolveAccountsRoot(), id);
}

function removeAccountDirById(id) {
  const safeId = String(id || '').trim();
  if (!safeId) return;
  const dir = resolveAccountDir(safeId);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function hasPersistentAccountId(record) {
  return Boolean(normalizeText(record?.accountId));
}

function isWithinDir(rootDir, targetPath) {
  const root = path.resolve(rootDir);
  const target = path.resolve(targetPath);
  return target === root || target.startsWith(`${root}${path.sep}`);
}

function loadIndex() {
  const fallback = { version: 1, nextSeq: 1, updatedAt: null, accounts: [] };
  const raw = readJson(resolveIndexPath(), fallback);
  const accountsRaw = Array.isArray(raw?.accounts) ? raw.accounts : [];
  const staleIds = accountsRaw
    .filter((account) => !hasPersistentAccountId(account))
    .map((account) => String(account?.id || '').trim())
    .filter(Boolean);
  const accounts = accountsRaw.filter((account) => hasPersistentAccountId(account));
  const maxSeq = accounts.reduce((max, account) => {
    const seq = Number(account?.seq);
    return Number.isFinite(seq) ? Math.max(max, seq) : max;
  }, 0);
  const nextSeq = Number.isFinite(Number(raw?.nextSeq)) && Number(raw?.nextSeq) > maxSeq
    ? Number(raw.nextSeq)
    : maxSeq + 1;
  const normalized = {
    version: 1,
    nextSeq,
    updatedAt: raw?.updatedAt || null,
    accounts,
  };

  if (staleIds.length > 0 || accounts.length !== accountsRaw.length) {
    writeJson(resolveIndexPath(), {
      version: 1,
      nextSeq,
      updatedAt: nowIso(),
      accounts,
    });
    for (const id of staleIds) {
      removeAccountDirById(id);
    }
  }

  return normalized;
}

function saveIndex(index) {
  const payload = {
    version: 1,
    nextSeq: Number(index?.nextSeq) || 1,
    updatedAt: nowIso(),
    accounts: Array.isArray(index?.accounts) ? index.accounts : [],
  };
  writeJson(resolveIndexPath(), payload);
  return payload;
}

function resolveProfilePrefix(platform) {
  if (platform === 'xiaohongshu') return 'xiaohongshu-batch';
  const slug = toSlug(platform) || 'account';
  return `${slug}-account`;
}

function resolveProfileSeq(profileId, platform) {
  const value = String(profileId || '').trim();
  if (!value) return null;
  const prefix = resolveProfilePrefix(platform);
  const match = value.match(new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-([0-9]+)$`));
  if (!match) return null;
  const seq = Number(match[1]);
  if (!Number.isFinite(seq) || seq < 0) return null;
  return seq;
}

function resolveUsedAutoSeq(index, platform) {
  const tag = resolveAutoTag(platform);
  const pattern = new RegExp(`^${tag}-([0-9]+)$`);
  const used = new Set();
  for (const row of (index?.accounts || [])) {
    const id = String(row?.id || '').trim();
    const match = id.match(pattern);
    if (!match) continue;
    const seq = Number(match[1]);
    if (!Number.isFinite(seq) || seq < 0) continue;
    used.add(seq);
  }
  return used;
}

function resolveNextAutoSeq(index, platform, preferredSeq = null) {
  const used = resolveUsedAutoSeq(index, platform);
  const preferred = Number(preferredSeq);
  if (Number.isFinite(preferred) && preferred >= 0 && !used.has(preferred)) {
    return preferred;
  }
  let seq = 0;
  while (used.has(seq)) seq += 1;
  return seq;
}

function ensureAliasUnique(accounts, alias, exceptId = '') {
  if (!alias) return;
  const target = alias.toLowerCase();
  for (const account of accounts) {
    if (!account || account.id === exceptId) continue;
    const candidate = String(account.alias || '').trim().toLowerCase();
    if (candidate && candidate === target) {
      throw new Error(`alias already exists: ${alias}`);
    }
  }
}

function resolveAccountOrThrow(index, key) {
  const idOrAlias = String(key || '').trim();
  if (!idOrAlias) throw new Error('account id or alias is required');
  const byId = index.accounts.find((item) => item?.id === idOrAlias);
  if (byId) return byId;
  const target = idOrAlias.toLowerCase();
  const byAlias = index.accounts.filter((item) => String(item?.alias || '').trim().toLowerCase() === target);
  if (byAlias.length === 1) return byAlias[0];
  if (byAlias.length > 1) throw new Error(`alias is not unique: ${idOrAlias}`);
  throw new Error(`account not found: ${idOrAlias}`);
}

function resolveAccountByProfile(index, profileId) {
  const value = String(profileId || '').trim();
  if (!value) return null;
  let matched = null;
  for (const item of index.accounts) {
    if (String(item?.profileId || '').trim() !== value) continue;
    matched = pickNewerRecord(matched, item);
  }
  return matched;
}

function resolveAccountByAccountId(index, accountId) {
  const value = normalizeText(accountId);
  if (!value) return null;
  let matched = null;
  for (const item of index.accounts) {
    if (normalizeText(item?.accountId) !== value) continue;
    matched = pickNewerRecord(matched, item);
  }
  return matched;
}

function persistAccountMeta(account) {
  const dir = resolveAccountDir(account.id);
  writeJson(path.join(dir, META_FILE), account);
}

function deleteAccountMeta(id) {
  removeAccountDirById(id);
}

function resolveAccountName(inputName, platform, seq) {
  const provided = normalizeText(inputName);
  if (provided) return provided.slice(0, 120);
  return `${platform}-account-${formatSeq(seq)}`;
}

export function listAccounts() {
  const index = loadIndex();
  const accounts = [...index.accounts].sort((a, b) => Number(a?.seq || 0) - Number(b?.seq || 0));
  return { root: resolveAccountsRoot(), count: accounts.length, accounts };
}

function buildProfileAccountView(profileId, record = null) {
  const accountId = normalizeText(record?.accountId);
  const status = normalizeStatus(record?.status || (accountId ? STATUS_VALID : STATUS_INVALID));
  const valid = status === STATUS_VALID && Boolean(accountId);
  return {
    profileId,
    accountRecordId: record?.id || null,
    accountId,
    alias: normalizeText(record?.alias),
    name: normalizeText(record?.name),
    status,
    valid,
    reason: normalizeText(record?.reason) || (valid ? null : 'missing_account_id'),
    updatedAt: record?.updatedAt || null,
  };
}

export function listAccountProfiles() {
  const index = loadIndex();
  const byAccountId = new Map();
  for (const record of index.accounts) {
    const accountId = normalizeText(record?.accountId);
    if (!accountId) continue;
    byAccountId.set(accountId, pickNewerRecord(byAccountId.get(accountId), record));
  }
  const deduped = [];
  for (const record of index.accounts) {
    const accountId = normalizeText(record?.accountId);
    if (accountId) {
      if (byAccountId.get(accountId) !== record) continue;
    }
    deduped.push(record);
  }
  const byProfile = new Map();
  for (const record of deduped) {
    const profileId = normalizeText(record?.profileId);
    if (!profileId) continue;
    byProfile.set(profileId, pickNewerRecord(byProfile.get(profileId), record));
  }
  const rows = Array.from(byProfile.entries())
    .sort((a, b) => (Number(a[1]?.seq || 0) - Number(b[1]?.seq || 0)))
    .map(([profileId, record]) => buildProfileAccountView(profileId, record));
  const validProfiles = rows.filter((item) => item.valid).map((item) => item.profileId);
  const invalidProfiles = rows.filter((item) => !item.valid).map((item) => item.profileId);
  return {
    root: resolveAccountsRoot(),
    count: rows.length,
    profiles: rows,
    validProfiles,
    invalidProfiles,
  };
}

export function getAccount(idOrAlias) {
  const index = loadIndex();
  return resolveAccountOrThrow(index, idOrAlias);
}

export async function addAccount(input = {}) {
  const index = loadIndex();
  const platform = normalizePlatform(input.platform);
  const hasCustomId = Boolean(normalizeText(input.id));
  const explicitProfileId = normalizeText(input.profileId);
  const autoPrefix = resolveProfilePrefix(platform);
  let seq = null;
  let profileId = explicitProfileId;

  if (!hasCustomId && !explicitProfileId) {
    // Default path: account/profile share the same minimal available slot.
    seq = resolveNextAutoSeq(index, platform, null);
    profileId = `${autoPrefix}-${seq}`;
  } else {
    profileId = explicitProfileId || resolveNextProfileId(autoPrefix);
    const profileSeq = resolveProfileSeq(profileId, platform);
    seq = resolveNextAutoSeq(index, platform, hasCustomId ? null : profileSeq);
  }

  await ensureProfile(profileId);

  const id = ensureSafeName(
    hasCustomId ? normalizeId(input.id, platform, seq) : buildAutoAccountId(platform, seq),
    'id',
  );
  if (index.accounts.some((item) => item?.id === id)) {
    throw new Error(`account id already exists: ${id}`);
  }

  const alias = normalizeAlias(input.alias) || normalizeAlias(input.username);
  ensureAliasUnique(index.accounts, alias);

  const fingerprintId = normalizeText(input.fingerprintId) || profileId;
  const createdAt = nowIso();
  const accountId = normalizeText(input.accountId || input.platformAccountId || null);
  const status = accountId ? STATUS_VALID : STATUS_INVALID;
  const account = {
    id,
    seq,
    platform,
    status,
    valid: status === STATUS_VALID,
    reason: status === STATUS_VALID ? null : 'missing_account_id',
    accountId,
    name: accountId || resolveAccountName(input.name, platform, seq),
    alias,
    username: normalizeText(input.username),
    profileId,
    fingerprintId,
    createdAt,
    updatedAt: createdAt,
    aliasSource: alias ? (normalizeAlias(input.alias) ? 'manual' : 'username') : null,
  };

  index.accounts.push(account);
  index.nextSeq = Math.max(Number(index.nextSeq) || 1, seq + 1);
  saveIndex(index);
  persistAccountMeta(account);

  return {
    root: resolveAccountsRoot(),
    account,
  };
}

export async function updateAccount(idOrAlias, patch = {}) {
  const index = loadIndex();
  const account = resolveAccountOrThrow(index, idOrAlias);
  const next = { ...account };

  if (Object.prototype.hasOwnProperty.call(patch, 'platform')) {
    next.platform = normalizePlatform(patch.platform);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'name')) {
    const name = normalizeText(patch.name);
    if (name) next.name = name.slice(0, 120);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'username')) {
    next.username = normalizeText(patch.username);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'status')) {
    next.status = normalizeStatus(patch.status);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'accountId')) {
    next.accountId = normalizeText(patch.accountId);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'reason')) {
    next.reason = normalizeText(patch.reason);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'profileId')) {
    const profileId = ensureSafeName(normalizeText(patch.profileId), 'profileId');
    if (profileId !== next.profileId) {
      await ensureProfile(profileId);
      next.profileId = profileId;
      if (!Object.prototype.hasOwnProperty.call(patch, 'fingerprintId')) {
        next.fingerprintId = profileId;
      }
    }
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'fingerprintId')) {
    const fp = ensureSafeName(normalizeText(patch.fingerprintId), 'fingerprintId');
    next.fingerprintId = fp;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'alias')) {
    const alias = normalizeAlias(patch.alias);
    ensureAliasUnique(index.accounts, alias, next.id);
    next.alias = alias;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'aliasSource')) {
    next.aliasSource = normalizeText(patch.aliasSource);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'valid')) {
    next.valid = patch.valid === true;
  }

  if (next.accountId && (!next.name || String(next.name).startsWith(`${next.platform}-account-`))) {
    next.name = String(next.accountId);
  }
  if (!next.accountId) {
    next.status = STATUS_INVALID;
    next.valid = false;
    if (!next.reason) next.reason = 'missing_account_id';
  } else if (next.status !== 'disabled' && next.status !== 'archived') {
    next.status = next.valid === false ? STATUS_INVALID : STATUS_VALID;
  }
  if (next.status === STATUS_VALID) {
    next.valid = true;
    next.reason = null;
  } else if (next.status === STATUS_INVALID) {
    next.valid = false;
    next.reason = next.reason || 'invalid';
  }

  next.updatedAt = nowIso();

  const idx = index.accounts.findIndex((item) => item?.id === account.id);
  if (idx < 0) throw new Error(`account not found: ${idOrAlias}`);
  index.accounts[idx] = next;
  saveIndex(index);
  persistAccountMeta(next);
  return next;
}

export function upsertProfileAccountState(input = {}) {
  const profileId = ensureSafeName(normalizeText(input.profileId), 'profileId');
  const platform = normalizePlatform(input.platform);
  const accountId = normalizeText(input.accountId || input.platformAccountId || null);
  const alias = normalizeAlias(input.alias);
  const reason = normalizeText(input.reason);
  const detectedAt = normalizeText(input.detectedAt) || nowIso();
  const status = accountId ? STATUS_VALID : STATUS_INVALID;

  const index = loadIndex();
  const existingByProfile = resolveAccountByProfile(index, profileId);
  const existingByAccountId = accountId ? resolveAccountByAccountId(index, accountId) : null;
  let target = existingByAccountId || existingByProfile || null;
  const purgeIds = new Set();

  if (!accountId) {
    if (target && hasPersistentAccountId(target)) {
      const next = {
        ...target,
        platform,
        profileId,
        fingerprintId: profileId,
        status: STATUS_INVALID,
        valid: false,
        reason: reason || 'invalid',
        detectedAt,
        updatedAt: nowIso(),
      };
      const rowIndex = index.accounts.findIndex((item) => item?.id === target.id);
      if (rowIndex < 0) throw new Error(`account not found: ${target.id}`);
      index.accounts[rowIndex] = next;
      saveIndex(index);
      persistAccountMeta(next);
      return buildProfileAccountView(profileId, next);
    }

    const staleIds = index.accounts
      .filter((item) => String(item?.profileId || '').trim() === profileId && !hasPersistentAccountId(item))
      .map((item) => String(item?.id || '').trim())
      .filter(Boolean);
    if (staleIds.length > 0) {
      index.accounts = index.accounts.filter((item) => {
        const id = String(item?.id || '').trim();
        return !staleIds.includes(id);
      });
      saveIndex(index);
      for (const id of staleIds) deleteAccountMeta(id);
    }

    return buildProfileAccountView(profileId, {
      profileId,
      accountId: null,
      alias: null,
      status: STATUS_INVALID,
      valid: false,
      reason: reason || 'missing_account_id',
      updatedAt: detectedAt,
    });
  }

  if (!target) {
    const profileSeq = resolveProfileSeq(profileId, platform);
    const seq = resolveNextAutoSeq(index, platform, profileSeq);
    const id = ensureSafeName(buildAutoAccountId(platform, seq), 'id');
    const createdAt = nowIso();
    const record = {
      id,
      seq,
      platform,
      status,
      valid: status === STATUS_VALID,
      reason: status === STATUS_VALID ? null : (reason || 'missing_account_id'),
      accountId: accountId || null,
      name: accountId || `${platform}-${profileId}`,
      alias: alias || null,
      username: null,
      profileId,
      fingerprintId: profileId,
      createdAt,
      updatedAt: createdAt,
      detectedAt,
      aliasSource: alias ? 'auto' : null,
    };
    index.accounts.push(record);
    index.nextSeq = Math.max(Number(index.nextSeq) || 1, seq + 1);
    saveIndex(index);
    persistAccountMeta(record);
    return buildProfileAccountView(profileId, record);
  }

  if (
    accountId
    && existingByProfile
    && existingByAccountId
    && existingByProfile.id !== existingByAccountId.id
  ) {
    purgeIds.add(existingByProfile.id);
    target = existingByAccountId;
  }

  if (accountId) {
    for (const row of index.accounts) {
      if (!row || row.id === target.id) continue;
      if (normalizeText(row.accountId) === accountId) {
        purgeIds.add(row.id);
      }
    }
  }

  const next = {
    ...target,
    platform,
    profileId,
    fingerprintId: profileId,
    accountId: accountId || null,
    status,
    valid: status === STATUS_VALID,
    reason: status === STATUS_VALID ? null : (reason || 'missing_account_id'),
    detectedAt,
    updatedAt: nowIso(),
  };
  if (accountId) {
    next.name = accountId;
  }
  if (alias) {
    for (const row of index.accounts) {
      if (!row) continue;
      if (row.id === target.id || purgeIds.has(row.id)) continue;
      const candidate = String(row.alias || '').trim().toLowerCase();
      if (candidate && candidate === alias.toLowerCase()) {
        throw new Error(`alias already exists: ${alias}`);
      }
    }
    next.alias = alias;
    next.aliasSource = 'auto';
  }

  index.accounts = index.accounts.filter((item) => item && !purgeIds.has(item.id));
  const rowIndex = index.accounts.findIndex((item) => item?.id === target.id);
  if (rowIndex < 0) throw new Error(`account not found: ${target.id}`);
  index.accounts[rowIndex] = next;
  saveIndex(index);
  for (const id of purgeIds) {
    if (id !== next.id) deleteAccountMeta(id);
  }
  persistAccountMeta(next);
  return buildProfileAccountView(profileId, next);
}

export function markProfileInvalid(profileId, reason = 'login_guard') {
  const id = ensureSafeName(normalizeText(profileId), 'profileId');
  return upsertProfileAccountState({
    profileId: id,
    accountId: null,
    reason,
  });
}

export function removeAccount(idOrAlias, options = {}) {
  const index = loadIndex();
  const account = resolveAccountOrThrow(index, idOrAlias);
  const idx = index.accounts.findIndex((item) => item?.id === account.id);
  if (idx < 0) throw new Error(`account not found: ${idOrAlias}`);
  index.accounts.splice(idx, 1);
  saveIndex(index);
  deleteAccountMeta(account.id);

  const profileDeleted = Boolean(options.deleteProfile);
  const fingerprintDeleted = Boolean(options.deleteFingerprint);
  if (profileDeleted) {
    const profilesRoot = resolveProfilesRoot();
    const profilePath = path.join(profilesRoot, account.profileId);
    if (isWithinDir(profilesRoot, profilePath)) {
      fs.rmSync(profilePath, { recursive: true, force: true });
    }
  }
  if (fingerprintDeleted) {
    const fpRoot = resolveFingerprintsRoot();
    const fpPath = path.join(fpRoot, `${account.fingerprintId}.json`);
    if (isWithinDir(fpRoot, fpPath)) {
      fs.rmSync(fpPath, { force: true });
    }
  }

  return {
    removed: account,
    profileDeleted,
    fingerprintDeleted,
  };
}
