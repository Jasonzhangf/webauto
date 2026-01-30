/**
 * Phase 3 Block: comment interaction (like or dry-run).
 */

import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import { systemHoverAt } from '../../../../workflow/blocks/helpers/systemInput.js';
import { controllerAction, delay } from '../utils/controllerAction.js';

export interface InteractInput {
  sessionId: string;
  noteId: string;
  safeUrl: string;
  keyword?: string;
  env?: string;
  likeKeywords: string[];
  maxLikesPerRound?: number;
  unifiedApiUrl?: string;
  dryRun?: boolean;
  dryRunDir?: string;
}

export interface InteractOutput {
  success: boolean;
  noteId: string;
  likedCount: number;
  likedComments: Array<{
    commentId: string;
    userId: string;
    userName: string;
    content: string;
    timestamp: string;
    dryRun?: boolean;
  }>;
  reachedBottom: boolean;
  dryRun?: boolean;
  dryRunDir?: string;
  error?: string;
}

export interface CommentMatchResult {
  commentId: string;
  userId: string;
  userName: string;
  content: string;
  timestamp: string;
  isLiked: boolean;
  anchor?: any;
  domRect?: { x: number; y: number; width: number; height: number };
  domIndex?: number;
  domSelector?: string;
  source?: 'container' | 'dom';
}

function resolveDownloadRoot(): string {
  const custom = process.env.WEBAUTO_DOWNLOAD_ROOT || process.env.WEBAUTO_DOWNLOAD_DIR;
  if (custom && custom.trim()) return custom;
  const home = process.env.HOME || process.env.USERPROFILE;
  if (home && home.trim()) return path.join(home, '.webauto', 'download');
  return path.join(os.homedir(), '.webauto', 'download');
}

