/**
 * OpenDetailBlock Controller Helper
 *
 * 封装 OpenDetail 专用的 controller 调用
 */

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
    const response = await fetch(controllerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, payload }),
      // 防御性超时，避免 containers:match / container:operation 长时间挂起
      signal: (AbortSignal as any).timeout ? (AbortSignal as any).timeout(10000) : undefined
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
    const data = await response.json();
    return data.data || data;
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
