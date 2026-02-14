/**
 * Phase 3 Block: 评论互动（Interact）
 *
 * 职责：
 * - 打开帖子详情页（safeUrl，必须含 xsec_token）
 * - 展开评论区
 * - 滚动评论区，筛选包含关键字的评论
 * - 高亮点赞按钮并点击点赞
 * - 截图落盘用于验证（高亮前/点赞后）
 */

import path from 'node:path';
import fs, { promises as fsp } from 'node:fs';
import os from 'node:os';
import { controllerAction, delay } from '../utils/controllerAction.js';
import { resolveDownloadRoot, savePngBase64, takeScreenshotBase64 } from './helpers/evidence.js';
import {
  ensureCommentsOpened,
  extractVisibleComments,
  highlightCommentRow,
  isCommentEnd,
  scrollComments,
  checkBottomWithBackAndForth,
  type XhsExtractedComment,
} from './helpers/xhsComments.js';

export interface InteractRoundStats {
  round: number;
  visible: number;
  harvestedNew: number;
  harvestedTotal: number;
  ruleHits: number;
  gateBlocked: number;
  dedupSkipped: number;
  alreadyLikedSkipped: number;
  notVisibleSkipped: number;
  clickFailed: number;
  verifyFailed: number;
  newLikes: number;
  likedTotal: number;
  reachedBottom: boolean;
  endReason?: string;
  ms: number;
}

export interface InteractInput {
  sessionId: string;
  noteId: string;
  safeUrl: string;
  likeKeywords: string[];
  maxLikesPerRound?: number;
  dryRun?: boolean;
  unifiedApiUrl?: string;
  keyword?: string;
  env?: string;
  reuseCurrentDetail?: boolean;
  commentsAlreadyOpened?: boolean;
  collectComments?: boolean;
  persistCollectedComments?: boolean;
  commentsFilePath?: string;
  evidenceDir?: string;
  onRound?: (stats: InteractRoundStats) => void;
}

export interface InteractOutput {
  success: boolean;
  noteId: string;
  likedCount: number;
  scannedCount: number;
  likedComments: Array<{
    index: number;
    userId: string;
    userName: string;
    content: string;
    timestamp: string;
    screenshots?: { before?: string | null; after?: string | null };
    matchedRule?: string;
  }>;
  commentsAdded?: number;
  commentsTotal?: number;
  commentsPath?: string;
  evidenceDir?: string;
  dedupSkipped?: number;
  alreadyLikedSkipped?: number;
  reachedBottom: boolean;
  stopReason?: string;
  error?: string;
}

function normalizeText(s: string) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

function resolveLikeIconState(useHref: string): 'liked' | 'unliked' | 'unknown' {
  const href = String(useHref || '').trim().toLowerCase();
  if (href.includes('#liked')) return 'liked';
  if (href.includes('#like')) return 'unliked';
  return 'unknown';
}

export type LikeRule =
  | { kind: 'contains'; include: string; raw: string }
  | { kind: 'and'; includeA: string; includeB: string; raw: string }
  | { kind: 'include_without'; include: string; exclude: string; raw: string };

function parseLikeRuleToken(token: string): LikeRule | null {
  const raw = String(token || '').trim();
  if (!raw) return null;

  const m = raw.match(/^\{\s*(.+?)\s*([+\-＋－])\s*(.+?)\s*\}$/);
  if (!m) {
    return { kind: 'contains', include: raw, raw };
  }

  const left = normalizeText(m[1]);
  const right = normalizeText(m[3]);
  if (!left || !right) return null;

  const op = m[2] === '＋' ? '+' : m[2] === '－' ? '-' : m[2];
  if (op === '+') {
    return { kind: 'and', includeA: left, includeB: right, raw: `{${left} + ${right}}` };
  }
  return { kind: 'include_without', include: left, exclude: right, raw: `{${left} - ${right}}` };
}

export function compileLikeRules(likeKeywords: string[]): LikeRule[] {
  const rows = Array.isArray(likeKeywords) ? likeKeywords : [];
  const rules: LikeRule[] = [];
  for (const row of rows) {
    const parsed = parseLikeRuleToken(String(row || '').trim());
    if (!parsed) continue;
    rules.push(parsed);
  }
  return rules;
}

