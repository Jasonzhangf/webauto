/**
 * 浏览器服务通信验证器
 * 验证双向通信是否正常
 */

import { BrowserService } from '../service.mjs';

export class BrowserHealthCommunicator {
  constructor(config = {}) {
    this.service = new BrowserService(config);
  }

  async verifyGetStatus() {
    const result = await this.service.getStatus();
    return {
      ok: result.success,
      sessions: result.sessions,
      raw: result.raw
    };
  }

  async verifyCommand(action, args = {}) {
    const result = await this.service.command(action, args);
    return {
      ok: !!result.ok,
      data: result,
      raw: result
    };
  }

  async run() {
    try {
      const status = await this.verifyGetStatus();
      if (!status.ok) {
        return { ok: false, stage: 'getStatus', info: status };
      }

      const commTest = await this.verifyCommand('getStatus', {});
      if (!commTest.ok) {
        return { ok: false, stage: 'getStatusCommand', info: commTest };
      }

      return { ok: true, status, communication: commTest };
    } catch (err) {
      return { ok: false, stage: 'exception', error: err.message };
    }
  }
}
