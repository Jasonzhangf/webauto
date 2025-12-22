/**
 * Browser Service 健康握手模块
 * - 验证服务健康状态
 * - 验证命令接口通信
 * - 支持多次重试
 */

import { BrowserService } from '../service.mjs';

export class BrowserHealthHandshake {
  constructor(config = {}) {
    this.service = new BrowserService(config);
    this.healthTimeout = config.healthTimeout ?? 15000;
    this.retryInterval = config.retryInterval ?? 1000;
    this.maxRetries = config.maxRetries ?? 5;
  }

  async waitForHealth() {
    const start = Date.now();
    let attempts = 0;

    while (attempts < this.maxRetries) {
      attempts += 1;
      const result = await this.service.health();
      if (result.ok) {
        return { ok: true, data: result.data, attempts, elapsed: Date.now() - start };
      }
      if (Date.now() - start > this.healthTimeout) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, this.retryInterval));
    }

    return { ok: false, attempts, elapsed: Date.now() - start };
  }

  async verifyCommunication() {
    try {
      const status = await this.service.getStatus();
      return { ok: true, sessions: status.sessions };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  async run() {
    const health = await this.waitForHealth();
    if (!health.ok) {
      return { ok: false, stage: 'health', info: health };
    }

    const comm = await this.verifyCommunication();
    if (!comm.ok) {
      return { ok: false, stage: 'communication', info: comm };
    }

    return { ok: true, health, communication: comm };
  }
}
