/**
 * Workflow Block: XiaohongshuFullCollectBlock
 *
 * Phase 3-4 编排：在搜索结果页批量打开详情 → 提取详情 → 采集评论 → 持久化 → 关闭详情。
 *
 * 约定：
 * - 已由上游步骤完成 EnsureSession / EnsureLogin / WaitSearchPermit / GoToSearch；
 * - 本 Block 不做任何 URL 构造导航，只通过容器点击进入详情；
 * - 所有点击/滚动/输入均走系统级能力（container:operation / keyboard:press / mouse:wheel）。
 */

import { execute as collectSearchList } from './CollectSearchListBlock.js';
import { execute as openDetail } from './OpenDetailBlock.js';
import { execute as extractDetail } from './ExtractDetailBlock.js';
import { execute as collectComments } from './CollectCommentsBlock.js';
import { execute as persistXhsNote } from './PersistXhsNoteBlock.js';
import { execute as closeDetail } from './CloseDetailBlock.js';
import { countPersistedNotes } from './helpers/persistedNotes.js';
import { AsyncWorkQueue } from './helpers/asyncWorkQueue.js';
import { organizeOneNote } from './helpers/xhsNoteOrganizer.js';
import { isDebugArtifactsEnabled } from './helpers/debugArtifacts.js';
import { mergeNotesMarkdown } from './helpers/mergeXhsMarkdown.js';
import {
  logControllerActionError,
  logControllerActionResult,
  logControllerActionStart,
} from './helpers/operationLogger.js';
import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';

export interface XiaohongshuFullCollectInput {
  sessionId: string;
  keyword: string;
  env?: string;
  targetCount: number;
  mode?: 'phase3' | 'phase34';
  maxScrollRounds?: number;
  maxWarmupRounds?: number;
  allowClickCommentButton?: boolean;
  strictTargetCount?: boolean;
  serviceUrl?: string;
  enableOcr?: boolean;
  ocrLanguages?: string;
  ocrConcurrency?: number;
}

export interface XiaohongshuFullCollectOutput {
  success: boolean;
  processedCount: number;
  targetCount: number;
  initialPersistedCount: number;
  finalPersistedCount: number;
  addedCount: number;
  keywordDir: string;
  mergedMarkdownPath?: string;
  mergedMarkdownNotes?: number;
  processed: Array<{
    noteId?: string;
    detailUrl?: string;
    domIndex?: number;
    ok: boolean;
    outputDir?: string;
    contentPath?: string;
    error?: string;
  }>;
  error?: string;
}

function resolveDownloadRoot(): string {
  const custom = process.env.WEBAUTO_DOWNLOAD_ROOT || process.env.WEBAUTO_DOWNLOAD_DIR;
  if (custom && custom.trim()) return custom;
  const home = process.env.HOME || process.env.USERPROFILE;
  if (home && home.trim()) return path.join(home, '.webauto', 'download');
  return path.join(os.homedir(), '.webauto', 'download');
}

