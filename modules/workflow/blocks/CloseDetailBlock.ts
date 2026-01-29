/**
 * Workflow Block: CloseDetailBlock
 *
 * 关闭详情页（严格模式：只按 ESC，失败即停）
 */

import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { verifyAnchorByContainerId } from './helpers/containerAnchors.js';
import { isDebugArtifactsEnabled } from './helpers/debugArtifacts.js';
import {
  logControllerActionError,
  logControllerActionResult,
  logControllerActionStart,
} from './helpers/operationLogger.js';

// 调试截图保存目录
const DEBUG_ENABLED = isDebugArtifactsEnabled();
const DEBUG_SCREENSHOT_DIR = DEBUG_ENABLED
  ? path.join(os.homedir(), '.webauto', 'logs', 'debug-screenshots')
  : '';

/**
 * 保存调试截图（复用 OpenDetailBlock 的逻辑）
 */
async function saveDebugScreenshot(
  kind: string,
  sessionId: string,
  meta: Record<string, any> = {},
): Promise<{ pngPath?: string; jsonPath?: string }> {
  if (!DEBUG_ENABLED) return {};
  try {
    await fs.mkdir(DEBUG_SCREENSHOT_DIR, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const base = `${ts}-${kind}-${sessionId}`;
    const pngPath = path.join(DEBUG_SCREENSHOT_DIR, `${base}.png`);
    const jsonPath = path.join(DEBUG_SCREENSHOT_DIR, `${base}.json`);

    // 截图
    async function takeShot(): Promise<any> {
      const response = await fetch('http://127.0.0.1:7701/v1/controller/action', {
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

    console.log(`[CloseDetail][debug] saved ${kind}: ${pngPath}`);
    return { pngPath: b64 ? pngPath : undefined, jsonPath };
  } catch {
    return {};
  }
}

export interface CloseDetailInput {
  sessionId: string;
  serviceUrl?: string;
  debugDir?: string;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CloseDetailOutput {
  success: boolean;
  method: 'close_button' | 'esc_key' | 'browser_back_key' | 'history_back' | 'mask_click' | 'unknown';
  anchor?: {
    detailContainerId?: string;
    detailRect?: Rect;
    searchListContainerId?: string;
    searchListRect?: Rect;
    verified?: boolean;
  };
  error?: string;
}

/**
 * 关闭详情页
 *
 * @param input - 输入参数
 * @returns Promise<CloseDetailOutput>
 */
export async function execute(input: CloseDetailInput): Promise<CloseDetailOutput> {
  const {
    sessionId,
    serviceUrl = 'http://127.0.0.1:7701'
  } = input;

  const profile = sessionId;
  const controllerUrl = `${serviceUrl}/v1/controller/action`;
  const logDir = path.join(os.homedir(), '.webauto', 'logs', 'close-detail');
  const DETAIL_CONTAINER_ID = 'xiaohongshu_detail.modal_shell';
  const SEARCH_LIST_CONTAINER_ID = 'xiaohongshu_search.search_result_list';

  async function sleep(ms: number): Promise<void> {
    await new Promise((r) => setTimeout(r, ms));
  }

  async function getCurrentUrl(): Promise<string> {
    const res = await controllerAction('browser:execute', {
      profile,
      script: 'location.href',
    });
    return (res?.result ?? res?.data?.result ?? '') as string;
  }

  async function controllerAction(action: string, payload: any = {}) {
    const opId = logControllerActionStart(action, payload, { source: 'CloseDetailBlock' });
    try {
      const response = await fetch(controllerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, payload }),
        signal: (AbortSignal as any).timeout ? (AbortSignal as any).timeout(20000) : undefined,
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }
      const data = await response.json().catch(() => ({}));
      const result = (data as any).data || data;
      logControllerActionResult(opId, action, result, { source: 'CloseDetailBlock' });
      return result;
    } catch (error) {
      logControllerActionError(opId, action, error, payload, { source: 'CloseDetailBlock' });
      throw error;
    }
  }

  async function captureFailureScreenshot(tag: string): Promise<string | null> {
    if (!DEBUG_ENABLED) return null;
    try {
      const shot = await controllerAction('browser:screenshot', { profileId: profile, fullPage: false });
      const b64 =
        (shot as any)?.data?.data ??
        (shot as any)?.data?.body?.data ??
        (shot as any)?.body?.data ??
        (shot as any)?.result?.data ??
        (shot as any)?.result ??
        (shot as any)?.data ??
        shot;
      if (typeof b64 !== 'string' || b64.length < 10) return null;
      await fs.mkdir(logDir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const file = path.join(logDir, `${stamp}_${profile}_${tag}.png`);
      await fs.writeFile(file, Buffer.from(b64, 'base64'));
      return file;
    } catch {
      return null;
    }
  }

  try {
    // 记录初始 Tab 状态
    const beforeTabs: Array<{ index: number; url: string }> = await controllerAction('browser:page:list', { profileId: profile })
      .then((r: any) => r?.pages || [])
      .catch((): Array<{ index: number; url: string }> => []);

    // 只允许 ESC：但 ESC 在某些状态下（例如输入框聚焦/视频层）可能只会关闭子层，需要多按几次。
    // 仍然不做任何其它方式的"兜底关闭"，仅做 ESC 重试与证据落盘。
    const maxAttempts = 3;
    for (let i = 1; i <= maxAttempts; i += 1) {
      // ESC 前截屏
      await saveDebugScreenshot(`before_esc_attempt_${i}`, profile, {
        attempt: i,
        maxAttempts,
        tabsBefore: beforeTabs.length,
      });

      await controllerAction('keyboard:press', { profileId: profile, key: 'Escape' });
      await sleep(900);

      const url = await getCurrentUrl();
      const detailAnchor = await verifyAnchorByContainerId(
        DETAIL_CONTAINER_ID,
        profile,
        serviceUrl,
        '2px solid #ff00aa',
        350,
      ).catch(() => ({ found: false, highlighted: false } as any));

      const listAnchor = await verifyAnchorByContainerId(
        SEARCH_LIST_CONTAINER_ID,
        profile,
        serviceUrl,
        '2px solid #00bbff',
        350,
      ).catch(() => ({ found: false, highlighted: false } as any));

      const inSearchResult = url.includes('/search_result');
      const detailGone = !detailAnchor?.found;

      if (inSearchResult && listAnchor?.found && detailGone) {
        return {
          success: true,
          method: 'esc_key',
          anchor: {
            detailContainerId: DETAIL_CONTAINER_ID,
            detailRect: detailAnchor?.rect,
            searchListContainerId: SEARCH_LIST_CONTAINER_ID,
            searchListRect: listAnchor?.rect,
            verified: true,
          },
        };
      }

      const shot = await captureFailureScreenshot(`close_detail_attempt_${i}`);

      // 继续下一次 ESC 前给页面一点时间稳定
      await sleep(650);

      if (i === maxAttempts) {
        return {
          success: false,
          method: 'unknown',
          anchor: {
            detailContainerId: DETAIL_CONTAINER_ID,
            detailRect: detailAnchor?.rect,
            searchListContainerId: SEARCH_LIST_CONTAINER_ID,
            searchListRect: listAnchor?.rect,
            verified: false,
          },
          error: `CloseDetail failed after ${maxAttempts} ESC: url=${url || 'unknown'} inSearchResult=${inSearchResult} listFound=${Boolean(listAnchor?.found)} detailFound=${Boolean(detailAnchor?.found)} screenshot=${shot || 'none'}`,
        };
      }
    }
    return { success: false, method: 'unknown', error: 'CloseDetail unreachable' };
  } catch (err: any) {
    const shot = await captureFailureScreenshot('close_detail_threw');
    return {
      success: false,
      method: 'unknown',
      error: `CloseDetail failed: ${err?.message || String(err)} screenshot=${shot || 'none'}`,
    };
  }
}
