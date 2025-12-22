/**
 * Browser Service 通信模块
 * 只负责：
 *  - HTTP 通信
 *  - 会话管理
 *  - 健康检查
 * 不负责：
 *  - 进程启动/关闭（由上层 orchestrator 脚本负责）
 */

const DEFAULT_CONFIG = {
  host: '127.0.0.1',
  port: 7704,
};

class BrowserService {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.base = `http://${this.config.host}:${this.config.port}`;
  }

  // 发送命令（底层 HTTP 通信）
  async command(action, args = {}) {
    const resp = await fetch(`${this.base}/command`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action, args })
    });
    const text = await resp.text();
    if (!resp.ok) {
      throw new Error(`BrowserService ${action} 失败: ${resp.status} ${text}`);
    }
    try {
      return JSON.parse(text);
    } catch {
      return { ok: false, raw: text };
    }
  }

  // 创建会话
  async createSession(options) {
    const result = await this.command('start', {
      profileId: options.profile,
      url: options.url || '',
      headless: !!options.headless
    });
    return {
      success: !!result.ok,
      sessionId: result.sessionId || result.profileId || options.profile,
      raw: result,
    };
  }

  // 获取当前状态
  async getStatus() {
    const result = await this.command('getStatus', {});
    return {
      success: true,
      sessions: result.sessions || [],
      raw: result,
    };
  }

  // 获取 Cookie
  async getCookies(profileId) {
    const result = await this.command('getCookies', { profileId });
    return {
      success: !!result.ok,
      cookies: result.cookies || [],
      raw: result,
    };
  }

  // 从文件加载 Cookie
  async loadCookiesFromFile(profileId, filePath) {
    const result = await this.command('loadCookies', {
      profileId,
      path: filePath,
    });
    return {
      success: !!result.ok,
      count: result.count || 0,
      raw: result,
    };
  }

  // 健康检查
  async health() {
    try {
      const resp = await fetch(`${this.base}/health`);
      const text = await resp.text();
      if (!resp.ok) {
        return { ok: false, reason: `${resp.status} ${text}` };
      }
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        return { ok: false, reason: 'invalid JSON', raw: text };
      }
      return { ok: data.ok === true, data };
    } catch (err) {
      return { ok: false, reason: err.message };
    }
  }
}

export { BrowserService };
