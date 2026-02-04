import { BrowserSession, BrowserSessionOptions } from './BrowserSession.js';

export interface CreateSessionPayload extends BrowserSessionOptions {
  initialUrl?: string;
  sessionId?: string;
}

export const SESSION_CLOSED_EVENT = 'browser-service:session-closed';

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export class SessionManager {
  private sessions = new Map<string, BrowserSession>();
  // Track owning process (e.g. a script pid) so we can kill it when the browser is closed manually.
  private owners = new Map<string, { pid: number; startedAt: string }>();
  private sessionFactory: (options: BrowserSessionOptions) => BrowserSession;

  private debugLog(label: string, data: any) {
    if (process.env.DEBUG !== '1' && process.env.WEBAUTO_DEBUG !== '1') return;
    try {
      console.log(`[browser-service:${label}] ${JSON.stringify(data)}`);
    } catch {
      console.log(`[browser-service:${label}]`, data);
    }
  }

  // Optional options are currently not used, but allowed for future extensions
  constructor(
    _options?: { host?: string; port?: number; wsHost?: string; wsPort?: number },
    sessionFactory?: (options: BrowserSessionOptions) => BrowserSession,
  ) {
    this.sessionFactory = sessionFactory || ((opts) => new BrowserSession(opts));
  }

  async createSession(options: CreateSessionPayload): Promise<{ sessionId: string }> {
    const profileId = options.profileId || options.sessionId || `session_${Date.now().toString(36)}`;
    options.profileId = profileId;
    if (!options.sessionName) {
      options.sessionName = profileId;
    }

    this.debugLog('createSession:start', {
      profileId,
      headless: options.headless,
      hasInitialUrl: Boolean(options.initialUrl),
      ownerPid: Number((options as any).ownerPid || 0) || null,
    });

    const existing = this.sessions.get(profileId);
    if (existing) {
      const owner = this.owners.get(profileId);
      if (owner?.pid && !isProcessAlive(owner.pid)) {
        // Owner died; treat existing session as stale and replace it.
        this.debugLog('createSession:replace_stale_owner', { profileId, deadPid: owner.pid });
        await this.deleteSession(profileId);
      } else {
        this.debugLog('createSession:reuse', { profileId, ownerPid: owner?.pid || null });
        // Reuse existing session (keepalive). Do not restart the browser if it's already running.
        return { sessionId: profileId };
      }
    }

    const session = this.sessionFactory(options);
    session.onExit = (id) => {
      const current = this.sessions.get(id);
      if (current === session) {
        this.sessions.delete(id);
        // If the user closed the browser window, also terminate the owning script (if any).
        const owner = this.owners.get(id);
        if (owner?.pid) {
          try {
            process.kill(owner.pid, 'SIGTERM');
          } catch {
            // ignore
          }
        }
        this.owners.delete(id);
        (process as any).emit(SESSION_CLOSED_EVENT, id);
      }
    };
    await session.start(options.initialUrl);
    this.sessions.set(profileId, session);

    this.debugLog('createSession:started', { profileId });

    const ownerPid = Number((options as any).ownerPid || 0);
    if (Number.isFinite(ownerPid) && ownerPid > 0) {
      this.owners.set(profileId, { pid: ownerPid, startedAt: new Date().toISOString() });
    }

    return { sessionId: profileId };
  }

  getSession(profileId: string): BrowserSession | undefined {
    this.debugLog('getSession', { profileId, hit: this.sessions.has(profileId) });
    return this.sessions.get(profileId);
  }

  listSessions() {
    return Array.from(this.sessions.values()).map((session) => ({
      profileId: session.id,
      session_id: session.id,
      current_url: session.getCurrentUrl(),
      mode: session.modeName,
      owner_pid: this.owners.get(session.id)?.pid || null,
    }));
  }

  async getSessionInfo(profileId: string) {
    const session = this.getSession(profileId);
    if (!session) return null;
    return session.getInfo();
  }

  async deleteSession(profileId: string): Promise<boolean> {
    const session = this.sessions.get(profileId);
    if (!session) return false;

    this.debugLog('deleteSession:start', { profileId });
    session.onExit = undefined;
    await session.close();
    this.sessions.delete(profileId);
    // Deleting a session from API should NOT kill the owner (Stop=only kill script lives in UI).
    this.owners.delete(profileId);
    (process as any).emit(SESSION_CLOSED_EVENT, profileId);
    this.debugLog('deleteSession:done', { profileId });
    return true;
  }

  async shutdown(): Promise<void> {
    const jobs = Array.from(this.sessions.values()).map((session) => session.close().catch(() => {}));
    await Promise.all(jobs);
    this.sessions.clear();
  }
}
