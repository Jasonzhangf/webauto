/**
 * Workflow Block: XiaohongshuCollectLinksBlock
 *
 * Phase2：在搜索结果页通过“点击进入详情 → 读取真实 URL(xsec_token) → ESC 返回”的方式采集安全链接，
 * 并写入：~/.webauto/download/xiaohongshu/{env}/{keyword}/phase2-links.jsonl
 *
 * 约束：
 * - 严禁构造 URL；必须点击进入详情获取真实链接
 * - searchUrl 必须严格等于同一个字符串（用于发现误点“相关搜索/大家都在搜”）
 * - 开发阶段：任何异常（误点/验证码/退出失败）直接 fail-fast，保留证据
 */

import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { urlKeywordEquals } from './helpers/searchPageState.js';
import { execute as collectSearchList } from './CollectSearchListBlock.js';
import { execute as openDetail } from './OpenDetailBlock.js';
import { execute as closeDetail } from './CloseDetailBlock.js';

export interface XiaohongshuCollectLinksInput {
  sessionId: string;
  keyword: string;
  env?: string;
  targetCount: number;
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

  // 0) 读取已有链接（增量采集）
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
  if (initialCount > targetCount) {
    const trimmed = existing.slice(0, targetCount);
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
      targetCount,
    };
  }
  if (initialCount === targetCount) {
    const expected = existing[0]?.searchUrl || '';
    return {
      success: true,
      keywordDir,
      linksPath,
      expectedSearchUrl: expected,
      initialCount,
      finalCount: initialCount,
      addedCount: 0,
      targetCount,
    };
  }

  // 1) 记录本次采集的 expectedSearchUrl（严格等于）
  const expectedSearchUrl = await getCurrentUrl();
  if (!expectedSearchUrl.includes('/search_result') || !urlKeywordEquals(expectedSearchUrl, keyword)) {
    await saveDebug('not_on_expected_search_result', { expectedSearchUrl, keyword });
    return {
      success: false,
      keywordDir,
      linksPath,
      expectedSearchUrl,
      initialCount,
      finalCount: initialCount,
      addedCount: 0,
      targetCount,
      error: `not_on_search_result_or_keyword_mismatch: ${expectedSearchUrl}`,
    };
  }

  // 1.1) 既有数据的 searchUrl 必须严格一致
  for (const e of existing) {
    if (e.searchUrl !== expectedSearchUrl) {
      await saveDebug('existing_searchurl_mismatch', { expectedSearchUrl, entry: e });
      return {
        success: false,
        keywordDir,
        linksPath,
        expectedSearchUrl,
        initialCount,
        finalCount: initialCount,
        addedCount: 0,
        targetCount,
        error: `existing_searchurl_mismatch: ${e.searchUrl}`,
      };
    }
  }

  async function assertSearchUrlStable(tag: string): Promise<true | { url: string }> {
    const urlNow = await getCurrentUrl();
    if (urlNow !== expectedSearchUrl) {
      await saveDebug(`searchurl_changed_${tag}`, { expectedSearchUrl, urlNow });
      return { url: urlNow };
    }
    return true;
  }

  async function scrollSearchList(direction: 'down' | 'up', amount: number): Promise<boolean> {
    // ✅ 系统级滚动：优先走容器 scroll operation；失败 fallback PageDown/PageUp
    try {
      const op = await controllerAction('container:operation', {
        containerId: 'xiaohongshu_search.search_result_list',
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

  // 2) 逐屏采集：每屏只处理当前视口内的卡片，处理完再滚动下一屏
  let scrollSteps = 0;
  let added = 0;

  while (byNoteId.size < targetCount && scrollSteps < maxScrollRounds) {
    const stable = await assertSearchUrlStable('before_collect_list');
    if (stable !== true) {
      return {
        success: false,
        keywordDir,
        linksPath,
        expectedSearchUrl,
        initialCount,
        finalCount: byNoteId.size,
        addedCount: added,
        targetCount,
        error: `searchurl_changed: ${stable.url}`,
      };
    }

    const remaining = Math.max(0, targetCount - byNoteId.size);
    const list = await collectSearchList({
      sessionId,
      targetCount: Math.min(remaining, 30),
      maxScrollRounds: 1,
      serviceUrl,
    });

    const stable2 = await assertSearchUrlStable('after_collect_list');
    if (stable2 !== true) {
      return {
        success: false,
        keywordDir,
        linksPath,
        expectedSearchUrl,
        initialCount,
        finalCount: byNoteId.size,
        addedCount: added,
        targetCount,
        error: `searchurl_changed_after_collect_list: ${stable2.url}`,
      };
    }

    if (!list.success || !Array.isArray(list.items) || list.items.length === 0) {
      await saveDebug('collect_search_list_failed', { success: Boolean(list.success), error: list.error || null });
      return {
        success: false,
        keywordDir,
        linksPath,
        expectedSearchUrl,
        initialCount,
        finalCount: byNoteId.size,
        addedCount: added,
        targetCount,
        error: list.error || 'CollectSearchListBlock returned no items',
      };
    }

    // 倒序处理：更可能在视口内（避免第二排/边缘误点）
    for (const item of list.items.slice().reverse()) {
      if (byNoteId.size >= targetCount) break;

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
        return {
          success: false,
          keywordDir,
          linksPath,
          expectedSearchUrl,
          initialCount,
          finalCount: byNoteId.size,
          addedCount: added,
          targetCount,
          error: `searchurl_changed_before_open_detail: ${stable3.url}`,
        };
      }

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
        return {
          success: false,
          keywordDir,
          linksPath,
          expectedSearchUrl,
          initialCount,
          finalCount: byNoteId.size,
          addedCount: added,
          targetCount,
          error: `open_detail_failed: ${opened.error || 'unknown'}`,
        };
      }

      if (byNoteId.has(opened.noteId)) {
        const closedDup = await closeDetail({ sessionId, serviceUrl });
        if (!closedDup.success) {
          await saveDebug('close_detail_failed_after_duplicate', { noteId: opened.noteId, error: closedDup.error || null });
          return {
            success: false,
            keywordDir,
            linksPath,
            expectedSearchUrl,
            initialCount,
            finalCount: byNoteId.size,
            addedCount: added,
            targetCount,
            error: `close_detail_failed: ${closedDup.error || 'unknown'}`,
          };
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
          return {
            success: false,
            keywordDir,
            linksPath,
            expectedSearchUrl,
            initialCount,
            finalCount: byNoteId.size,
            addedCount: added,
            targetCount,
            error: `close_detail_failed: ${closedInvalid.error || 'unknown'}`,
          };
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

      // 追加写盘（每条成功都落盘，便于中途崩溃后增量继续）
      await appendJsonl(linksPath, entry);
      byNoteId.set(entry.noteId, entry);
      added += 1;
      console.log(`[Phase2Links] collected ${byNoteId.size}/${targetCount}: noteId=${entry.noteId}`);

      const closed = await closeDetail({ sessionId, serviceUrl });
      if (!closed.success) {
        await saveDebug('close_detail_failed', { noteId: entry.noteId, error: closed.error || null });
        return {
          success: false,
          keywordDir,
          linksPath,
          expectedSearchUrl,
          initialCount,
          finalCount: byNoteId.size,
          addedCount: added,
          targetCount,
          error: `close_detail_failed: ${closed.error || 'unknown'}`,
        };
      }
      await delay(850);

      const stable4 = await assertSearchUrlStable('after_close_detail');
      if (stable4 !== true) {
        return {
          success: false,
          keywordDir,
          linksPath,
          expectedSearchUrl,
          initialCount,
          finalCount: byNoteId.size,
          addedCount: added,
          targetCount,
          error: `searchurl_changed_after_close_detail: ${stable4.url}`,
        };
      }
    }

    if (byNoteId.size >= targetCount) break;

    // 下一屏
    scrollSteps += 1;
    const moved = await scrollSearchList('down', 800);
    if (!moved) {
      await saveDebug('scroll_failed', { scrollSteps, collected: byNoteId.size });
      break;
    }
    await delay(800);
  }

  const finalCount = byNoteId.size;
  if (finalCount !== targetCount) {
    await saveDebug('target_not_reached', { finalCount, targetCount, expectedSearchUrl });
    return {
      success: false,
      keywordDir,
      linksPath,
      expectedSearchUrl,
      initialCount,
      finalCount,
      addedCount: added,
      targetCount,
      error: `target_not_reached: ${finalCount}/${targetCount}`,
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
    targetCount,
  };
}
