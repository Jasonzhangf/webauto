/**
 * System Input Helper (browser-service)
 *
 * 统一封装系统级鼠标/键盘/滚轮操作，避免在各 Block 内重复实现。
 * 注意：这里只做“系统事件发送”，不做任何 DOM click/scroll 等 JS 行为。
 */

export interface FocusPoint {
  x: number;
  y: number;
}

export async function browserServiceCommand(
  browserServiceUrl: string,
  action: string,
  args: Record<string, any>,
  timeoutMs = 8000,
): Promise<any> {
  const response = await fetch(`${browserServiceUrl}/command`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, args }),
    signal: (AbortSignal as any).timeout
      ? (AbortSignal as any).timeout(timeoutMs)
      : undefined,
  });
  if (!response.ok) {
    throw new Error(`browser-service HTTP ${response.status}: ${await response.text()}`);
  }
  const data = await response.json().catch(() => ({} as any));
  if (data?.ok === false || data?.success === false) {
    throw new Error(data?.error || 'browser-service command failed');
  }
  return data?.body || data?.data || data;
}

export async function systemHoverAt(
  profileId: string,
  x: number,
  y: number,
  browserServiceUrl = 'http://127.0.0.1:7704',
): Promise<void> {
  await browserServiceCommand(
    browserServiceUrl,
    'mouse:move',
    { profileId, x: Math.floor(x), y: Math.floor(y), steps: 3 },
    8000,
  ).catch(() => {});
}

export async function systemClickAt(
  profileId: string,
  x: number,
  y: number,
  browserServiceUrl = 'http://127.0.0.1:7704',
): Promise<void> {
  await systemHoverAt(profileId, x, y, browserServiceUrl);
  await new Promise((r) => setTimeout(r, 80));
  await browserServiceCommand(
    browserServiceUrl,
    'mouse:click',
    {
      profileId,
      x: Math.floor(x),
      y: Math.floor(y),
      clicks: 1,
      delay: 40 + Math.floor(Math.random() * 60),
    },
    8000,
  );
}

export async function systemMouseWheel(options: {
  profileId: string;
  deltaY: number;
  focusPoint?: FocusPoint | null;
  browserServiceUrl?: string;
  browserWsUrl?: string;
}): Promise<void> {
  const {
    profileId,
    deltaY,
    focusPoint,
    browserServiceUrl = 'http://127.0.0.1:7704',
    browserWsUrl = process.env.WEBAUTO_BROWSER_WS_URL || 'ws://127.0.0.1:8765',
  } = options;

  try {
    if (focusPoint) {
      await systemHoverAt(profileId, focusPoint.x, focusPoint.y, browserServiceUrl);
      await new Promise((r) => setTimeout(r, 60));
    }
    await browserServiceCommand(
      browserServiceUrl,
      'mouse:wheel',
      { profileId, deltaX: 0, deltaY },
      8000,
    );
    return;
  } catch (err: any) {
    console.warn(
      '[WarmupComments] browser-service mouse:wheel failed, fallback to ws:',
      err?.message || err,
    );
  }

  await browserServiceWsScroll({
    profileId,
    deltaY,
    browserWsUrl,
    coordinates: focusPoint ? { x: focusPoint.x, y: focusPoint.y } : null,
  });
}

async function browserServiceWsScroll(options: {
  profileId: string;
  deltaY: number;
  browserWsUrl: string;
  coordinates: { x: number; y: number } | null;
}): Promise<void> {
  const { profileId, deltaY, browserWsUrl, coordinates } = options;
  const { default: WebSocket } = await import('ws');
  const requestId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      try {
        ws.close();
      } catch {}
      reject(new Error('browser-service ws timeout'));
    }, 15000);

    const ws = new WebSocket(browserWsUrl);

    const cleanup = () => {
      clearTimeout(timer);
      try {
        ws.close();
      } catch {}
    };

    ws.on('open', () => {
      try {
        ws.send(
          JSON.stringify({
            type: 'command',
            request_id: requestId,
            session_id: profileId,
            data: {
              command_type: 'user_action',
              action: 'operation',
              parameters: {
                operation_type: 'scroll',
                ...(coordinates ? { target: { coordinates } } : {}),
                deltaY,
              },
            },
          }),
        );
      } catch (err) {
        cleanup();
        reject(err);
      }
    });

    ws.on('message', (buf: any) => {
      try {
        const msg = JSON.parse(String(buf || ''));
        if (msg?.type !== 'response') return;
        if (String(msg?.request_id || '') !== requestId) return;
        const payload = msg?.data || {};
        if (payload?.success === false) {
          cleanup();
          reject(new Error(payload?.error || 'browser-service ws scroll failed'));
          return;
        }
        cleanup();
        resolve();
      } catch (err) {
        cleanup();
        reject(err);
      }
    });

    ws.on('error', (err: any) => {
      cleanup();
      reject(err);
    });
  });
}

