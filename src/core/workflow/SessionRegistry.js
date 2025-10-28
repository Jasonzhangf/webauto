// 简单的会话注册表，用于在多个工作流之间共享浏览器上下文

class SessionRegistry {
  constructor() {
    this.sessions = new Map(); // sessionId -> { browser, context, page, createdAt }
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
}

const registry = new SessionRegistry();
export default registry;

