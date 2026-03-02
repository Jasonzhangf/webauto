import type { IncomingMessage, ServerResponse } from 'node:http';

export type UiCliAction = {
  action: string;
  selector?: string;
  value?: string;
  text?: string;
  key?: string;
  reason?: string;
  tabId?: string;
  tabLabel?: string;
  state?: 'exists' | 'visible' | 'hidden' | 'text_contains' | 'text_equals' | 'value_equals' | 'not_disabled';
  nth?: number;
  exact?: boolean;
  timeoutMs?: number;
  intervalMs?: number;
  detailed?: boolean;
};

export type UiCliStatus = {
  ok: boolean;
  pid: number;
  ready: boolean;
  host: string;
  port: number;
  ts: string;
  snapshot?: any;
  error?: string;
};

export type UiCliBridgeOptions = {
  getWindow: () => any;
  onRestart?: (input: { reason: string; source: 'ui_cli_bridge' }) => Promise<any> | any;
  host?: string;
  port?: number;
};

export const DEFAULT_HOST = '127.0.0.1';
export const DEFAULT_PORT = 7716;
export const DEFAULT_SNAPSHOT_TIMEOUT_MS = 35_000;
export const DEFAULT_ACTION_TIMEOUT_MS = 30_000;
export const DEFAULT_WAIT_PROBE_TIMEOUT_MS = 3_000;

export function readInt(input: unknown, fallback: number): number {
  const n = Number(input);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export function sendJson(res: ServerResponse, code: number, payload: any) {
  const body = JSON.stringify(payload);
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Length', Buffer.byteLength(body));
  res.end(body);
}

export function parseBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

export function clipText(value: unknown, maxLen = 220): string {
  const text = String(value ?? '');
  if (text.length <= maxLen) return text;
  return `${text.slice(0, Math.max(0, maxLen - 3))}...`;
}

export function summarizeAction(input: Partial<UiCliAction> | null | undefined) {
  const rawClient = (input as any)?._client;
  const client = rawClient && typeof rawClient === 'object'
    ? {
        client: clipText((rawClient as any).client ?? '', 80) || null,
        cmd: clipText((rawClient as any).cmd ?? '', 80) || null,
        pid: Number.isFinite(Number((rawClient as any).pid)) ? Math.floor(Number((rawClient as any).pid)) : null,
        ppid: Number.isFinite(Number((rawClient as any).ppid)) ? Math.floor(Number((rawClient as any).ppid)) : null,
      }
    : null;
  return {
    action: String(input?.action || '').trim() || null,
    selector: String(input?.selector || '').trim() || null,
    tabId: String(input?.tabId || '').trim() || null,
    tabLabel: String(input?.tabLabel || '').trim() || null,
    state: String(input?.state || '').trim() || null,
    key: String(input?.key || '').trim() || null,
    text: clipText(input?.text ?? '', 160) || null,
    value: clipText(input?.value ?? '', 160) || null,
    timeoutMs: readInt(input?.timeoutMs, 0) || null,
    intervalMs: readInt(input?.intervalMs, 0) || null,
    nth: Number.isFinite(Number(input?.nth)) ? Math.floor(Number(input?.nth)) : null,
    exact: input?.exact === true ? true : null,
    detailed: input?.detailed === true ? true : null,
    client,
  };
}

export function toActionError(input: Partial<UiCliAction> | null | undefined, error: string, extra: Record<string, any> = {}) {
  const action = String(input?.action || '').trim();
  const selector = String(input?.selector || '').trim();
  const state = String(input?.state || '').trim();
  const payload = {
    ok: false,
    error: String(error || 'unknown_error'),
    action: action || null,
    selector: selector || null,
    state: state || null,
    ...extra,
  };
  return payload;
}

export async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  const ms = readInt(timeoutMs, 0);
  if (ms <= 0) return promise;
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`${label}_timeout:${ms}`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
