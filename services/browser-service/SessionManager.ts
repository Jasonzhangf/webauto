import { BrowserSession, BrowserSessionOptions } from './BrowserSession.js';

export interface CreateSessionPayload extends BrowserSessionOptions {
  initialUrl?: string;
  sessionId?: string;
}

export const SESSION_CLOSED_EVENT = 'browser-service:session-closed';

export class SessionManager {
  private sessions = new Map<string, BrowserSession>();
  // Track owning process (e.g. a script pid) so we can kill it when the browser is closed manually.
  private owners = new Map<string, { pid: number; startedAt: string }>();

  // Optional options are currently not used, but allowed for future extensions
  constructor(_options?: { host?: string; port?: number; wsHost?: string; wsPort?: number }) {}

  async createSession(options: CreateSessionPayload): Promise<{ sessionId: string }> {
    const profileId = options.profileId || options.sessionId || `session_${Date.now().toString(36)}`;
    options.profileId = profileId;
    if (!options.sessionName) {
      options.sessionName = profileId;
    }

    const existing = this.sessions.get(profileId);
    if (existing) {
      existing.onExit = undefined;
      await existing.close().catch(() => {});
      this.sessions.delete(profileId);
      this.owners.delete(profileId);
    }

    const session = new BrowserSession(options);
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

    const ownerPid = Number((options as any).ownerPid || 0);
    if (Number.isFinite(ownerPid) && ownerPid > 0) {
      this.owners.set(profileId, { pid: ownerPid, startedAt: new Date().toISOString() });
    }

    return { sessionId: profileId };
  }

  getSession(profileId: string): BrowserSession | undefined {
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
    session.onExit = undefined;
    await session.close();
    this.sessions.delete(profileId);
    // Deleting a session from API should NOT kill the owner (Stop=only kill script lives in UI).
    this.owners.delete(profileId);
    (process as any).emit(SESSION_CLOSED_EVENT, profileId);
    return true;
  }

  async shutdown(): Promise<void> {
    const jobs = Array.from(this.sessions.values()).map((session) => session.close().catch(() => {}));
    await Promise.all(jobs);
    this.sessions.clear();
  }
}
