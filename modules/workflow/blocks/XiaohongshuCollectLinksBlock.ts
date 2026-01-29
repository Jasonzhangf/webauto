/**
 * Workflow Block: XiaohongshuCollectLinksBlock
 *
 * Phase2锛氬湪鎼滅储缁撴灉椤甸€氳繃鈥滅偣鍑昏繘鍏ヨ鎯?鈫?璇诲彇鐪熷疄 URL(xsec_token) 鈫?ESC 杩斿洖鈥濈殑鏂瑰紡閲囬泦瀹夊叏閾炬帴锛?
 * 骞跺啓鍏ワ細~/.webauto/download/xiaohongshu/{env}/{keyword}/phase2-links.jsonl
 *
 * 绾︽潫锛?
 * - 涓ョ鏋勯€?URL锛涘繀椤荤偣鍑昏繘鍏ヨ鎯呰幏鍙栫湡瀹為摼鎺?
 * - searchUrl 蹇呴』涓ユ牸绛変簬鍚屼竴涓瓧绗︿覆锛堢敤浜庡彂鐜拌鐐光€滅浉鍏虫悳绱?澶у閮藉湪鎼溾€濓級
 * - 寮€鍙戦樁娈碉細浠讳綍寮傚父锛堣鐐?楠岃瘉鐮?閫€鍑哄け璐ワ級鐩存帴 fail-fast锛屼繚鐣欒瘉鎹?
 */

import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { urlKeywordEquals } from './helpers/searchPageState.js';
import { getPrimarySelectorByContainerId } from './helpers/containerAnchors.js';
import { execute as collectSearchList } from './CollectSearchListBlock.js';
import { execute as detectPageState } from './DetectPageStateBlock.js';
import { execute as openDetail } from './OpenDetailBlock.js';
import { execute as closeDetail } from './CloseDetailBlock.js';
import { execute as restorePhase } from './restore/RestorePhaseBlock.js';
import { resolveTargetCount } from './helpers/targetCountMode.js';
import { execute as waitSearchPermit } from './WaitSearchPermitBlock.js';
import { execute as goToSearch } from './GoToSearchBlock.js';
import { isDevMode } from './helpers/systemInput.js';
import {
  logControllerActionError,
  logControllerActionResult,
  logControllerActionStart,
} from './helpers/operationLogger.js';

export interface XiaohongshuCollectLinksInput {
  sessionId: string;
  keyword: string;
  env?: string;
  targetCount: number;
  targetCountMode?: 'absolute' | 'incremental';
  maxScrollRounds?: number;
  strictTargetCount?: boolean;
  serviceUrl?: string;
}

export interface Phase2LinkEntry {
  noteId: string;
  safeUrl: string;
  searchUrl: string;
  ts: string;
}

type Rect = { x: number; y: number; width: number; height: number };

export interface XiaohongshuCollectLinksOutput {
  success: boolean;
  keywordDir: string;
  linksPath: string;
  expectedSearchUrl: string;
  initialCount: number;
  finalCount: number;
  addedCount: number;
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

function resolveDownloadRoot(): string {
  const custom = process.env.WEBAUTO_DOWNLOAD_ROOT || process.env.WEBAUTO_DOWNLOAD_DIR;
  if (custom && custom.trim()) return custom;
  const home = process.env.HOME || process.env.USERPROFILE || os.homedir();
  return path.join(home, '.webauto', 'download');
}

function isDebugArtifactsEnabled(): boolean {
  return (
    process.env.WEBAUTO_DEBUG === '1' ||
    process.env.WEBAUTO_DEBUG_ARTIFACTS === '1' ||
    process.env.WEBAUTO_DEBUG_SCREENSHOT === '1'
  );
}

function shuffleItems<T>(items: T[]): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
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

async function appendJsonl(filePath: string, value: any): Promise<void> {
  const line = `${JSON.stringify(value)}\n`;
  await fs.appendFile(filePath, line, 'utf-8');
}

export async function execute(input: XiaohongshuCollectLinksInput): Promise<XiaohongshuCollectLinksOutput> {
  const {
    sessionId,
    keyword,
    env = 'debug',
    targetCount,
    targetCountMode = 'absolute',
    maxScrollRounds = 60,
    strictTargetCount = true,
    serviceUrl = 'http://127.0.0.1:7701',
  } = input;

  const profile = sessionId;
  const controllerUrl = `${serviceUrl}/v1/controller/action`;
  const debugArtifactsEnabled = isDebugArtifactsEnabled();
  const keywordDir = path.join(resolveDownloadRoot(), 'xiaohongshu', env, keyword);
  const linksPath = path.join(keywordDir, 'phase2-links.jsonl');
  const debugDir = path.join(keywordDir, '_debug', 'phase2_links');
  const listContainerId = 'xiaohongshu_search.search_result_list';
  const listSelectorPromise = getPrimarySelectorByContainerId(listContainerId).catch((): string | null => null);
  const failFast = isDevMode();
  const maxRecoverAttempts = Math.max(
    1,
    Number(process.env.WEBAUTO_PHASE2_RECOVER_MAX || 3),
  );
  let recoverAttempts = 0;

  async function controllerAction(action: string, payload: any = {}): Promise<any> {
    const opId = logControllerActionStart(action, payload, { source: 'XiaohongshuCollectLinksBlock' });
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
      logControllerActionResult(opId, action, result, { source: 'XiaohongshuCollectLinksBlock' });
      return result;
    } catch (error) {
      logControllerActionError(opId, action, error, payload, { source: 'XiaohongshuCollectLinksBlock' });
      throw error;
    }
  }

