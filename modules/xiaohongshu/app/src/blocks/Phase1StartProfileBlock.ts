/**
 * Phase 1 Block: 启动/复用 Profile 会话
 */

export interface StartProfileInput {
  profile: string;
  url?: string;
  headless?: boolean;
  browserServiceUrl?: string;
}

export interface StartProfileOutput {
  started: boolean;
  profile: string;
  url: string;
  headless: boolean;
}

async function browserServiceCommand(action: string, args: any, serviceUrl: string) {
  const res = await fetch(`${serviceUrl}/command`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, args }),
    signal: AbortSignal.timeout(20000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) throw new Error(data?.error || 'browser-service error');
  return data;
}

export async function execute(input: StartProfileInput): Promise<StartProfileOutput> {
  const {
    profile,
    url = 'https://www.xiaohongshu.com',
    headless = false,
    browserServiceUrl = 'http://127.0.0.1:7704',
  } = input;

  console.log(`[Phase1StartProfile] 启动 profile=${profile} headless=${headless}`);

  await browserServiceCommand('start', {
    profileId: profile,
    headless,
    url,
    viewport: { width: 1920, height: 2160 }, // 增加纵向高度，确保点击目标在视口内
  }, browserServiceUrl);

  return {
    started: true,
    profile,
    url,
    headless,
  };
}
