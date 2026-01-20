/**
 * Workflow Block: CloseDetailBlock
 *
 * 关闭详情页（严格模式：只按 ESC，失败即停）
 */

import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { verifyAnchorByContainerId } from './helpers/containerAnchors.js';

export interface CloseDetailInput {
  sessionId: string;
  serviceUrl?: string;
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

  async function getCurrentUrl(): Promise<string> {
    const res = await controllerAction('browser:execute', {
      profile,
      script: 'location.href',
    });
    return (res?.result ?? res?.data?.result ?? '') as string;
  }

  async function controllerAction(action: string, payload: any = {}) {
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
    return (data as any).data || data;
  }

  async function captureFailureScreenshot(tag: string): Promise<string | null> {
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
    // 1) 按 ESC（系统级）
    await controllerAction('keyboard:press', { profileId: profile, key: 'Escape' });
    await new Promise((r) => setTimeout(r, 1500));

    // 2) 必须回到搜索列表（不做任何兜底返回/重试）
    const url = await getCurrentUrl();
    const listAnchor = await verifyAnchorByContainerId(
      'xiaohongshu_search.search_result_list',
      profile,
      serviceUrl,
      '2px solid #00bbff',
      800,
    ).catch(() => ({ found: false, highlighted: false } as any));

    if (!url.includes('/search_result') || !listAnchor?.found) {
      const shot = await captureFailureScreenshot('close_detail_failed');
      return {
        success: false,
        method: 'unknown',
        anchor: {
          searchListContainerId: 'xiaohongshu_search.search_result_list',
          searchListRect: listAnchor?.rect,
          verified: false,
        },
        error: `CloseDetail failed: url=${url || 'unknown'} listFound=${Boolean(listAnchor?.found)} screenshot=${shot || 'none'}`,
      };
    }

    return {
      success: true,
      method: 'esc_key',
      anchor: {
        searchListContainerId: 'xiaohongshu_search.search_result_list',
        searchListRect: listAnchor?.rect,
        verified: true,
      },
    };
  } catch (err: any) {
    const shot = await captureFailureScreenshot('close_detail_threw');
    return {
      success: false,
      method: 'unknown',
      error: `CloseDetail failed: ${err?.message || String(err)} screenshot=${shot || 'none'}`,
    };
  }
}
