/**
 * expandCommentsController.ts
 *
 * ExpandComments 专用的 controller 调用封装
 */

export interface ExpandCommentsControllerConfig {
  profile: string;
  controllerUrl: string;
}

export interface ExpandCommentsControllerClient {
  controllerAction(action: string, payload?: any): Promise<any>;
  getCurrentUrl(): Promise<string>;
}

/**
 * 创建 ExpandComments Controller 客户端
 */
export function createExpandCommentsControllerClient(
  config: ExpandCommentsControllerConfig,
): ExpandCommentsControllerClient {
  const { profile, controllerUrl } = config;

  async function controllerAction(action: string, payload: any = {}): Promise<any> {
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
    return data.data || data;
  }

  async function getCurrentUrl(): Promise<string> {
    const response = await fetch(controllerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'browser:execute',
        payload: {
          profile,
          script: 'location.href',
        },
      }),
    });
    const data = await response.json();
    return data.data?.result || data.result || '';
  }

  return { controllerAction, getCurrentUrl };
}