export function matchLikeText(textRaw: string, rules: LikeRule[]): { ok: boolean; reason: string; matchedRule?: string } {
  const text = normalizeText(textRaw);
  if (!text) return { ok: false, reason: 'empty_text' };
  if (!Array.isArray(rules) || rules.length === 0) return { ok: false, reason: 'no_rules' };

  for (const rule of rules) {
    if (rule.kind === 'contains') {
      if (text.includes(rule.include)) {
        return { ok: true, reason: 'contains_match', matchedRule: rule.raw };
      }
      continue;
    }
    if (rule.kind === 'and') {
      if (text.includes(rule.includeA) && text.includes(rule.includeB)) {
        return { ok: true, reason: 'and_match', matchedRule: rule.raw };
      }
      continue;
    }
    if (text.includes(rule.include) && !text.includes(rule.exclude)) {
      return { ok: true, reason: 'include_without_match', matchedRule: rule.raw };
    }
  }

  return { ok: false, reason: 'no_rule_match' };
}

async function highlightLikeButton(sessionId: string, index: number, apiUrl: string) {
  return controllerAction(
    'container:operation',
    {
      containerId: 'xiaohongshu_detail.comment_section.comment_item',
      operationId: 'highlight',
      sessionId,
      timeoutMs: 12000,
      config: {
        index,
        target: '.like-wrapper',
        style: '12px solid #00e5ff',
        duration: 8000,
        channel: 'virtual-like-like',
        visibleOnly: true,
      },
    },
    apiUrl,
  );
}

async function ensureCommentVisibleCentered(sessionId: string, apiUrl: string, index: number) {
  for (let i = 0; i < 3; i++) {
    const rect = await controllerAction(
      'browser:execute',
      {
        profile: sessionId,
        timeoutMs: 12000,
        script: `(() => {
          const idx = ${index};
          const isVisible = (el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight;
          };
          const items = Array.from(document.querySelectorAll('.comment-item')).filter(isVisible);
          if (!items[idx]) return { ok: false };
          const r = items[idx].getBoundingClientRect();
          const vh = window.innerHeight;
          return { ok: true, top: r.top, bottom: r.bottom, height: r.height, vh };
        })()`
      },
      apiUrl,
    ).then(res => res?.result || res?.data?.result || null);

    if (!rect || rect.ok !== true) return false;

    const pad = 80;
    const visible = rect.top >= pad && rect.bottom <= (rect.vh - pad);
    if (visible) return true;

    const dir = rect.top < pad ? 'up' : 'down';
    const amount = Math.min(800, Math.ceil((rect.top < pad ? (pad - rect.top) : (rect.bottom - (rect.vh - pad))) + 120));

    await controllerAction(
      'container:operation',
      {
        containerId: 'xiaohongshu_detail.comment_section',
        operationId: 'scroll',
        sessionId,
        timeoutMs: 12000,
        config: { direction: dir, amount },
      },
      apiUrl,
    ).catch(() => {});
    await delay(500);
  }
  return false;
}

async function clickLikeButtonByIndex(sessionId: string, index: number, apiUrl: string) {
  return controllerAction(
    'container:operation',
    {
      containerId: 'xiaohongshu_detail.comment_section.comment_item',
      operationId: 'click',
      sessionId,
      timeoutMs: 12000,
      // 明确走系统级点击（clickOperation 内部用 bbox/elementFromPoint 选点并调用 systemInput.mouseClick）
      config: { index, target: '.like-wrapper', useSystemMouse: true, visibleOnly: true },
    },
    apiUrl,
  );
}

async function expandMoreComments(sessionId: string, apiUrl: string): Promise<void> {
  await controllerAction(
    'container:operation',
    {
      containerId: 'xiaohongshu_detail.comment_section.show_more_button',
      operationId: 'click',
      sessionId,
      timeoutMs: 12000,
      config: { visibleOnly: true, useSystemMouse: true },
    },
    apiUrl,
  ).catch(() => {});
}

