/**
 * Workflow Block: EnsureSession
 *
 * 确保浏览器 Session 存在并处于登录状态
 */

export interface EnsureSessionInput {
  profileId: string;
  url?: string;
  serviceUrl?: string;
}

export interface EnsureSessionOutput {
  sessionId: string;
  status: 'active' | 'created';
  currentPage: string;
  error?: string;
}

/**
 * 确保浏览器 Session 存在
 *
 * @param input - 输入参数
 * @returns Promise<EnsureSessionOutput>
 */
export async function execute(input: EnsureSessionInput): Promise<EnsureSessionOutput> {
  const { profileId, url, serviceUrl = 'http://127.0.0.1:7704' } = input;

  if (!profileId) {
    return {
      sessionId: '',
      status: 'active',
      currentPage: '',
      error: 'Missing profileId'
    };
  }

  try {
    const statusUrl = `${serviceUrl}/command`;
    const statusRes = await fetch(statusUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'getStatus' })
    });

    const statusData = await statusRes.json();
    const sessions = statusData.data || [];
    const existing = sessions.find((s: any) => s.profileId === profileId);

    if (existing) {
      if (url && existing.url !== url) {
        await fetch(statusUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'goto',
            args: { profileId, url }
          })
        });
      }

      return {
        sessionId: existing.id || profileId,
        status: 'active',
        currentPage: url || existing.url
      };
    }

    const startRes = await fetch(statusUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'start',
        args: {
          profileId,
          url,
          headless: false
        }
      })
    });

    const startData = await startRes.json();
    if (!startData.success) {
      throw new Error(startData.error || 'Failed to start session');
    }

    return {
      sessionId: profileId,
      status: 'created',
      currentPage: url || ''
    };
  } catch (error: any) {
    return {
      sessionId: '',
      status: 'active',
      currentPage: '',
      error: `Session error: ${error.message}`
    };
  }
}
