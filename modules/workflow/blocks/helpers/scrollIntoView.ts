/**
 * Scroll Into View Helper
 *
 * 在点击元素前将其滚动到视口可见区域，避免点击视口外元素失败
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

/**
 * 将元素滚动到视口可见区域
 * 
 * @param options - 滚动选项
 * @returns Promise<ScrollIntoViewResult>
 */
export async function scrollIntoView(options: ScrollIntoViewOptions): Promise<ScrollIntoViewResult> {
  const {
    sessionId,
    serviceUrl = 'http://127.0.0.1:7701',
    selector,
    coordinates,
    block = 'center',
    behavior = 'instant',
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

  try {
    // 构建脚本：根据 selector 或 coordinates 查找元素并滚动
    const script = selector
      ? `(() => {
          const selector = ${JSON.stringify(selector)};
          const el = document.querySelector(selector);
          if (!el || !(el instanceof HTMLElement)) {
            return { success: false, visible: false, error: 'Element not found' };
          }
          
          // 滚动到视口中心
          try {
            el.scrollIntoView({ behavior: '${behavior}', block: '${block}' });
          } catch (e) {
            return { success: false, visible: false, error: 'scrollIntoView failed: ' + e.message };
          }
          
          // 等待一小段时间让滚动完成
          const rect = el.getBoundingClientRect();
          const viewportH = window.innerHeight || 0;
          const visible = rect.top >= 0 && rect.top < viewportH;
          
          return {
            success: true,
            visible,
            rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
          };
        })()`
      : coordinates
      ? `(() => {
          const x = ${JSON.stringify(coordinates.x)};
          const y = ${JSON.stringify(coordinates.y)};
          const el = document.elementFromPoint(x, y);
          if (!el || !(el instanceof HTMLElement)) {
            return { success: false, visible: false, error: 'No element at coordinates' };
          }
          
          // 滚动到视口中心
          try {
            el.scrollIntoView({ behavior: '${behavior}', block: '${block}' });
          } catch (e) {
            return { success: false, visible: false, error: 'scrollIntoView failed: ' + e.message };
          }
          
          // 等待一小段时间让滚动完成
          const rect = el.getBoundingClientRect();
          const viewportH = window.innerHeight || 0;
          const visible = rect.top >= 0 && rect.top < viewportH;
          
          return {
            success: true,
            visible,
            rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
          };
        })()`
      : `(() => { return { success: false, visible: false, error: 'No selector or coordinates provided' }; })()`;

    const result = await controllerAction('browser:execute', {
      profile: sessionId,
      script,
    });

    const payload = result?.result || result;

    if (!payload?.success) {
      return {
        success: false,
        visible: false,
        error: payload?.error || 'Scroll into view failed',
      };
    }

    return {
      success: true,
      visible: payload.visible ?? false,
      rect: payload.rect,
    };
  } catch (error: any) {
    return {
      success: false,
      visible: false,
      error: `scrollIntoView failed: ${error.message}`,
    };
  }
}

/**
 * 通过坐标点滚动元素到视口
 * 
 * @param profileId - 会话ID
 * @param x - X坐标
 * @param y - Y坐标  
 * @param serviceUrl - 服务URL
 * @returns Promise<ScrollIntoViewResult>
 */
export async function scrollElementAtPointIntoView(
  profileId: string,
  x: number,
  y: number,
  serviceUrl = 'http://127.0.0.1:7701',
): Promise<ScrollIntoViewResult> {
  return scrollIntoView({
    sessionId: profileId,
    serviceUrl,
    coordinates: { x, y },
    block: 'center',
    behavior: 'instant',
  });
}