async function verifyLikedBySignature(
  sessionId: string,
  apiUrl: string,
  signature: { userId?: string; userName?: string; text: string },
): Promise<boolean> {
  const targetText = normalizeText(signature.text);
  if (!targetText) return false;

  // 优先走容器 extract（只看视口内）
  try {
    const rows = await extractVisibleComments(sessionId, apiUrl, 60);
    const found = rows.find((r) => {
      const t = normalizeText(String(r.text || ''));
      if (!t || t !== targetText) return false;
      const uid = String(r.user_id || '').trim();
      const un = String(r.user_name || '').trim();
      if (signature.userId && uid && uid !== signature.userId) return false;
      if (!signature.userId && signature.userName && un && un !== signature.userName) return false;
      return true;
    });
    if (found) {
      // user container-lib 可能未配置 like_status；且 like_active 不是“已点赞”语义，容器结果仅作弱提示
      const hint = String(found.like_status || '');
      if (hint.includes('liked') || hint.includes('like-liked')) return true;
    }
  } catch {
    // fallback below
  }

  // fallback：直接读 DOM（避免 index 漂移导致误判）
  try {
    const res = await controllerAction(
      'browser:execute',
      {
        profile: sessionId,
        timeoutMs: 12000,
        script: `(() => {
          const targetText = ${JSON.stringify(targetText)};
          const userName = ${JSON.stringify(String(signature.userName || ''))};
          const items = Array.from(document.querySelectorAll('.comment-item'));
          for (const el of items) {
            const r = el.getBoundingClientRect();
            const visible = r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight;
            if (!visible) continue;
            const textEl = el.querySelector('.content') || el.querySelector('.comment-content') || el.querySelector('p');
            const t = (textEl?.textContent || '')
              .replace(/\\s+/g, ' ')
              .trim();
            if (t !== targetText) continue;
            if (userName) {
              const n = (el.querySelector('.name')?.textContent || el.querySelector('.username')?.textContent || el.querySelector('.user-name')?.textContent || '')
                .replace(/\\s+/g, ' ')
                .trim();
              if (n && n !== userName) continue;
            }
            const like = el.querySelector('.like-wrapper');
            const use = like?.querySelector('use');
            const useHref = use?.getAttribute('xlink:href') || use?.getAttribute('href') || '';
            return { ok: true, useHref };
          }
          return { ok: false, useHref: '' };
        })()`,
      },
      apiUrl,
    );
    const useHref = String(res?.result?.useHref || res?.useHref || '');
    return useHref.includes('#liked');
  } catch {
    return false;
  }
}

async function getLikeStateForVisibleCommentIndex(
  sessionId: string,
  apiUrl: string,
  index: number,
): Promise<{ useHref: string; count: string; likeClass: string; iconState: 'liked' | 'unliked' | 'unknown' }> {
  try {
    const res = await controllerAction(
      'browser:execute',
      {
        profile: sessionId,
        timeoutMs: 12000,
        script: `(() => {
          const idx = ${JSON.stringify(index)};
          const isVisible = (el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth;
          };
          const visibleItems = Array.from(document.querySelectorAll('.comment-item')).filter(isVisible);
          const el = visibleItems[idx];
          if (!el) return { ok: false, likeClass: '', useHref: '', count: '', iconState: 'unknown' };
          const like = el.querySelector('.like-wrapper');
          const use = like?.querySelector('svg.like-icon use') || like?.querySelector('use');
          const useHref = use?.getAttribute('xlink:href') || use?.getAttribute('href') || use?.href?.baseVal || '';
          const count = (like?.querySelector('.count')?.textContent || '').replace(/\\s+/g, ' ').trim();
          const likeClass = like ? String(like.className || '') : '';
          const iconState = useHref.includes('#liked') ? 'liked' : useHref.includes('#like') ? 'unliked' : (likeClass.includes('like-active') ? 'liked' : 'unknown');
          return { ok: true, likeClass, useHref, count, iconState };
        })()`,
      },
      apiUrl,
    );
    const useHref = String(res?.result?.useHref || res?.useHref || '');
    return {
      useHref,
      count: String(res?.result?.count || res?.count || ''),
      likeClass: String(res?.result?.likeClass || res?.likeClass || ''),
      iconState: resolveLikeIconState(String(res?.result?.iconState || res?.iconState || useHref)),
    };
  } catch {
    return { useHref: '', count: '', likeClass: '', iconState: 'unknown' };
  }
}

