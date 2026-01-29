/**
 * Comment Section Locator Helper
 *
 * 共享定位逻辑：WarmupCommentsBlock / ExpandCommentsBlock
 * - 通过容器锚点 verifyAnchorByContainerId 获取 rect
 * - 必要时尝试点击 comment_button 激活评论区
 */

import {
  logControllerActionError,
  logControllerActionResult,
  logControllerActionStart,
} from './operationLogger.js';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CommentSectionLocateResult {
  found: boolean;
  rect?: Rect;
  error?: string;
  clickedCommentButton?: boolean;
}

export interface LocateCommentSectionOptions {
  profile: string;
  serviceUrl: string;
  controllerUrl: string;
  commentSectionContainerId: string;
  commentButtonContainerId?: string;
  canClickCommentButton: boolean;
  highlightStyle?: string;
  highlightMs?: number;
}

export interface ClickCommentButtonResult {
  clicked: boolean;
  rect?: Rect;
  error?: string;
}

export async function clickCommentButtonByContainerId(
  options: {
    profile: string;
    serviceUrl: string;
    controllerUrl: string;
    commentButtonContainerId: string;
    highlightStyle?: string;
    highlightMs?: number;
  },
): Promise<ClickCommentButtonResult> {
  const {
    profile,
    serviceUrl,
    controllerUrl,
    commentButtonContainerId,
    highlightStyle = '2px solid #ff00ff',
    highlightMs = 1200,
  } = options;

  try {
    const { verifyAnchorByContainerId } = await import('./containerAnchors.js');
    const vp = await getViewport(controllerUrl, profile);
    const btnAnchor = await verifyAnchorByContainerId(
      commentButtonContainerId,
      profile,
      serviceUrl,
      highlightStyle,
      highlightMs,
    );
    if (btnAnchor.found && btnAnchor.rect && vp.innerWidth && vp.innerHeight) {
      const bx = clamp(
        btnAnchor.rect.x + btnAnchor.rect.width / 2,
        30,
        vp.innerWidth - 30,
      );
      const by = clamp(
        btnAnchor.rect.y + btnAnchor.rect.height / 2,
        120,
        vp.innerHeight - 120,
      );
      console.log(
        `[WarmupComments] click comment_button @(${Math.floor(bx)},${Math.floor(by)})`,
      );
      const { systemClickAt } = await import('./systemInput.js');
      await systemClickAt(profile, Math.floor(bx), Math.floor(by), undefined, 'click_comment_button');
      await new Promise((r) => setTimeout(r, 800));
      return { clicked: true, rect: btnAnchor.rect };
    }
    return {
      clicked: false,
      rect: btnAnchor.rect,
      error: btnAnchor.error || 'comment_button anchor not found',
    };
  } catch (e: any) {
    return { clicked: false, error: e?.message || String(e) };
  }
}

export async function locateCommentSection(
  options: LocateCommentSectionOptions,
): Promise<CommentSectionLocateResult> {
  const {
    profile,
    serviceUrl,
    controllerUrl,
    commentSectionContainerId,
    commentButtonContainerId,
    canClickCommentButton,
    highlightStyle = '2px solid #ffaa00',
    highlightMs = 2000,
  } = options;

  const { verifyAnchorByContainerId } = await import('./containerAnchors.js');

  let clicked = false;

  const tryClickCommentButton = async (reason: string) => {
    if (!canClickCommentButton) return;
    if (!commentButtonContainerId) return;
    if (clicked) return;

    try {
      const vp = await getViewport(controllerUrl, profile);
      const btnAnchor = await verifyAnchorByContainerId(
        commentButtonContainerId,
        profile,
        serviceUrl,
        '2px solid #ff00ff',
        1200,
      );
      if (btnAnchor.found && btnAnchor.rect && vp.innerWidth && vp.innerHeight) {
        const bx = clamp(
          btnAnchor.rect.x + btnAnchor.rect.width / 2,
          30,
          vp.innerWidth - 30,
        );
        const by = clamp(
          btnAnchor.rect.y + btnAnchor.rect.height / 2,
          120,
          vp.innerHeight - 120,
        );
        console.log(
          `[WarmupComments] click comment_button (${reason}) @(${Math.floor(bx)},${Math.floor(by)})`,
        );
        const { systemClickAt } = await import('./systemInput.js');
        await systemClickAt(profile, Math.floor(bx), Math.floor(by), undefined, 'click_comment_button');
        clicked = true;
        await new Promise((r) => setTimeout(r, 800));
      }
    } catch {
      // ignore
    }
  };

  try {
    let anchor = await verifyAnchorByContainerId(
      commentSectionContainerId,
      profile,
      serviceUrl,
      highlightStyle,
      highlightMs,
    );

    if (!anchor?.found) {
      await tryClickCommentButton('comment_section_not_found');
      anchor = await verifyAnchorByContainerId(
        commentSectionContainerId,
        profile,
        serviceUrl,
        highlightStyle,
        highlightMs,
      );
    }

    if (anchor.found && anchor.rect) {
      console.log(
        `[WarmupComments] comment_section rect: ${JSON.stringify(anchor.rect)}`,
      );
      return { found: true, rect: anchor.rect, clickedCommentButton: clicked };
    }

    return {
      found: false,
      error: anchor.error || 'comment_section anchor not found',
      clickedCommentButton: clicked,
    };
  } catch (e: any) {
    return {
      found: false,
      error: `comment_section anchor verify error: ${e?.message || e}`,
      clickedCommentButton: clicked,
    };
  }
}

async function controllerAction(
  controllerUrl: string,
  action: string,
  payload: any = {},
) {
  const opId = logControllerActionStart(action, payload, { source: 'commentSectionLocator' });
  try {
    const response = await fetch(controllerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, payload }),
      signal: (AbortSignal as any).timeout
        ? (AbortSignal as any).timeout(10000)
        : undefined,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
    const data = await response.json();
    const result = data.data || data;
    logControllerActionResult(opId, action, result, { source: 'commentSectionLocator' });
    return result;
  } catch (error) {
    logControllerActionError(opId, action, error, payload, { source: 'commentSectionLocator' });
    throw error;
  }
}

async function getViewport(controllerUrl: string, profile: string) {
  try {
    const result = await controllerAction(controllerUrl, 'browser:execute', {
      profile,
      script: '(() => ({ w: window.innerWidth || 0, h: window.innerHeight || 0 }))()',
    });
    const payload = (result as any).result || (result as any).data?.result || result;
    return { innerWidth: Number(payload?.w || 0), innerHeight: Number(payload?.h || 0) };
  } catch {
    return { innerWidth: 0, innerHeight: 0 };
  }
}

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}
