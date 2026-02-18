import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';

// Simplified inline types to avoid module resolution issues
interface XhsCollectedUrl {
  noteId: string;
  safeUrl: string;
  searchUrl?: string;
  timestamp?: number;
}

function sanitizeForPath(name: string, fallback = 'unknown'): string {
  const text = String(name || '').trim();
  if (!text) return fallback;
  const cleaned = text.replace(/[\\/:"*?<>|]+/g, '_').trim();
  return cleaned || fallback;
}

function asStringArray(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => String(item || '').trim())
    .filter(Boolean);
}

function normalizeCollectedUrls(input: unknown, completedNoteIds: Set<string>): XhsCollectedUrl[] {
  if (!Array.isArray(input)) return [];
  const out: XhsCollectedUrl[] = [];
  const seen = new Set<string>();
  for (const row of input) {
    if (!row || typeof row !== 'object') continue;
    const noteId = String((row as Record<string, unknown>).noteId || '').trim();
    if (!noteId || completedNoteIds.has(noteId) || seen.has(noteId)) continue;
    seen.add(noteId);
    const safeUrl = String((row as Record<string, unknown>).safeUrl || '').trim();
    const searchUrl = String((row as Record<string, unknown>).searchUrl || '').trim();
    const timestampRaw = Number((row as Record<string, unknown>).timestamp);
    const item: XhsCollectedUrl = {
      noteId,
      safeUrl,
      ...(searchUrl ? { searchUrl } : {}),
      ...(Number.isFinite(timestampRaw) ? { timestamp: timestampRaw } : {}),
    };
    out.push(item);
  }
  return out;
}

async function resolveStatePath(input: { keyword: string; env: string; downloadRoot?: string }): Promise<string | null> {
  const root = resolveDownloadRoot(input.downloadRoot);
  const sanitizedEnv = sanitizeForPath(input.env, 'debug');
  const sanitizedKeyword = sanitizeForPath(input.keyword, 'unknown');
  const rawEnv = String(input.env || '').trim();
  const rawKeyword = String(input.keyword || '').trim();

  const candidates = [
    path.join(root, 'xiaohongshu', sanitizedEnv, sanitizedKeyword, '.collect-state.json'),
  ];
  const legacyPath = path.join(root, 'xiaohongshu', rawEnv, rawKeyword, '.collect-state.json');
  if (legacyPath !== candidates[0]) candidates.push(legacyPath);

  for (const filePath of candidates) {
    try {
      await fs.access(filePath);
      return filePath;
    } catch {
      // continue
    }
  }
  return null;
}

async function getXhsPendingItems(input: { keyword: string; env: string; downloadRoot?: string }): Promise<XhsCollectedUrl[]> {
  const statePath = await resolveStatePath(input);
  if (!statePath) return [];
  try {
    const content = await fs.readFile(statePath, 'utf8');
    const state = JSON.parse(content) as Record<string, any>;
    const completed = new Set(asStringArray(state?.detailCollection?.completedNoteIds));
    return normalizeCollectedUrls(state?.listCollection?.collectedUrls, completed);
  } catch (error: any) {
    const code = String(error?.code || '');
    const kind = code === 'ENOENT' ? 'missing_state' : code === 'EACCES' ? 'access_denied' : 'invalid_state';
    console.warn(
      `[xhs.sharding] failed to load pending items (${kind}) from ${statePath}: ${error?.message || String(error)}`,
    );
    return [];
  }
}

export interface ShardSpec {
  index: number;
  count: number;
  by?: 'noteId-hash' | 'index-mod';
}

export interface DynamicShardPlan {
  profileId: string;
  assignedNoteIds: string[];
  totalPending: number;
}

export function fnv1a32(input: string) {
  // FNV-1a 32-bit
  let hash = 0x811c9dc5;
  const str = String(input || '');
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i);
    // hash *= 16777619 (with 32-bit overflow)
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return hash >>> 0;
}

export function normalizeShard(spec?: Partial<ShardSpec> | null): ShardSpec | null {
  if (!spec) return null;
  const count = Math.max(1, Math.floor(Number(spec.count)));
  const index = Math.max(0, Math.floor(Number(spec.index)));
  if (!Number.isFinite(count) || !Number.isFinite(index)) return null;
  if (count <= 1) return null;
  if (index >= count) return null;
  return { index, count, by: spec.by || 'noteId-hash' };
}

export function shardFilterByNoteIdHash<T extends { noteId?: string }>(items: T[], shard: ShardSpec) {
  const list = Array.isArray(items) ? items : [];
  if (shard.count <= 1) return list;
  return list.filter((it) => {
    const id = String(it?.noteId || '').trim();
    if (!id) return false;
    return fnv1a32(id) % shard.count === shard.index;
  });
}

export function shardFilterByIndexMod<T>(items: T[], shard: ShardSpec) {
  const list = Array.isArray(items) ? items : [];
  if (shard.count <= 1) return list;
  return list.filter((_, idx) => idx % shard.count === shard.index);
}

export function resolveDownloadRoot(customRoot?: string): string {
  const fromArg = String(customRoot || '').trim();
  if (fromArg) return path.resolve(fromArg);
  const fromEnv = String(process.env.WEBAUTO_DOWNLOAD_ROOT || process.env.WEBAUTO_DOWNLOAD_DIR || '').trim();
  if (fromEnv) return path.resolve(fromEnv);
  const home = process.env.HOME || process.env.USERPROFILE || os.homedir();
  return path.join(home!, '.webauto', 'download');
}

export async function buildDynamicShardPlan(input: {
  keyword: string;
  env: string;
  downloadRoot?: string;
  validProfiles: string[];
}): Promise<DynamicShardPlan[]> {
  const { keyword, env, downloadRoot, validProfiles } = input;
  if (!validProfiles.length) return [];

  // Load pending items (not completed yet)
  const pendingItems = await getXhsPendingItems({ keyword, env, downloadRoot });
  if (pendingItems.length === 0) {
    return validProfiles.map((profileId: string) => ({ profileId, assignedNoteIds: [] as string[], totalPending: 0 }));
  }

  // Calculate how many notes each profile should handle
  // Using ceil to ensure we cover all pending items
  const perProfileCount = Math.ceil(pendingItems.length / validProfiles.length);
  
  const plans: DynamicShardPlan[] = [];
  for (let i = 0; i < validProfiles.length; i++) {
    const profileId = validProfiles[i];
    const startIdx = i * perProfileCount;
    const endIdx = Math.min(startIdx + perProfileCount, pendingItems.length);
    const assignedNoteIds: string[] = pendingItems.slice(startIdx, endIdx).map((item: XhsCollectedUrl) => item.noteId);
    plans.push({
      profileId,
      assignedNoteIds,
      totalPending: pendingItems.length,
    });
  }

  return plans;
}

export async function getPendingItemsByNoteIds(input: {
  keyword: string;
  env: string;
  downloadRoot?: string;
  noteIds: string[];
}): Promise<XhsCollectedUrl[]> {
  const pendingItems = await getXhsPendingItems({ keyword: input.keyword, env: input.env, downloadRoot: input.downloadRoot });
  const noteIdSet = new Set(input.noteIds);
  return pendingItems.filter((item: XhsCollectedUrl) => noteIdSet.has(item.noteId));
}