async function checkLikeGate(profileId: string): Promise<{ allowed: boolean; current: number; limit: number }> {
  try {
    const res = await fetch(`http://127.0.0.1:7790/like/status/${encodeURIComponent(profileId)}`);
    const data = await res.json();
    return {
      allowed: Boolean(data?.allowed ?? data?.ok ?? true),
      current: Number(data?.current ?? data?.countInWindow ?? 0),
      limit: Number(data?.limit ?? data?.maxCount ?? 6),
    };
  } catch {
    return { allowed: true, current: 0, limit: 6 };
  }
}

async function requestLikeGate(profileId: string): Promise<{ allowed: boolean; current: number; limit: number }> {
  try {
    const res = await fetch('http://127.0.0.1:7790/like', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId, key: profileId }),
    });
    const data = await res.json();
    return {
      allowed: Boolean(data?.allowed ?? data?.ok ?? true),
      current: Number(data?.current ?? data?.countInWindow ?? 0),
      limit: Number(data?.limit ?? data?.maxCount ?? 6),
    };
  } catch {
    return { allowed: true, current: 0, limit: 6 };
  }
}

function emitLikeEvent(keyword: string, env: string, payload: any) {
  try {
    const home = process.env.HOME || process.env.USERPROFILE || require('os').homedir();
    const logPath = require('path').join(home, '.webauto', 'download', 'xiaohongshu', env, keyword, 'run-events.jsonl');
    const row = { ts: new Date().toISOString(), type: 'like', ...payload };
    fs.appendFileSync(logPath, JSON.stringify(row) + '\n', 'utf8');
  } catch {}
}


// Like deduplication: persist liked signatures to disk
function getLikeStatePath(keyword: string, env: string): string {
  const home = process.env.HOME || process.env.USERPROFILE || require('os').homedir();
  return path.join(home, '.webauto', 'download', 'xiaohongshu', env, keyword, '.like-state.jsonl');
}

function loadLikedSignatures(keyword: string, env: string): Set<string> {
  try {
    const p = getLikeStatePath(keyword, env);
    if (!fs.existsSync(p)) return new Set();
    const lines = fs.readFileSync(p, 'utf8').split('\n').filter(Boolean);
    const sigs = new Set<string>();
    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        if (obj.signature) sigs.add(obj.signature);
      } catch {}
    }
    return sigs;
  } catch {
    return new Set();
  }
}

function saveLikedSignature(keyword: string, env: string, signature: string): void {
  try {
    const p = getLikeStatePath(keyword, env);
    const row = { ts: new Date().toISOString(), signature };
    fs.appendFileSync(p, JSON.stringify(row) + '\n', 'utf8');
  } catch {}
}

function makeSignature(noteId: string, userId: string, userName: string, text: string): string {
  const normalizedText = String(text || '').trim().slice(0, 200);
  return [noteId, String(userId || ''), String(userName || ''), normalizedText].join('|');
}

function normalizeHarvestComment(noteId: string, row: XhsExtractedComment) {
  return {
    noteId,
    userName: String((row as any).user_name || '').trim(),
    userId: String((row as any).user_id || '').trim(),
    content: String((row as any).text || '').replace(/\s+/g, ' ').trim(),
    time: String((row as any).timestamp || '').trim(),
    likeCount: 0,
    ts: new Date().toISOString(),
  };
}

