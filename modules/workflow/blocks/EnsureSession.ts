/**
 * Workflow Block: EnsureSession
 *
 * 确保浏览器 Session 存在并处于登录状态
 */

export interface EnsureSessionInput {
  profileId: string;
  url?: string;
  serviceUrl?: string;
  viewport?: { width: number; height: number };
  /**
   * When starting a new session, whether to run browser in headless mode.
   * Note: if the session already exists, EnsureSession will reuse it and will NOT restart it.
   */
  headless?: boolean;
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
  const { profileId, url, serviceUrl = 'http://127.0.0.1:7704', viewport } = input;
  const headless = typeof input.headless === 'boolean' ? input.headless : false;

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
    const desiredViewport = viewport || {
      width: Number(process.env.WEBAUTO_VIEWPORT_WIDTH || 1440),
      height: Number(process.env.WEBAUTO_VIEWPORT_HEIGHT || 1100),
    };

    async function setViewport(): Promise<{ ok: boolean; error?: string }> {
      const res = await fetch(statusUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'page:setViewport',
          args: {
            profileId,
            width: desiredViewport.width,
            height: desiredViewport.height,
          },
        }),
      }).then((r) => r.json().catch(() => ({} as any)));

      const ok = !(res?.ok === false || res?.success === false);
      if (!ok) return { ok: false, error: res?.error || 'viewport_set_failed' };
      console.log(
        `[EnsureSession] viewport set: ${desiredViewport.width}x${desiredViewport.height} (profile=${profileId})`,
      );
      return { ok: true };
    }

    const statusRes = await fetch(statusUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'getStatus' })
    });

    const statusData = await statusRes.json();
    const sessions =
      statusData.sessions ||
      statusData.data?.sessions ||
      statusData.body?.sessions ||
      (Array.isArray(statusData.data) ? statusData.data : []) ||
      [];
    const existing = Array.isArray(sessions)
      ? sessions.find((s: any) => s?.profileId === profileId)
      : null;

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

      // Phase1 关键约束：保证视口高度足够（避免第二排卡片误点）
      const vp = await setViewport();
      if (!vp.ok) {
        return {
          sessionId: existing.sessionId || existing.id || profileId,
          status: 'active',
          currentPage: url || existing.url,
          error: vp.error,
        };
      }

      return {
        sessionId: existing.sessionId || existing.id || profileId,
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
          headless
        }
      })
    });

    const startData = await startRes.json();
    if (!startData.ok) {
      throw new Error(startData.error || 'Failed to start session');
    }

    const vp = await setViewport();
    if (!vp.ok) {
      return {
        sessionId: startData.sessionId || profileId,
        status: 'created',
        currentPage: url || '',
        error: vp.error,
      };
    }

    return {
      sessionId: startData.sessionId || profileId,
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
