/**
 * Workflow Block: XiaohongshuCollectFromLinksBlock
 *
 * Phase3/4（基于 Phase2 links）：
 * - 读取 phase2-links.jsonl（searchUrl 严格一致 + keyword 严格一致 + safeUrl 含 xsec_token）
 * - Phase34 多 Tab：最多同时打开 4 个“不同笔记”的详情 tab，按 tab 轮换抓评论
 *   - 每次轮到某 tab：最多新增抓取 50 条评论，然后切换到下一个 tab
 *   - 当某笔记命中 end_marker 或 empty_state 即视为完成，关闭该 tab 并补充打开下一条笔记
 *
 * 开发阶段：任何异常 fail-fast，并落盘截图/元数据用于复盘。
 */

import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { urlKeywordEquals } from './helpers/searchPageState.js';
import { countPersistedNotes } from './helpers/persistedNotes.js';
import { isDebugArtifactsEnabled } from './helpers/debugArtifacts.js';
import { execute as extractDetail } from './ExtractDetailBlock.js';
import { execute as expandComments } from './ExpandCommentsBlock.js';
import { execute as persistXhsNote } from './PersistXhsNoteBlock.js';
import { resolveTargetCount } from './helpers/targetCountMode.js';
import { mergeNotesMarkdown } from './helpers/mergeXhsMarkdown.js';
import { isDevMode } from './helpers/systemInput.js';
import {
  logControllerActionError,
  logControllerActionResult,
  logControllerActionStart,
} from './helpers/operationLogger.js';

const DEFAULT_COMMENTS_COVERAGE_RATIO = 0.9;

function resolveCommentsCoverageRatio(): number {
  const raw = String(process.env.WEBAUTO_COMMENTS_COVERAGE_RATIO || '').trim();
  if (!raw) return DEFAULT_COMMENTS_COVERAGE_RATIO;
  const normalized = raw.endsWith('%') ? Number(raw.slice(0, -1)) / 100 : Number(raw);
  if (!Number.isFinite(normalized) || normalized <= 0 || normalized > 1) return DEFAULT_COMMENTS_COVERAGE_RATIO;
  return normalized;
}

const COMMENTS_COVERAGE_RATIO = resolveCommentsCoverageRatio();

export interface XiaohongshuCollectFromLinksInput {
  sessionId: string;
  keyword: string;
  env?: string;
  targetCount: number;
  targetCountMode?: 'absolute' | 'incremental';
  maxComments?: number;
  strictTargetCount?: boolean;
  serviceUrl?: string;
}

export interface Phase2LinkEntry {
  noteId: string;
  safeUrl: string;
  searchUrl: string;
  ts?: string;
}

export interface XiaohongshuCollectFromLinksOutput {
  success: boolean;
  keywordDir: string;
  linksPath: string;
  expectedSearchUrl: string;
  initialPersistedCount: number;
  finalPersistedCount: number;
  addedCount: number;
  processedCount: number;
  rejectedCount?: number;
  targetCount: number;
  mergedMarkdownPath?: string;
  mergedMarkdownNotes?: number;
  error?: string;
}

