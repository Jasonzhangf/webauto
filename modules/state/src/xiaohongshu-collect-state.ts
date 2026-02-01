import path from 'node:path';

import { atomicWriteJson, readJsonMaybe } from './atomic-json.js';
import { resolvePlatformEnvKeywordDir } from './paths.js';

export type XhsCollectStatus = 'idle' | 'running' | 'completed' | 'failed';

export interface XhsCollectedUrl {
  noteId: string;
  safeUrl: string;
  searchUrl?: string;
  timestamp?: number;
}

export interface XhsCollectStateV2 {
  // schema
  version: 2;
  platform: 'xiaohongshu';

  // identity
  keyword: string;
  env: string;

  // lifecycle
  startTime: string | null;
  lastUpdateTime: string | null;
  status: XhsCollectStatus;
  error?: string;

  // Phase2: 列表采集
  listCollection: {
    targetCount: number;
    collectedUrls: XhsCollectedUrl[];
    currentUrlIndex: number;
    scrollRounds: number;
    lastScrollTime: string | null;
  };

  // Phase3-4: 详情/评论采集
  detailCollection: {
    total: number;
    completed: number;
    failed: number;
    skipped: number;
    completedNoteIds: string[];
    failedNoteIds: Array<{ noteId: string; error: string; timestamp: string }>;
  };

  // 统计
  stats: {
    totalDurationMs: number;
    phase2DurationMs: number;
    phase3DurationMs: number;
    phase4DurationMs: number;
  };

  // 通用：恢复信息（用于 UI/脚本展示与未来 resume）
  resume: {
    token: string;
    lastNoteId?: string;
    lastStep?: string;
  };

  // legacy 保留（迁移/兼容）
  legacy?: Record<string, unknown>;
}

const STATE_FILENAME = '.collect-state.json';

