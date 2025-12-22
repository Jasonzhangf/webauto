/**
 * Browser 健康验证器
 * 整合握手 + 通信验证
 */

import { BrowserHealthHandshake } from './handshake.mjs';
import { BrowserHealthCommunicator } from './communicator.mjs';

export class BrowserHealthValidator {
  constructor(config = {}) {
    this.config = config;
    this.handshake = new BrowserHealthHandshake(config);
    this.communicator = new BrowserHealthCommunicator(config);
  }

  async validate() {
    // 第一步：健康握手
    const handshake = await this.handshake.run();
    if (!handshake.ok) {
      return { ok: false, stage: 'handshake', info: handshake };
    }

    // 第二步：通信验证
    const communication = await this.communicator.run();
    if (!communication.ok) {
      return { ok: false, stage: 'communication', info: communication };
    }

    return { ok: true, handshake, communication };
  }

  async performHealthCheck(options = {}) {
    console.log('[browser-health] 开始健康检查');
    const result = await this.validate();
    
    return {
      healthy: result.ok,
      details: result,
      errors: result.ok ? [] : [`健康检查失败: ${result.stage}`]
    };
  }
}
