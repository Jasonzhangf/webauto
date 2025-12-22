/**
 * Controller 客户端
 * 通过 Controller 实现容器匹配功能
 */

export class BrowserControllerClient {
  constructor(config = {}) {
    this.base = `http://${config.host || '127.0.0.1'}:${config.port || 8970}`;
  }

  async command(action, payload = {}) {
    const resp = await fetch(`${this.base}/command`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action, payload })
    });
    const text = await resp.text();
    if (!resp.ok) {
      throw new Error(`Controller ${action} 失败: ${resp.status} ${text}`);
    }
    try {
      return JSON.parse(text);
    } catch {
      return { ok: false, raw: text };
    }
  }

  async containerInspect(profileId, options = {}) {
    return this.command('containers:inspect', {
      profileId,
      maxDepth: options.maxDepth || 2,
      maxChildren: options.maxChildren || 5,
      ...options
    });
  }

  async matchRoot(profileId, url, options = {}) {
    return this.command('containers:match', {
      profileId,
      url,
      ...options
    });
  }
}
