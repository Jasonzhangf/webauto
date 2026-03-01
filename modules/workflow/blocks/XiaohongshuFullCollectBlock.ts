/**
 * Workflow Block: XiaohongshuFullCollectBlock
 *
 * Phase 3-4 缂栨帓锛氬湪鎼滅储缁撴灉椤垫壒閲忔墦寮€璇︽儏 鈫?鎻愬彇璇︽儏 鈫?閲囬泦璇勮 鈫?鎸佷箙鍖?鈫?鍏抽棴璇︽儏銆?
 *
 * 绾﹀畾锛?
 * - 宸茬敱涓婃父姝ラ瀹屾垚 EnsureSession / EnsureLogin / WaitSearchPermit / GoToSearch锛?
 * - 鏈?Block 涓嶅仛浠讳綍 URL 鏋勯€犲鑸紝鍙€氳繃瀹瑰櫒鐐瑰嚮杩涘叆璇︽儏锛?
 * - 鎵€鏈夌偣鍑?婊氬姩/杈撳叆鍧囪蛋绯荤粺绾ц兘鍔涳紙container:operation / keyboard:press / PageDown/PageUp锛夈€?
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
    // 宸插湪鎼滅储缁撴灉椤碉紝鐩存帴瑙嗕负鍏抽棴鎴愬姛
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

    // 涓ユ牸绛変簬锛氬繀椤昏兘瑙ｆ瀽鍑?keyword=... 涓旇В鐮佸悗瀹屽叏绛変簬鐩爣 keyword
    try {
      const u = new URL(raw);
      const kw = u.searchParams.get('keyword');
      if (!kw) return false;
      const decodedKw = safeDecodeURIComponent(safeDecodeURIComponent(kw)).trim();
      return decodedKw === String(keyword || '').trim();
    } catch {
      // 鍏煎鏌愪簺鎯呭喌涓?keyword 鍙兘琚弻閲嶇紪鐮佸鑷?URL 瑙ｆ瀽澶辫触
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

    // 鉁?绯荤粺绾ф粴鍔細浼樺厛璧板鍣?scroll operation
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
      // fallback锛歅ageUp/PageDown锛堢郴缁熺骇锛?
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

  // 1) 閫愬睆澶勭悊锛氭瘡娆″彧閲囬泦褰撳墠瑙嗗彛鍐呯殑鍗＄墖锛坢axScrollRounds=1锛夛紝澶勭悊瀹屽啀婊氬姩涓嬩竴灞?
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
      maxScrollRounds: 1, // 鍙噰闆嗗綋鍓嶈鍙ｏ紝閬垮厤 domIndex 婕傜Щ/铏氭嫙鍒楄〃瀵艰嚧 selector 涓嶅瓨鍦?
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

    // 鍊掑簭澶勭悊锛氫紭鍏堝鐞嗗綋鍓嶆洿鍙兘鍦ㄨ鍙ｅ唴鐨勫崱鐗?
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

        // 寮€鍙戦樁娈碉細涓ユ牸绂佹 keyword 婕傜Щ銆傝嫢鍦ㄥ鐞嗗垪琛ㄩ」鍓?URL 宸插彉涓哄叾瀹?keyword锛坰earch_result锛夛紝绔嬪嵆鍋滄骞朵繚鐣欒皟璇曚俊鎭€?
        // 鍙﹀锛氳嫢姝ゆ椂浠嶅仠鐣欏湪璇︽儏椤碉紙/explore锛夛紝浼樺厛鍒ゅ畾涓衡€滄湭鑳介€€鍑鸿鎯呪€濓紝鐩存帴 fail-fast銆?
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

          // 寮€鍙戦樁娈碉細涓嶅仛鍏滃簳绾犻敊/鑷姩琛ュ伩銆備换浣曗€滄墦寮€璇︽儏澶辫触鈥濓紙灏ゅ叾鏄鎺?楠岃瘉鐮?璇偣锛夐兘搴旂珛鍗冲仠涓嬶紝淇濈暀璇佹嵁鎺掓煡銆?
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

        // OCR + merged.md 鍚庡彴骞惰锛氫笌鍚庣画鐨勨€滃紑璇︽儏/鎶撹瘎璁衡€濆苟琛岋紝涓嶉樆濉炰富娴佺▼銆?
        // 娉ㄦ剰锛氫粎鍋氭湰鍦版枃浠跺鐞嗭紝涓嶆秹鍙婃祻瑙堝櫒鎿嶄綔锛屼笉浼氳Е鍙戦鎺с€?
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

        // 姣忔鎴愬姛鍚庣珛鍗宠繘鍏ヤ笅涓€杞紙閲嶆柊閲囬泦褰撳墠瑙嗗彛锛夛紝閬垮厤鍒楄〃閲嶆覆鏌撳鑷?selector/href 澶辨晥
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

    // 鑻ヨ繛缁杞棤鏂板锛屽厛灏濊瘯鈥滃洖婊氫竴娆″啀涓嬫粴鈥濇潵瑙﹀彂铏氭嫙鍒楄〃閲嶆帓锛堜笉鏀瑰彉 keyword锛屼笉鍋氱籂閿欙級
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
      // 婊氫笉鍔細寰€鍥炴粴鍑犳鍐嶇户缁線鍓嶆粴锛岃Е鍙戣櫄鎷熷垪琛ㄩ噸鎺?
      // 娉ㄦ剰锛氳繖閲屽彧鏄粴鍔ㄧ瓥鐣ワ紝涓嶅仛 keyword 绾犻敊/閲嶆悳
      for (let j = 0; j < 3; j += 1) {
        await scrollSearchList('up', 520);
      }
      const movedAfterBounce = await scrollSearchList('down', 800);
      if (movedAfterBounce) {
        noScrollMoveRounds = 0;
        continue;
      }

      // 杩炵画 3 娆℃粴鍔ㄩ兘涓嶅姩锛氬熀鏈彲鍒ゅ畾瑙﹀簳/鍗℃锛岄€€鍑洪伩鍏嶆棤闄愬惊鐜?
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

  // 绛夊緟鍚庡彴 OCR 鏀跺熬锛堝凡涓庨噰闆嗚繃绋嬪苟琛屾墽琛岋級
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