function generateToken(): string {
  // 16 hex chars
  const bytes = new Uint8Array(8);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function resolveXhsCollectStatePath(input: { keyword: string; env: string; downloadRoot?: string }): string {
  const baseDir = resolvePlatformEnvKeywordDir({ platform: 'xiaohongshu', ...input });
  return path.join(baseDir, STATE_FILENAME);
}

export function createDefaultXhsCollectState(input: {
  keyword: string;
  env: string;
  targetCount?: number;
}): XhsCollectStateV2 {
  const now = new Date().toISOString();
  return {
    version: 2,
    platform: 'xiaohongshu',
    keyword: input.keyword,
    env: input.env,
    startTime: null,
    lastUpdateTime: null,
    status: 'idle',
    listCollection: {
      targetCount: Number(input.targetCount || 0) || 0,
      collectedUrls: [],
      currentUrlIndex: 0,
      scrollRounds: 0,
      lastScrollTime: null,
    },
    detailCollection: {
      total: 0,
      completed: 0,
      failed: 0,
      skipped: 0,
      completedNoteIds: [],
      failedNoteIds: [],
    },
    stats: {
      totalDurationMs: 0,
      phase2DurationMs: 0,
      phase3DurationMs: 0,
      phase4DurationMs: 0,
    },
    resume: { token: generateToken() },
    legacy: { createdAt: now },
  };
}

function looksLikeV2(x: any): x is XhsCollectStateV2 {
  return x && typeof x === 'object' && x.version === 2 && x.platform === 'xiaohongshu';
}

function normalizeCollectedUrls(urls: any[]): XhsCollectedUrl[] {
  const out: XhsCollectedUrl[] = [];
  for (const u of urls || []) {
    const noteId = String(u?.noteId || '').trim();
    const safeUrl = String(u?.safeUrl || u?.safeDetailUrl || '').trim();
    const searchUrl = String(u?.searchUrl || '').trim() || undefined;
    const timestamp = typeof u?.timestamp === 'number' ? u.timestamp : undefined;
    if (!noteId || !safeUrl) continue;
    out.push({ noteId, safeUrl, ...(searchUrl ? { searchUrl } : {}), ...(timestamp ? { timestamp } : {}) });
  }
  // dedupe by noteId
  const seen = new Set<string>();
  const deduped: XhsCollectedUrl[] = [];
  for (const r of out) {
    if (seen.has(r.noteId)) continue;
    seen.add(r.noteId);
    deduped.push(r);
  }
  return deduped;
}

export function normalizeXhsCollectState(
  raw: unknown,
  input: { keyword: string; env: string; targetCount?: number },
): XhsCollectStateV2 {
  const base = createDefaultXhsCollectState(input);
  if (!raw || typeof raw !== 'object') return base;
  const obj: any = raw;

  // v2 passthrough (still enforce keyword/env)
  if (looksLikeV2(obj)) {
    return {
      ...base,
      ...obj,
      keyword: input.keyword,
      env: input.env,
      listCollection: {
        ...base.listCollection,
        ...(obj.listCollection || {}),
        collectedUrls: normalizeCollectedUrls(obj.listCollection?.collectedUrls || []),
      },
      detailCollection: {
        ...base.detailCollection,
        ...(obj.detailCollection || {}),
      },
      stats: { ...base.stats, ...(obj.stats || {}) },
      resume: { ...base.resume, ...(obj.resume || {}) },
    };
  }

  // legacy v1 (scripts/xiaohongshu/search/shared/state.mjs)
  if (typeof obj.version === 'number' && obj.listCollection && obj.detailCollection) {
    return {
      ...base,
      status: String(obj.status || base.status) as XhsCollectStatus,
      startTime: obj.startTime || null,
      lastUpdateTime: obj.lastUpdateTime || null,
      error: typeof obj.error === 'string' ? obj.error : undefined,
      listCollection: {
        ...base.listCollection,
        ...(obj.listCollection || {}),
        targetCount: Number(obj.listCollection?.targetCount ?? input.targetCount ?? 0) || 0,
        collectedUrls: normalizeCollectedUrls(obj.listCollection?.collectedUrls || []),
      },
      detailCollection: {
        ...base.detailCollection,
        ...(obj.detailCollection || {}),
        completedNoteIds: Array.isArray(obj.detailCollection?.completedNoteIds)
          ? obj.detailCollection.completedNoteIds.map((x: any) => String(x || '').trim()).filter(Boolean)
          : base.detailCollection.completedNoteIds,
        failedNoteIds: Array.isArray(obj.detailCollection?.failedNoteIds)
          ? obj.detailCollection.failedNoteIds
              .map((x: any) => ({
                noteId: String(x?.noteId || '').trim(),
                error: String(x?.error || '').trim() || 'unknown',
                timestamp: String(x?.timestamp || '').trim() || new Date().toISOString(),
              }))
              .filter((x: any) => x.noteId)
          : base.detailCollection.failedNoteIds,
      },
      stats: { ...base.stats, ...(obj.stats || {}) },
      legacy: { ...(base.legacy || {}), v1: obj },
    };
  }

  // legacy: search/lib/state-manager.mjs
  if (Array.isArray(obj.completedNotes) && typeof obj.processedCount === 'number') {
    const completedNoteIds = obj.completedNotes.map((x: any) => String(x || '').trim()).filter(Boolean);
    return {
      ...base,
      status: 'running',
      detailCollection: {
        ...base.detailCollection,
        total: completedNoteIds.length,
        completed: completedNoteIds.length,
        completedNoteIds,
      },
      legacy: { ...(base.legacy || {}), stateManager: obj },
    };
  }

  // legacy: tests/state-manager.mjs
  if (obj.global && obj.history && typeof obj.resumeToken === 'string') {
    const completed = Array.isArray(obj.history?.completed)
      ? obj.history.completed.map((x: any) => String(x || '').trim()).filter(Boolean)
      : [];
    return {
      ...base,
      status: 'running',
      listCollection: { ...base.listCollection, targetCount: Number(obj.global?.target || 0) || 0 },
      detailCollection: {
        ...base.detailCollection,
        total: completed.length,
        completed: completed.length,
        completedNoteIds: completed,
      },
      resume: { ...base.resume, token: obj.resumeToken },
      legacy: { ...(base.legacy || {}), collectStateManager: obj },
    };
  }

  return { ...base, legacy: { ...(base.legacy || {}), unknown: obj } };
}

export async function loadXhsCollectState(input: {
  keyword: string;
  env: string;
  downloadRoot?: string;
  targetCount?: number;
}): Promise<XhsCollectStateV2> {
  const p = resolveXhsCollectStatePath(input);
  const raw = await readJsonMaybe<unknown>(p);
  return normalizeXhsCollectState(raw, input);
}

export async function saveXhsCollectState(
  state: XhsCollectStateV2,
  input: { keyword: string; env: string; downloadRoot?: string },
): Promise<void> {
  const p = resolveXhsCollectStatePath(input);
  const next: XhsCollectStateV2 = {
    ...state,
    version: 2,
    platform: 'xiaohongshu',
    keyword: input.keyword,
    env: input.env,
    lastUpdateTime: new Date().toISOString(),
    listCollection: {
      ...state.listCollection,
      collectedUrls: normalizeCollectedUrls(state.listCollection?.collectedUrls || []),
    },
    resume: state.resume?.token ? state.resume : { token: generateToken() },
  };
  await atomicWriteJson(p, next);
}

export async function updateXhsCollectState(
  input: { keyword: string; env: string; downloadRoot?: string; targetCount?: number },
  updater: (draft: XhsCollectStateV2) => void,
): Promise<XhsCollectStateV2> {
  const state = await loadXhsCollectState(input);
  const draft: XhsCollectStateV2 = JSON.parse(JSON.stringify(state));
  updater(draft);
  await saveXhsCollectState(draft, input);
  return draft;
}

export function formatXhsCollectStateSummary(state: XhsCollectStateV2): string {
  const lines: string[] = [];
  lines.push(`keyword: ${state.keyword}`);
  lines.push(`env: ${state.env}`);
  lines.push(`status: ${state.status}`);
  lines.push(`links: ${state.listCollection.collectedUrls.length}/${state.listCollection.targetCount}`);
  lines.push(`detail: ok=${state.detailCollection.completed} failed=${state.detailCollection.failed} skipped=${state.detailCollection.skipped}`);
  return lines.join('\n');
}

export async function initializeXhsCollectState(input: {
  keyword: string;
  env: string;
  downloadRoot?: string;
  targetCount: number;
}): Promise<XhsCollectStateV2> {
  const state = createDefaultXhsCollectState({
    keyword: input.keyword,
    env: input.env,
    targetCount: input.targetCount,
  });
  state.startTime = new Date().toISOString();
  state.lastUpdateTime = state.startTime;
  state.status = 'running';
  await saveXhsCollectState(state, input);
  return state;
}

export async function updateXhsListCollection(input: {
  keyword: string;
  env: string;
  downloadRoot?: string;
  newUrls: Array<Partial<XhsCollectedUrl>>;
}): Promise<XhsCollectStateV2> {
  return updateXhsCollectState({ keyword: input.keyword, env: input.env, downloadRoot: input.downloadRoot }, (draft) => {
    const before = draft.listCollection.collectedUrls || [];
    const merged = normalizeCollectedUrls([...before, ...(input.newUrls || [])]);
    draft.listCollection.collectedUrls = merged;
  });
}

export async function updateXhsDetailCollection(input: {
  keyword: string;
  env: string;
  downloadRoot?: string;
  noteId: string;
  status: 'completed' | 'failed' | 'skipped';
  error?: string;
}): Promise<XhsCollectStateV2> {
  const noteId = String(input.noteId || '').trim();
  if (!noteId) {
    return loadXhsCollectState({ keyword: input.keyword, env: input.env, downloadRoot: input.downloadRoot });
  }

  return updateXhsCollectState({ keyword: input.keyword, env: input.env, downloadRoot: input.downloadRoot }, (draft) => {
    const completed = new Set(draft.detailCollection.completedNoteIds || []);
    const failed = new Set((draft.detailCollection.failedNoteIds || []).map((x) => x.noteId));
    if (completed.has(noteId) || failed.has(noteId)) return;

    draft.detailCollection.total += 1;
    if (input.status === 'completed') {
      draft.detailCollection.completed += 1;
      draft.detailCollection.completedNoteIds = [...(draft.detailCollection.completedNoteIds || []), noteId];
      return;
    }
    if (input.status === 'failed') {
      draft.detailCollection.failed += 1;
      draft.detailCollection.failedNoteIds = [
        ...(draft.detailCollection.failedNoteIds || []),
        {
          noteId,
          error: String(input.error || '').trim() || 'unknown',
          timestamp: new Date().toISOString(),
        },
      ];
      return;
    }
    draft.detailCollection.skipped += 1;
  });
}

export async function markXhsCollectCompleted(input: {
  keyword: string;
  env: string;
  downloadRoot?: string;
}): Promise<XhsCollectStateV2> {
  return updateXhsCollectState({ keyword: input.keyword, env: input.env, downloadRoot: input.downloadRoot }, (draft) => {
    draft.status = 'completed';
    if (draft.startTime) {
      draft.stats.totalDurationMs = Date.now() - new Date(draft.startTime).getTime();
    }
  });
}

export async function markXhsCollectFailed(input: {
  keyword: string;
  env: string;
  downloadRoot?: string;
  error: string;
}): Promise<XhsCollectStateV2> {
  return updateXhsCollectState({ keyword: input.keyword, env: input.env, downloadRoot: input.downloadRoot }, (draft) => {
    draft.status = 'failed';
    draft.error = String(input.error || '').trim() || 'unknown';
  });
}

export async function resetXhsCollectState(input: { keyword: string; env: string; downloadRoot?: string }): Promise<boolean> {
  const { promises: fs } = await import('node:fs');
  const p = resolveXhsCollectStatePath(input);
  try {
    await fs.unlink(p);
    return true;
  } catch (err: any) {
    if (err?.code === 'ENOENT') return true;
    throw err;
  }
}

export async function getXhsPendingItems(input: {
  keyword: string;
  env: string;
  downloadRoot?: string;
}): Promise<XhsCollectedUrl[]> {
  const state = await loadXhsCollectState(input);
  const completed = new Set(state.detailCollection.completedNoteIds || []);
  return (state.listCollection.collectedUrls || []).filter((u) => !completed.has(u.noteId));
}
