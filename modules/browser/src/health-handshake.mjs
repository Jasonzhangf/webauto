/**
 * 浏览器服务健康握手验证
 * 确保服务启动后通信完全正常
 */

import { getStateBus } from '../../core/src/state-bus.mjs';

export class HealthHandshake {
  constructor() {
    this.bus = getStateBus();
    this.healthUrl = 'http://127.0.0.1:7704/health';
    this.commandUrl = 'http://127.0.0.1:7704/command';
  }

  async verifyFullHealth() {
    try {
      // 1. 基础健康检查
      const healthResp = await fetch(this.healthUrl);
      if (!healthResp.ok) {
        throw new Error(`Health check failed: ${healthResp.status}`);
      }
      
      // 2. 命令接口测试
      const testResp = await fetch(this.commandUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'getStatus',
          args: {}
        })
      });
      
      if (!testResp.ok) {
        throw new Error(`Command test failed: ${testResp.status}`);
      }
      
      // 3. 状态广播
      this.bus.setState('browser', {
        status: 'healthy',
        lastHealthCheck: Date.now(),
        commandAvailable: true
      });
      
      return {
        ok: true,
        healthCheck: await healthResp.json(),
        commandTest: await testResp.json()
      };
    } catch (err) {
      this.bus.setState('browser', {
        status: 'unhealthy',
        lastError: err.message,
        lastHealthCheck: Date.now()
      });
      return {
        ok: false,
        error: err.message
      };
    }
  }

  async waitForServiceReady(maxAttempts = 10, interval = 1000) {
    for (let i = 0; i < maxAttempts; i++) {
      const result = await this.verifyFullHealth();
      if (result.ok) {
        return result;
      }
      if (i < maxAttempts - 1) {
        await new Promise(resolve => setTimeout(resolve, interval));
      }
    }
    throw new Error('Browser service failed to become ready');
  }
}
