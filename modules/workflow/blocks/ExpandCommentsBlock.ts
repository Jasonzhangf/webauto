/**
 * Workflow Block: ExpandCommentsBlock
 *
 * 展开评论并提取评论列表
 */

import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { locateCommentSection } from './helpers/commentSectionLocator.js';
import { getScrollStats, getViewport, systemMouseWheel } from './helpers/commentScroller.js';
import { expandRepliesInView, findExpandTargets } from './helpers/replyExpander.js';
import { createExpandCommentsControllerClient } from './helpers/expandCommentsController.js';
import { buildExtractCommentsScript, mergeExtractedComments } from './helpers/expandCommentsExtractor.js';
import { systemClickAt } from './helpers/systemInput.js';
import { getCommentEndState } from './helpers/xhsCommentDom.js';

// 调试截图保存目录
const DEBUG_SCREENSHOT_DIR = path.join(os.homedir(), '.webauto', 'logs', 'debug-screenshots');

/**
 * 保存调试截图
 */
async function saveDebugScreenshot(
  kind: string,
  sessionId: string,
  meta: Record<string, any> = {},
): Promise<{ pngPath?: string; jsonPath?: string }> {
  try {
    await fs.mkdir(DEBUG_SCREENSHOT_DIR, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const base = `${ts}-${kind}-${sessionId}`;
    const pngPath = path.join(DEBUG_SCREENSHOT_DIR, `${base}.png`);
    const jsonPath = path.join(DEBUG_SCREENSHOT_DIR, `${base}.json`);

    const controllerUrl = 'http://127.0.0.1:7701/v1/controller/action';

    // 截图
    async function takeShot(): Promise<any> {
      const response = await fetch(controllerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'browser:screenshot',
          payload: { profileId: sessionId, fullPage: false },
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json().catch(() => ({}));
      return data.data || data;
    }

    let shot: any = null;
    try {
      shot = await takeShot();
    } catch {
      try {
        shot = await takeShot();
      } catch {
        shot = null;
      }
    }

    // 提取 base64
    const b64 =
      shot?.data?.data ??
      shot?.data?.body?.data ??
      shot?.body?.data ??
      shot?.result?.data ??
      shot?.result ??
      shot?.data ??
      shot;
    if (typeof b64 === 'string' && b64.length > 10) {
      await fs.writeFile(pngPath, Buffer.from(b64, 'base64'));
    }

    // 保存元数据
    await fs.writeFile(
      jsonPath,
      JSON.stringify({ ts, kind, sessionId, ...meta, pngPath: b64 ? pngPath : null }, null, 2),
      'utf-8',
    );

    console.log(`[ExpandComments][debug] saved ${kind}: ${pngPath}`);
    return { pngPath: b64 ? pngPath : undefined, jsonPath };
  } catch {
    return {};
  }
}

export interface ExpandCommentsInput {
  sessionId: string;
  maxRounds?: number;
  expectedTotal?: number | null;
  // 多 tab 渐进式评论抓取：每次只抓“新增”最多 N 条，然后切 tab
  maxNewComments?: number;
  seedSeenKeys?: string[];
  startFromTop?: boolean;
  ensureLatestTab?: boolean;
  serviceUrl?: string;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ExpandCommentsOutput {
  success: boolean;
  comments: Array<Record<string, any>>;
  reachedEnd: boolean;
  emptyState: boolean;
  stoppedByMaxNew?: boolean;
  anchor?: {
    commentSectionContainerId: string;
    commentSectionRect?: Rect;
    sampleCommentContainerId?: string;
    sampleCommentRect?: Rect;
    endMarkerContainerId?: string;
    endMarkerRect?: Rect;
    verified?: boolean;
  };
  error?: string;
}

/**
 * 展开评论并提取列表
 *
 * @param input - 输入参数
 * @returns Promise<ExpandCommentsOutput>
 */
export async function execute(input: ExpandCommentsInput): Promise<ExpandCommentsOutput> {
  const {
    sessionId,
    // 默认按“抓完”为目标：滚动到评论底部（或空评论）才结束
    maxRounds = 240,
    expectedTotal = null,
    maxNewComments,
    seedSeenKeys,
    startFromTop = true,
    ensureLatestTab = true,
    serviceUrl = 'http://127.0.0.1:7701'
  } = input;

  const profile = sessionId;
  const controllerUrl = `${serviceUrl}/v1/controller/action`;

  const controllerClient = createExpandCommentsControllerClient({ profile, controllerUrl });
  const { controllerAction, getCurrentUrl } = controllerClient;

  const browserServiceUrl =
    process.env.WEBAUTO_BROWSER_SERVICE_URL || 'http://127.0.0.1:7704';
  const browserWsUrl = process.env.WEBAUTO_BROWSER_WS_URL || 'ws://127.0.0.1:8765';

  const commentSectionId = 'xiaohongshu_detail.comment_section';
  const commentButtonId = 'xiaohongshu_detail.comment_button';
  const showMoreContainerId = 'xiaohongshu_detail.comment_section.show_more_button';
  const commentItemContainerId = 'xiaohongshu_detail.comment_section.comment_item';
  const emptyStateContainerId = 'xiaohongshu_detail.comment_section.empty_state';
  const endMarkerContainerId = 'xiaohongshu_detail.comment_section.end_marker';

  const logPrefix = '[ExpandComments]';

  const warn = (msg: string) => console.warn(`${logPrefix} ${msg}`);
  const log = (msg: string) => console.log(`${logPrefix} ${msg}`);

  const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max);

  const viewport0 = await getViewport(controllerUrl, profile);
  const viewportW = viewport0.innerWidth || 1440;
  const viewportH = viewport0.innerHeight || 900;

  // Tab 监控：记录初始状态
  const initialTabs: Array<{ index: number; url: string }> = await controllerAction('browser:page:list', { profileId: profile })
    .then((r: any) => r?.pages || [])
    .catch((): Array<{ index: number; url: string }> => []);

  const tryActivateCommentsUi = async (reason: string) => {
    try {
      const result = await locateCommentSection({
        profile,
        serviceUrl,
        controllerUrl,
        commentSectionContainerId: commentSectionId,
        commentButtonContainerId: commentButtonId,
        canClickCommentButton: true,
        highlightStyle: '2px solid #ffaa00',
        highlightMs: 1200,
      });
      if (!result.found) {
        // 强制按 comment_button 作为激活
        await locateCommentSection({
          profile,
          serviceUrl,
          controllerUrl,
          commentSectionContainerId: commentSectionId,
          commentButtonContainerId: commentButtonId,
          canClickCommentButton: true,
          highlightStyle: '2px solid #ffaa00',
          highlightMs: 1200,
        });
      }
      log(`activated comments (${reason})`);
    } catch {
      // ignore
    }
  };

  const systemWheel = async (deltaY: number, focusPoint?: { x: number; y: number }, context = 'expand_comments_scroll') => {
    await systemMouseWheel({
      profileId: profile,
      deltaY,
      focusPoint,
      browserServiceUrl,
      browserWsUrl,
      context,
    });
  };

  const scrollStats = async (rootSelectors: string[]) =>
    getScrollStats(rootSelectors, controllerUrl, profile);

  const locateRectBySelectors = async (selectors: string[]): Promise<Rect | null> => {
    const filtered = selectors.filter((sel) => typeof sel === 'string' && sel.trim().length > 0);
    if (!filtered.length) return null;
    try {
      const response = await controllerAction('browser:execute', {
        profile,
        script: `(() => {
          const selectors = ${JSON.stringify(filtered)};
          for (const sel of selectors) {
            try {
              const el = document.querySelector(sel);
              if (!el) continue;
              const rect = el.getBoundingClientRect();
              if (!rect || !rect.width || !rect.height) continue;
              return { x: rect.left, y: rect.top, width: rect.width, height: rect.height, selector: sel };
            } catch (_) {}
          }
          return null;
        })()`,
      });
      const payload = (response as any)?.result || (response as any)?.data?.result || response;
      if (
        payload &&
        ['x', 'y', 'width', 'height'].every(
          (key) => typeof payload[key] === 'number' && Number.isFinite(payload[key]),
        )
      ) {
        return {
          x: Number(payload.x),
          y: Number(payload.y),
          width: Number(payload.width),
          height: Number(payload.height),
        };
      }
    } catch (err: any) {
      warn(`locateRectBySelectors error: ${err?.message || err}`);
    }
    return null;
  };

  const findContainer = (tree: any, pattern: RegExp): any => {
    if (!tree) return null;
    if (pattern.test(tree.id || tree.defId || '')) return tree;
    if (Array.isArray(tree.children)) {
      for (const child of tree.children) {
        const found = findContainer(child, pattern);
        if (found) return found;
      }
    }
    return null;
  };

  const collectContainers = (tree: any, pattern: RegExp, result: any[] = []): any[] => {
    if (!tree) return result;
    if (pattern.test(tree.id || tree.defId || '')) result.push(tree);
    if (Array.isArray(tree.children)) {
      for (const child of tree.children) collectContainers(child, pattern, result);
    }
    return result;
  };

  const resolveEndMarkerRectViaSelectors = async (primarySelector: string | null): Promise<Rect | null> => {
    const selectors: string[] = [];
    if (primarySelector) selectors.push(primarySelector);
    selectors.push('.comment-end', '.comments-end', '.comment-list .end');
    return locateRectBySelectors(selectors);
  };

  const readEndMarkerTextBySelector = async (primarySelector: string | null): Promise<string | null> => {
    const selectors: string[] = [];
    if (primarySelector) selectors.push(primarySelector);
    selectors.push('.end-container', '.comment-footer', '.comment-end', '.comments-end');
    try {
      const res = await controllerAction('browser:execute', {
        profile,
        script: `(() => {
          const selectors = ${JSON.stringify(selectors)};
          for (const sel of selectors) {
            try {
              const el = document.querySelector(sel);
              if (!el) continue;
              const t = (el.textContent || '').trim();
              if (t) return t.slice(0, 120);
            } catch (_) {}
          }
          return null;
        })()`,
      });
      const payload = (res as any)?.result ?? (res as any)?.data?.result ?? res;
      return typeof payload === 'string' ? payload : null;
    } catch {
      return null;
    }
  };

  const trySelectLatestTab = async (): Promise<boolean> => {
    try {
      const res = await controllerAction('browser:execute', {
        profile,
        script: `(() => {
          const roots = [
            document.querySelector('.comments-el'),
            document.querySelector('.comment-list'),
            document.querySelector('.comments-container'),
            document.querySelector('[class*="comment-section"]'),
          ].filter(Boolean);
          const root = roots[0] || document;

          const isVisible = (r) => r && r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < (window.innerHeight || 0);
          const candidates = Array.from(root.querySelectorAll('button, a, div, span'))
            .map((el) => {
              const t = (el.textContent || '').trim();
              if (t !== '最新' && t !== '最新评论') return null;
              const r = el.getBoundingClientRect();
              if (!isVisible(r)) return null;
              const cls = (el.getAttribute('class') || '') + ' ' + (el.parentElement ? (el.parentElement.getAttribute('class') || '') : '');
              const aria = el.getAttribute('aria-selected');
              const active = aria === 'true' || /active|selected|current/.test(cls);
              return { x: r.left, y: r.top, width: r.width, height: r.height, text: t, active };
            })
            .filter(Boolean);
          if (!candidates.length) return null;
          candidates.sort((a, b) => (a.text === '最新' ? -1 : 1));
          return candidates[0];
        })()`,
      });
      const payload = (res as any)?.result ?? (res as any)?.data?.result ?? res;
      if (!payload || typeof payload.x !== 'number' || typeof payload.y !== 'number') return false;
      if (payload.active) return true;
      const cx = Math.floor(payload.x + payload.width / 2);
      const cy = Math.floor(payload.y + payload.height / 2);
      await systemClickAt(profile, cx, cy, browserServiceUrl, 'select_latest_tab');
      await new Promise((r) => setTimeout(r, 900));
      return true;
    } catch {
      return false;
    }
  };

  const buildFocusPoint = (rect?: Rect): { x: number; y: number } => {
    if (!rect) return { x: Math.floor(viewportW / 2), y: Math.floor(viewportH / 2) };
    return {
      x: clamp(Math.floor(rect.x + rect.width / 2), 30, viewportW - 30),
      y: clamp(Math.floor(rect.y + Math.max(12, rect.height * 0.25)), 160, viewportH - 160),
    };
  };

  const extractCommentsOnce = async (params: {
    rootSelectors: string[];
    itemSelector: string;
    extractors: Record<string, { selectors: string[]; attr?: string }>;
    seenKeys: Set<string>;
    out: Array<Record<string, any>>;
  }) => {
    const script = buildExtractCommentsScript({
      rootSelectors: params.rootSelectors,
      itemSelector: params.itemSelector,
      extractors: params.extractors,
    });

    const domResult = await controllerAction('browser:execute', { profile, script });
    const payload = (domResult as any)?.result || (domResult as any)?.data?.result || domResult;
    if (!payload?.found || !Array.isArray(payload.comments)) return;
    mergeExtractedComments({ rawList: payload.comments, seenKeys: params.seenKeys, out: params.out });
  };

  const stripExtractorDefs = (extractors: any): Record<string, { selectors: string[]; attr?: string }> => {
    const fields: Record<string, { selectors: string[]; attr?: string }> = {};
    for (const [field, def] of Object.entries(extractors || {})) {
      const selectors = Array.isArray((def as any)?.selectors) ? (def as any).selectors : [];
      if (!selectors.length) continue;
      fields[field] = {
        selectors,
        attr: (def as any)?.attr,
      };
    }
    return fields;
  };

  const safeGetPrimarySelectorById = async (getPrimarySelectorByContainerId: any, id: string): Promise<string | null> => {
    try {
      return await getPrimarySelectorByContainerId(id);
    } catch (err: any) {
      warn(`getPrimarySelectorByContainerId error (${id}): ${err?.message || err}`);
      return null;
    }
  };

  const normalizeRect = (raw: any): Rect | null => {
    if (!raw || typeof raw !== 'object') return null;
    if (typeof raw.x === 'number' && typeof raw.y === 'number' && typeof raw.width === 'number' && typeof raw.height === 'number') {
      return { x: raw.x, y: raw.y, width: raw.width, height: raw.height };
    }
    return null;
  };

  // 以下旧的内联实现将被后续段落删除/替换

  try {
    const { verifyAnchorByContainerId, getPrimarySelectorByContainerId, getContainerExtractorsById } = await import('./helpers/containerAnchors.js');

    // 1. 锚定评论区根容器（只做一次高亮 + Rect 回环）
    let commentSectionRect: Rect | undefined;
    let commentSectionLocated = false;
    let lastAnchorError: string | null = null;

    try {
      const anchor = await locateCommentSection({
        profile,
        serviceUrl,
        controllerUrl,
        commentSectionContainerId: commentSectionId,
        commentButtonContainerId: commentButtonId,
        canClickCommentButton: true,
      });
      if (anchor.found && anchor.rect) {
        commentSectionRect = anchor.rect;
        commentSectionLocated = true;
        log(`comment_section rect: ${JSON.stringify(anchor.rect)}`);
      } else {
        lastAnchorError = anchor.error || 'not found';
      }
    } catch (e: any) {
      lastAnchorError = e.message || String(e);
    }

    if (!commentSectionLocated) {
      if (lastAnchorError) {
        warn(`comment_section anchor verify failed: ${lastAnchorError}`);
      }
      return {
        success: false,
        comments: [],
        reachedEnd: false,
        emptyState: false,
        anchor: {
          commentSectionContainerId: commentSectionId,
          commentSectionRect: undefined,
        },
        error: lastAnchorError || 'comment_section anchor not found',
      };
    }

    // 2. 重新 inspect 评论区域，供锚点与终止标记 / 样本评论锚点使用
    const currentUrl = await getCurrentUrl();
    if (!currentUrl) throw new Error('无法确定当前页面 URL，ExpandComments 需要在详情页内运行');

    const inspected = await controllerAction('containers:inspect-container', {
      profile,
      containerId: commentSectionId,
      url: currentUrl,
      maxChildren: 200
    });

    const effectiveTree = inspected.snapshot?.container_tree || inspected.container_tree || { id: commentSectionId };

    const emptyStateNode = findContainer(effectiveTree, /xiaohongshu_detail\.comment_section\.empty_state$/);
    const commentNodes = collectContainers(effectiveTree, /xiaohongshu_detail\.comment_section\.comment_item$/);

    // 3.0 锚点兜底：无评论 + 命中 empty_state
    if (commentNodes.length === 0) {
      if (emptyStateNode?.id) {
        let emptyRect: Rect | undefined;
        try {
          const anchor = await verifyAnchorByContainerId(
            emptyStateNode.id,
            profile,
            serviceUrl,
            '2px dashed #888888',
            2000,
          );
          if (anchor.found && anchor.rect) {
            emptyRect = anchor.rect;
            log(`empty_state rect: ${JSON.stringify(anchor.rect)}`);
          }
        } catch {
          // ignore
        }

        if (emptyRect && emptyRect.height > 0) {
          return {
            success: true,
            comments: [],
            reachedEnd: true,
            emptyState: true,
            anchor: {
              commentSectionContainerId: commentSectionId,
              commentSectionRect,
              endMarkerContainerId: emptyStateNode.id,
              endMarkerRect: emptyRect,
              verified: Boolean(commentSectionRect),
            },
          };
        }
      }

      warn('no comment_item or empty_state anchors found, aborting expand');
      return {
        success: false,
        comments: [],
        reachedEnd: false,
        emptyState: false,
        anchor: {
          commentSectionContainerId: commentSectionId,
          commentSectionRect,
        },
        error: 'comment_item & empty_state anchors not found',
      };
    }

    // 3.1 样本评论高亮
    let sampleCommentRect: Rect | undefined;
    let sampleCommentContainerId: string | undefined;
    if (commentNodes.length > 0) {
      const sample = commentNodes[0];
      if (sample?.id) {
        sampleCommentContainerId = sample.id;
        try {
          const anchor = await verifyAnchorByContainerId(
            sample.id,
            profile,
            serviceUrl,
            '2px solid #00ff00',
            2000,
          );
          if (anchor.found && anchor.rect) {
            sampleCommentRect = anchor.rect;
            log(`sample comment rect: ${JSON.stringify(anchor.rect)}`);
          } else {
            const primarySelector = await safeGetPrimarySelectorById(getPrimarySelectorByContainerId, sample.id);
            const fallbackSelectors = [
              primarySelector || '',
              '.comments-el .comment-item',
              '.comment-list .comment-item',
              '.comments-container .comment-item',
              '.comment-item',
            ];
            const fallbackRect = await locateRectBySelectors(fallbackSelectors);
            if (fallbackRect) sampleCommentRect = fallbackRect;
          }
        } catch {
          // ignore
        }
      }
    }

    const itemSelector = await safeGetPrimarySelectorById(getPrimarySelectorByContainerId, commentItemContainerId) || '.comment-item';
    const rawExtractors = await getContainerExtractorsById(commentItemContainerId);
    const extractors = stripExtractorDefs(rawExtractors);

    const rootSelectors = [
      (await safeGetPrimarySelectorById(getPrimarySelectorByContainerId, commentSectionId)) || '',
      '.comments-el',
      '.comment-list',
      '.comments-container',
      '[class*="comment-section"]',
    ].filter((s) => s && typeof s === 'string');

    const scrollRootSelectors =
      rootSelectors.length > 0
        ? Array.from(new Set([...rootSelectors, 'html', 'body']))
        : ['.comments-el', '.comment-list', '.comments-container', 'html', 'body'];

    const focusPoint = buildFocusPoint(commentSectionRect);

    if (ensureLatestTab) {
      await trySelectLatestTab();
    }

    // 滚动回顶部（仅在该 tab 第一次抓取时执行，避免重复回顶导致“永远只抽到前 50 条”）
    if (startFromTop) {
      const end0 = await getCommentEndState(controllerUrl, profile).catch((): any => null);
      if (end0?.emptyStateVisible) {
        log('empty_state visible before scroll_to_top; skip scroll_to_top');
      } else {
        try {
          await systemClickAt(profile, focusPoint.x, focusPoint.y, browserServiceUrl, 'scroll_to_top');
          for (let i = 0; i < 24; i += 1) {
            const s = await scrollStats(scrollRootSelectors);
            if (!s.found || s.atTop) break;
            await systemWheel(-(360 + Math.floor(Math.random() * 220)), focusPoint);
            await new Promise((r) => setTimeout(r, 450 + Math.random() * 350));
          }
        } catch (e: any) {
          const msg = String(e?.message || e || '');
          if (msg.includes('captcha_modal_detected') || msg.includes('unsafe_click_image_in_detail')) {
            throw e;
          }
          // 非关键错误不影响后续抽取：保留日志即可
          warn(`scroll_to_top ignored error: ${msg}`);
        }
      }
    }

    const comments: Array<Record<string, any>> = [];
    const seenKeys = new Set<string>(
      Array.isArray(seedSeenKeys) ? seedSeenKeys.filter((k) => typeof k === 'string') : [],
    );
    const maxNew =
      typeof maxNewComments === 'number' && Number.isFinite(maxNewComments) && maxNewComments > 0
        ? Math.floor(maxNewComments)
        : null;
    let stoppedByMaxNew = false;

    const showMoreSelector = await safeGetPrimarySelectorById(getPrimarySelectorByContainerId, showMoreContainerId);

    // 循环抽取
    let noEffectStreak = 0;
    let lastScrollTop: number | null = null;
    let recoveries = 0;
    let emptyDetectTries = 0;

    for (let round = 0; round < maxRounds; round += 1) {
      try {
        // 先展开视口内回复（只读查找 + 系统点击）
        await expandRepliesInView({
          controllerUrl,
          profile,
          browserServiceUrl,
          // 详情页同屏可能有多个“展开更多”按钮；这里要尽量展开干净，避免漏掉可见回复
          // 每次点击都会重算目标坐标，避免布局变化导致点偏
          maxTargets: 6,
          recomputeEachClick: true,
          focusPoint,
          showMoreContainerId,
          showMoreSelector,
          logPrefix,
          round,
        });

        // 提取当前视口内评论
        await extractCommentsOnce({
          rootSelectors,
          itemSelector,
          extractors,
          seenKeys,
          out: comments,
        });
      } catch (e: any) {
        const msg = String(e?.message || e || '');
        if (msg.includes('captcha_modal_detected') || msg.includes('unsafe_click_image_in_detail')) {
          throw e;
        }
        warn(`round=${round} extract/expand error: ${msg}`);
      }

      // 多 tab 渐进式：本次新增达到上限就停止（留在当前位置，下一次切回该 tab 继续）
      if (maxNew && comments.length >= maxNew) {
        stoppedByMaxNew = true;
        break;
      }

      // 空评论兜底：如果没有抽到任何 comment_item，优先用 empty_state 容器确认
      if (comments.length === 0) {
        try {
          const emptyAnchor = await verifyAnchorByContainerId(
            emptyStateContainerId,
            profile,
            serviceUrl,
            '2px dashed #9c27b0',
            900,
          );
          if (emptyAnchor?.found && emptyAnchor.rect) {
            return {
              success: true,
              comments: [],
              reachedEnd: true,
              emptyState: true,
              anchor: {
                commentSectionContainerId: commentSectionId,
                commentSectionRect,
                endMarkerContainerId: emptyStateContainerId,
                endMarkerRect: emptyAnchor.rect as Rect,
                verified: Boolean(commentSectionRect),
              },
            };
          }
        } catch {
          // ignore
        }
        if (emptyDetectTries < 2) {
          emptyDetectTries += 1;
          await tryActivateCommentsUi(`no_comments_try_${emptyDetectTries}`);
          await new Promise((r) => setTimeout(r, 900));
        }
      }

      const stats = await scrollStats(scrollRootSelectors);
      const endState = await getCommentEndState(controllerUrl, profile);

      if (round % 20 === 0) {
        log(
          `round=${round} comments=${comments.length} scrollTop=${stats.scrollTop}/${stats.scrollHeight} endMarker=${endState.endMarkerVisible} empty=${endState.emptyStateVisible}`,
        );
      }

      // 终止条件：严格仅以 end_marker / empty_state 为准
      if (endState.endMarkerVisible || endState.emptyStateVisible) {
        break;
      }

      if (stats.found) {
        if (lastScrollTop !== null && Math.abs(stats.scrollTop - lastScrollTop) < 2) {
          noEffectStreak += 1;
        } else {
          noEffectStreak = 0;
        }
        lastScrollTop = stats.scrollTop;
      } else {
        noEffectStreak += 1;
      }

      if (noEffectStreak >= 2) {
        recoveries += 1;
        warn(`scroll stuck (streak=${noEffectStreak}), recovery #${recoveries}: rollback then down`);
        try {
          await systemClickAt(profile, focusPoint.x, focusPoint.y, browserServiceUrl, 'scroll_recovery');
        } catch (e: any) {
          const msg = String(e?.message || e || '');
          if (msg.includes('captcha_modal_detected') || msg.includes('unsafe_click_image_in_detail')) throw e;
        }

        // 回滚（向上）2 次，再向下 3 次
        for (let k = 0; k < 2; k += 1) {
          try {
            await systemWheel(-(320 + Math.floor(Math.random() * 160)), focusPoint, 'expand_scroll_recovery_up');
          } catch (e: any) {
            const msg = String(e?.message || e || '');
            if (msg.includes('captcha_modal_detected')) throw e;
          }
          await new Promise((r) => setTimeout(r, 500 + Math.random() * 400));
        }
        for (let k = 0; k < 3; k += 1) {
          try {
            await systemWheel(540 + Math.floor(Math.random() * 220), focusPoint, 'expand_scroll_recovery_down');
          } catch (e: any) {
            const msg = String(e?.message || e || '');
            if (msg.includes('captcha_modal_detected')) throw e;
          }
          await new Promise((r) => setTimeout(r, 600 + Math.random() * 450));
        }

        noEffectStreak = 0;
        // 避免无穷恢复
        if (recoveries >= 6) break;
      }

      const deltaY = 520 + Math.floor(Math.random() * 260);
      try {
        await systemWheel(deltaY, focusPoint, 'expand_scroll');
      } catch (e: any) {
        const msg = String(e?.message || e || '');
        if (msg.includes('captcha_modal_detected')) throw e;
        warn(`systemWheel failed: ${msg}`);
      }
      await new Promise((r) => setTimeout(r, 650 + Math.random() * 650));
    }

    // 补齐最后一屏：
    // - 单 tab“抓完”模式需要补齐
    // - 多 tab “maxNewComments” 分批模式不补齐，避免一次超过上限
    if (!stoppedByMaxNew) {
      try {
        await extractCommentsOnce({
          rootSelectors,
          itemSelector,
          extractors,
          seenKeys,
          out: comments,
        });
      } catch {
        // ignore
      }
    }

    // 4. 检查终止条件
    const endMarker = findContainer(effectiveTree, /xiaohongshu_detail\.comment_section\.end_marker$/);
    let endMarkerRect: Rect | undefined;
    let endMarkerContainerId: string | undefined;
    let endMarkerHit = false;
    let emptyStateHit = false;
    let endMarkerText: string | undefined;

    if (endMarker?.id && comments.length > 0) {
      endMarkerContainerId = endMarker.id;
      try {
        const primarySelector = await safeGetPrimarySelectorById(getPrimarySelectorByContainerId, endMarker.id);
        const anchor = await verifyAnchorByContainerId(
          endMarker.id,
          profile,
          serviceUrl,
          '2px solid #ff8c00',
          2000,
        );
        if (anchor.found && anchor.rect) {
          endMarkerRect = anchor.rect;
          endMarkerHit = true;
          log(`end_marker rect: ${JSON.stringify(anchor.rect)}`);
          endMarkerText = (await readEndMarkerTextBySelector(primarySelector)) || undefined;
        } else {
          const fallbackRect = await resolveEndMarkerRectViaSelectors(primarySelector);
          if (fallbackRect) {
            const vp = await getViewport(controllerUrl, profile);
            const innerH = vp.innerHeight || 0;
            const ok = innerH ? fallbackRect.y > innerH * 0.55 : true;
            if (ok) {
              endMarkerRect = fallbackRect;
              endMarkerHit = true;
            }
          }
          endMarkerText = (await readEndMarkerTextBySelector(primarySelector)) || undefined;
        }
      } catch {
        // ignore
      }
    } else if (emptyStateNode?.id && comments.length === 0) {
      endMarkerContainerId = emptyStateNode.id;
      try {
        const anchor = await verifyAnchorByContainerId(
          emptyStateNode.id,
          profile,
          serviceUrl,
          '2px dashed #888888',
          2000,
        );
        if (anchor.found && anchor.rect) {
          endMarkerRect = anchor.rect;
          emptyStateHit = true;
          log(`empty_state rect: ${JSON.stringify(anchor.rect)}`);
          endMarkerText = (await readEndMarkerTextBySelector(emptyStateNode.id)) || undefined;
        }
      } catch {
        // ignore
      }
    }

    let verified = false;
    if (commentSectionRect) {
      const sectionOk = commentSectionRect.height > 0;
      const sampleOk = comments.length > 0 ? !!(sampleCommentRect && sampleCommentRect.height > 0) : true;
      const endOk = endMarkerRect ? endMarkerRect.height > 0 : true;
      verified = sectionOk && sampleOk && endOk;
    }

    const reachedEnd =
      comments.length === 0
        ? Boolean(emptyStateHit && endMarkerRect)
        : Boolean(endMarkerHit && endMarkerRect);

    return {
      success: true,
      comments,
      reachedEnd,
      emptyState: comments.length === 0 && Boolean(emptyStateHit && endMarkerRect),
      stoppedByMaxNew,
      anchor: {
        commentSectionContainerId: commentSectionId,
        commentSectionRect,
        sampleCommentContainerId,
        sampleCommentRect,
        endMarkerContainerId,
        endMarkerRect,
        verified
      }
    };

  } catch (error: any) {
    return {
      success: false,
      comments: [],
      reachedEnd: false,
      emptyState: false,
      error: `ExpandComments failed: ${error.message}`
    };
  }
}
