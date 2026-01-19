/**
 * Phase 3-4 Block: 关闭详情页（返回搜索页）
 *
 * 职责：从详情页安全返回搜索结果页
 */

export interface CloseDetailInput {
  profile?: string;
  unifiedApiUrl?: string;
}

export interface CloseDetailOutput {
  success: boolean;
  finalUrl: string;
}

async function controllerAction(action: string, payload: any, apiUrl: string) {
  const res = await fetch(`${apiUrl}/v1/controller/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload }),
    signal: AbortSignal.timeout(20000),
  });
  const data = await res.json().catch(() => ({}));
  return data.data || data;
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export async function execute(input: CloseDetailInput): Promise<CloseDetailOutput> {
  const {
    profile = 'xiaohongshu_fresh',
    unifiedApiUrl = 'http://127.0.0.1:7701',
  } = input;

  console.log(`[Phase34CloseDetail] ESC 返回搜索页`);

  // 系统 ESC 返回
  await controllerAction('keyboard:press', {
    profileId: profile,
    key: 'Escape',
  }, unifiedApiUrl);

  // 等待导航完成
  await delay(1500);

  // 验证已返回搜索页
  const finalUrl = await controllerAction('browser:execute', {
    profile,
    script: 'window.location.href'
  }, unifiedApiUrl).then(res => res?.result || res?.data?.result || '');

  const success = finalUrl.includes('/search_result');

  console.log(`[Phase34CloseDetail] 完成: success=${success} url=${finalUrl}`);

  return {
    success,
    finalUrl,
  };
}