function sanitizeFilenamePart(value: string): string {
  return String(value || '')
    .trim()
    .replace(/[\\/:"*?<>|]+/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 80);
}

function resolveDownloadRoot() {
  const custom = process.env.WEBAUTO_DOWNLOAD_ROOT || process.env.WEBAUTO_DOWNLOAD_DIR;
  if (custom && custom.trim()) return custom;
  const home = process.env.HOME || process.env.USERPROFILE;
  if (home && home.trim()) return path.join(home, '.webauto', 'download');
  return path.join(os.homedir(), '.webauto', 'download');
}

function extractBase64FromScreenshotResponse(raw: any): string | undefined {
  const v =
    raw?.data?.data ??
    raw?.data?.body?.data ??
    raw?.body?.data ??
    raw?.result?.data ??
    raw?.result ??
    raw?.data ??
    raw;
  return typeof v === 'string' && v.length > 10 ? v : undefined;
}

async function readJsonl(filePath: string): Promise<any[]> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return content
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch (e: any) {
    if (e?.code === 'ENOENT') return [];
    throw e;
  }
}

export async function execute(input: XiaohongshuCollectFromLinksInput): Promise<XiaohongshuCollectFromLinksOutput> {
  const {
    sessionId,
    keyword,
    env = 'debug',
    targetCount,
    targetCountMode = 'absolute',
    maxComments,
    strictTargetCount = true,
    serviceUrl = 'http://127.0.0.1:7701',
  } = input;

  const profile = sessionId;
  const controllerUrl = `${serviceUrl}/v1/controller/action`;

  const downloadRoot = resolveDownloadRoot();
  const keywordDir = path.join(downloadRoot, 'xiaohongshu', env, keyword);
  const linksPath = path.join(keywordDir, 'phase2-links.jsonl');
  const debugArtifactsEnabled = isDebugArtifactsEnabled();
  const debugDir = debugArtifactsEnabled ? path.join(keywordDir, '_debug', 'phase34_from_links') : null;
  const failFast = isDevMode();
  const maxCommentsLimit =
    typeof maxComments === 'number' && Number.isFinite(maxComments) && maxComments > 0
      ? Math.floor(maxComments)
      : null;
  const countCoverageRatio = failFast && !maxCommentsLimit ? COMMENTS_COVERAGE_RATIO : undefined;
  const maxRetryPerNote = Math.max(
    1,
    Number(process.env.WEBAUTO_PHASE34_RETRY_MAX || 2),
  );

  async function controllerAction(action: string, payload: any = {}): Promise<any> {
    const opId = logControllerActionStart(action, payload, { source: 'XiaohongshuCollectFromLinksBlock' });
    try {
      const res = await fetch(controllerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, payload }),
        signal: (AbortSignal as any).timeout ? (AbortSignal as any).timeout(30000) : undefined,
      });
      const raw = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${raw}`);
      let data: any = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        data = { raw };
      }
      const result = data.data || data;
      logControllerActionResult(opId, action, result, { source: 'XiaohongshuCollectFromLinksBlock' });
      return result;
    } catch (error) {
      logControllerActionError(opId, action, error, payload, { source: 'XiaohongshuCollectFromLinksBlock' });
      throw error;
    }
  }

  const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  async function getCurrentUrl(): Promise<string> {
    const res = await controllerAction('browser:execute', { profile, script: 'window.location.href' });
    return (res as any)?.result ?? (res as any)?.data?.result ?? '';
  }

  async function saveDebug(kind: string, meta: Record<string, any>): Promise<void> {
    if (!debugArtifactsEnabled || !debugDir) return;
    try {
      await fs.mkdir(debugDir, { recursive: true });
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const base = `${ts}-${sanitizeFilenamePart(kind)}`;
      const pngPath = path.join(debugDir, `${base}.png`);
      const jsonPath = path.join(debugDir, `${base}.json`);

      const shot = await controllerAction('browser:screenshot', { profileId: profile, fullPage: false }).catch((): any => null);
      const b64 = extractBase64FromScreenshotResponse(shot);
      if (b64) await fs.writeFile(pngPath, Buffer.from(b64, 'base64'));

      await fs.writeFile(
        jsonPath,
        JSON.stringify(
          {
            ts,
            kind,
            sessionId: profile,
            keyword,
            env,
            url: await getCurrentUrl().catch(() => ''),
            pngPath: b64 ? pngPath : null,
            ...meta,
          },
          null,
          2,
        ),
        'utf-8',
      );
      console.log(`[Phase34FromLinks][debug] saved ${kind}: ${pngPath}`);
    } catch (e: any) {
      console.warn(`[Phase34FromLinks][debug] save failed (${kind}): ${e?.message || String(e)}`);
    }
  }

  async function moveNoteToRejected(options: {
    noteId: string;
    reason: string;
    meta?: Record<string, any>;
  }): Promise<void> {
    const { noteId, reason, meta } = options;
    try {
      const src = path.join(persistedAtStart.keywordDir, noteId);
      const rejectedDir = path.join(persistedAtStart.keywordDir, '_rejected');
      await fs.mkdir(rejectedDir, { recursive: true });
      let dest = path.join(rejectedDir, noteId);
      // 若已存在同名，追加时间戳避免覆盖
      try {
        await fs.access(dest);
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        dest = path.join(rejectedDir, `${noteId}_${ts}_${sanitizeFilenamePart(reason)}`);
      } catch {
        // ok
      }
      await fs.rename(src, dest).catch(async (e: any) => {
        // rename 失败则尝试直接写入 reject.json（不阻塞流程）
        await saveDebug('move_to_rejected_failed', { noteId, reason, error: e?.message || String(e) });
      });
      const rejectJsonPath = path.join(dest, 'reject.json');
      await fs
        .writeFile(
          rejectJsonPath,
          JSON.stringify(
            {
              ts: new Date().toISOString(),
              noteId,
              reason,
              ...((meta && typeof meta === 'object') ? { meta } : {}),
            },
            null,
            2,
          ),
          'utf-8',
        )
        .catch(() => {});
    } catch {
      // ignore
    }
  }

  function validateEntry(raw: any): Phase2LinkEntry | null {
    const noteId = typeof raw?.noteId === 'string' ? raw.noteId.trim() : '';
    const safeUrl = typeof raw?.safeUrl === 'string' ? raw.safeUrl.trim() : '';
    const searchUrl = typeof raw?.searchUrl === 'string' ? raw.searchUrl.trim() : '';
    if (!noteId || !safeUrl || !searchUrl) return null;
    if (!safeUrl.includes('xsec_token=')) return null;
    if (!urlKeywordEquals(searchUrl, keyword)) return null;
    return { noteId, safeUrl, searchUrl, ts: typeof raw?.ts === 'string' ? raw.ts : undefined };
  }

  const persistedAtStart = await countPersistedNotes({
    platform: 'xiaohongshu',
    env,
    keyword,
    downloadRoot,
    requiredFiles: ['content.md', 'comments.md'],
    requireCommentsDone: true,
    minCommentsCoverageRatio: countCoverageRatio,
  });

  await resetIncompleteComments().catch(() => {});

  let persistedCount = persistedAtStart.count;
  const initialPersistedCount = persistedAtStart.count;
  const { targetTotal } = resolveTargetCount({
    targetCount,
    baseCount: initialPersistedCount,
    mode: targetCountMode,
  });

  if (strictTargetCount && persistedCount > targetTotal) {
    return {
      success: false,
      keywordDir: persistedAtStart.keywordDir,
      linksPath,
      expectedSearchUrl: '',
      initialPersistedCount,
      finalPersistedCount: persistedCount,
      addedCount: 0,
      processedCount: 0,
      targetCount: targetTotal,
      error: `existing_count_exceeds_target: ${persistedCount} > ${targetTotal}`,
    };
  }
  if (persistedCount === targetTotal) {
    const merged = await mergeMarkdownIfNeeded();
    return {
      success: true,
      keywordDir: persistedAtStart.keywordDir,
      linksPath,
      expectedSearchUrl: '',
      initialPersistedCount,
      finalPersistedCount: persistedCount,
      addedCount: 0,
      processedCount: 0,
      targetCount: targetTotal,
      ...merged,
    };
  }

  const rawLinks = await readJsonl(linksPath);
  let links: Phase2LinkEntry[] = [];
  const seenLinkNoteIds = new Set<string>();
  for (const r of rawLinks) {
    const e = validateEntry(r);
    if (!e) continue;
    if (seenLinkNoteIds.has(e.noteId)) continue;
    seenLinkNoteIds.add(e.noteId);
    links.push(e);
  }

  if (links.length === 0) {
    await saveDebug('links_empty', { linksPath });
    return {
      success: false,
      keywordDir: persistedAtStart.keywordDir,
      linksPath,
      expectedSearchUrl: '',
      initialPersistedCount,
      finalPersistedCount: persistedCount,
      addedCount: Math.max(0, persistedCount - initialPersistedCount),
      processedCount: 0,
      targetCount: targetTotal,
      error: 'phase2_links_empty',
    };
  }

  const invalidLinks = links.filter((e) => !urlKeywordEquals(e.searchUrl, keyword));
  if (invalidLinks.length > 0) {
    await saveDebug('searchurl_keyword_mismatch', { bad: invalidLinks.slice(0, 5), count: invalidLinks.length });
    if (failFast) {
      const first = invalidLinks[0];
      return {
        success: false,
        keywordDir: persistedAtStart.keywordDir,
        linksPath,
        expectedSearchUrl: first?.searchUrl || '',
        initialPersistedCount,
        finalPersistedCount: persistedCount,
        addedCount: Math.max(0, persistedCount - initialPersistedCount),
        processedCount: 0,
        targetCount: targetTotal,
        error: `searchurl_keyword_mismatch: ${first?.searchUrl || 'unknown'}`,
      };
    }
    links = links.filter((e) => urlKeywordEquals(e.searchUrl, keyword));
  }

  if (links.length === 0) {
    await saveDebug('links_empty_after_filter', { linksPath });
    return {
      success: false,
      keywordDir: persistedAtStart.keywordDir,
      linksPath,
      expectedSearchUrl: '',
      initialPersistedCount,
      finalPersistedCount: persistedCount,
      addedCount: Math.max(0, persistedCount - initialPersistedCount),
      processedCount: 0,
      targetCount: targetTotal,
      error: 'phase2_links_empty_after_filter',
    };
  }

  const expectedSearchUrl = links[0].searchUrl;

  async function appendCoverageShortfall(entry: Record<string, any>): Promise<void> {
    try {
      await fs.mkdir(keywordDir, { recursive: true });
      const logPath = path.join(keywordDir, 'comments-coverage-shortfall.jsonl');
      const line = `${JSON.stringify({ ts: new Date().toISOString(), ...entry })}\n`;
      await fs.appendFile(logPath, line, 'utf-8');
    } catch {
      // ignore
    }
  }

  const processedNoteIds = new Set<string>(persistedAtStart.noteIds);
  let processedCount = 0;
  let rejectedCount = 0;

  // Phase34：最多 4 个“不同笔记”的详情 tab 轮换抓评论（每 tab 每次最多新增 50）
  const MAX_TABS = 4;
  const BATCH = maxCommentsLimit ? Math.min(50, maxCommentsLimit) : 50;

  type Task = {
    noteId: string;
    safeUrl: string;
    searchUrl: string;
    detailUrl: string;
    tabIndex: number;
    startedAt: number;
    firstRun: boolean;
    seenKeys: Set<string>;
    comments: Array<Record<string, any>>;
    reachedEnd: boolean;
    emptyState: boolean;
    totalFromHeader: number | null;
    stoppedByMaxComments: boolean;
    batches: number;
  };

  const pendingLinks = links.filter((l) => !processedNoteIds.has(l.noteId));
  const linkById = new Map<string, Phase2LinkEntry>(links.map((l) => [l.noteId, l]));
  const retryCounts = new Map<string, number>();
  const queuedNoteIds = new Set<string>(pendingLinks.map((l) => l.noteId));
  let cursor = 0;
  const active: Task[] = [];
  let rr = 0;
  const usedTabIndexes = new Set<number>();
  const reservedTabIndexes = new Set<number>();
  let searchTabIndex: number | null = null;
  let searchTabUrl: string | null = null;

  function logProgress(stage: string, noteId?: string): void {
    const noteLabel = noteId ? ` noteId=${noteId}` : '';
    console.log(
      `[Phase34FromLinks][progress] stage=${stage}${noteLabel} persisted=${persistedCount}/${targetTotal} processed=${processedCount}/${targetTotal} active=${active.length} cursor=${cursor}/${pendingLinks.length}`,
    );
  }

  async function clearCommentsArtifacts(noteId: string): Promise<void> {
    const postDir = path.join(persistedAtStart.keywordDir, noteId);
    const commentsPath = path.join(postDir, 'comments.md');
    const commentsDonePath = path.join(postDir, 'comments.done.json');
    await fs.unlink(commentsPath).catch(() => {});
    await fs.unlink(commentsDonePath).catch(() => {});
  }

  async function handleTaskError(options: {
    noteId: string;
    stage: string;
    error: unknown;
    task?: Task | null;
  }): Promise<{ recovered: boolean; rejected: boolean }> {
    const { noteId, stage, error, task } = options;
    const message = error instanceof Error ? error.message : String(error);
    await saveDebug('phase34_task_error', {
      noteId,
      stage,
      error: message,
    });

    if (failFast) throw error;

    const attempts = (retryCounts.get(noteId) || 0) + 1;
    retryCounts.set(noteId, attempts);

    await clearCommentsArtifacts(noteId);

    if (task) {
      task.comments = [];
      task.seenKeys = new Set<string>();
      task.reachedEnd = false;
      task.emptyState = false;
      task.totalFromHeader = null;
      task.stoppedByMaxComments = false;
      task.batches = 0;
      task.firstRun = true;
      await closeTaskTab(task).catch(() => {});
      const idx = active.findIndex((t) => t.noteId === noteId);
      if (idx >= 0) active.splice(idx, 1);
    }

    if (attempts > maxRetryPerNote) {
      console.warn(`[Phase34FromLinks] noteId=${noteId} exceeded retry limit=${maxRetryPerNote}`);
      rejectedCount += 1;
      const link = linkById.get(noteId);
      if (link) {
        await moveNoteToRejected({ noteId, reason: 'retry_exhausted', meta: { stage, error: message } });
      }
      return { recovered: false, rejected: true };
    }

    const link = linkById.get(noteId);
    if (link && !queuedNoteIds.has(noteId)) {
      queuedNoteIds.add(noteId);
      pendingLinks.push(link);
    }
    logProgress('retry_enqueued', noteId);
    return { recovered: true, rejected: false };
  }

  async function listPagesDetailed(): Promise<{
    pages: Array<{ index: number; url: string; active: boolean }>;
    activeIndex: number | null;
  }> {
    const res = await controllerAction('browser:page:list', { profileId: profile }).catch((): any => null);
    const pages = (res as any)?.pages || (res as any)?.data?.pages || [];
    const activeIndexRaw = (res as any)?.activeIndex ?? (res as any)?.data?.activeIndex;
    const activeIndex = Number.isFinite(Number(activeIndexRaw)) ? Number(activeIndexRaw) : null;
    return { pages: Array.isArray(pages) ? pages : [], activeIndex };
  }

  async function refreshSearchTabIndex(reason: string): Promise<void> {
    const { pages } = await listPagesDetailed().catch(() => ({
      pages: [] as Array<{ index: number; url: string; active: boolean }>,
      activeIndex: null as number | null,
    }));
    const prev = searchTabIndex;
    const found = pages.find((p) => {
      const url = typeof p?.url === 'string' ? p.url : '';
      return url.includes('/search_result') && urlKeywordEquals(url, keyword);
    });
    if (found && Number.isFinite(Number(found.index))) {
      searchTabIndex = Number(found.index);
      searchTabUrl = typeof found.url === 'string' ? found.url : searchTabUrl;
    } else {
      searchTabIndex = null;
      searchTabUrl = searchTabUrl || expectedSearchUrl;
    }
    reservedTabIndexes.clear();
    if (searchTabIndex !== null) reservedTabIndexes.add(searchTabIndex);
    if (prev !== searchTabIndex) {
      console.log(
        `[Phase34FromLinks] search tab updated: reason=${reason} index=${searchTabIndex ?? 'n/a'} url=${searchTabUrl ?? ''}`,
      );
    }
  }

  searchTabUrl = expectedSearchUrl;
  await refreshSearchTabIndex('phase34_start');
  logProgress('start');

  async function openPageWithFallback(url: string, reason: string): Promise<number> {
    await refreshSearchTabIndex(`open_page:${reason}`).catch(() => {});
    const reservedIndex = searchTabIndex;
    const beforeDetail = await listPagesDetailed().catch(() => ({
      pages: [] as Array<{ index: number; url: string; active: boolean }>,
      activeIndex: null,
    }) as { pages: Array<{ index: number; url: string; active: boolean }>; activeIndex: number | null });
    const beforeIndexes = new Set<number>(
      beforeDetail.pages.map((p) => Number(p?.index)).filter((n) => Number.isFinite(n)) as number[],
    );

    // Use system-level shortcut to open new tab in same window (Cmd+T on macOS)
const created = await controllerAction('system:shortcut', { app: 'camoufox', shortcut: 'new-tab' });
    const createdIndex = Number((created as any)?.index ?? (created as any)?.data?.index ?? (created as any)?.body?.index);
    if (Number.isFinite(createdIndex) && createdIndex !== reservedIndex) return createdIndex;

    await delay(500);
    const afterDetail = await listPagesDetailed().catch(() => ({
      pages: [] as Array<{ index: number; url: string; active: boolean }>,
      activeIndex: null,
    }) as { pages: Array<{ index: number; url: string; active: boolean }>; activeIndex: number | null });

    if (Number.isFinite(afterDetail.activeIndex) && afterDetail.activeIndex !== reservedIndex) {
      return Number(afterDetail.activeIndex);
    }

    const newPage = afterDetail.pages.find(
      (p) =>
        Number.isFinite(p?.index) &&
        !beforeIndexes.has(Number(p.index)) &&
        Number(p.index) !== reservedIndex,
    );
    if (newPage && Number.isFinite(newPage.index)) return Number(newPage.index);

    const fallback = afterDetail.pages
      .map((p) => Number(p?.index))
      .filter((idx) => Number.isFinite(idx) && idx !== reservedIndex)
      .sort((a, b) => a - b);
    if (fallback.length > 0) {
      return fallback[fallback.length - 1];
    }

    await saveDebug('page_new_invalid_index', {
      reason,
      url,
      created,
      before: beforeDetail.pages.slice(0, 6).map((p) => ({ index: p.index, url: p.url })),
      after: afterDetail.pages.slice(0, 6).map((p) => ({ index: p.index, url: p.url })),
      beforeActive: beforeDetail.activeIndex,
      afterActive: afterDetail.activeIndex,
    });
    throw new Error('browser:page:new returned invalid index');
  }

  function parseNoteIdFromUrl(url: string): string | null {
    const u = typeof url === 'string' ? url : '';
    const m = u.match(/\/explore\/([^/?#]+)/);
    return m ? String(m[1]) : null;
  }

  async function resolveDetailTabIndex(noteId: string): Promise<number | null> {
    const { pages } = await listPagesDetailed();
    for (const p of pages) {
      const url = typeof p?.url === 'string' ? p.url : '';
      if (url.includes('/explore/') && url.includes(noteId)) return Number(p.index);
    }
    return null;
  }

  async function rebuildUsedTabIndexes(reason: string): Promise<void> {
    await refreshSearchTabIndex(`rebuild_tabs:${reason}`).catch(() => {});
    const pages = await listPagesDetailed()
      .then((res) => res.pages)
      .catch(() => [] as Array<{ index: number; url: string; active: boolean }>);
    usedTabIndexes.clear();
    for (const t of active) {
      const resolved = pages.find((p) => typeof p?.url === 'string' && p.url.includes('/explore/') && p.url.includes(t.noteId));
      if (resolved && Number.isFinite((resolved as any).index)) {
        const idx = Number((resolved as any).index);
        t.tabIndex = idx;
        usedTabIndexes.add(idx);
      } else {
        // keep the task, but mark unknown; will reopen when scheduled
        (t as any).tabIndex = null;
      }
    }
    await saveDebug('tabs_rebuilt', {
      reason,
      pages: pages.map((p) => ({ index: (p as any)?.index, url: (p as any)?.url, active: (p as any)?.active })),
      active: active.map((t) => ({ noteId: t.noteId, tabIndex: (t as any).tabIndex ?? null })),
      usedTabIndexes: Array.from(usedTabIndexes),
    }).catch(() => {});
  }

  async function pickReusableTabIndex(): Promise<number | null> {
    const { pages } = await listPagesDetailed();
    const candidates = pages
      .filter((p) => Number.isFinite(p?.index))
      .filter((p) => !usedTabIndexes.has(Number(p.index)))
      .filter((p) => !reservedTabIndexes.has(Number(p.index)))
      .map((p) => ({ index: Number(p.index), url: typeof p?.url === 'string' ? p.url : '' }))
      .filter((p) => p.index >= 0)
      // 允许复用 about:blank 等空白页（开发阶段避免无意义地新开 tab）
      .filter((p) => p.url);

    if (candidates.length === 0) return null;

    // 优先不复用搜索页 tab（保留搜索结果页便于人工观察）
    const preferred = candidates.filter((p) => !p.url.includes('/search_result'));
    const pickFrom = preferred.length > 0 ? preferred : candidates;
    pickFrom.sort((a, b) => a.index - b.index);
    return pickFrom[0].index;
  }

  async function openNewTask(link: Phase2LinkEntry): Promise<Task> {
    processedCount += 1;
    logProgress('open_tab', link.noteId);
    console.log(
      `[Phase34FromLinks] open/reuse tab for note ${persistedCount + 1}/${targetTotal}: noteId=${link.noteId}`,
    );

    // refresh tab index bookkeeping (page indices may shift after closePage)
    await rebuildUsedTabIndexes('open_new_task').catch(() => {});

    // 启动 Phase34 时，可能已经存在上次中断遗留的详情 tab；
    // 开发阶段要求：优先复用现有 tab，在原有基础上重定向，避免无限开新 tab。
    let idx: number | null = await resolveDetailTabIndex(link.noteId);
    let reused = true;

    if (idx === null) {
      idx = await pickReusableTabIndex();
    }

    if (idx !== null && idx === searchTabIndex) {
      idx = null;
    }

    if (idx === null) {
      reused = false;
      idx = await openPageWithFallback(link.safeUrl, `open_new_task:${link.noteId}`);
    }

    usedTabIndexes.add(idx);
    try {
      await controllerAction('browser:page:switch', { profileId: profile, index: idx });
    } catch (e: any) {
      // Page indices can shift; re-resolve by noteId and retry once.
      await saveDebug('page_switch_failed_open_task', { noteId: link.noteId, detailIndex: idx, error: e?.message || String(e) });
      const resolved = await resolveDetailTabIndex(link.noteId);
      if (resolved === null || !Number.isFinite(resolved)) throw e;
      usedTabIndexes.delete(idx);
      idx = resolved;
      usedTabIndexes.add(idx);
      await controllerAction('browser:page:switch', { profileId: profile, index: idx });
    }
    await delay(900);

    const beforeUrl = await getCurrentUrl().catch(() => '');
    const beforeNoteId = parseNoteIdFromUrl(beforeUrl || '');

    // 若复用的 tab 不是目标详情页，则在当前 tab 内 browser:goto 到 safeUrl
    if (beforeNoteId !== link.noteId || !beforeUrl.includes('xsec_token=')) {
      await controllerAction('browser:goto', { profile, url: link.safeUrl });
      await delay(2200);
    }

    await saveDebug('after_open_detail_tab', {
      noteId: link.noteId,
      detailIndex: idx,
      reused,
      beforeUrl,
    });

    const urlNow = await getCurrentUrl();
    if (!urlNow.includes('/explore/') || !urlNow.includes('xsec_token=') || !urlNow.includes(link.noteId)) {
      await saveDebug('detail_url_mismatch', { noteId: link.noteId, expectedSafeUrl: link.safeUrl, beforeUrl, urlNow });
      throw new Error(`detail_url_mismatch: ${urlNow}`);
    }

    // 详情：首次打开就提取并落盘（避免后续 tab 轮换时重复做重活）
    const detail = await extractDetail({ sessionId, serviceUrl });
    if (!detail.success) {
      await saveDebug('extract_detail_failed', { noteId: link.noteId, error: detail.error || null });
      throw new Error(`extract_detail_failed: ${detail.error || 'unknown'}`);
    }

    const persistedDetail = await persistXhsNote({
      sessionId,
      env,
      platform: 'xiaohongshu',
      keyword,
      noteId: link.noteId,
      searchUrl: link.searchUrl,
      detailUrl: urlNow,
      detail: detail.detail,
      persistMode: 'detail',
    });
    if (!persistedDetail.success) {
      await saveDebug('persist_detail_failed', { noteId: link.noteId, error: persistedDetail.error || null });
      throw new Error(`persist_detail_failed: ${persistedDetail.error || 'unknown'}`);
    }

    return {
      noteId: link.noteId,
      safeUrl: link.safeUrl,
      searchUrl: link.searchUrl,
      detailUrl: urlNow,
      tabIndex: idx,
      startedAt: Date.now(),
      firstRun: true,
      seenKeys: new Set<string>(),
      comments: [],
      reachedEnd: false,
      emptyState: false,
      totalFromHeader: null,
      stoppedByMaxComments: false,
      batches: 0,
    };
  }

  async function closeTaskTab(task: Task): Promise<void> {
    const idx = await resolveDetailTabIndex(task.noteId);
    if (idx === null || !Number.isFinite(idx)) {
      await saveDebug('close_task_tab_not_found', {
        noteId: task.noteId,
        detailUrl: task.detailUrl,
        tabIndex: task.tabIndex ?? null,
      });
      return;
    }
    try {
      await controllerAction('browser:page:switch', { profileId: profile, index: idx });
      await delay(450);
      await controllerAction('keyboard:press', { profileId: profile, key: 'Escape' });
      await delay(450);
    } catch {
      // ignore
    }
    await controllerAction('browser:page:close', { profileId: profile, index: idx }).catch(async (e: any) => {
      await saveDebug('page_close_failed', { noteId: task.noteId, detailIndex: idx, error: e?.message || String(e) });
      throw e;
    });
    usedTabIndexes.delete(idx);
    // indices may shift after close; refresh bookkeeping
    await rebuildUsedTabIndexes('close_task_tab').catch(() => {});
    await delay(650);
  }

  async function runOneBatch(task: Task): Promise<{ done: boolean; newCount: number; rejected?: { reason: string; meta?: any } }> {
    // Always resolve by noteId first; page indices can shift after closePage.
    let idx: number | null = await resolveDetailTabIndex(task.noteId);
    if (idx === null || !Number.isFinite(idx)) {
      // The tab might have been closed (by us or by the site). Reopen on demand.
      await saveDebug('task_tab_missing_reopen', { noteId: task.noteId, safeUrl: task.safeUrl, detailUrl: task.detailUrl });
      await rebuildUsedTabIndexes('task_tab_missing_reopen').catch(() => {});
      idx = await openPageWithFallback(task.safeUrl, `reopen_task:${task.noteId}`);
    }
    if (idx === searchTabIndex) {
      idx = await openPageWithFallback(task.safeUrl, `reopen_task_reserved:${task.noteId}`);
    }
    task.tabIndex = idx;

    console.log(
      `[Phase34FromLinks] batch start noteId=${task.noteId} tabIndex=${idx} batchNo=${task.batches + 1} (maxNew=${BATCH})`,
    );
    logProgress('batch_start', task.noteId);

    try {
      await controllerAction('browser:page:switch', { profileId: profile, index: idx });
    } catch (e: any) {
      // The index is stale or shifted; rebuild and retry once by re-resolving.
      await saveDebug('page_switch_failed_run_batch', { noteId: task.noteId, detailIndex: idx, error: e?.message || String(e) });
      await rebuildUsedTabIndexes('page_switch_failed_run_batch').catch(() => {});
      const resolved = await resolveDetailTabIndex(task.noteId);
      if (resolved === null || !Number.isFinite(resolved)) throw e;
      task.tabIndex = resolved;
      idx = resolved;
      await controllerAction('browser:page:switch', { profileId: profile, index: idx });
    }
    await delay(900);
    await saveDebug('before_comments_batch', { noteId: task.noteId, tabIndex: idx, batchNo: task.batches + 1 });

    // Safety: ensure we are still on the correct detail URL; if not, navigate to safeUrl within the same tab.
    try {
      const urlNow = await getCurrentUrl();
      if (!urlNow.includes('/explore/') || !urlNow.includes(task.noteId) || !urlNow.includes('xsec_token=')) {
        await saveDebug('run_batch_detail_url_mismatch', { noteId: task.noteId, urlNow, safeUrl: task.safeUrl });
        await controllerAction('browser:goto', { profile, url: task.safeUrl });
        await delay(2200);
      }
    } catch {
      // ignore
    }

    const out = await expandComments({
      sessionId,
      serviceUrl,
      maxRounds: 240,
      maxNewComments: BATCH,
      seedSeenKeys: Array.from(task.seenKeys),
      startFromTop: task.firstRun,
      ensureLatestTab: task.firstRun,
    } as any);

    if (!out.success) {
      await saveDebug('expand_comments_failed', { noteId: task.noteId, error: out.error || null });
      throw new Error(`expand_comments_failed: ${out.error || 'unknown'}`);
    }

    let newCount = 0;
    for (const c of out.comments || []) {
      const k = typeof (c as any)?._key === 'string' ? String((c as any)._key) : '';
      if (k) task.seenKeys.add(k);
      task.comments.push(c);
      newCount += 1;
    }

    if (maxCommentsLimit && task.comments.length >= maxCommentsLimit) {
      task.comments = task.comments.slice(0, maxCommentsLimit);
      task.stoppedByMaxComments = true;
    }

    task.firstRun = false;
    task.batches += 1;

    const done = Boolean(out.reachedEnd || out.emptyState || task.stoppedByMaxComments);
    task.reachedEnd = Boolean(out.reachedEnd);
    task.emptyState = Boolean(out.emptyState);
    task.totalFromHeader = typeof (out as any)?.totalFromHeader === 'number' ? (out as any).totalFromHeader : null;

    // 若未到底/空，则必须严格达到 batch 上限（否则说明抽取/滚动异常，需要停下排查）
    if (!done && !out.stoppedByMaxNew) {
      await saveDebug('batch_not_reached', {
        noteId: task.noteId,
        newCount,
        batch: BATCH,
        reachedEnd: out.reachedEnd,
        emptyState: out.emptyState,
      });
      throw new Error('batch_not_reached_but_not_at_end_marker_or_empty_state');
    }

    // 每个 batch 都增量落盘（comments.md 会覆盖写入；便于中断后复盘/续跑）
    const persistedComments = await persistXhsNote({
      sessionId,
      env,
      platform: 'xiaohongshu',
      keyword,
      noteId: task.noteId,
      searchUrl: task.searchUrl,
      detailUrl: task.detailUrl,
      commentsResult: {
        comments: task.comments,
        reachedEnd: task.reachedEnd,
        emptyState: task.emptyState,
        stoppedByMaxComments: task.stoppedByMaxComments,
        maxComments: maxCommentsLimit,
        // 仅用于 comments.md 头部展示
        totalFromHeader: task.totalFromHeader,
      },
      persistMode: 'comments',
      downloadImages: false,
    });
    if (!persistedComments.success) {
      await saveDebug('persist_comments_failed', { noteId: task.noteId, error: persistedComments.error || null });
      throw new Error(`persist_comments_failed: ${persistedComments.error || 'unknown'}`);
    }

    // 评论覆盖率校验（必须达到 90% 标称数量）：仅在“到底/空态”后执行硬校验
    // 注意：这里不再 throw 终止整个 Phase34；而是将该 note 移入 _rejected，并继续用后续链接补齐 targetCount。
    if (done && !task.stoppedByMaxComments && task.totalFromHeader !== null && task.totalFromHeader > 0) {
      const need = Math.ceil(task.totalFromHeader * COMMENTS_COVERAGE_RATIO);
      const got = task.comments.length;
      if (got < need) {
        const replyCount = task.comments.filter((c: any) => Boolean(c && typeof c === 'object' && (c as any).is_reply)).length;
        const withIdCount = task.comments.filter((c: any) => {
          const id = (c as any)?.comment_id || (c as any)?.commentId || (c as any)?.id || '';
          return typeof id === 'string' && id.trim().length > 0;
        }).length;
        const tail = task.comments.slice(-5).map((c: any) => ({
          key: typeof c?._key === 'string' ? c._key : null,
          id: (c as any)?.comment_id || null,
          user: (c as any)?.user_name || null,
          text: typeof (c as any)?.text === 'string' ? String((c as any).text).slice(0, 80) : null,
          is_reply: Boolean((c as any)?.is_reply),
        }));
        const exitReason = task.reachedEnd
          ? 'reached_end'
          : task.emptyState
            ? 'empty_state'
            : task.stoppedByMaxComments
              ? 'max_comments'
              : 'unknown';
        const shortfall = {
          noteId: task.noteId,
          safeUrl: task.safeUrl,
          detailUrl: task.detailUrl,
          searchUrl: task.searchUrl,
          got,
          headerTotal: task.totalFromHeader,
          needAtLeast: need,
          reachedEnd: task.reachedEnd,
          emptyState: task.emptyState,
          stoppedByMaxComments: task.stoppedByMaxComments,
          exitReason,
          replyCount,
          withIdCount,
          tail,
        };
        await saveDebug('comments_coverage_shortfall', shortfall);
        await appendCoverageShortfall(shortfall);
      }
    }

    console.log(
      `[Phase34FromLinks] batch done noteId=${task.noteId} new=${newCount} total=${task.comments.length} reachedEnd=${task.reachedEnd} empty=${task.emptyState}`,
    );
    logProgress('batch_done', task.noteId);

    return { done, newCount };
  }

  while (persistedCount < targetTotal) {
    // 填充：按要求一个一个开 tab，开一个先抓一批 50
    if (active.length < MAX_TABS && cursor < pendingLinks.length) {
      const link = pendingLinks[cursor];
      cursor += 1;
      queuedNoteIds.delete(link.noteId);
      let task: Task | null = null;
      try {
        task = await openNewTask(link);
        active.push(task);

        const res = await runOneBatch(task);
        if (res.done) {
          await closeTaskTab(task);
          active.pop();
          processedNoteIds.add(task.noteId);
          logProgress('note_done', task.noteId);
          if (res.rejected) {
            rejectedCount += 1;
            await moveNoteToRejected({
              noteId: task.noteId,
              reason: res.rejected.reason,
              meta: res.rejected.meta || {},
            });
          }
          const persistedAfter = await countPersistedNotes({
            platform: 'xiaohongshu',
            env,
            keyword,
            downloadRoot,
            requiredFiles: ['content.md', 'comments.md'],
            requireCommentsDone: true,
            minCommentsCoverageRatio: countCoverageRatio,
          });
          persistedCount = persistedAfter.count;
        }
      } catch (error) {
        await handleTaskError({ noteId: link.noteId, stage: 'open_or_batch', error, task });
      }
      continue;
    }

    if (active.length === 0) break;

    // 轮换：50 条切换一次
    rr = rr % active.length;
    const task = active[rr];
    rr += 1;

    let res: { done: boolean; newCount: number; rejected?: { reason: string; meta?: any } } | null = null;
    try {
      res = await runOneBatch(task);
    } catch (error) {
      await handleTaskError({ noteId: task.noteId, stage: 'run_batch', error, task });
      continue;
    }
    if (!res) continue;
    if (res.done) {
      await closeTaskTab(task);
      const idx = active.findIndex((t) => t.noteId === task.noteId);
      if (idx >= 0) active.splice(idx, 1);
      processedNoteIds.add(task.noteId);
      logProgress('note_done', task.noteId);
      if (res.rejected) {
        rejectedCount += 1;
        await moveNoteToRejected({
          noteId: task.noteId,
          reason: res.rejected.reason,
          meta: res.rejected.meta || {},
        });
      }

      const persistedAfter = await countPersistedNotes({
        platform: 'xiaohongshu',
        env,
        keyword,
        downloadRoot,
        requiredFiles: ['content.md', 'comments.md'],
        requireCommentsDone: true,
        minCommentsCoverageRatio: countCoverageRatio,
      });
      persistedCount = persistedAfter.count;
    }
  }

  async function isCommentsDone(noteDir: string): Promise<boolean> {
    const donePath = path.join(noteDir, 'comments.done.json');
    try {
      await fs.access(donePath);
      return true;
    } catch {
      // ignore
    }
    const commentsPath = path.join(noteDir, 'comments.md');
    try {
      const text = await fs.readFile(commentsPath, 'utf-8');
      if (text.includes('empty=鏄?')) return true;
      if (text.includes('reachedEnd=鏄?')) return true;
      if (text.includes('stoppedByMaxComments=yes')) return true;
      return false;
    } catch {
      return false;
    }
  }

  async function resetIncompleteComments(): Promise<string[]> {
    const cleared: string[] = [];
    const entries = await fs.readdir(keywordDir, { withFileTypes: true }).catch((): any[] => []);
    for (const ent of entries) {
      if (!ent?.isDirectory?.()) continue;
      if (ent.name.startsWith('_')) continue;
      const noteDir = path.join(keywordDir, ent.name);
      const commentsPath = path.join(noteDir, 'comments.md');
      const exists = await fs.access(commentsPath).then(() => true).catch(() => false);
      if (!exists) continue;
      const done = await isCommentsDone(noteDir);
      if (done) continue;
      await fs.unlink(commentsPath).catch(() => {});
      await fs.unlink(path.join(noteDir, 'comments.jsonl')).catch(() => {});
      await fs.unlink(path.join(noteDir, 'comments.done.json')).catch(() => {});
      cleared.push(ent.name);
    }
    if (cleared.length > 0) {
      console.log(`[Phase34FromLinks] cleared incomplete comments: ${cleared.join(', ')}`);
    }
    return cleared;
  }

  async function mergeMarkdownIfNeeded(): Promise<{
    mergedMarkdownPath?: string;
    mergedMarkdownNotes?: number;
  }> {
    try {
      const merged = await mergeNotesMarkdown({
        platform: 'xiaohongshu',
        env,
        keyword,
        downloadRoot,
      });
      if (merged.success) {
        console.log(`[Phase34FromLinks] merged markdown: ${merged.outputPath} (notes=${merged.mergedNotes})`);
        return {
          mergedMarkdownPath: merged.outputPath,
          mergedMarkdownNotes: merged.mergedNotes,
        };
      }
      console.warn(`[Phase34FromLinks] merge markdown skipped: ${merged.error}`);
    } catch (err: any) {
      console.warn(`[Phase34FromLinks] merge markdown failed: ${err?.message || String(err)}`);
    }
    return {};
  }

  const finalPersistedCount = persistedCount;
  const addedCount = Math.max(0, finalPersistedCount - initialPersistedCount);

  if (finalPersistedCount !== targetTotal) {
    await saveDebug('target_not_reached', { finalPersistedCount, targetCount: targetTotal, expectedSearchUrl });
    return {
      success: false,
      keywordDir: persistedAtStart.keywordDir,
      linksPath,
      expectedSearchUrl,
      initialPersistedCount,
      finalPersistedCount,
      addedCount,
      processedCount,
      rejectedCount,
      targetCount: targetTotal,
      error: `target_not_reached: ${finalPersistedCount}/${targetTotal}`,
    };
  }

  const merged = await mergeMarkdownIfNeeded();
  return {
    success: true,
    keywordDir: persistedAtStart.keywordDir,
    linksPath,
    expectedSearchUrl,
    initialPersistedCount,
    finalPersistedCount,
    addedCount,
    processedCount,
    rejectedCount,
    targetCount: targetTotal,
    ...merged,
  };
}
