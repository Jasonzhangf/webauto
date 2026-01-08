/**
 * RemoteBrowserSession - 远程浏览器会话适配器
 *
 * 作用：让 Unified API (7701) 能够代理对 Browser Service (7704) 的调用
 * 核心职责：通过 HTTP 与 Browser Service 通信，模拟本地 BrowserSession 接口
 */

import { fetch } from 'undici';

export interface RemoteSessionOptions {
  sessionId: string;
  browserServiceUrl: string; // http://127.0.0.1:7704
}

/**
 * 远程浏览器会话代理
 *
 * 实现与 BrowserSession 兼容的接口，但所有操作都通过 HTTP 转发到 Browser Service
 */
export class RemoteBrowserSession {
  private sessionId: string;
  private baseUrl: string;
  private lastKnownUrl: string | null = null;

  constructor(options: RemoteSessionOptions) {
    this.sessionId = options.sessionId;
    this.baseUrl = options.browserServiceUrl;
  }

  get id(): string {
    return this.sessionId;
  }

  get currentPage(): any {
    return this.createPageProxy();
  }

  private createPageProxy(): any {
    return {
      evaluate: async (fn: any, ...args: any[]) => {
        return this.evaluate(fn.toString(), ...args);
      },
      url: () => this.getCurrentUrl() || '',
      mouse: {
        move: async (x: number, y: number, options?: any) => {
          return this.sendCommand('mouseMove', { x, y, ...options });
        },
        click: async (x: number, y: number, options?: any) => {
          return this.sendCommand('mouseClick', { x, y, ...options });
        }
      }
    };
  }

  async ensurePage(url?: string): Promise<any> {
    if (url) {
      await this.goto(url);
    }
    return this.createPageProxy();
  }

  private async sendCommand(action: string, args?: any): Promise<any> {
    const url = `${this.baseUrl}/command`;
    const payload = {
      action,
      args: {
        profileId: this.sessionId,
        ...args
      }
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Browser Service command failed: ${response.statusText}`);
    }

    const result: any = await response.json();

    // Browser Service 使用 { ok: boolean, body?: any, error?: string } 结构，
    // 旧代码使用 { success: boolean, data?: any, error?: string }。
    const isError =
      result?.success === false ||
      result?.ok === false;

    if (isError) {
      // 打印原始返回，便于定位协议不一致问题
      // 注意：这里是 Unified API 侧日志，不会泄露页面内容
      // eslint-disable-next-line no-console
      console.error('[RemoteBrowserSession] sendCommand error payload', action, result);
      throw new Error(result.error || 'Unknown error');
    }

    // 统一返回 data/body/result 中的有效字段
    if (result.data !== undefined) return result.data;
    if (result.body !== undefined) return result.body;
    if (result.result !== undefined) return result.result;
    return result;
  }

  async goto(url: string): Promise<void> {
    await this.sendCommand('goto', { url });
    this.lastKnownUrl = url;
  }

  getCurrentUrl(): string | null {
    return this.lastKnownUrl;
  }

  async evaluate(expression: string, arg?: any): Promise<any> {
    const script = typeof expression === 'function'
      ? `(${expression.toString()})(${JSON.stringify(arg)})`
      : expression;

    return this.sendCommand('evaluate', { script });
  }

  async screenshot(fullPage = true): Promise<Buffer> {
    const result = await this.sendCommand('screenshot', { fullPage });
    if (typeof result === 'string') {
      return Buffer.from(result, 'base64');
    }
    return result;
  }

  async click(selector: string): Promise<void> {
    await this.sendCommand('click', { selector });
  }

  async fill(selector: string, text: string): Promise<void> {
    await this.sendCommand('fill', { selector, text });
  }

  async getCookies(): Promise<any[]> {
    return this.sendCommand('getCookies');
  }

  async saveCookiesToFile(filePath: string): Promise<{ path: string; count: number }> {
    return this.sendCommand('saveCookies', { path: filePath });
  }

  async saveCookiesIfStable(filePath: string, opts: { minDelayMs?: number } = {}): Promise<{ path: string; count: number } | null> {
    return this.sendCommand('saveCookiesIfStable', { path: filePath, ...opts });
  }

  async injectCookiesFromFile(filePath: string): Promise<{ count: number }> {
    return this.sendCommand('loadCookies', { path: filePath });
  }

  async getInfo(): Promise<any> {
    return this.sendCommand('getStatus');
  }

  async close(): Promise<void> {
    await this.sendCommand('stop');
  }

  setMode(mode: string): void {
    this.sendCommand('setMode', { mode }).catch(() => {
      // ignore unsupported command
    });
  }

  addRuntimeEventObserver(_observer: (event: any) => void): () => void {
    console.warn('[RemoteBrowserSession] addRuntimeEventObserver not implemented');
    return () => {};
  }

  get modeName(): 'dev' | 'run' {
    return 'dev';
  }
}
