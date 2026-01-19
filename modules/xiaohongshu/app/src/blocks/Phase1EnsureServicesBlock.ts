/**
 * Phase 1 Block: 确保基础服务就绪
 */

export interface EnsureServicesInput {
  unifiedApiUrl?: string;
  browserServiceUrl?: string;
  timeout?: number;
}

export interface EnsureServicesOutput {
  unifiedApiOk: boolean;
  browserServiceOk: boolean;
  unifiedApiUrl: string;
  browserServiceUrl: string;
}

export async function execute(input: EnsureServicesInput = {}): Promise<EnsureServicesOutput> {
  const {
    unifiedApiUrl = 'http://127.0.0.1:7701',
    browserServiceUrl = 'http://127.0.0.1:7704',
    timeout = 5000,
  } = input;

  console.log('[Phase1EnsureServices] 检查服务状态...');

  let unifiedApiOk = false;
  try {
    const res = await fetch(`${unifiedApiUrl}/health`, {
      signal: AbortSignal.timeout(timeout),
    });
    unifiedApiOk = res.ok;
    console.log(`[Phase1] Unified API: ${unifiedApiOk ? '✅' : '❌'}`);
  } catch (err: any) {
    console.warn(`[Phase1] Unified API 不可达: ${err?.message || String(err)}`);
  }

  let browserServiceOk = false;
  try {
    const res = await fetch(`${browserServiceUrl}/health`, {
      signal: AbortSignal.timeout(timeout),
    });
    browserServiceOk = res.ok;
    console.log(`[Phase1] Browser Service: ${browserServiceOk ? '✅' : '❌'}`);
  } catch (err: any) {
    console.warn(`[Phase1] Browser Service 不可达: ${err?.message || String(err)}`);
  }

  return {
    unifiedApiOk,
    browserServiceOk,
    unifiedApiUrl,
    browserServiceUrl,
  };
}
