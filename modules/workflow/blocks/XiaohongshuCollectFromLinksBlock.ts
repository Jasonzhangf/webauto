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

  // Phase34：最多 4 个“不同笔记”的详情 tab 轮换抓评论（每 tab 每次最多新增 50）
  const MAX_TABS = 4;
  const BATCH = 50;

  type Task = {
    noteId: string;
    safeUrl: string;
    detailUrl: string;
    startedAt: number;
    firstRun: boolean;
    seenKeys: Set<string>;
    comments: Array<Record<string, any>>;
    reachedEnd: boolean;
    emptyState: boolean;
    batches: number;
  };

  const pendingLinks = links.filter((l) => !processedNoteIds.has(l.noteId));
  let cursor = 0;
  const active: Task[] = [];
  let rr = 0;

  async function listPages(): Promise<Array<{ index: number; url: string; active: boolean }>> {
    const res = await controllerAction('browser:page:list', { profileId: profile }).catch((): any => null);
    const pages = (res as any)?.pages || (res as any)?.data?.pages || [];
    return Array.isArray(pages) ? pages : [];
  }

  async function resolveDetailTabIndex(noteId: string): Promise<number | null> {
    const pages = await listPages();
    for (const p of pages) {
      const url = typeof p?.url === 'string' ? p.url : '';
      if (url.includes('/explore/') && url.includes(noteId)) return Number(p.index);
    }
    return null;
  }

  async function openNewTask(link: Phase2LinkEntry): Promise<Task> {
    processedCount += 1;
    console.log(`[Phase34FromLinks] open tab for note ${persistedCount + 1}/${targetCount}: noteId=${link.noteId}`);

    const created = await controllerAction('browser:page:new', { profileId: profile, url: link.safeUrl });
    const createdIndex = Number(created?.index ?? created?.data?.index);
    if (!Number.isFinite(createdIndex)) {
      await saveDebug('page_new_invalid_index', { created, noteId: link.noteId, safeUrl: link.safeUrl });
      throw new Error('browser:page:new returned invalid index');
    }
    await controllerAction('browser:page:switch', { profileId: profile, index: createdIndex });
    await delay(1800);
    await saveDebug('after_open_detail_tab', { noteId: link.noteId, detailIndex: createdIndex });

    const urlNow = await getCurrentUrl();
    if (!urlNow.includes('/explore/') || !urlNow.includes('xsec_token=') || !urlNow.includes(link.noteId)) {
      await saveDebug('detail_url_mismatch', { noteId: link.noteId, expectedSafeUrl: link.safeUrl, urlNow });
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
      startedAt: Date.now(),
      firstRun: true,
      seenKeys: new Set<string>(),
      comments: [],
      reachedEnd: false,
      emptyState: false,
      batches: 0,
    };
  }

  async function closeTaskTab(task: Task): Promise<void> {
    const idx = await resolveDetailTabIndex(task.noteId);
    if (idx === null) {
      await saveDebug('close_task_tab_not_found', { noteId: task.noteId, detailUrl: task.detailUrl });
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
    await delay(650);
  }

  async function runOneBatch(task: Task): Promise<{ done: boolean; newCount: number }> {
    const idx = await resolveDetailTabIndex(task.noteId);
    if (idx === null) {
      await saveDebug('task_tab_not_found', { noteId: task.noteId, detailUrl: task.detailUrl });
      throw new Error('task_tab_not_found');
    }

    console.log(
      `[Phase34FromLinks] batch start noteId=${task.noteId} tabIndex=${idx} batchNo=${task.batches + 1} (maxNew=${BATCH})`,
    );

    await controllerAction('browser:page:switch', { profileId: profile, index: idx });
    await delay(900);
    await saveDebug('before_comments_batch', { noteId: task.noteId, tabIndex: idx, batchNo: task.batches + 1 });

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
        totalFromHeader: null,
      },
      persistMode: 'comments',
      downloadImages: false,
    });
    if (!persistedComments.success) {
      await saveDebug('persist_comments_failed', { noteId: task.noteId, error: persistedComments.error || null });
      throw new Error(`persist_comments_failed: ${persistedComments.error || 'unknown'}`);
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
        const persistedAfter = await countPersistedNotes({
          platform: 'xiaohongshu',
          env,
          keyword,
          requiredFiles: ['content.md', 'comments.md'],
          requireCommentsDone: true,
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

      const persistedAfter = await countPersistedNotes({
        platform: 'xiaohongshu',
        env,
        keyword,
        requiredFiles: ['content.md', 'comments.md'],
        requireCommentsDone: true,
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
    targetCount,
  };
}