export async function execute(input: XiaohongshuFullCollectInput): Promise<XiaohongshuFullCollectOutput> {
  const {
    sessionId,
    keyword,
    env = 'debug',
    targetCount,
    mode = 'phase34',
    maxScrollRounds = 40,
    maxWarmupRounds,
    allowClickCommentButton,
    strictTargetCount = true,
    serviceUrl = 'http://127.0.0.1:7701',
    enableOcr = true,
    ocrLanguages,
    ocrConcurrency = 1,
  } = input;

  const processed: XiaohongshuFullCollectOutput['processed'] = [];
  const downloadRoot = resolveDownloadRoot();
  const debugArtifactsEnabled = isDebugArtifactsEnabled();

  const requiredFiles =
    mode === 'phase34' ? (['content.md', 'comments.md'] as const) : (['content.md'] as const);

  const persistedAtStart = await countPersistedNotes({
    platform: 'xiaohongshu',
    env,
    keyword,
    downloadRoot,
    requiredFiles: [...requiredFiles],
    ...(mode === 'phase34' ? { requireCommentsDone: true } : {}),
  });
  const seenNoteIds = new Set<string>(persistedAtStart.noteIds);
  let persistedCount = persistedAtStart.count;
  const openDetailDebugDir = debugArtifactsEnabled
    ? `${persistedAtStart.keywordDir}/_debug/open_detail`
    : '';
  const ocrDebugDir = debugArtifactsEnabled
    ? path.join(persistedAtStart.keywordDir, '_debug', 'ocr')
    : '';

  const ocrQueue =
    enableOcr && mode === 'phase34' && process.platform === 'darwin'
      ? new AsyncWorkQueue({ concurrency: ocrConcurrency, label: 'ocr' })
      : null;

  if (enableOcr && mode === 'phase34' && process.platform !== 'darwin') {
    console.warn(`[FullCollect][ocr] enableOcr=true but platform=${process.platform}; OCR skipped (macOS only)`);
  }

  if (strictTargetCount && persistedCount > targetCount) {
    return {
      success: false,
      processedCount: persistedCount,
      targetCount,
      initialPersistedCount: persistedAtStart.count,
      finalPersistedCount: persistedCount,
      addedCount: 0,
      keywordDir: persistedAtStart.keywordDir,
      processed,
      error: `existing_count_exceeds_target: ${persistedCount} > ${targetCount}`,
    };
  }
  const controllerUrl = `${serviceUrl}/v1/controller/action`;
  const ensureClosedDebugDir = debugArtifactsEnabled
    ? path.join(persistedAtStart.keywordDir, '_debug', 'ensure_closed')
    : '';

  async function saveEnsureClosedDebug(kind: string, meta: Record<string, any>) {
    if (!debugArtifactsEnabled) return;
    try {
      await fs.mkdir(ensureClosedDebugDir, { recursive: true });
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const base = `${ts}-${kind}`;
      const pngPath = path.join(ensureClosedDebugDir, `${base}.png`);
      const jsonPath = path.join(ensureClosedDebugDir, `${base}.json`);

      let shot: any = null;
      try {
        shot = await controllerAction('browser:screenshot', { profileId: sessionId, fullPage: false });
      } catch {
        shot = null;
      }
      const b64 =
        (shot as any)?.data?.data ??
        (shot as any)?.data?.body?.data ??
        (shot as any)?.body?.data ??
        (shot as any)?.result?.data ??
        (shot as any)?.result ??
        (shot as any)?.data ??
        shot;
      if (typeof b64 === 'string' && b64.length > 10) {
        await fs.writeFile(pngPath, Buffer.from(b64, 'base64'));
      }
      await fs.writeFile(
        jsonPath,
        JSON.stringify(
          {
            ts,
            kind,
            sessionId,
            keyword,
            url: await getCurrentUrl(),
            ...meta,
            pngPath: typeof b64 === 'string' && b64.length > 10 ? pngPath : null,
          },
          null,
          2,
        ),
        'utf-8',
      );
      console.log(`[FullCollect][debug] ensureClosed saved ${kind}: ${pngPath}`);
    } catch (e: any) {
      console.warn(`[FullCollect][debug] ensureClosed save failed (${kind}): ${e?.message || String(e)}`);
    }
  }

  async function saveOcrDebug(kind: string, meta: Record<string, any>) {
    if (!debugArtifactsEnabled || !ocrDebugDir) return;
    try {
      await fs.mkdir(ocrDebugDir, { recursive: true });
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const jsonPath = path.join(ocrDebugDir, `${ts}-${kind}.json`);
      await fs.writeFile(jsonPath, JSON.stringify(meta, null, 2), 'utf-8');
    } catch (e: any) {
      console.warn(`[FullCollect][ocr] save debug failed (${kind}): ${e?.message || String(e)}`);
    }
  }

  async function ensureClosed(): Promise<boolean> {
    // 已在搜索结果页，直接视为关闭成功
    const url0 = await getCurrentUrl();
    if (url0.includes('/search_result') && urlMatchesKeyword(url0)) {
      return true;
    }

    try {
      const res = await closeDetail({ sessionId, serviceUrl });
      if (res?.success) return true;
      if (res?.error) {
        processed.push({ ok: false, error: `CloseDetail failed: ${res.error}` });
      }
      await saveEnsureClosedDebug('close_detail_failed', {
        urlBefore: url0,
        result: res || null,
      });
    } catch (e: any) {
      processed.push({ ok: false, error: `CloseDetail threw: ${e?.message || String(e)}` });
      await saveEnsureClosedDebug('close_detail_threw', {
        urlBefore: url0,
        error: e?.message || String(e),
      });
    }
    await saveEnsureClosedDebug('stuck_in_detail_after_close_attempts', {});
    return false;
  }

  function buildStuckInDetailResult(reason: string): XiaohongshuFullCollectOutput {
    return {
      success: false,
      processedCount: persistedCount,
      targetCount,
      initialPersistedCount: persistedAtStart.count,
      finalPersistedCount: persistedCount,
      addedCount: Math.max(0, persistedCount - persistedAtStart.count),
      keywordDir: persistedAtStart.keywordDir,
      processed,
      error: reason,
    };
  }

  async function assertKeywordStillCorrect(tag: string): Promise<true | { ok: false; url: string }> {
    const url = await getCurrentUrl();
    if (url && url.includes('/search_result') && !urlMatchesKeyword(url)) {
      await saveEnsureClosedDebug(`keyword_changed_${tag}`, { url, keyword });
      return { ok: false, url };
    }
    return true;
  }

  async function controllerAction(action: string, payload: any = {}) {
    const opId = logControllerActionStart(action, payload, { source: 'XiaohongshuFullCollectBlock' });
    try {
      const response = await fetch(controllerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, payload }),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }
      const data = await response.json();
      const result = data.data || data;
      logControllerActionResult(opId, action, result, { source: 'XiaohongshuFullCollectBlock' });
      return result;
    } catch (error) {
      logControllerActionError(opId, action, error, payload, { source: 'XiaohongshuFullCollectBlock' });
      throw error;
    }
  }

  function safeDecodeURIComponent(value: string): string {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  async function getCurrentUrl(): Promise<string> {
    try {
      const res = await controllerAction('browser:execute', {
        profile: sessionId,
        script: 'location.href',
      });
      return (res?.result ?? res?.data?.result ?? res ?? '') as string;
    } catch {
      return '';
    }
  }

  function urlMatchesKeyword(url: string): boolean {
    const raw = url || '';
    if (!raw.includes('/search_result')) return false;

    // 严格等于：必须能解析出 keyword=... 且解码后完全等于目标 keyword
    try {
      const u = new URL(raw);
      const kw = u.searchParams.get('keyword');
      if (!kw) return false;
      const decodedKw = safeDecodeURIComponent(safeDecodeURIComponent(kw)).trim();
      return decodedKw === String(keyword || '').trim();
    } catch {
      // 兼容某些情况下 keyword 可能被双重编码导致 URL 解析失败
      const decoded = safeDecodeURIComponent(safeDecodeURIComponent(raw));
      if (!decoded.includes('/search_result')) return false;
      try {
        const u2 = new URL(decoded);
        const kw2 = u2.searchParams.get('keyword');
        if (!kw2) return false;
        const decodedKw2 = safeDecodeURIComponent(safeDecodeURIComponent(kw2)).trim();
        return decodedKw2 === String(keyword || '').trim();
      } catch {
        return false;
      }
    }
  }

  async function scrollSearchListDown(): Promise<boolean> {
    return scrollSearchList('down', 800);
  }

  async function getSearchListScrollState(): Promise<{ windowY: number; feedsY: number | null }> {
    try {
      const res = await controllerAction('browser:execute', {
        profile: sessionId,
        script: `(() => {
          const el = document.querySelector('.feeds-container');
          const y = window.scrollY || document.documentElement.scrollTop || 0;
          const feedsY =
            el && typeof el.scrollTop === 'number' && el.scrollHeight && el.clientHeight
              ? el.scrollTop
              : null;
          return { windowY: y, feedsY };
        })()`,
      });
      const payload = (res as any)?.result ?? (res as any)?.data?.result ?? res ?? null;
      const windowY = Number(payload?.windowY ?? 0);
      const feedsYRaw = payload?.feedsY;
      const feedsY = feedsYRaw === null || typeof feedsYRaw === 'undefined' ? null : Number(feedsYRaw);
      return {
        windowY: Number.isFinite(windowY) ? windowY : 0,
        feedsY: feedsY === null ? null : Number.isFinite(feedsY) ? feedsY : null,
      };
    } catch {
      return { windowY: 0, feedsY: null };
    }
  }

  async function scrollSearchList(direction: 'down' | 'up', amount: number): Promise<boolean> {
    const before = await getSearchListScrollState();

    // ✅ 系统级滚动：优先走容器 scroll operation
    try {
      const op = await controllerAction('container:operation', {
        containerId: 'xiaohongshu_search.search_result_list',
        operationId: 'scroll',
        sessionId,
        config: { direction, amount: Math.min(800, Math.max(120, Math.floor(amount))) },
      });
      const payload = (op as any)?.data ?? op;
      const ok = Boolean(payload?.success ?? (payload as any)?.data?.success ?? (op as any)?.success);
      await new Promise((r) => setTimeout(r, 1100));
      const after = await getSearchListScrollState();
      const moved =
        Math.abs(after.windowY - before.windowY) >= 10 ||
        (after.feedsY !== null &&
          before.feedsY !== null &&
          Math.abs(after.feedsY - before.feedsY) >= 10);
      return ok && moved;
    } catch {
      // fallback：PageUp/PageDown（系统级）
      try {
        await controllerAction('keyboard:press', {
          profileId: sessionId,
          key: direction === 'up' ? 'PageUp' : 'PageDown',
        });
        await new Promise((r) => setTimeout(r, 1300));
        const after = await getSearchListScrollState();
        const moved =
          Math.abs(after.windowY - before.windowY) >= 10 ||
          (after.feedsY !== null &&
            before.feedsY !== null &&
            Math.abs(after.feedsY - before.feedsY) >= 10);
        return moved;
      } catch {
        return false;
      }
    }
  }

  // 1) 逐屏处理：每次只采集当前视口内的卡片（maxScrollRounds=1），处理完再滚动下一屏
  let scrollSteps = 0;
  let stagnantRounds = 0;
  let noScrollMoveRounds = 0;
  let bounceAttempts = 0;

  async function saveSearchListScrollDebug(kind: string, meta: Record<string, any>) {
    try {
      await controllerAction('container:operation', {
        containerId: 'xiaohongshu_search.search_result_list',
        operationId: 'highlight',
        sessionId,
        config: { style: '3px solid #ff4444', duration: 1500 },
      });
    } catch {}
    await new Promise((r) => setTimeout(r, 600));
    await saveEnsureClosedDebug(kind, meta);
  }

  while (persistedCount < targetCount && scrollSteps < maxScrollRounds) {
    const urlNow = await getCurrentUrl();
    if (urlNow && !urlMatchesKeyword(urlNow)) {
      await saveEnsureClosedDebug('keyword_changed', { url: urlNow });
      return {
        success: false,
        processedCount: persistedCount,
        targetCount,
        initialPersistedCount: persistedAtStart.count,
        finalPersistedCount: persistedCount,
        addedCount: Math.max(0, persistedCount - persistedAtStart.count),
        keywordDir: persistedAtStart.keywordDir,
        processed,
        error: `keyword_changed: ${urlNow}`,
      };
    }

    const remaining = Math.max(0, targetCount - persistedCount);

    const list = await collectSearchList({
      sessionId,
      targetCount: Math.min(remaining, 30),
      maxScrollRounds: 1, // 只采集当前视口，避免 domIndex 漂移/虚拟列表导致 selector 不存在
      serviceUrl,
    });

    const kwOkAfterList = await assertKeywordStillCorrect('after_collect_list');
    if (kwOkAfterList !== true) {
      return {
        success: false,
        processedCount: persistedCount,
        targetCount,
        initialPersistedCount: persistedAtStart.count,
        finalPersistedCount: persistedCount,
        addedCount: Math.max(0, persistedCount - persistedAtStart.count),
        keywordDir: persistedAtStart.keywordDir,
        processed,
        error: `keyword_changed_after_collect_list: ${kwOkAfterList.url}`,
      };
    }

    if (!list.success || !Array.isArray(list.items) || list.items.length === 0) {
      await saveEnsureClosedDebug('collect_search_list_failed', {
        success: Boolean(list.success),
        error: list.error || null,
        itemCount: Array.isArray(list.items) ? list.items.length : null,
      });
      return {
        success: false,
        processedCount: persistedCount,
        targetCount,
        initialPersistedCount: persistedAtStart.count,
        finalPersistedCount: persistedCount,
        addedCount: Math.max(0, persistedCount - persistedAtStart.count),
        keywordDir: persistedAtStart.keywordDir,
        processed,
        error: list.error || 'CollectSearchListBlock returned no items',
      };
    }

    let processedThisRound = 0;

    // 倒序处理：优先处理当前更可能在视口内的卡片
    for (const item of list.items.slice().reverse()) {
      if (persistedCount >= targetCount) break;

      const domIndex = typeof item.domIndex === 'number' ? item.domIndex : undefined;
      const noteId = typeof item.noteId === 'string' ? item.noteId : undefined;
      const clickRect =
        item.rect &&
        typeof item.rect.x === 'number' &&
        typeof item.rect.y === 'number' &&
        typeof item.rect.width === 'number' &&
        typeof item.rect.height === 'number'
          ? item.rect
          : undefined;

      if (noteId && seenNoteIds.has(noteId)) {
        continue;
      }

      if (typeof domIndex !== 'number' || !Number.isFinite(domIndex) || domIndex < 0) {
        continue;
      }

      try {
        const beforePersistCount = persistedCount;

        // 开发阶段：严格禁止 keyword 漂移。若在处理列表项前 URL 已变为其它 keyword（search_result），立即停止并保留调试信息。
        // 另外：若此时仍停留在详情页（/explore），优先判定为“未能退出详情”，直接 fail-fast。
        const urlBeforeOpen = await getCurrentUrl();
        if (urlBeforeOpen && urlBeforeOpen.includes('/explore/')) {
          await saveEnsureClosedDebug('unexpected_in_detail_before_open_detail', {
            urlNow,
            urlBeforeOpen,
            keyword,
            domIndex,
            expectedNoteId: noteId || null,
          });
          const closed = await ensureClosed();
          if (!closed) return buildStuckInDetailResult('stuck_in_detail_before_open_detail');
          continue;
        }
        if (urlBeforeOpen && urlBeforeOpen.includes('/search_result') && !urlMatchesKeyword(urlBeforeOpen)) {
          await saveEnsureClosedDebug('keyword_changed_before_open_detail', {
            urlNow,
            urlBeforeOpen,
            keyword,
            domIndex,
            expectedNoteId: noteId || null,
          });
          return {
            success: false,
            processedCount: persistedCount,
            targetCount,
            initialPersistedCount: persistedAtStart.count,
            finalPersistedCount: persistedCount,
            addedCount: Math.max(0, persistedCount - persistedAtStart.count),
            keywordDir: persistedAtStart.keywordDir,
            processed,
            error: `keyword_changed_before_open_detail: ${urlBeforeOpen}`,
          };
        }

        const opened = await openDetail({
          sessionId,
          containerId: item.containerId || 'xiaohongshu_search.search_result_item',
          domIndex,
          clickRect,
          expectedNoteId: item.noteId,
          expectedHref: item.hrefAttr,
          debugDir: openDetailDebugDir || undefined,
          serviceUrl,
        });

        if (!opened.success || !opened.safeDetailUrl || !opened.noteId) {
          processed.push({
            domIndex,
            noteId,
            ok: false,
            error: opened.error || 'OpenDetailBlock failed',
          });

          // 开发阶段：不做兜底纠错/自动补偿。任何“打开详情失败”（尤其是风控/验证码/误点）都应立即停下，保留证据排查。
          const closed = await ensureClosed();
          if (!closed) return buildStuckInDetailResult('stuck_in_detail_after_open_detail_failed');

          return {
            success: false,
            processedCount: persistedCount,
            targetCount,
            initialPersistedCount: persistedAtStart.count,
            finalPersistedCount: persistedCount,
            addedCount: Math.max(0, persistedCount - persistedAtStart.count),
            keywordDir: persistedAtStart.keywordDir,
            processed,
            error: `open_detail_failed: ${opened.error || 'unknown'}`,
          };
        }

        if (seenNoteIds.has(opened.noteId)) {
          const closed = await ensureClosed();
          if (!closed) return buildStuckInDetailResult('stuck_in_detail_after_duplicate_note');
          continue;
        }
        seenNoteIds.add(opened.noteId);

        const detail = await extractDetail({ sessionId, serviceUrl });
        if (!detail.success) {
          processed.push({
            noteId: opened.noteId,
            detailUrl: opened.safeDetailUrl,
            domIndex,
            ok: false,
            error: detail.error || 'ExtractDetailBlock failed',
          });
          const closed = await ensureClosed();
          if (!closed) return buildStuckInDetailResult('stuck_in_detail_after_extract_failed');
          continue;
        }

        const comments =
          mode === 'phase3'
            ? {
                success: true,
                comments: [],
                reachedEnd: false,
                emptyState: false,
                warmupCount: 0,
                totalFromHeader: null,
              }
	            : await collectComments({
	                sessionId,
	                serviceUrl,
	                ...(typeof maxWarmupRounds === 'number' && maxWarmupRounds > 0
	                  ? { maxWarmupRounds }
	                  : {}),
	                ...(allowClickCommentButton === false ? { allowClickCommentButton: false } : {}),
	                commentTabMode: 'rotate4',
	                commentTabBatch: 50,
	                commentTabMaxTabs: 4,
	              } as any);

        if (mode === 'phase34' && !comments?.success) {
          processed.push({
            noteId: opened.noteId,
            detailUrl: opened.safeDetailUrl,
            domIndex,
            ok: false,
            error: comments?.error || 'CollectCommentsBlock failed',
          });
          const closed = await ensureClosed();
          if (!closed) return buildStuckInDetailResult('stuck_in_detail_after_collect_comments_failed');
          continue;
        }

        const persisted = await persistXhsNote({
          sessionId,
          env,
          platform: 'xiaohongshu',
          keyword,
          noteId: opened.noteId,
          searchUrl: urlNow,
          detailUrl: opened.safeDetailUrl,
          detail: detail.detail,
          commentsResult: comments,
          persistMode: mode === 'phase3' ? 'detail' : 'both',
        });

        processed.push({
          noteId: opened.noteId,
          detailUrl: opened.safeDetailUrl,
          domIndex,
          ok: Boolean(persisted.success),
          outputDir: persisted.outputDir,
          contentPath: persisted.contentPath,
          ...(persisted.success ? {} : { error: persisted.error || 'PersistXhsNoteBlock failed' }),
        });

        // OCR + merged.md 后台并行：与后续的“开详情/抓评论”并行，不阻塞主流程。
        // 注意：仅做本地文件处理，不涉及浏览器操作，不会触发风控。
        if (persisted.success && ocrQueue && persisted.outputDir) {
          const noteDir = String(persisted.outputDir);
          const noteIdForJob = String(opened.noteId);
          const languagesForJob = typeof ocrLanguages === 'string' && ocrLanguages.trim() ? ocrLanguages.trim() : 'chi_sim+eng';
          console.log(`[FullCollect][ocr] queue note=${noteIdForJob} dir=${noteDir}`);
          void ocrQueue
            .enqueue(async () => {
              const t0 = Date.now();
              await saveOcrDebug(`start-${noteIdForJob}`, { noteId: noteIdForJob, noteDir, languages: languagesForJob });
              const res = await organizeOneNote({
                noteDir,
                noteId: noteIdForJob,
                keyword,
                ocrLanguages: languagesForJob,
                runOcr: true,
              });
              const ms = Date.now() - t0;
              await saveOcrDebug(`done-${noteIdForJob}`, { ...res, ms });
              console.log(
                `[FullCollect][ocr] done note=${noteIdForJob} images=${res.imageCount} ocrErrors=${res.ocrErrors} ms=${ms}`,
              );
              return res;
            })
            .catch(async (e: any) => {
              await saveOcrDebug(`error-${noteIdForJob}`, { noteId: noteIdForJob, error: e?.message || String(e) });
              console.warn(`[FullCollect][ocr] failed note=${noteIdForJob}: ${e?.message || String(e)}`);
            });
        }
        if (persisted.success) {
          const persistedAfter = await countPersistedNotes({
            platform: 'xiaohongshu',
            env,
            keyword,
            requiredFiles: [...requiredFiles],
            ...(mode === 'phase34' ? { requireCommentsDone: true } : {}),
          });
          if (persistedAfter.count > beforePersistCount) {
            persistedCount = persistedAfter.count;
            processedThisRound += 1;
          }
        }

        const closed = await ensureClosed();
        if (!closed) {
          processed.push({
            noteId: opened.noteId,
            detailUrl: opened.safeDetailUrl,
            domIndex,
            ok: false,
            error: 'CloseDetailBlock failed repeatedly (stuck in detail)',
          });
          return {
            success: false,
            processedCount: persistedCount,
            targetCount,
            initialPersistedCount: persistedAtStart.count,
            finalPersistedCount: persistedCount,
            addedCount: Math.max(0, persistedCount - persistedAtStart.count),
            keywordDir: persistedAtStart.keywordDir,
            processed,
            error: 'stuck_in_detail',
          };
        }

        const kwOkAfterClose = await assertKeywordStillCorrect('after_close_detail');
        if (kwOkAfterClose !== true) {
          return {
            success: false,
            processedCount: persistedCount,
            targetCount,
            initialPersistedCount: persistedAtStart.count,
            finalPersistedCount: persistedCount,
            addedCount: Math.max(0, persistedCount - persistedAtStart.count),
            keywordDir: persistedAtStart.keywordDir,
            processed,
            error: `keyword_changed_after_close_detail: ${kwOkAfterClose.url}`,
          };
        }

        // 每次成功后立即进入下一轮（重新采集当前视口），避免列表重渲染导致 selector/href 失效
        if (persistedCount > beforePersistCount) {
          break;
        }
      } catch (err: any) {
        processed.push({
          domIndex,
          noteId,
          ok: false,
          error: err?.message || String(err),
        });
        const closed = await ensureClosed();
        if (!closed) {
          return {
            success: false,
            processedCount: persistedCount,
            targetCount,
            initialPersistedCount: persistedAtStart.count,
            finalPersistedCount: persistedCount,
            addedCount: Math.max(0, persistedCount - persistedAtStart.count),
            keywordDir: persistedAtStart.keywordDir,
            processed,
            error: 'stuck_in_detail',
          };
        }
      }
    }

    if (processedThisRound === 0) {
      stagnantRounds += 1;
    } else {
      stagnantRounds = 0;
    }

    if (persistedCount >= targetCount) break;

    // 若连续多轮无新增，先尝试“回滚一次再下滚”来触发虚拟列表重排（不改变 keyword，不做纠错）
    if (stagnantRounds >= 4 && bounceAttempts < 3) {
      bounceAttempts += 1;
      console.log(`[FullCollect] stagnantRounds=${stagnantRounds}, bounce=${bounceAttempts} (up then down)`);
      await scrollSearchList('up', 600);
      await scrollSearchList('down', 800);
      stagnantRounds = 0;
    }

    scrollSteps += 1;
    const scrolled = await scrollSearchListDown();
    if (!scrolled) {
      noScrollMoveRounds += 1;
      console.log(`[FullCollect] scroll did not move (round=${noScrollMoveRounds})`);
      // 滚不动：往回滚几次再继续往前滚，触发虚拟列表重排
      // 注意：这里只是滚动策略，不做 keyword 纠错/重搜
      for (let j = 0; j < 3; j += 1) {
        await scrollSearchList('up', 520);
      }
      const movedAfterBounce = await scrollSearchList('down', 800);
      if (movedAfterBounce) {
        noScrollMoveRounds = 0;
        continue;
      }

      // 连续 3 次滚动都不动：基本可判定触底/卡死，退出避免无限循环
      if (noScrollMoveRounds >= 3) {
        await saveSearchListScrollDebug('search_list_scroll_stuck', {
          persistedCount,
          targetCount,
          scrollSteps,
          noScrollMoveRounds,
        });
        break;
      }
      continue;
    }
    noScrollMoveRounds = 0;

    const kwOkAfterScroll = await assertKeywordStillCorrect('after_scroll_list');
    if (kwOkAfterScroll !== true) {
      return {
        success: false,
        processedCount: persistedCount,
        targetCount,
        initialPersistedCount: persistedAtStart.count,
        finalPersistedCount: persistedCount,
        addedCount: Math.max(0, persistedCount - persistedAtStart.count),
        keywordDir: persistedAtStart.keywordDir,
        processed,
        error: `keyword_changed_after_scroll_list: ${kwOkAfterScroll.url}`,
      };
    }
  }

  const persistedAtEnd = await countPersistedNotes({
    platform: 'xiaohongshu',
    env,
    keyword,
    requiredFiles: [...requiredFiles],
    ...(mode === 'phase34' ? { requireCommentsDone: true } : {}),
  });

  // 等待后台 OCR 收尾（已与采集过程并行执行）
  if (ocrQueue) {
    console.log(`[FullCollect][ocr] draining... pending=${ocrQueue.getPendingCount()} running=${ocrQueue.getRunningCount()}`);
    await ocrQueue.drain();
    console.log('[FullCollect][ocr] drained');
  }
  const finalCount = persistedAtEnd.count;
  let mergedMarkdownPath: string | undefined;
  let mergedMarkdownNotes: number | undefined;

  try {
    const merged = await mergeNotesMarkdown({
      platform: 'xiaohongshu',
      env,
      keyword,
      downloadRoot,
    });
    if (merged.success) {
      mergedMarkdownPath = merged.outputPath;
      mergedMarkdownNotes = merged.mergedNotes;
      console.log(`[FullCollect] merged markdown: ${merged.outputPath} (notes=${merged.mergedNotes})`);
    } else {
      console.warn(`[FullCollect] merge markdown skipped: ${merged.error}`);
    }
  } catch (err: any) {
    console.warn(`[FullCollect] merge markdown failed: ${err?.message || String(err)}`);
  }

  return {
    success: strictTargetCount ? finalCount === targetCount : finalCount >= targetCount,
    processedCount: finalCount,
    targetCount,
    initialPersistedCount: persistedAtStart.count,
    finalPersistedCount: finalCount,
    addedCount: Math.max(0, finalCount - persistedAtStart.count),
    keywordDir: persistedAtEnd.keywordDir,
    mergedMarkdownPath,
    mergedMarkdownNotes,
    processed,
    ...(strictTargetCount
      ? finalCount === targetCount
        ? {}
        : { error: `persisted_count_mismatch: ${finalCount}/${targetCount}` }
      : finalCount >= targetCount
        ? {}
        : { error: `only processed ${finalCount}/${targetCount}` }),
  };
}
