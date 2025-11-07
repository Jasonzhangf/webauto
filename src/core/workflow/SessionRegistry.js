// 简单的会话注册表，用于在多个工作流之间共享浏览器上下文

class SessionRegistry {
  constructor() {
    this.sessions = new Map(); // sessionId -> { browser, context, page, createdAt }
    this._hooksInstalled = false;
    this._installExitHooks();
  }

  save(sessionId, session) {
    if (!sessionId || !session) return false;
    this.sessions.set(sessionId, { ...session, createdAt: Date.now() });
    return true;
  }

  get(sessionId) {
    return this.sessions.get(sessionId) || null;
  }

  has(sessionId) {
    return this.sessions.has(sessionId);
  }

  async close(sessionId) {
    const s = this.sessions.get(sessionId);
    if (s && s.browser) {
      try { await s.browser.close(); } catch {}
    }
    this.sessions.delete(sessionId);
  }

  list() {
    return Array.from(this.sessions.keys());
  }

  async closeAll() {
    const ids = Array.from(this.sessions.keys());
    for (const id of ids) {
      try { await this.close(id); } catch {}
    }
  }

  _installExitHooks() {
    if (this._hooksInstalled) return;
    const safeClose = async () => {
      try { await this.closeAll(); } catch {}
    };
    try { process.on('beforeExit', safeClose); } catch {}
    try { process.on('exit', () => {}); } catch {}
    try { process.on('SIGINT', async () => { await safeClose(); process.exit(0); }); } catch {}
    try { process.on('SIGTERM', async () => { await safeClose(); process.exit(0); }); } catch {}
    try { process.on('SIGQUIT', async () => { await safeClose(); process.exit(0); }); } catch {}
    this._hooksInstalled = true;
  }
}

const registry = new SessionRegistry();
export default registry;