  const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  async function getCurrentUrl(): Promise<string> {
    const res = await controllerAction('browser:execute', { profile, script: 'window.location.href' });
    return (res as any)?.result ?? (res as any)?.data?.result ?? '';
  }

  async function saveDebug(kind: string, meta: Record<string, any>): Promise<void> {
    if (!debugArtifactsEnabled) return;
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
      console.log(`[Phase2Links][debug] saved ${kind}: ${pngPath}`);
    } catch (e: any) {
      console.warn(`[Phase2Links][debug] save failed (${kind}): ${e?.message || String(e)}`);
    }
  }

  function validateEntry(raw: any): Phase2LinkEntry | null {
    const noteId = typeof raw?.noteId === 'string' ? raw.noteId.trim() : '';
    const safeUrl = typeof raw?.safeUrl === 'string' ? raw.safeUrl.trim() : '';
    const searchUrl = typeof raw?.searchUrl === 'string' ? raw.searchUrl.trim() : '';
    if (!noteId || !safeUrl || !searchUrl) return null;
    if (!isValidSafeUrl(safeUrl)) return null;
    if (!isValidSearchUrl(searchUrl, keyword)) return null;
    return {
      noteId,
      safeUrl,
      searchUrl,
      ts: typeof raw?.ts === 'string' ? raw.ts : new Date().toISOString(),
    };
  }

  function isValidSearchUrl(searchUrl: string, expectedKeyword: string): boolean {
    try {
      const url = new URL(searchUrl);
      if (!url.hostname.endsWith('xiaohongshu.com')) return false;
      if (!url.pathname.includes('/search_result')) return false;
      return urlKeywordEquals(searchUrl, expectedKeyword);
    } catch {
      return false;
    }
  }

  function isValidSafeUrl(safeUrl: string): boolean {
    try {
      const url = new URL(safeUrl);
      if (!url.hostname.endsWith('xiaohongshu.com')) return false;
      if (!/\/explore\/[a-f0-9]+/.test(url.pathname)) return false;
      if (!url.searchParams.get('xsec_token')) return false;
      return true;
    } catch {
      return false;
    }
  }

  await fs.mkdir(keywordDir, { recursive: true });

  // 0) 璇诲彇宸叉湁閾炬帴锛堝閲忛噰闆嗭級
  const existingRaw = await readJsonl(linksPath);
  const existing: Phase2LinkEntry[] = [];
  const byNoteId = new Map<string, Phase2LinkEntry>();
  for (const r of existingRaw) {
    const e = validateEntry(r);
    if (!e) continue;
    if (byNoteId.has(e.noteId)) continue;
    byNoteId.set(e.noteId, e);
    existing.push(e);
  }

  const initialCount = byNoteId.size;
  const { targetTotal } = resolveTargetCount({
    targetCount,
    baseCount: initialCount,
    mode: targetCountMode,
  });

  if (initialCount > targetTotal) {
    const trimmed = existing.slice(0, targetTotal);
    const body = trimmed.length > 0 ? `${trimmed.map((e) => JSON.stringify(e)).join('\n')}\n` : '';
    await fs.writeFile(linksPath, body, 'utf-8');
    console.log(`[Phase2Links] existing links exceed target, trimmed ${initialCount} -> ${trimmed.length}`);
    const expected = trimmed[0]?.searchUrl || '';
    return {
      success: true,
      keywordDir,
      linksPath,
      expectedSearchUrl: expected,
      initialCount,
      finalCount: trimmed.length,
      addedCount: 0,
      targetCount: targetTotal,
    };
  }
  if (initialCount === targetTotal) {
    const expected = existing[0]?.searchUrl || '';
    return {
      success: true,
      keywordDir,
      linksPath,
      expectedSearchUrl: expected,
      initialCount,
      finalCount: initialCount,
      addedCount: 0,
      targetCount: targetTotal,
    };
  }

  // 1) 记录本次采集的 expectedSearchUrl（允许多次搜索产生不同 URL）
  let expectedSearchUrl = await getCurrentUrl();
  const allowedSearchUrls = new Set<string>();
  const recordSearchUrl = (url: string) => {
    if (!url || !url.includes('/search_result')) return;
    if (!urlKeywordEquals(url, keyword)) return;
    allowedSearchUrls.add(url);
    expectedSearchUrl = url;
  };

  recordSearchUrl(expectedSearchUrl);
  if (allowedSearchUrls.size === 0) {
    await saveDebug('not_on_expected_search_result', { expectedSearchUrl, keyword });
    if (failFast) {
      return {
        success: false,
        keywordDir,
        linksPath,
        expectedSearchUrl,
        initialCount,
        finalCount: initialCount,
        addedCount: 0,
        targetCount: targetTotal,
        error: `not_on_search_result_or_keyword_mismatch: ${expectedSearchUrl}`,
      };
    }
    const retryOk = await retrySearch('init_search');
    if (!retryOk) {
      return {
        success: false,
        keywordDir,
        linksPath,
        expectedSearchUrl,
        initialCount,
        finalCount: initialCount,
        addedCount: 0,
        targetCount: targetTotal,
        error: `not_on_search_result_or_keyword_mismatch: ${expectedSearchUrl}`,
      };
    }
  }

  // 1.1) 既有数据的 searchUrl 校验：keyword 一致即可
  for (const e of existing) {
    if (allowedSearchUrls.has(e.searchUrl)) continue;
    if (!urlKeywordEquals(e.searchUrl, keyword)) {
      await saveDebug('existing_searchurl_mismatch', { expectedSearchUrl, entry: e });
      if (failFast) {
        return {
          success: false,
          keywordDir,
          linksPath,
          expectedSearchUrl,
          initialCount,
          finalCount: initialCount,
          addedCount: 0,
          targetCount: targetTotal,
          error: `existing_searchurl_mismatch: ${e.searchUrl}`,
        };
      }
      continue;
    }
    recordSearchUrl(e.searchUrl);
  }

  async function assertSearchUrlStable(tag: string): Promise<true | { url: string }> {
    const urlNow = await getCurrentUrl();
    if (!allowedSearchUrls.has(urlNow)) {
      await saveDebug(`searchurl_changed_${tag}`, { expectedSearchUrl, urlNow });
      return { url: urlNow };
    }
    return true;
  }

  async function observePageState(tag: string): Promise<{ url: string; stage: string } | null> {
    try {
      const state = await detectPageState({
        sessionId: profile,
        platform: 'xiaohongshu',
        serviceUrl,
      });
      console.log(
        `[Phase2Links][state:${tag}] success=${state.success} stage=${state.stage} url=${state.url} root=${state.rootId || 'n/a'} matches=${(state.matchIds || []).join(',')}`,
      );
      return { url: state.url, stage: state.stage };
    } catch (error: any) {
      console.warn(`[Phase2Links][state:${tag}] failed: ${error?.message || error}`);
      return null;
    }
  }

  async function retrySearch(tag: string): Promise<boolean> {
    if (recoverAttempts >= maxRecoverAttempts) return false;
    recoverAttempts += 1;

    const permit = await waitSearchPermit({
      sessionId: profile,
      keyword,
      serviceUrl,
    });
    if (!permit.success || !permit.granted) {
      await saveDebug('search_permit_failed', {
        tag,
        keyword,
        reason: permit.error || permit.reason || 'permit_denied',
      });
      return false;
    }

    const go = await goToSearch({
      sessionId: profile,
      keyword,
      env,
      serviceUrl,
    });
    if (!go.success || !go.searchPageReady) {
      await saveDebug('search_retry_failed', {
        tag,
        keyword,
        error: go.error || 'search_not_ready',
        url: go.url || '',
      });
      return false;
    }

    const urlNow = go.url || (await getCurrentUrl().catch(() => ''));
    if (urlNow) recordSearchUrl(urlNow);
    return allowedSearchUrls.has(urlNow);
  }

  async function getListRect(): Promise<Rect | null> {
    const selector = await listSelectorPromise;
    if (!selector) return null;
    const res = await controllerAction('browser:execute', {
      profile,
      script: `(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      })()`,
    });
    const payload = (res as any)?.result ?? (res as any)?.data?.result ?? res ?? null;
    if (
      !payload ||
      typeof payload.x !== 'number' ||
      typeof payload.y !== 'number' ||
      typeof payload.width !== 'number' ||
      typeof payload.height !== 'number'
    ) {
      return null;
    }
    return payload as Rect;
  }

  async function probeViewportCandidates(tag: string): Promise<{
    total: number;
    inViewport: number;
    viewport: { width: number; height: number };
    listRect: Rect | null;
  }> {
    const res = await controllerAction('browser:execute', {
      profile,
      script: `(() => {
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
        const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
        const safeTop = 180;
        const safeBottom = 140;
        const safeLeft = 24;
        const safeRight = 24;
        const cards = Array.from(document.querySelectorAll('.note-item'));
        let inViewport = 0;
        for (const card of cards) {
          const rect = card.getBoundingClientRect();
          if (!rect || rect.width <= 0 || rect.height <= 0) continue;
          const cx = rect.x + rect.width / 2;
          const cy = rect.y + rect.height / 2;
          const ok =
            cx >= safeLeft &&
            cx <= (viewportWidth - safeRight) &&
            cy >= safeTop &&
            cy <= (viewportHeight - safeBottom);
          if (ok) inViewport += 1;
        }
        return {
          total: cards.length,
          inViewport,
          viewportHeight,
          viewportWidth,
        };
      })()`,
    });
    const payload = (res as any)?.result ?? (res as any)?.data?.result ?? res ?? {};
    const listRect = await getListRect().catch((): Rect | null => null);
    const viewport = {
      width: Number(payload?.viewportWidth ?? 0),
      height: Number(payload?.viewportHeight ?? 0),
    };
    return {
      total: Number(payload?.total ?? 0),
      inViewport: Number(payload?.inViewport ?? 0),
      viewport,
      listRect,
    };
  }

  async function checkRisk(tag: string): Promise<{ ok: boolean; error?: string }> {
    const urlNow = await getCurrentUrl().catch(() => '');
    if (urlNow.includes('captcha') || urlNow.includes('verify')) {
      await saveDebug('risk_captcha_url', { tag, urlNow });
      return { ok: false, error: `captcha_url_detected: ${urlNow}` };
    }

    const res = await controllerAction('browser:execute', {
      profile,
      script: `(() => {
        const modal =
          document.querySelector('.r-captcha-modal') ||
          document.querySelector('.captcha-modal-content') ||
          document.querySelector('[class*="captcha-modal"]') ||
          document.querySelector('[class*="captcha"][class*="modal"]');
        const title =
          document.querySelector('.captcha-modal-title') ||
          document.querySelector('.captcha-modal__header .text-h6-bold') ||
          null;
        const modalText = modal ? (modal.textContent || '').trim().slice(0, 120) : '';
        const titleText = title ? (title.textContent || '').trim().slice(0, 120) : '';
        return {
          visible: Boolean(modal || title),
          modalClass: modal && modal.className ? String(modal.className) : '',
          modalText,
          titleText,
        };
      })()`,
    });
    const payload = (res as any)?.result ?? (res as any)?.data?.result ?? res ?? {};
    if (payload?.visible) {
      await saveDebug('risk_captcha_modal', {
        tag,
        urlNow,
        modalClass: payload?.modalClass ?? '',
        modalText: payload?.modalText ?? '',
        titleText: payload?.titleText ?? '',
      });
      return { ok: false, error: 'captcha_modal_detected' };
    }

    return { ok: true };
  }

  async function recoverToSearch(tag: string): Promise<boolean> {
    await observePageState(`${tag}:before`);
    const restore = await restorePhase({
      sessionId: profile,
      phase: 3,
      serviceUrl,
    });
    console.log(
      `[Phase2Links][restore:${tag}] success=${restore.success} restored=${restore.restored} stage=${restore.finalStage} url=${restore.url}`,
    );
    const after = await observePageState(`${tag}:after`);
    if (after && after.stage === 'search' && allowedSearchUrls.has(after.url)) {
      return true;
    }
    if (failFast) return false;
    return retrySearch(`recover_${tag}`);
  }

  async function ensureExitState(tag: string): Promise<{ ok: boolean; error?: string }> {
    const state = await detectPageState({
      sessionId: profile,
      platform: 'xiaohongshu',
      serviceUrl,
    }).catch((error: any): null => {
      console.warn(`[Phase2Links][state:${tag}] failed: ${error?.message || error}`);
      return null;
    });

    if (!state) {
      await saveDebug('exit_state_probe_failed', { tag, expectedSearchUrl });
      return { ok: false, error: 'exit_state_probe_failed' };
    }

    if (state.stage !== 'search' || !allowedSearchUrls.has(state.url)) {
      await saveDebug('exit_state_mismatch', {
        tag,
        expectedSearchUrl,
        stage: state.stage,
        url: state.url,
        rootId: state.rootId,
        matchIds: state.matchIds || [],
      });
      const restored = await recoverToSearch(`exit_state_mismatch_${tag}`);
      if (!restored) {
        return { ok: false, error: 'exit_state_mismatch' };
      }
    }

    return { ok: true };
  }

  async function ensureViewportCandidates(tag: string): Promise<{ ok: boolean; error?: string }> {
    const probe = await probeViewportCandidates(tag);
    if (probe.inViewport > 0) return { ok: true };

    const quickDelays = [3000, 3000];
    for (let i = 0; i < quickDelays.length; i += 1) {
      const delayMs = quickDelays[i];
      await delay(delayMs);
      const retry = await probeViewportCandidates(`${tag}_wait_${delayMs}`);
      if (retry.inViewport > 0) {
        return { ok: true };
      }
    }

    await saveDebug('viewport_empty', {
      tag,
      probe,
      expectedSearchUrl,
    });

    if (probe.listRect && typeof probe.listRect.y === 'number' && probe.viewport.height > 0) {
      const direction = probe.listRect.y < 0 ? 'up' : 'down';
      await scrollSearchList(direction, 520 + Math.floor(Math.random() * 200));
    } else {
      await scrollSearchList('down', 520 + Math.floor(Math.random() * 200));
    }
    await delay(900);

    const after = await probeViewportCandidates(`${tag}_after_scroll`);
    if (after.inViewport > 0) return { ok: true };

    const bounced = await bounceScrollOnStuck();
    if (bounced) {
      await delay(900);
      const afterBounce = await probeViewportCandidates(`${tag}_after_bounce`);
      if (afterBounce.inViewport > 0) return { ok: true };
    }

    const backoffDelays = [10000, 20000, 50000];
    for (let i = 0; i < backoffDelays.length; i += 1) {
      const delayMs = backoffDelays[i];
      await delay(delayMs);
      const retry = await probeViewportCandidates(`${tag}_backoff_${delayMs}`);
      if (retry.inViewport > 0) {
        return { ok: true };
      }
    }

    await saveDebug('viewport_empty_after_recover', {
      tag,
      initial: probe,
      after,
      expectedSearchUrl,
    });
    return { ok: false, error: 'viewport_empty' };
  }

  async function ensureSearchExitAndViewport(tag: string): Promise<{ ok: boolean; error?: string }> {
    const risk = await checkRisk(`${tag}:risk`);
    if (!risk.ok) return { ok: false, error: risk.error || 'risk_detected' };

    const exitState = await ensureExitState(`${tag}:exit`);
    if (!exitState.ok) return exitState;

    const viewport = await ensureViewportCandidates(`${tag}:viewport`);
    if (!viewport.ok) return viewport;

    return { ok: true };
  }

  async function scrollSearchList(direction: 'down' | 'up', amount: number): Promise<boolean> {
    // 鉁?绯荤粺绾ф粴鍔細浼樺厛璧板鍣?scroll operation锛涘け璐?fallback PageDown/PageUp
    try {
      const op = await controllerAction('container:operation', {
        containerId: listContainerId,
        operationId: 'scroll',
        sessionId: profile,
        config: { direction, amount: Math.min(800, Math.max(120, Math.floor(amount))) },
      });
      const payload = (op as any)?.data ?? op;
      const ok = Boolean(payload?.success ?? (payload as any)?.data?.success ?? (op as any)?.success);
      await delay(1100);
      return ok;
    } catch {
      try {
        await controllerAction('keyboard:press', { profileId: profile, key: direction === 'up' ? 'PageUp' : 'PageDown' });
        await delay(1300);
        return true;
      } catch {
        return false;
      }
    }
  }

  async function bounceScrollOnStuck(): Promise<boolean> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const upCount = 3 + Math.floor(Math.random() * 4);
      for (let i = 0; i < upCount; i += 1) {
        const upOk = await scrollSearchList('up', 520 + Math.floor(Math.random() * 180));
        if (!upOk) break;
        await delay(500 + Math.floor(Math.random() * 300));
      }

      for (let i = 0; i < 3; i += 1) {
        const downOk = await scrollSearchList('down', 520 + Math.floor(Math.random() * 200));
        if (!downOk) break;
        await delay(600 + Math.floor(Math.random() * 350));
      }

      const retry = await scrollSearchList('down', 800);
      if (retry) {
        console.log(`[Phase2Links] bounce scroll succeeded on attempt ${attempt}`);
        return true;
      }
      console.warn(`[Phase2Links] bounce scroll attempt ${attempt} failed`);
    }
    return false;
  }

  // 2) 閫愬睆閲囬泦锛氭瘡灞忓彧澶勭悊褰撳墠瑙嗗彛鍐呯殑鍗＄墖锛屽鐞嗗畬鍐嶆粴鍔ㄤ笅涓€灞?
  let scrollSteps = 0;
  let added = 0;

  while (byNoteId.size < targetTotal && scrollSteps < maxScrollRounds) {
    const stable = await assertSearchUrlStable('before_collect_list');
    if (stable !== true) {
      const restored = await recoverToSearch('searchurl_changed_before_collect');
      if (!restored) {
        return {
          success: false,
          keywordDir,
          linksPath,
          expectedSearchUrl,
          initialCount,
          finalCount: byNoteId.size,
          addedCount: added,
          targetCount: targetTotal,
          error: `searchurl_changed: ${stable.url}`,
        };
      }
      continue;
    }

    const ready = await ensureSearchExitAndViewport('before_collect_list');
    if (!ready.ok) {
      return {
        success: false,
        keywordDir,
        linksPath,
        expectedSearchUrl,
        initialCount,
        finalCount: byNoteId.size,
        addedCount: added,
        targetCount: targetTotal,
        error: ready.error || 'search_exit_state_or_viewport_failed',
      };
    }

    const remaining = Math.max(0, targetTotal - byNoteId.size);
    const list = await collectSearchList({
      sessionId,
      targetCount: Math.min(remaining, 30),
      maxScrollRounds: 1,
      serviceUrl,
    });

    const stable2 = await assertSearchUrlStable('after_collect_list');
    if (stable2 !== true) {
      const restored = await recoverToSearch('searchurl_changed_after_collect_list');
      if (!restored) {
        return {
          success: false,
          keywordDir,
          linksPath,
          expectedSearchUrl,
          initialCount,
          finalCount: byNoteId.size,
          addedCount: added,
          targetCount: targetTotal,
          error: `searchurl_changed_after_collect_list: ${stable2.url}`,
        };
      }
      continue;
    }

    if (!list.success || !Array.isArray(list.items) || list.items.length === 0) {
      await saveDebug('collect_search_list_failed', { success: Boolean(list.success), error: list.error || null });

      const readyRetry = await ensureSearchExitAndViewport('collect_list_empty_retry');
      if (readyRetry.ok) {
        const retry = await collectSearchList({
          sessionId,
          targetCount: Math.min(remaining, 30),
          maxScrollRounds: 1,
          serviceUrl,
        });
        if (retry.success && Array.isArray(retry.items) && retry.items.length > 0) {
          console.log('[Phase2Links] collect list retry succeeded after viewport recovery');
          list.items = retry.items;
        } else {
          await saveDebug('collect_search_list_retry_failed', { success: Boolean(retry.success), error: retry.error || null });
          return {
            success: false,
            keywordDir,
            linksPath,
            expectedSearchUrl,
            initialCount,
            finalCount: byNoteId.size,
            addedCount: added,
            targetCount: targetTotal,
            error: retry.error || 'CollectSearchListBlock returned no items (retry)',
          };
        }
      } else {
        return {
          success: false,
          keywordDir,
          linksPath,
          expectedSearchUrl,
          initialCount,
          finalCount: byNoteId.size,
          addedCount: added,
          targetCount: targetTotal,
          error: readyRetry.error || 'CollectSearchListBlock returned no items',
        };
      }
    }

    const candidates = shuffleItems(list.items);
    console.log(`[Phase2Links] viewport candidates=${candidates.length} remaining=${remaining}`);
    for (const item of candidates) {
      if (byNoteId.size >= targetTotal) break;

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

      if (noteId && byNoteId.has(noteId)) continue;

      const stable3 = await assertSearchUrlStable('before_open_detail');
      if (stable3 !== true) {
        const restored = await recoverToSearch('searchurl_changed_before_open_detail');
        if (!restored) {
          return {
            success: false,
            keywordDir,
            linksPath,
            expectedSearchUrl,
            initialCount,
            finalCount: byNoteId.size,
            addedCount: added,
            targetCount: targetTotal,
            error: `searchurl_changed_before_open_detail: ${stable3.url}`,
          };
        }
        continue;
      }

      const riskBeforeOpen = await checkRisk('before_open_detail');
      if (!riskBeforeOpen.ok) {
        return {
          success: false,
          keywordDir,
          linksPath,
          expectedSearchUrl,
          initialCount,
          finalCount: byNoteId.size,
          addedCount: added,
          targetCount: targetTotal,
          error: riskBeforeOpen.error || 'risk_detected_before_open_detail',
        };
      }

      console.log(
        `[Phase2Links] click candidate noteId=${noteId || 'unknown'} domIndex=${domIndex ?? 'n/a'} rect=${clickRect ? JSON.stringify(clickRect) : 'n/a'}`,
      );

      const opened = await openDetail({
        sessionId,
        containerId: item.containerId || 'xiaohongshu_search.search_result_item',
        domIndex,
        clickRect,
        expectedNoteId: item.noteId,
        expectedHref: item.hrefAttr,
        debugDir,
        serviceUrl,
      });

      if (!opened.success || !opened.safeDetailUrl || !opened.noteId) {
        await saveDebug('open_detail_failed', { domIndex, expectedNoteId: item.noteId, error: opened.error || null });
        const restored = await recoverToSearch('open_detail_failed');
        if (!restored) {
          return {
            success: false,
            keywordDir,
            linksPath,
            expectedSearchUrl,
            initialCount,
            finalCount: byNoteId.size,
            addedCount: added,
            targetCount: targetTotal,
            error: `open_detail_failed: ${opened.error || 'unknown'}`,
          };
        }
        const afterRecover = await ensureSearchExitAndViewport('after_open_detail_failed');
        if (!afterRecover.ok) {
          return {
            success: false,
            keywordDir,
            linksPath,
            expectedSearchUrl,
            initialCount,
            finalCount: byNoteId.size,
            addedCount: added,
            targetCount: targetTotal,
            error: afterRecover.error || 'search_exit_state_failed_after_open_detail',
          };
        }
        await delay(900);
        continue;
      }

      if (byNoteId.has(opened.noteId)) {
        const closedDup = await closeDetail({ sessionId, serviceUrl });
        if (!closedDup.success) {
          await saveDebug('close_detail_failed_after_duplicate', { noteId: opened.noteId, error: closedDup.error || null });
          const restored = await recoverToSearch('close_detail_failed_after_duplicate');
          if (!restored) {
            return {
              success: false,
              keywordDir,
              linksPath,
              expectedSearchUrl,
              initialCount,
              finalCount: byNoteId.size,
              addedCount: added,
              targetCount: targetTotal,
              error: `close_detail_failed: ${closedDup.error || 'unknown'}`,
            };
          }
          const afterRecover = await ensureSearchExitAndViewport('after_close_detail_failed_duplicate');
          if (!afterRecover.ok) {
            return {
              success: false,
              keywordDir,
              linksPath,
              expectedSearchUrl,
              initialCount,
              finalCount: byNoteId.size,
              addedCount: added,
              targetCount: targetTotal,
              error: afterRecover.error || 'search_exit_state_failed_after_close_detail_duplicate',
            };
          }
          await delay(900);
          continue;
        }
        await delay(700);
        continue;
      }

      if (!isValidSafeUrl(opened.safeDetailUrl) || !isValidSearchUrl(expectedSearchUrl, keyword)) {
        await saveDebug('invalid_link', {
          noteId: opened.noteId,
          safeUrl: opened.safeDetailUrl,
          searchUrl: expectedSearchUrl,
        });
        const closedInvalid = await closeDetail({ sessionId, serviceUrl });
        if (!closedInvalid.success) {
          await saveDebug('close_detail_failed_after_invalid', { noteId: opened.noteId, error: closedInvalid.error || null });
          const restored = await recoverToSearch('close_detail_failed_after_invalid');
          if (!restored) {
            return {
              success: false,
              keywordDir,
              linksPath,
              expectedSearchUrl,
              initialCount,
              finalCount: byNoteId.size,
              addedCount: added,
              targetCount: targetTotal,
              error: `close_detail_failed: ${closedInvalid.error || 'unknown'}`,
            };
          }
          const afterRecover = await ensureSearchExitAndViewport('after_close_detail_failed_invalid');
          if (!afterRecover.ok) {
            return {
              success: false,
              keywordDir,
              linksPath,
              expectedSearchUrl,
              initialCount,
              finalCount: byNoteId.size,
              addedCount: added,
              targetCount: targetTotal,
              error: afterRecover.error || 'search_exit_state_failed_after_close_detail_invalid',
            };
          }
          await delay(900);
          continue;
        }
        await delay(700);
        continue;
      }

      const entry: Phase2LinkEntry = {
        noteId: opened.noteId,
        safeUrl: opened.safeDetailUrl,
        searchUrl: expectedSearchUrl,
        ts: new Date().toISOString(),
      };

      // 杩藉姞鍐欑洏锛堟瘡鏉℃垚鍔熼兘钀界洏锛屼究浜庝腑閫斿穿婧冨悗澧為噺缁х画锛?
      await appendJsonl(linksPath, entry);
      byNoteId.set(entry.noteId, entry);
      added += 1;
      console.log(`[Phase2Links] collected ${byNoteId.size}/${targetTotal}: noteId=${entry.noteId}`);

      const closed = await closeDetail({ sessionId, serviceUrl });
      if (!closed.success) {
        await saveDebug('close_detail_failed', { noteId: entry.noteId, error: closed.error || null });
        const restored = await recoverToSearch('close_detail_failed');
        if (!restored) {
          return {
            success: false,
            keywordDir,
            linksPath,
            expectedSearchUrl,
            initialCount,
            finalCount: byNoteId.size,
            addedCount: added,
            targetCount: targetTotal,
            error: `close_detail_failed: ${closed.error || 'unknown'}`,
          };
        }
        const afterRecover = await ensureSearchExitAndViewport('after_close_detail_failed');
        if (!afterRecover.ok) {
          return {
            success: false,
            keywordDir,
            linksPath,
            expectedSearchUrl,
            initialCount,
            finalCount: byNoteId.size,
            addedCount: added,
            targetCount: targetTotal,
            error: afterRecover.error || 'search_exit_state_failed_after_close_detail',
          };
        }
        await delay(900);
        continue;
      }
      await delay(850);

      const exitReady = await ensureSearchExitAndViewport('after_close_detail');
      if (!exitReady.ok) {
        return {
          success: false,
          keywordDir,
          linksPath,
          expectedSearchUrl,
          initialCount,
          finalCount: byNoteId.size,
          addedCount: added,
          targetCount: targetTotal,
          error: exitReady.error || 'search_exit_state_failed_after_close_detail',
        };
      }

      const stable4 = await assertSearchUrlStable('after_close_detail');
      if (stable4 !== true) {
        const restored = await recoverToSearch('searchurl_changed_after_close_detail');
        if (!restored) {
          return {
            success: false,
            keywordDir,
            linksPath,
            expectedSearchUrl,
            initialCount,
            finalCount: byNoteId.size,
            addedCount: added,
            targetCount: targetTotal,
            error: `searchurl_changed_after_close_detail: ${stable4.url}`,
          };
        }
        continue;
      }
    }

    if (byNoteId.size >= targetTotal) break;

    // 涓嬩竴灞?    scrollSteps += 1;
    const moved = await scrollSearchList('down', 800);
    if (!moved) {
      const bounced = await bounceScrollOnStuck();
      if (!bounced) {
        await saveDebug('scroll_failed', { scrollSteps, collected: byNoteId.size, reason: 'bounce_exhausted' });
        break;
      }
    }
    await delay(800);
  }

  const finalCount = byNoteId.size;
  if (finalCount !== targetTotal) {
    await saveDebug('target_not_reached', { finalCount, targetCount: targetTotal, expectedSearchUrl });
    return {
      success: false,
      keywordDir,
      linksPath,
      expectedSearchUrl,
      initialCount,
      finalCount,
      addedCount: added,
      targetCount: targetTotal,
      error: `target_not_reached: ${finalCount}/${targetTotal}`,
    };
  }

  return {
    success: true,
    keywordDir,
    linksPath,
    expectedSearchUrl,
    initialCount,
    finalCount,
    addedCount: added,
    targetCount: targetTotal,
  };
}
