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
}

export interface XiaohongshuFullCollectOutput {
  success: boolean;
  processedCount: number;
  targetCount: number;
  initialPersistedCount: number;
  finalPersistedCount: number;
  addedCount: number;
  keywordDir: string;
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
  } = input;

  const processed: XiaohongshuFullCollectOutput['processed'] = [];

  const requiredFiles =
    mode === 'phase34' ? (['content.md', 'comments.md'] as const) : (['content.md'] as const);

  const persistedAtStart = await countPersistedNotes({
    platform: 'xiaohongshu',
    env,
    keyword,
    requiredFiles: [...requiredFiles],
    ...(mode === 'phase34' ? { requireCommentsDone: true } : {}),
  });
  const seenNoteIds = new Set<string>(persistedAtStart.noteIds);
  let persistedCount = persistedAtStart.count;
  const openDetailDebugDir = `${persistedAtStart.keywordDir}/_debug/open_detail`;

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
  const ensureClosedDebugDir = path.join(persistedAtStart.keywordDir, '_debug', 'ensure_closed');

  async function saveEnsureClosedDebug(kind: string, meta: Record<string, any>) {
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
    } catch (e: any) {
      processed.push({ ok: false, error: `CloseDetail threw: ${e?.message || String(e)}` });
    }
    await saveEnsureClosedDebug('stuck_in_detail_after_close_attempts', {});
    return false;
  }

  async function controllerAction(action: string, payload: any = {}) {
    const response = await fetch(controllerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, payload }),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
    const data = await response.json();
    return data.data || data;
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
    // ✅ 系统级滚动：优先走容器 scroll operation
    try {
      const op = await controllerAction('container:operation', {
        containerId: 'xiaohongshu_search.search_result_list',
        operationId: 'scroll',
        sessionId,
        config: { direction: 'down', amount: 800 },
      });
      const payload = (op as any)?.data ?? op;
      const ok = Boolean(payload?.success ?? (payload as any)?.data?.success ?? (op as any)?.success);
      await new Promise((r) => setTimeout(r, 1000));
      return ok;
    } catch {
      // fallback：PageDown
      try {
        await controllerAction('keyboard:press', { profileId: sessionId, key: 'PageDown' });
        await new Promise((r) => setTimeout(r, 1200));
        return true;
      } catch {
        return false;
      }
    }
  }

  // 1) 逐屏处理：每次只采集当前视口内的卡片（maxScrollRounds=1），处理完再滚动下一屏
  let scrollSteps = 0;
  let stagnantRounds = 0;

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

        const opened = await openDetail({
          sessionId,
          containerId: item.containerId || 'xiaohongshu_search.search_result_item',
          domIndex,
          clickRect,
          expectedNoteId: item.noteId,
          expectedHref: item.hrefAttr,
          debugDir: openDetailDebugDir,
          serviceUrl,
        });

        if (!opened.success || !opened.safeDetailUrl || !opened.noteId) {
          processed.push({
            domIndex,
            noteId,
            ok: false,
            error: opened.error || 'OpenDetailBlock failed',
          });
          await ensureClosed();
          continue;
        }

        if (seenNoteIds.has(opened.noteId)) {
          await ensureClosed();
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
          await ensureClosed();
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
              } as any);

        if (mode === 'phase34' && !comments?.success) {
          processed.push({
            noteId: opened.noteId,
            detailUrl: opened.safeDetailUrl,
            domIndex,
            ok: false,
            error: comments?.error || 'CollectCommentsBlock failed',
          });
          await ensureClosed();
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
    if (stagnantRounds >= 3) break;

    scrollSteps += 1;
    const scrolled = await scrollSearchListDown();
    if (!scrolled) break;
  }

  const persistedAtEnd = await countPersistedNotes({
    platform: 'xiaohongshu',
    env,
    keyword,
    requiredFiles: [...requiredFiles],
    ...(mode === 'phase34' ? { requireCommentsDone: true } : {}),
  });
  const finalCount = persistedAtEnd.count;

  return {
    success: strictTargetCount ? finalCount === targetCount : finalCount >= targetCount,
    processedCount: finalCount,
    targetCount,
    initialPersistedCount: persistedAtStart.count,
    finalPersistedCount: finalCount,
    addedCount: Math.max(0, finalCount - persistedAtStart.count),
    keywordDir: persistedAtEnd.keywordDir,
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
