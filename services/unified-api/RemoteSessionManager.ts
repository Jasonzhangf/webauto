/**
 * RemoteSessionManager - 远程会话管理器
 *
 * 作用：在 Unified API (7701) 中管理对 Browser Service (7704) 的远程会话
 * 核心职责：创建/销毁/查询远程会话，并返回 RemoteBrowserSession 适配器
 */

import { RemoteBrowserSession } from './RemoteBrowserSession.js';
import { fetch } from 'undici';
import { getStateRegistry } from './state-registry.js';

export interface RemoteSessionManagerOptions {
  browserServiceUrl: string; // http://127.0.0.1:7704
}

export interface CreateRemoteSessionPayload {
  sessionId?: string;
  profileId?: string;
  headless?: boolean;
  url?: string;
}

export class RemoteSessionManager {
  private sessions = new Map<string, RemoteBrowserSession>();
  private browserServiceUrl: string;
  private stateRegistry: any;

  constructor(options: any) {
    // 支持两种构造方式：
    // 1. { browserServiceUrl: string }
    // 2. { host: string, port: number, ... } (兼容原 SessionManager)
    this.browserServiceUrl = options.browserServiceUrl || `http://${options.host || '127.0.0.1'}:${options.port || 7704}`;
    this.stateRegistry = getStateRegistry();
  }

  /**
   * 创建远程会话
   */
  async createSession(options: CreateRemoteSessionPayload): Promise<{ sessionId: string }> {
    const sessionId = options.sessionId || options.profileId || `session_${Date.now().toString(36)}`;

    // 通过 HTTP 调用 Browser Service 创建会话
    const response = await fetch(`${this.browserServiceUrl}/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'start',
        args: {
          profileId: sessionId,
          headless: options.headless,
          url: options.url
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to create remote session: ${response.statusText}`);
    }

    const result: any = await response.json();
    if (!result.success) {
      throw new Error(result.error || 'Failed to create remote session');
    }

    // 创建本地代理对象
    const remoteSession = new RemoteBrowserSession({
      sessionId,
      browserServiceUrl: this.browserServiceUrl
    });

    this.sessions.set(sessionId, remoteSession);

    this.stateRegistry.updateSessionState(sessionId, {
      profileId: sessionId,
      sessionId,
      currentUrl: options.url || '',
    });

    return { sessionId };
  }

  /**
   * 获取会话
   */
  getSession(sessionId: string): RemoteBrowserSession | undefined {
    let session = this.sessions.get(sessionId);
    if (session) return session;

    // 隐式创建会话代理（如果会话在远端存在但本地未缓存）
    // 这允许不通过 createSession 也能访问已存在的会话
    session = new RemoteBrowserSession({
      sessionId,
      browserServiceUrl: this.browserServiceUrl
    });
    this.sessions.set(sessionId, session);
    return session;
  }

  /**
   * 列出所有会话
   */
  async listSessions(): Promise<any[]> {
    // 从 Browser Service 查询会话列表
    const response = await fetch(`${this.browserServiceUrl}/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'getStatus'
      })
    });

    if (!response.ok) {
      console.warn('[RemoteSessionManager] Failed to fetch sessions:', response.statusText);
      return [];
    }

    const result: any = await response.json();
    // BrowserService returns { ok: true, body: { ok: true, sessions: [...] } }
    // or { ok: true, sessions: [...] } (depending on how it's wrapped)
    const sessions = result.body?.sessions || result.sessions || result.data?.sessions || result.data || [];

    if (Array.isArray(sessions)) {
      sessions.forEach((session: any) => {
        const profileId = session.profileId || session.profile_id || session.sessionId || session.session_id;
        if (!profileId) return;
        this.stateRegistry.updateSessionState(profileId, {
          profileId,
          sessionId: session.sessionId || session.session_id || profileId,
          currentUrl: session.currentUrl || session.current_url || '',
        });
      });
    }

    this.stateRegistry.flush();

    return sessions;
  }

  /**
   * 获取会话信息
   */
  async getSessionInfo(sessionId: string): Promise<any | null> {
    const session = this.getSession(sessionId);
    if (!session) return null;

    return session.getInfo();
  }

  /**
   * 删除会话
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    try {
      await session.close();
      this.sessions.delete(sessionId);
      this.stateRegistry.removeSessionState(sessionId);
      return true;
    } catch (error) {
      console.warn(`[RemoteSessionManager] Failed to delete session ${sessionId}:`, error);
      return false;
    }
  }

  /**
   * 关闭所有会话
   */
  async shutdown(): Promise<void> {
    const entries = Array.from(this.sessions.entries());
    const jobs = entries.map(([, session]) =>
      session.close().catch(() => {})
    );
    await Promise.all(jobs);
    entries.forEach(([sessionId]) => this.stateRegistry.removeSessionState(sessionId));
    this.sessions.clear();
  }
}
