/**
 * Workflow Block: StartBrowserService
 *
 * 确保浏览器服务可用
 */

export interface StartBrowserServiceInput {
  host?: string;
  port?: number;
  wsPort?: number;
}

export interface StartBrowserServiceOutput {
  status: 'connected' | 'error';
  host: string;
  port: number;
  wsPort: number;
  service: string;
  timestamp: string;
  error?: string;
}

/**
 * 确保浏览器服务可用
 *
 * @param input - 输入参数
 * @returns Promise<StartBrowserServiceOutput>
 */
export async function execute(input: StartBrowserServiceInput): Promise<StartBrowserServiceOutput> {
  const { host = '127.0.0.1', port = 7704, wsPort = 8765 } = input;
  const healthUrl = `http://${host}:${port}/health`;

  try {
    const response = await fetch(healthUrl);
    if (!response.ok) {
      throw new Error(`Browser Service returned ${response.status}`);
    }
    const data = await response.json();

    if (!data.ok) {
      throw new Error('Browser Service health check failed');
    }

    return {
      status: 'connected',
      host,
      port,
      wsPort,
      service: 'browser-service',
      timestamp: new Date().toISOString()
    };
  } catch (error: any) {
    return {
      status: 'error',
      host,
      port,
      wsPort,
      service: 'browser-service',
      timestamp: new Date().toISOString(),
      error: `Browser Service not available at ${healthUrl}: ${error.message}`
    };
  }
}
