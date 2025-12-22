import fs from 'node:fs';
import path from 'node:path';

export interface SessionManagerOptions {
  host?: string;
  port?: number;
}

export interface CreateSessionOptions extends SessionManagerOptions {
  profile: string;
  headless?: boolean;
  url?: string;
  keepOpen?: boolean;
}

export interface CreateSessionResult {
  success: boolean;
  sessionId?: string;
  data?: any;
  message?: string;
}

export interface ListSessionsResult {
  success: boolean;
  sessions: any[];
  data?: any;
  message?: string;
}

export interface DeleteSessionOptions extends SessionManagerOptions {
  profile: string;
}

export interface DeleteSessionResult {
  success: boolean;
  message?: string;
}

const DEFAULT_PORT = 7704;
const TEST_MODE = () => process.env.SESSION_MANAGER_TEST_MODE === '1';
const memorySessions = new Map<string, any>();

export async function createSession(options: CreateSessionOptions): Promise<CreateSessionResult> {
  if (!options.profile) {
    throw new Error('createSession requires profile');
  }
  if (TEST_MODE()) {
    const info = {
      profileId: options.profile,
      session_id: options.profile,
      current_url: options.url || '',
      mode: options.headless ? 'headless' : 'dev',
    };
    memorySessions.set(options.profile, info);
    return { success: true, sessionId: options.profile, data: info };
  }
  const base = buildBase(options);
  const payload = {
    action: 'start',
    args: {
      profileId: options.profile,
      headless: Boolean(options.headless),
      url: options.url || '',
      keepOpen: options.keepOpen ?? !options.headless,
    },
  };
  const response = await post(`${base}/command`, payload);
  if (!response?.ok) {
    return { success: false, data: response, message: response?.error || 'start failed' };
  }
  return {
    success: true,
    sessionId: response.sessionId || response.profileId || options.profile,
    data: response,
  };
}

export async function listSessions(options: SessionManagerOptions = {}): Promise<ListSessionsResult> {
  if (TEST_MODE()) {
    return { success: true, sessions: Array.from(memorySessions.values()), data: { ok: true } };
  }
  const base = buildBase(options);
  const response = await post(`${base}/command`, { action: 'getStatus' });
  const sessions = Array.isArray(response?.sessions) ? response.sessions : [];
  return { success: true, sessions, data: response };
}

export async function deleteSession(options: DeleteSessionOptions): Promise<DeleteSessionResult> {
  if (!options.profile) {
    throw new Error('deleteSession requires profile');
  }
  if (TEST_MODE()) {
    const existed = memorySessions.delete(options.profile);
    return { success: existed };
  }
  const base = buildBase(options);
  const response = await post(`${base}/command`, { action: 'stop', args: { profileId: options.profile } });
  if (response?.ok) {
    return { success: true, message: 'session stopped' };
  }
  return { success: false, message: response?.error || 'stop failed' };
}

function buildBase(options: SessionManagerOptions) {
  const { host, port } = resolveConfig(options);
  const resolvedHost = host === '0.0.0.0' ? '127.0.0.1' : host;
  return `http://${resolvedHost}:${port}`;
}

function resolveConfig(options: SessionManagerOptions) {
  const config = loadBrowserConfig();
  return {
    host: options.host || process.env.WEBAUTO_BROWSER_HTTP_HOST || config.host,
    port: options.port || Number(process.env.WEBAUTO_BROWSER_HTTP_PORT || config.port),
  };
}

function loadBrowserConfig() {
  const fallback = {
    host: '0.0.0.0',
    port: DEFAULT_PORT,
  };
  try {
    const configPath = path.join(process.cwd(), 'config', 'browser-service.json');
    const raw = fs.readFileSync(configPath, 'utf-8');
    const overrides = JSON.parse(raw);
    return {
      host: overrides.host || fallback.host,
      port: Number(overrides.port || fallback.port),
    };
  } catch {
    return fallback;
  }
}

async function post(url: string, body: any) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${url} -> ${response.status} ${text}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    return { ok: false, raw: text };
  }
}
