/**
 * Scroll Into View Helper
 */

import {
  logControllerActionError,
  logControllerActionResult,
  logControllerActionStart,
} from './operationLogger.js';

export interface ScrollIntoViewOptions {
  sessionId: string;
  serviceUrl?: string;
  selector?: string;
  coordinates?: { x: number; y: number };
  block?: 'start' | 'center' | 'end' | 'nearest';
  behavior?: 'auto' | 'instant' | 'smooth';
  maxSteps?: number;
  scrollSettleMs?: number;
  viewportMargin?: number;
}

export interface ScrollIntoViewResult {
  success: boolean;
  visible: boolean;
  rect?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  error?: string;
}

export async function scrollIntoView(options: ScrollIntoViewOptions): Promise<ScrollIntoViewResult> {
  const {
    sessionId,
    serviceUrl = 'http://127.0.0.1:7701',
    selector,
    coordinates,
    maxSteps,
    scrollSettleMs,
    viewportMargin,
  } = options;

  const controllerUrl = `${serviceUrl}/v1/controller/action`;

  async function controllerAction(action: string, payload: any): Promise<any> {
    const opId = logControllerActionStart(action, payload, { source: 'scrollIntoView' });
    try {
      const response = await fetch(controllerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, payload }),
        signal: (AbortSignal as any).timeout ? (AbortSignal as any).timeout(8000) : undefined,
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }
      const data = await response.json();
      const result = data.data || data;
      logControllerActionResult(opId, action, result, { source: 'scrollIntoView' });
      return result;
    } catch (error) {
      logControllerActionError(opId, action, error, payload, { source: 'scrollIntoView' });
      throw error;
    }
  }

  if (!selector) {
    return {
      success: false,
      visible: false,
      error: coordinates ? 'scroll_into_view_requires_selector' : 'selector_required',
    };
  }

  try {
    const result = await controllerAction('scroll_into_view', {
      profileId: sessionId,
      selector,
      ...(Number.isFinite(maxSteps) ? { maxSteps } : {}),
      ...(Number.isFinite(scrollSettleMs) ? { scrollSettleMs } : {}),
      ...(Number.isFinite(viewportMargin) ? { viewportMargin } : {}),
    });

    const payload = (result as any)?.data ?? result;
    const target = payload?.data?.target ?? payload?.target ?? payload?.result?.target ?? null;
    if (!target || !target.rect || !target.viewport) {
      return {
        success: false,
        visible: false,
        error: payload?.error || 'scroll_into_view_failed',
      };
    }

    const rect = target.rect as { top?: number; left?: number; width?: number; height?: number; x?: number; y?: number };
    const viewport = target.viewport as { width?: number; height?: number };
    const vw = Number(viewport.width || 0);
    const vh = Number(viewport.height || 0);
    const left = Number(rect.left ?? rect.x ?? 0);
    const top = Number(rect.top ?? rect.y ?? 0);
    const width = Math.max(0, Number(rect.width ?? 0));
    const height = Math.max(0, Number(rect.height ?? 0));
    const right = left + width;
    const bottom = top + height;
    const visible = vw > 0
      && vh > 0
      && right >= 0
      && bottom >= 0
      && left <= vw
      && top <= vh;

    return {
      success: true,
      visible,
      rect: { x: left, y: top, width, height },
    };
  } catch (error: any) {
    return {
      success: false,
      visible: false,
      error: `scrollIntoView failed: ${error?.message || String(error)}`,
    };
  }
}

export async function scrollElementAtPointIntoView(
  _profileId: string,
  _x: number,
  _y: number,
  _serviceUrl = 'http://127.0.0.1:7701',
): Promise<ScrollIntoViewResult> {
  return {
    success: false,
    visible: false,
    error: 'scroll_into_view_requires_selector',
  };
}