function sanitizeName(value: string): string {
  return String(value || '')
    .trim()
    .replace(/[\\/:"*?<>|]+/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 120);
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

function extractScreenshotBase64(raw: any): string | undefined {
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

function resolveFocusPoint(rect?: { x: number; y: number; width: number; height: number }): { x: number; y: number } | null {
  if (!rect) return null;
  const width = Number(rect.width);
  const height = Number(rect.height);
  const x = Number(rect.x);
  const y = Number(rect.y);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x: x + width / 2, y: y + height / 2 };
}

async function highlightDomRect(
  sessionId: string,
  rect: { x: number; y: number; width: number; height: number },
  unifiedApiUrl: string,
  durationMs = 2000,
): Promise<void> {
  const script = `((r) => {
    if (!r || !Number.isFinite(r.x) || !Number.isFinite(r.y)) return false;
    let overlay = document.getElementById('webauto-dryrun-highlight');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'webauto-dryrun-highlight';
      overlay.style.position = 'fixed';
      overlay.style.pointerEvents = 'none';
      overlay.style.zIndex = '2147483647';
      overlay.style.boxSizing = 'border-box';
      overlay.style.borderRadius = '6px';
      document.body.appendChild(overlay);
    }
    overlay.style.left = r.x + 'px';
    overlay.style.top = r.y + 'px';
    overlay.style.width = r.width + 'px';
    overlay.style.height = r.height + 'px';
    overlay.style.border = '3px solid #ff4d4f';
    overlay.style.background = 'rgba(255, 77, 79, 0.08)';
    setTimeout(() => {
      try { overlay && overlay.parentElement && overlay.parentElement.removeChild(overlay); } catch {}
    }, ${durationMs});
    return true;
  })(${JSON.stringify(rect)})`;
  await controllerAction(
    'browser:execute',
    { profile: sessionId, script },
    unifiedApiUrl,
  ).catch(() => {});
}

async function saveDryRunRecord(options: {
  sessionId: string;
  unifiedApiUrl: string;
  outputDir: string;
  record: Record<string, any>;
  screenshotName: string;
}): Promise<{ screenshotPath?: string }> {
  const { sessionId, unifiedApiUrl, outputDir, record, screenshotName } = options;
  await ensureDir(outputDir);
  const shot = await controllerAction(
    'browser:screenshot',
    { profileId: sessionId, fullPage: false },
    unifiedApiUrl,
  ).catch((): any => null);
  const b64 = extractScreenshotBase64(shot);
  let screenshotPath: string | undefined;
  if (b64) {
    screenshotPath = path.join(outputDir, `${sanitizeName(screenshotName)}.png`);
    await fs.writeFile(screenshotPath, Buffer.from(b64, 'base64'));
  }
  const recordPath = path.join(outputDir, 'dryrun-records.jsonl');
  const line = JSON.stringify({ ts: new Date().toISOString(), screenshotPath, ...record });
  await fs.appendFile(recordPath, `${line}\n`, 'utf-8');
  return { screenshotPath };
}

export async function execute(input: InteractInput): Promise<InteractOutput> {
  const {
    sessionId,
    noteId,
    safeUrl,
    keyword = '',
    env = 'prod',
    likeKeywords,
    maxLikesPerRound = 2,
    unifiedApiUrl = 'http://127.0.0.1:7701',
    dryRun = false,
    dryRunDir,
  } = input;

  const resolvedDryRunDir = dryRun
    ? (dryRunDir || path.join(resolveDownloadRoot(), 'xiaohongshu', env, keyword || 'unknown', '_debug', 'phase3_dryrun'))
    : undefined;
  const browserServiceUrl = process.env.WEBAUTO_BROWSER_SERVICE_URL || 'http://127.0.0.1:7704';

  console.log(`[Phase3Interact] start note ${noteId}`);
  if (dryRun) {
    console.log(`[Phase3Interact] dry-run enabled (no clicks). records: ${resolvedDryRunDir}`);
  }

  const likedComments: InteractOutput['likedComments'] = [];
  let likedCount = 0;
  let reachedBottom = false;
  let scrollCount = 0;
  const maxScrolls = 60;
  let noMatchLogged = false;

  // 1) Navigate to detail (must be safeUrl with xsec_token)
  const navRes = await controllerAction(
    'browser:goto',
    { profile: sessionId, url: safeUrl },
    unifiedApiUrl,
  );
  if (navRes?.success === false) {
    return {
      success: false,
      noteId,
      likedCount: 0,
      likedComments: [],
      reachedBottom: false,
      error: navRes?.error || 'navigate failed',
    };
  }
  await delay(2000);

  // 2) Ensure comment panel opened
  await ensureCommentsOpened(sessionId, unifiedApiUrl);

  // 3) Scroll comments + match + like/dry-run
  while (likedCount < maxLikesPerRound && !reachedBottom && scrollCount < maxScrolls) {
    scrollCount += 1;

    let matches = await getKeywordCommentMatches(sessionId, likeKeywords, unifiedApiUrl);
    if (dryRun && matches.length === 0) {
      const domMatches = await getKeywordCommentMatchesByDom(sessionId, likeKeywords, unifiedApiUrl);
      if (domMatches.length > 0) {
        matches = domMatches;
      }
    }
    if (dryRun && matches.length === 0 && !noMatchLogged) {
      noMatchLogged = true;
      const sectionRes = await controllerAction(
        'containers:match',
        {
          containerId: 'xiaohongshu_detail.comment_section',
          sessionId,
          options: { viewportOnly: true },
        },
        unifiedApiUrl,
      ).catch((): any => null);
      const anchor = Array.isArray(sectionRes?.matches) ? sectionRes.matches[0]?.anchor : null;
      let focusPoint: { x: number; y: number } | null = null;
      if (anchor) {
        await controllerAction(
          'container:operation',
          {
            containerId: 'xiaohongshu_detail.comment_section',
            operationId: 'highlight',
            sessionId,
            config: { anchor },
          },
          unifiedApiUrl,
        );
        if (anchor?.rect) {
          await highlightDomRect(sessionId, anchor.rect, unifiedApiUrl, 2000);
        }
        focusPoint = resolveFocusPoint(anchor?.rect);
        if (focusPoint) {
          await systemHoverAt(sessionId, focusPoint.x, focusPoint.y, browserServiceUrl).catch(() => {});
        }
      }
      if (resolvedDryRunDir) {
        await saveDryRunRecord({
          sessionId,
          unifiedApiUrl,
          outputDir: resolvedDryRunDir,
          record: {
            mode: 'dry-run',
            noteId,
            safeUrl,
            matchedKeywords: [],
            containerId: 'xiaohongshu_detail.comment_section',
            anchor,
            focusPoint,
            reason: anchor ? 'no_keyword_match' : 'comment_section_not_found',
          },
          screenshotName: `${Date.now()}_${noteId}_no_keyword_match`,
        });
      }
    }
    for (const c of matches) {
      if (likedCount >= maxLikesPerRound) break;
      if (c.isLiked) continue;

      // Highlight for visual confirmation
      let focusPoint = resolveFocusPoint(c.anchor?.rect || c.domRect);
      if (c.anchor) {
        await controllerAction(
          'container:operation',
          {
            containerId: 'xiaohongshu_detail.comment_section.comment_item',
            operationId: 'highlight',
            sessionId,
            config: { anchor: c.anchor },
          },
          unifiedApiUrl,
        );
        if (c.anchor?.rect) {
          await highlightDomRect(sessionId, c.anchor.rect, unifiedApiUrl, 2000);
        }
      } else if (c.domRect) {
        await highlightDomRect(sessionId, c.domRect, unifiedApiUrl, 2000);
      }
      if (focusPoint) {
        await systemHoverAt(sessionId, focusPoint.x, focusPoint.y, browserServiceUrl).catch(() => {});
      }
      await delay(400);

      const matchedKeywords = likeKeywords.filter((k) => k && c.content.includes(k));
      if (dryRun) {
        const record = {
          mode: 'dry-run',
          noteId,
          safeUrl,
          commentId: c.commentId,
          userId: c.userId,
          userName: c.userName,
          content: c.content,
          timestamp: c.timestamp,
          matchedKeywords,
          containerId: 'xiaohongshu_detail.comment_section.comment_item',
          anchor: c.anchor || null,
          domRect: c.domRect || null,
          domIndex: Number.isFinite(c.domIndex as number) ? c.domIndex : null,
          domSelector: c.domSelector || null,
          source: c.source || (c.anchor ? 'container' : 'dom'),
          focusPoint,
          simulateClick: focusPoint ? 'mouse:move' : null,
          reason: 'keyword_match',
        };
        if (resolvedDryRunDir) {
          await saveDryRunRecord({
            sessionId,
            unifiedApiUrl,
            outputDir: resolvedDryRunDir,
            record,
            screenshotName: `${Date.now()}_${noteId}_${c.commentId || 'comment'}`,
          });
        }
        likedCount += 1;
        likedComments.push({
          commentId: c.commentId,
          userId: String(c.userId || ''),
          userName: String(c.userName || ''),
          content: String(c.content || ''),
          timestamp: String(c.timestamp || ''),
          dryRun: true,
        });
        await delay(400);
        continue;
      }

      // Like (container click internal target)
      const clickRes = await controllerAction(
        'container:operation',
        {
          containerId: 'xiaohongshu_detail.comment_section.comment_item',
          operationId: 'click',
          sessionId,
          config: { anchor: c.anchor },
        },
        unifiedApiUrl,
      );
      if (!clickRes?.success) {
        continue;
      }

      await delay(500);

      // Verify like state
      const after = await extractComment(sessionId, c.anchor, unifiedApiUrl);
      const likeStatus = String(after?.data?.like_status || '');
      const nowLiked = likeStatus.includes('like-active');
      if (!nowLiked) {
        // UI not updated yet; skip count
        continue;
      }

      likedCount += 1;
      likedComments.push({
        commentId: c.commentId,
        userId: String(after?.data?.user_id || c.userId || ''),
        userName: String(after?.data?.user_name || c.userName || ''),
        content: String(after?.data?.text || c.content || ''),
        timestamp: String(after?.data?.timestamp || c.timestamp || ''),
      });

      await delay(800);
    }

    reachedBottom = await isCommentEnd(sessionId, unifiedApiUrl);
    if (reachedBottom) break;

    await controllerAction(
      'browser:keyboard:press',
      { profile: sessionId, key: 'PageDown' },
      unifiedApiUrl,
    );
    await delay(900);
  }

  return {
    success: true,
    noteId,
    likedCount,
    likedComments,
    reachedBottom,
    dryRun,
    dryRunDir: resolvedDryRunDir,
  };
}

async function ensureCommentsOpened(sessionId: string, apiUrl: string): Promise<void> {
  const btn = await controllerAction(
    'containers:match',
    { containerId: 'xiaohongshu_detail.comment_button', sessionId },
    apiUrl,
  );
  if (btn?.success && Array.isArray(btn?.matches) && btn.matches.length > 0) {
    await controllerAction(
      'container:operation',
      { containerId: 'xiaohongshu_detail.comment_button', operationId: 'click', sessionId },
      apiUrl,
    );
    await delay(1200);
  }
}

async function isCommentEnd(sessionId: string, apiUrl: string): Promise<boolean> {
  const end = await controllerAction(
    'containers:match',
    { containerId: 'xiaohongshu_detail.comment_section.end_marker', sessionId },
    apiUrl,
  );
  if (end?.success && Array.isArray(end?.matches) && end.matches.length > 0) return true;
  return false;
}

async function getKeywordCommentMatches(
  sessionId: string,
  keywords: string[],
  apiUrl: string,
): Promise<CommentMatchResult[]> {
  const res = await controllerAction(
    'containers:match',
    {
      containerId: 'xiaohongshu_detail.comment_section.comment_item',
      sessionId,
      options: { viewportOnly: true },
    },
    apiUrl,
  );
  const matches = Array.isArray(res?.matches) ? res.matches : [];
  if (!res?.success || matches.length === 0) return [];

  const out: CommentMatchResult[] = [];
  for (const m of matches) {
    const dataRes = await extractComment(sessionId, m.anchor, apiUrl);
    if (!dataRes?.success) continue;
    const text = String(dataRes?.data?.text || '');
    if (!text) continue;
    if (!keywords.some((k) => k && text.includes(k))) continue;

    const likeStatus = String(dataRes?.data?.like_status || '');
    out.push({
      commentId: String(m.matchId || ''),
      userId: String(dataRes?.data?.user_id || ''),
      userName: String(dataRes?.data?.user_name || ''),
      content: text,
      timestamp: String(dataRes?.data?.timestamp || ''),
      isLiked: likeStatus.includes('like-active'),
      anchor: m.anchor,
      source: 'container',
    });
  }
  return out;
}

async function getKeywordCommentMatchesByDom(
  sessionId: string,
  keywords: string[],
  apiUrl: string,
): Promise<CommentMatchResult[]> {
  const script = `(() => {
    const nodes = Array.from(document.querySelectorAll('.comment-item, [class*=\"comment-item\"], .Comment_item'));
    const viewportH = window.innerHeight || 0;
    const viewportW = window.innerWidth || 0;
    return nodes.slice(0, 60).map((el, idx) => {
      const textEl = el.querySelector('.content, .comment-content, p');
      const nameEl = el.querySelector('.name, .username, .user-name');
      const timeEl = el.querySelector('.date, .time, [class*=\"time\"]');
      const text = (textEl ? textEl.textContent : el.textContent) || '';
      const rect = el.getBoundingClientRect();
      const visible =
        rect.width > 0 &&
        rect.height > 0 &&
        rect.bottom > 0 &&
        rect.top < viewportH &&
        rect.right > 0 &&
        rect.left < viewportW;
      return {
        index: idx,
        text: text.trim(),
        userName: (nameEl ? nameEl.textContent : '').trim(),
        timestamp: (timeEl ? timeEl.textContent : '').trim(),
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        visible,
      };
    });
  })()`;
  const res = await controllerAction(
    'browser:execute',
    { profile: sessionId, script },
    apiUrl,
  );
  const rows = Array.isArray(res?.result ?? res?.data?.result ?? res?.data)
    ? (res?.result ?? res?.data?.result ?? res?.data)
    : [];
  if (!rows.length) return [];

  const out: CommentMatchResult[] = [];
  for (const row of rows) {
    const text = String(row?.text || '');
    if (!text) continue;
    if (!keywords.some((k) => k && text.includes(k))) continue;
    if (!row?.visible) continue;
    out.push({
      commentId: `dom-${row?.index ?? ''}`,
      userId: '',
      userName: String(row?.userName || ''),
      content: text,
      timestamp: String(row?.timestamp || ''),
      isLiked: false,
      domRect: row?.rect ?? undefined,
      domIndex: Number.isFinite(Number(row?.index)) ? Number(row.index) : undefined,
      domSelector: '.comment-item',
      source: 'dom',
    });
  }
  return out;
}

async function extractComment(sessionId: string, anchor: any, apiUrl: string): Promise<any> {
  return controllerAction(
    'container:operation',
    {
      containerId: 'xiaohongshu_detail.comment_section.comment_item',
      operationId: 'extract',
      sessionId,
      config: { anchor },
    },
    apiUrl,
  );
}
