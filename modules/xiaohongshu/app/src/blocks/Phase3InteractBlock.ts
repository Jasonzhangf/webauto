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
  }>;
  reachedBottom: boolean;
  stopReason?: string;
  error?: string;
}

function normalizeText(s: string) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

async function highlightLikeButton(sessionId: string, index: number, apiUrl: string) {
  return controllerAction(
    'container:operation',
    {
      containerId: 'xiaohongshu_detail.comment_section.comment_item',
      operationId: 'highlight',
      sessionId,
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
        script: `(() => {
          const idx = ${index};
          const items = Array.from(document.querySelectorAll('.comment-item'));
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
      // 明确走系统级点击（clickOperation 内部用 bbox/elementFromPoint 选点并调用 systemInput.mouseClick）
      config: { index, target: '.like-wrapper', useSystemMouse: true, visibleOnly: true },
    },
    apiUrl,
  );
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
): Promise<{ useHref: string; count: string; likeClass: string }> {
  try {
    const res = await controllerAction(
      'browser:execute',
      {
        profile: sessionId,
        script: `(() => {
          const idx = ${JSON.stringify(index)};
          const isVisible = (el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth;
          };
          const visibleItems = Array.from(document.querySelectorAll('.comment-item')).filter(isVisible);
          const el = visibleItems[idx];
          if (!el) return { ok: false, likeClass: '', useHref: '', count: '' };
          const like = el.querySelector('.like-wrapper');
          const use = like?.querySelector('use');
          const useHref = use?.getAttribute('xlink:href') || use?.getAttribute('href') || '';
          const count = (like?.querySelector('.count')?.textContent || '').replace(/\\s+/g, ' ').trim();
          return { ok: true, likeClass: like ? like.className : '', useHref, count };
        })()`,
      },
      apiUrl,
    );
    return {
      useHref: String(res?.result?.useHref || res?.useHref || ''),
      count: String(res?.result?.count || res?.count || ''),
      likeClass: String(res?.result?.likeClass || res?.likeClass || ''),
    };
  } catch {
    return { useHref: '', count: '', likeClass: '' };
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
  } = input;

  // Load persisted liked signatures for dedup (resume support)
  const likedSignatures = loadLikedSignatures(keyword, env);
  console.log(`[Phase3Interact] 开始处理帖子: ${noteId}, 已有点赞记录: ${likedSignatures.size}`);

  const likedComments: InteractOutput['likedComments'] = [];
  let likedCount = 0;
  let scannedCount = 0;
  let reachedBottom = false;
  let bottomReason = '';
  let scrollCount = 0;
  const maxScrolls = Infinity;

  const traceDir = path.join(
    resolveDownloadRoot(),
    'xiaohongshu',
    env,
    keyword,
    'virtual-like',
    noteId,
  );

  // 检查点赞速率限制
  const gateStatus = await checkLikeGate(sessionId);
  console.log(`[Phase3Interact] Like Gate: ${gateStatus.current}/${gateStatus.limit} ${gateStatus.allowed ? '✅' : '❌'}`);

  // 1) 打开详情页（必须是带 xsec_token 的 safeUrl）
  const navRes = await controllerAction('browser:goto', { profile: sessionId, url: safeUrl }, unifiedApiUrl);
  if (navRes?.success === false) {
    return {
      success: false,
      noteId,
      likedCount: 0,
      scannedCount: 0,
      likedComments: [],
      reachedBottom: false,
      error: navRes?.error || 'goto failed',
    };
  }
  await delay(2200);

  // 2) 展开评论区（如果按钮存在则点击；否则视为已展开）
  await ensureCommentsOpened(sessionId, unifiedApiUrl);

  // 3) 滚动评论区 + 筛选 + 点赞
  while (likedCount < maxLikesPerRound && scrollCount < maxScrolls) {
    scrollCount += 1;

    const extracted = await extractVisibleComments(sessionId, unifiedApiUrl, 40);
    scannedCount += extracted.length;

    for (let i = 0; i < extracted.length; i++) {
      if (likedCount >= maxLikesPerRound) break;
      const c: any = extracted[i] || {};
      // Use domIndex from xhsComments if available, fallback to array index
      const domIndex = typeof (c as any).domIndex === 'number' ? (c as any).domIndex : i;
      const text = String(c.text || '').trim();
      if (!text) continue;
      if (!likeKeywords.some((k) => k && text.includes(k))) continue;

      // 请求点赞许可（速率限制）
      const likePermit = await requestLikeGate(sessionId);
      if (process.env.WEBAUTO_LIKE_GATE_BYPASS === '1') { likePermit.allowed = true; }
      if (!likePermit.allowed) {
        console.log(`[Phase3Interact] ⏳ 点赞速率限制：${likePermit.current}/${likePermit.limit}`);
        await delay(1000);
        continue;
      }

      // 视觉确认：高亮需要点击的位置（like button）
      await highlightCommentRow(sessionId, domIndex, unifiedApiUrl, 'virtual-like-row').catch((): null => null);
      const highlightRes = await highlightLikeButton(sessionId, domIndex, unifiedApiUrl);
      await delay(450);

      if (highlightRes?.inViewport !== true) {
        continue;
      }

      // 确保评论项在视口中部，避免截图/点击偏移
      const centered = await ensureCommentVisibleCentered(sessionId, unifiedApiUrl, domIndex);
      if (!centered) {
        continue;
      }

      // 再高亮一次，确保截图能看到高亮
      await highlightCommentRow(sessionId, domIndex, unifiedApiUrl, 'virtual-like-row').catch((): null => null);
      await highlightLikeButton(sessionId, domIndex, unifiedApiUrl).catch((): null => null);
      await delay(300);

      const signature = {
        userId: String(c.user_id || '').trim() || undefined,
        userName: String(c.user_name || '').trim() || undefined,
        text,
      };

      // 已点赞则跳过（优先走 DOM 校验，避免容器 extractor 缺失导致误判）
      const beforeState = await getLikeStateForVisibleCommentIndex(sessionId, unifiedApiUrl, domIndex);
      const beforeLiked = beforeState.useHref.includes('#liked');
      if (beforeLiked) {
        continue;
      }

      let beforePath: string | null = null;
      const beforeBase64 = await takeScreenshotBase64(sessionId, unifiedApiUrl);
      if (beforeBase64) {
        const name = `like-before-idx-${String(i).padStart(3, '0')}-${Date.now()}.png`;
        beforePath = await savePngBase64(beforeBase64, path.join(traceDir, name));
      }

      if (!dryRun) {
        const clickRes = await clickLikeButtonByIndex(sessionId, domIndex, unifiedApiUrl);
        if (!clickRes?.success) {
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
        const afterState = await getLikeStateForVisibleCommentIndex(sessionId, unifiedApiUrl, domIndex);
        const nowLiked =
          afterState.useHref.includes('#liked') || (await verifyLikedBySignature(sessionId, unifiedApiUrl, signature));
        if (!nowLiked) {
          continue;
        }
      }

      likedCount += 1;
      likedComments.push({
        index: i,
        userId: String(signature.userId || ''),
        userName: String(signature.userName || ''),
        content: String(text || ''),
        timestamp: String(c.timestamp || ''),
        screenshots: { before: beforePath, after: afterPath },
      });

      // 点赞间隔
      await delay(900);
    }

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
      console.log(`[Phase3Interact] reachedBottom=true reason=${bottomReason}`);
      break;
    }

    // 系统级滚动（避免大跨度、且保证在评论区域上滚动）
    await scrollComments(sessionId, unifiedApiUrl, 650);
    await delay(900);
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
    reachedBottom,
    stopReason: reachedBottom ? bottomReason : undefined,
  };
}