async function readJsonlRows(filePath: string): Promise<any[]> {
  try {
    const text = await fsp.readFile(filePath, 'utf8');
    return text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function appendJsonlRows(filePath: string, rows: any[]): Promise<void> {
  if (!rows.length) return;
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  const payload = rows.map((row) => JSON.stringify(row)).join('\n') + '\n';
  await fsp.appendFile(filePath, payload, 'utf8');
}

export async function execute(input: InteractInput): Promise<InteractOutput> {
  const {
    sessionId,
    noteId,
    safeUrl,
    likeKeywords,
    maxLikesPerRound = 2,
    dryRun = false,
    unifiedApiUrl = 'http://127.0.0.1:7701',
    keyword = 'unknown',
    env = 'debug',
    reuseCurrentDetail = false,
    commentsAlreadyOpened = false,
    collectComments = false,
    persistCollectedComments = false,
    commentsFilePath = '',
    evidenceDir = '',
    onRound,
  } = input;

  // Load persisted liked signatures for dedup (resume support)
  const likedSignatures = loadLikedSignatures(keyword, env);
  const compiledLikeRules = compileLikeRules(likeKeywords);
  console.log(`[Phase3Interact] 开始处理帖子: ${noteId}, 已有点赞记录: ${likedSignatures.size}`);
  console.log(
    `[Phase3Interact] 关键词规则: ${compiledLikeRules.length > 0 ? compiledLikeRules.map((r) => r.raw).join(' | ') : '(empty)'}`,
  );

  const likedComments: InteractOutput['likedComments'] = [];
  let likedCount = 0;
  let scannedCount = 0;
  let reachedBottom = false;
  let bottomReason = '';
  let scrollCount = 0;
  let totalDedupSkipped = 0;
  let totalAlreadyLikedSkipped = 0;
  const maxScrolls = Infinity;

  const harvestPath = String(commentsFilePath || '').trim();
  const shouldHarvest = Boolean(collectComments);
  const shouldPersistHarvest = shouldHarvest && Boolean(persistCollectedComments) && Boolean(harvestPath);
  const harvestedKeySet = new Set<string>();
  let harvestedAdded = 0;
  let harvestedTotal = 0;

  if (shouldPersistHarvest && harvestPath) {
    const existingRows = await readJsonlRows(harvestPath);
    for (const row of existingRows) {
      const key = `${String(row?.userId || '')}:${String(row?.content || '')}`;
      if (!key.endsWith(':')) harvestedKeySet.add(key);
    }
    harvestedTotal = harvestedKeySet.size;
  }

  const traceDir = String(evidenceDir || '').trim() || path.join(
    resolveDownloadRoot(),
    'xiaohongshu',
    env,
    keyword,
    dryRun ? 'virtual-like' : 'like-evidence',
    noteId,
  );

  // 检查点赞速率限制
  const gateStatus = await checkLikeGate(sessionId);
  console.log(`[Phase3Interact] Like Gate: ${gateStatus.current}/${gateStatus.limit} ${gateStatus.allowed ? '✅' : '❌'}`);

  // 1) 打开详情页（必须是带 xsec_token 的 safeUrl），或复用当前已打开详情页
  if (!reuseCurrentDetail) {
    const navRes = await controllerAction('browser:goto', { profile: sessionId, url: safeUrl, timeoutMs: 30000 }, unifiedApiUrl);
    if (navRes?.success === false) {
      return {
        success: false,
        noteId,
        likedCount: 0,
        scannedCount: 0,
        likedComments: [],
        evidenceDir: traceDir,
        dedupSkipped: 0,
        alreadyLikedSkipped: 0,
        reachedBottom: false,
        error: navRes?.error || 'goto failed',
      };
    }
    await delay(2200);
  } else {
    console.log('[Phase3Interact] reuse current detail page, skip goto');
  }

  // 2) 展开评论区（如果按钮存在则点击；否则视为已展开）
  if (!commentsAlreadyOpened) {
    await ensureCommentsOpened(sessionId, unifiedApiUrl);
  } else {
    console.log('[Phase3Interact] comments already opened, skip open click');
  }

  // 3) 滚动评论区 + 筛选 + 点赞
  while (likedCount < maxLikesPerRound && scrollCount < maxScrolls) {
    scrollCount += 1;
    const roundStartMs = Date.now();
    let roundRuleHits = 0;
    let roundGateBlocked = 0;
    let roundDedupSkipped = 0;
    let roundAlreadyLikedSkipped = 0;
    let roundNotVisibleSkipped = 0;
    let roundClickFailed = 0;
    let roundVerifyFailed = 0;
    let roundNewLikes = 0;

    const extracted = await extractVisibleComments(sessionId, unifiedApiUrl, 40);
    scannedCount += extracted.length;

    let roundHarvestedNew = 0;
    if (shouldHarvest && extracted.length > 0) {
      const rowsToAppend: any[] = [];
      for (const row of extracted) {
        const normalized = normalizeHarvestComment(noteId, row);
        if (!normalized.content) continue;
        const key = `${normalized.userId}:${normalized.content}`;
        if (harvestedKeySet.has(key)) continue;
        harvestedKeySet.add(key);
        harvestedAdded += 1;
        harvestedTotal += 1;
        roundHarvestedNew += 1;
        if (shouldPersistHarvest) rowsToAppend.push(normalized);
      }
      if (shouldPersistHarvest && rowsToAppend.length > 0) {
        try {
          await appendJsonlRows(harvestPath, rowsToAppend);
        } catch {
          // ignore comment append errors to avoid blocking like flow
        }
      }
    }

    for (let i = 0; i < extracted.length; i++) {
      if (likedCount >= maxLikesPerRound) break;
      const c: any = extracted[i] || {};
      const visibleIndex = i;
      const domIndex = typeof (c as any).domIndex === 'number' ? (c as any).domIndex : -1;
      const text = String(c.text || '').trim();
      if (!text) continue;
      const likeMatch = matchLikeText(text, compiledLikeRules);
      if (!likeMatch.ok) {
        continue;
      }
      roundRuleHits += 1;
      console.log(
        `[Phase3Interact] 命中规则 note=${noteId} visibleRow=${visibleIndex} domRow=${domIndex >= 0 ? domIndex : 'na'} rule=${likeMatch.matchedRule || likeMatch.reason}`,
      );

      // 视觉确认：高亮需要点击的位置（like button）
      await highlightCommentRow(sessionId, visibleIndex, unifiedApiUrl, 'virtual-like-row').catch((): null => null);
      const highlightRes = await highlightLikeButton(sessionId, visibleIndex, unifiedApiUrl);
      await delay(450);

      if (highlightRes?.inViewport !== true) {
        roundNotVisibleSkipped += 1;
        console.log(`[Phase3Interact] 跳过点赞 note=${noteId} visibleRow=${visibleIndex} reason=not_in_viewport`);
        continue;
      }

      // 确保评论项在视口中部，避免截图/点击偏移
      const centered = await ensureCommentVisibleCentered(sessionId, unifiedApiUrl, visibleIndex);
      if (!centered) {
        roundNotVisibleSkipped += 1;
        console.log(`[Phase3Interact] 跳过点赞 note=${noteId} visibleRow=${visibleIndex} reason=center_failed`);
        continue;
      }

      // 再高亮一次，确保截图能看到高亮
      await highlightCommentRow(sessionId, visibleIndex, unifiedApiUrl, 'virtual-like-row').catch((): null => null);
      await highlightLikeButton(sessionId, visibleIndex, unifiedApiUrl).catch((): null => null);
      await delay(300);

      const signature = {
        userId: String(c.user_id || '').trim() || undefined,
        userName: String(c.user_name || '').trim() || undefined,
        text,
      };

      const sigKey = makeSignature(noteId, String(signature.userId || ''), String(signature.userName || ''), text);
      if (likedSignatures.has(sigKey)) {
        roundDedupSkipped += 1;
        continue;
      }

      // 已点赞则跳过（优先走 DOM 校验，避免容器 extractor 缺失导致误判）
      const beforeState = await getLikeStateForVisibleCommentIndex(sessionId, unifiedApiUrl, visibleIndex);
      let beforeLiked = beforeState.iconState === 'liked';
      if (!beforeLiked && beforeState.iconState === 'unknown') {
        beforeLiked = await verifyLikedBySignature(sessionId, unifiedApiUrl, signature);
      }
      if (beforeLiked) {
        roundAlreadyLikedSkipped += 1;
        likedSignatures.add(sigKey);
        if (!dryRun) {
          saveLikedSignature(keyword, env, sigKey);
        }
        continue;
      }

      let beforePath: string | null = null;
      const beforeBase64 = await takeScreenshotBase64(sessionId, unifiedApiUrl);
      if (beforeBase64) {
        const name = `like-before-idx-${String(i).padStart(3, '0')}-${Date.now()}.png`;
        beforePath = await savePngBase64(beforeBase64, path.join(traceDir, name));
      }

      if (!dryRun) {
        // 请求点赞许可（速率限制）只在“即将执行实际点赞点击”时触发，
        // 跳过项（去重/已赞/不可见）不应消耗 gate 计数。
        const likePermit = await requestLikeGate(sessionId);
        if (process.env.WEBAUTO_LIKE_GATE_BYPASS === '1') {
          likePermit.allowed = true;
        }
        if (!likePermit.allowed) {
          roundGateBlocked += 1;
          console.log(`[Phase3Interact] ⏳ 点赞速率限制：${likePermit.current}/${likePermit.limit}`);
          await delay(1000);
          continue;
        }

        const clickRes = await clickLikeButtonByIndex(sessionId, visibleIndex, unifiedApiUrl);
        if (!clickRes?.success) {
          roundClickFailed += 1;
          continue;
        }
        await delay(650);
      } else {
        // dry-run: do not actually like; leave evidence only
        await delay(450);
      }

      let afterPath: string | null = null;
      const afterBase64 = await takeScreenshotBase64(sessionId, unifiedApiUrl);
      if (afterBase64) {
        const name = `like-after-idx-${String(i).padStart(3, '0')}-${Date.now()}.png`;
        afterPath = await savePngBase64(afterBase64, path.join(traceDir, name));
      }

      // 验证：目标评论的 like-wrapper 是否变为 like-active（避免 index 漂移误判）
      if (!dryRun) {
        const afterState = await getLikeStateForVisibleCommentIndex(sessionId, unifiedApiUrl, visibleIndex);
        const nowLiked =
          afterState.iconState === 'liked' || (await verifyLikedBySignature(sessionId, unifiedApiUrl, signature));
        if (!nowLiked) {
          roundVerifyFailed += 1;
          continue;
        }
      }

      likedCount += 1;
      roundNewLikes += 1;
      likedSignatures.add(sigKey);
      if (!dryRun) {
        saveLikedSignature(keyword, env, sigKey);
      }
      likedComments.push({
        index: i,
        userId: String(signature.userId || ''),
        userName: String(signature.userName || ''),
        content: String(text || ''),
        timestamp: String(c.timestamp || ''),
        screenshots: { before: beforePath, after: afterPath },
        matchedRule: likeMatch.matchedRule,
      });

      // 点赞间隔
      await delay(900);
    }

    totalDedupSkipped += roundDedupSkipped;
    totalAlreadyLikedSkipped += roundAlreadyLikedSkipped;

    // 尝试展开更多评论回复，避免只展开一层导致命中遗漏。
    await expandMoreComments(sessionId, unifiedApiUrl);
    await delay(350);

    // 底部检测：
    // - 优先使用明确 end marker / 空评论标记
    // - 定期使用往返滚动检测，避免卡死在“看起来还能滚但实际不再加载”的状态
    const basicEnd = await isCommentEnd(sessionId, unifiedApiUrl);
    if (basicEnd) {
      reachedBottom = true;
      bottomReason = 'end_marker_or_empty';
    } else if (scrollCount % 10 === 0) {
      const bf = await checkBottomWithBackAndForth(sessionId, unifiedApiUrl, 3).catch(() => ({ reachedBottom: false, reason: 'error' }));
      reachedBottom = bf.reachedBottom;
      bottomReason = bf.reason;
    }
    if (reachedBottom) {
      const roundMs = Date.now() - roundStartMs;
      console.log(
        `[Phase3Interact] round=${scrollCount} visible=${extracted.length} harvestedNew=${roundHarvestedNew} harvestedTotal=${harvestedTotal} ruleHits=${roundRuleHits} gateBlocked=${roundGateBlocked} dedup=${roundDedupSkipped} alreadyLiked=${roundAlreadyLikedSkipped} notVisible=${roundNotVisibleSkipped} clickFailed=${roundClickFailed} verifyFailed=${roundVerifyFailed} newLikes=${roundNewLikes} likedTotal=${likedCount}/${maxLikesPerRound} end=${bottomReason} ms=${roundMs}`,
      );
      try {
        onRound?.({
          round: scrollCount,
          visible: extracted.length,
          harvestedNew: roundHarvestedNew,
          harvestedTotal,
          ruleHits: roundRuleHits,
          gateBlocked: roundGateBlocked,
          dedupSkipped: roundDedupSkipped,
          alreadyLikedSkipped: roundAlreadyLikedSkipped,
          notVisibleSkipped: roundNotVisibleSkipped,
          clickFailed: roundClickFailed,
          verifyFailed: roundVerifyFailed,
          newLikes: roundNewLikes,
          likedTotal: likedCount,
          reachedBottom: true,
          endReason: bottomReason,
          ms: roundMs,
        });
      } catch {
        // ignore onRound callback failures
      }
      console.log(`[Phase3Interact] reachedBottom=true reason=${bottomReason}`);
      break;
    }

    // 系统级滚动（避免大跨度、且保证在评论区域上滚动）
    await scrollComments(sessionId, unifiedApiUrl, 650);
    await delay(900);

    const roundMs = Date.now() - roundStartMs;
    console.log(
      `[Phase3Interact] round=${scrollCount} visible=${extracted.length} harvestedNew=${roundHarvestedNew} harvestedTotal=${harvestedTotal} ruleHits=${roundRuleHits} gateBlocked=${roundGateBlocked} dedup=${roundDedupSkipped} alreadyLiked=${roundAlreadyLikedSkipped} notVisible=${roundNotVisibleSkipped} clickFailed=${roundClickFailed} verifyFailed=${roundVerifyFailed} newLikes=${roundNewLikes} likedTotal=${likedCount}/${maxLikesPerRound} end=no ms=${roundMs}`,
    );
    try {
      onRound?.({
        round: scrollCount,
        visible: extracted.length,
        harvestedNew: roundHarvestedNew,
        harvestedTotal,
        ruleHits: roundRuleHits,
        gateBlocked: roundGateBlocked,
        dedupSkipped: roundDedupSkipped,
        alreadyLikedSkipped: roundAlreadyLikedSkipped,
        notVisibleSkipped: roundNotVisibleSkipped,
        clickFailed: roundClickFailed,
        verifyFailed: roundVerifyFailed,
        newLikes: roundNewLikes,
        likedTotal: likedCount,
        reachedBottom: false,
        ms: roundMs,
      });
    } catch {
      // ignore onRound callback failures
    }
  }

  // 落盘一份摘要，便于复盘（不影响主流程）
  try {
    await fsp.mkdir(traceDir, { recursive: true });
    await fsp.writeFile(
      path.join(traceDir, `summary-${Date.now()}.json`),
      JSON.stringify(
        {
          noteId,
          safeUrl,
          likeKeywords,
          likedCount,
          reachedBottom,
          likedComments,
          ts: new Date().toISOString(),
        },
        null,
        2,
      ),
      'utf8',
    );
  } catch {
    // ignore
  }

  return {
    success: true,
    noteId,
    likedCount,
    scannedCount,
    likedComments,
    commentsAdded: shouldHarvest ? harvestedAdded : undefined,
    commentsTotal: shouldHarvest ? harvestedTotal : undefined,
    commentsPath: shouldPersistHarvest ? harvestPath : undefined,
    evidenceDir: traceDir,
    dedupSkipped: totalDedupSkipped,
    alreadyLikedSkipped: totalAlreadyLikedSkipped,
    reachedBottom,
    stopReason: reachedBottom ? bottomReason : undefined,
  };
}
