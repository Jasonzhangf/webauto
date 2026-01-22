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
import { execute as extractDetail } from './ExtractDetailBlock.js';
import { execute as expandComments } from './ExpandCommentsBlock.js';
import { execute as persistXhsNote } from './PersistXhsNoteBlock.js';

export interface XiaohongshuCollectFromLinksInput {
  sessionId: string;
  keyword: string;
  env?: string;
  targetCount: number;
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
  error?: string;
}

function sanitizeFilenamePart(value: string): string {
  return String(value || '')
    .trim()
    .replace(/[\\/:"*?<>|]+/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 80);
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
    strictTargetCount = true,
    serviceUrl = 'http://127.0.0.1:7701',
  } = input;

  const profile = sessionId;
  const controllerUrl = `${serviceUrl}/v1/controller/action`;

  const keywordDir = path.join(os.homedir(), '.webauto', 'download', 'xiaohongshu', env, keyword);
  const linksPath = path.join(keywordDir, 'phase2-links.jsonl');
  const debugDir = path.join(keywordDir, '_debug', 'phase34_from_links');

  async function controllerAction(action: string, payload: any = {}): Promise<any> {
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
    return data.data || data;
  }

  const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  async function getCurrentUrl(): Promise<string> {
    const res = await controllerAction('browser:execute', { profile, script: 'window.location.href' });
    return (res as any)?.result ?? (res as any)?.data?.result ?? '';
  }

  async function saveDebug(kind: string, meta: Record<string, any>): Promise<void> {
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
    requiredFiles: ['content.md', 'comments.md'],
    requireCommentsDone: true,
    minCommentsCoverageRatio: 0.9,
  });

  let persistedCount = persistedAtStart.count;
  const initialPersistedCount = persistedAtStart.count;

  if (strictTargetCount && persistedCount > targetCount) {
    return {
      success: false,
      keywordDir: persistedAtStart.keywordDir,
      linksPath,
      expectedSearchUrl: '',
      initialPersistedCount,
      finalPersistedCount: persistedCount,
      addedCount: 0,
      processedCount: 0,
      targetCount,
      error: `existing_count_exceeds_target: ${persistedCount} > ${targetCount}`,
    };
  }
  if (persistedCount === targetCount) {
    return {
      success: true,
      keywordDir: persistedAtStart.keywordDir,
      linksPath,
      expectedSearchUrl: '',
      initialPersistedCount,
      finalPersistedCount: persistedCount,
      addedCount: 0,
      processedCount: 0,
      targetCount,
    };
  }

  const rawLinks = await readJsonl(linksPath);
  const links: Phase2LinkEntry[] = [];
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
      targetCount,
      error: 'phase2_links_empty',
    };
  }

  const expectedSearchUrl = links[0].searchUrl;
  for (const e of links) {
    if (e.searchUrl !== expectedSearchUrl) {
      await saveDebug('searchurl_not_strict_equal', { expectedSearchUrl, bad: e });
      return {
        success: false,
        keywordDir: persistedAtStart.keywordDir,
        linksPath,
        expectedSearchUrl,
        initialPersistedCount,
        finalPersistedCount: persistedCount,
        addedCount: Math.max(0, persistedCount - initialPersistedCount),
        processedCount: 0,
        targetCount,
        error: `searchurl_not_strict_equal: ${e.searchUrl}`,
      };
    }
  }

  const processedNoteIds = new Set<string>(persistedAtStart.noteIds);
  let processedCount = 0;
  let rejectedCount = 0;

  // Phase34：最多 4 个“不同笔记”的详情 tab 轮换抓评论（每 tab 每次最多新增 50）
  const MAX_TABS = 4;
  const BATCH = 50;

  type Task = {
    noteId: string;
    safeUrl: string;
    detailUrl: string;
    tabIndex: number;
    startedAt: number;
    firstRun: boolean;
    seenKeys: Set<string>;
    comments: Array<Record<string, any>>;
    reachedEnd: boolean;
    emptyState: boolean;
    totalFromHeader: number | null;
    batches: number;
  };

  const pendingLinks = links.filter((l) => !processedNoteIds.has(l.noteId));
  let cursor = 0;
  const active: Task[] = [];
  let rr = 0;
  const usedTabIndexes = new Set<number>();

  async function listPages(): Promise<Array<{ index: number; url: string; active: boolean }>> {
    const res = await controllerAction('browser:page:list', { profileId: profile }).catch((): any => null);
    const pages = (res as any)?.pages || (res as any)?.data?.pages || [];
    return Array.isArray(pages) ? pages : [];
  }

  function parseNoteIdFromUrl(url: string): string | null {
    const u = typeof url === 'string' ? url : '';
    const m = u.match(/\/explore\/([^/?#]+)/);
    return m ? String(m[1]) : null;
  }

  async function resolveDetailTabIndex(noteId: string): Promise<number | null> {
    const pages = await listPages();
    for (const p of pages) {
      const url = typeof p?.url === 'string' ? p.url : '';
      if (url.includes('/explore/') && url.includes(noteId)) return Number(p.index);
    }
    return null;
  }

  async function rebuildUsedTabIndexes(reason: string): Promise<void> {
    const pages = await listPages().catch(
      () => [] as Array<{ index: number; url: string; active: boolean }>,
    );
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
    const pages = await listPages();
    const candidates = pages
      .filter((p) => Number.isFinite(p?.index))
      .filter((p) => !usedTabIndexes.has(Number(p.index)))
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
    console.log(
      `[Phase34FromLinks] open/reuse tab for note ${persistedCount + 1}/${targetCount}: noteId=${link.noteId}`,
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

    if (idx === null) {
      reused = false;
      const created = await controllerAction('browser:page:new', { profileId: profile, url: link.safeUrl });
      const createdIndex = Number(created?.index ?? created?.data?.index);
      if (!Number.isFinite(createdIndex)) {
        await saveDebug('page_new_invalid_index', { created, noteId: link.noteId, safeUrl: link.safeUrl });
        throw new Error('browser:page:new returned invalid index');
      }
      idx = createdIndex;
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
      searchUrl: expectedSearchUrl,
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
      detailUrl: urlNow,
      tabIndex: idx,
      startedAt: Date.now(),
      firstRun: true,
      seenKeys: new Set<string>(),
      comments: [],
      reachedEnd: false,
      emptyState: false,
      totalFromHeader: null,
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
      const created = await controllerAction('browser:page:new', { profileId: profile, url: task.safeUrl });
      const createdIndex = Number(created?.index ?? created?.data?.index);
      if (!Number.isFinite(createdIndex)) {
        await saveDebug('page_new_invalid_index_run_batch', { created, noteId: task.noteId, safeUrl: task.safeUrl });
        throw new Error('browser:page:new returned invalid index');
      }
      idx = createdIndex;
    }
    task.tabIndex = idx;

    console.log(
      `[Phase34FromLinks] batch start noteId=${task.noteId} tabIndex=${idx} batchNo=${task.batches + 1} (maxNew=${BATCH})`,
    );

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

    task.firstRun = false;
    task.batches += 1;

    const done = Boolean(out.reachedEnd || out.emptyState);
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
      searchUrl: expectedSearchUrl,
      detailUrl: task.detailUrl,
      commentsResult: {
        comments: task.comments,
        reachedEnd: task.reachedEnd,
        emptyState: task.emptyState,
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
    if (done && task.totalFromHeader !== null && task.totalFromHeader > 0) {
      const need = Math.ceil(task.totalFromHeader * 0.9);
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
        await saveDebug('comments_coverage_low', {
          noteId: task.noteId,
          got,
          headerTotal: task.totalFromHeader,
          needAtLeast: need,
          reachedEnd: task.reachedEnd,
          emptyState: task.emptyState,
          replyCount,
          withIdCount,
          tail,
        });
        return {
          done: true,
          newCount,
          rejected: {
            reason: 'comments_coverage_low',
            meta: { got, headerTotal: task.totalFromHeader, needAtLeast: need, replyCount, withIdCount },
          },
        };
      }
    }

    console.log(
      `[Phase34FromLinks] batch done noteId=${task.noteId} new=${newCount} total=${task.comments.length} reachedEnd=${task.reachedEnd} empty=${task.emptyState}`,
    );

    return { done, newCount };
  }

  while (persistedCount < targetCount) {
    // 填充：按要求一个一个开 tab，开一个先抓一批 50
    if (active.length < MAX_TABS && cursor < pendingLinks.length) {
      const link = pendingLinks[cursor];
      cursor += 1;
      const task = await openNewTask(link);
      active.push(task);

      const res = await runOneBatch(task);
      if (res.done) {
        await closeTaskTab(task);
        active.pop();
        processedNoteIds.add(task.noteId);
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
          requiredFiles: ['content.md', 'comments.md'],
          requireCommentsDone: true,
          minCommentsCoverageRatio: 0.9,
        });
        persistedCount = persistedAfter.count;
      }
      continue;
    }

    if (active.length === 0) break;

    // 轮换：50 条切换一次
    rr = rr % active.length;
    const task = active[rr];
    rr += 1;

    const res = await runOneBatch(task);
    if (res.done) {
      await closeTaskTab(task);
      const idx = active.findIndex((t) => t.noteId === task.noteId);
      if (idx >= 0) active.splice(idx, 1);
      processedNoteIds.add(task.noteId);
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
        requiredFiles: ['content.md', 'comments.md'],
        requireCommentsDone: true,
        minCommentsCoverageRatio: 0.9,
      });
      persistedCount = persistedAfter.count;
    }
  }

  const finalPersistedCount = persistedCount;
  const addedCount = Math.max(0, finalPersistedCount - initialPersistedCount);

  if (finalPersistedCount !== targetCount) {
    await saveDebug('target_not_reached', { finalPersistedCount, targetCount, expectedSearchUrl });
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
      targetCount,
      error: `target_not_reached: ${finalPersistedCount}/${targetCount}`,
    };
  }

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
    targetCount,
  };
}
