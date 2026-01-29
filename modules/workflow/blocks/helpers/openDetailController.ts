/**
 * OpenDetailBlock Controller Helper
 *
 * 封装 OpenDetail 专用的 controller 调用
 */

import {
  logControllerActionError,
  logControllerActionResult,
  logControllerActionStart,
} from './operationLogger.js';

export interface ControllerClientConfig {
  profile: string;
  controllerUrl: string;
}

export interface ControllerClient {
  controllerAction(action: string, payload?: any): Promise<any>;
  getCurrentUrl(): Promise<string>;
}

/**
 * 创建 OpenDetail Controller 客户端
 */
export function createOpenDetailControllerClient(config: ControllerClientConfig): ControllerClient {
  const { profile, controllerUrl } = config;

  async function controllerAction(action: string, payload: any = {}): Promise<any> {
    // OpenDetail 的 debug 截图可能较慢（页面重、资源多），这里对 screenshot 单独放宽超时。
    const timeoutMs =
      action === 'browser:screenshot'
        ? 45000
        : action === 'containers:match'
          ? 20000
          : 10000;
    const opId = logControllerActionStart(action, payload, { source: 'openDetailController' });
    try {
      const response = await fetch(controllerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, payload }),
      // 防御性超时，避免 containers:match / container:operation 长时间挂起
      signal: (AbortSignal as any).timeout ? (AbortSignal as any).timeout(timeoutMs) : undefined
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
    const data = await response.json();
    const result = data.data || data;
    logControllerActionResult(opId, action, result, { source: 'openDetailController' });
    return result;
  } catch (error) {
    logControllerActionError(opId, action, error, payload, { source: 'openDetailController' });
    throw error;
  }
  }

  async function getCurrentUrl(): Promise<string> {
    const response = await fetch(controllerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'browser:execute',
        payload: { profile, script: 'location.href' }
      }),
      signal: (AbortSignal as any).timeout ? (AbortSignal as any).timeout(5000) : undefined
    });
    const data = await response.json().catch(() => ({}));
    return data?.data?.result || data?.result || '';
  }

  return { controllerAction, getCurrentUrl };
}
