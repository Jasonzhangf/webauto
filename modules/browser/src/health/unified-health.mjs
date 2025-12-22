/**
 * 统一健康检查模块
 */

import { BrowserHealthValidator } from './validator.mjs';
import { ContainerHealthValidator } from './container-health.mjs';

export class UnifiedHealthValidator {
  constructor(config = {}) {
    this.browserHealth = new BrowserHealthValidator(config);
    this.containerHealth = new ContainerHealthValidator(config);
    this.config = config;
  }

  async performHealthCheck(options = {}) {
    const healthReport = {
      timestamp: new Date().toISOString(),
      browser: null,
      container: null,
      overall: false,
      errors: []
    };

    try {
      // 检查浏览器健康状态
      console.log('[unified-health] 开始浏览器健康检查');
      const browserResult = await this.browserHealth.performHealthCheck(options.browser);
      healthReport.browser = {
        healthy: browserResult.healthy,
        details: browserResult.details,
        errors: browserResult.errors
      };
      
      if (!browserResult.healthy) {
        healthReport.errors.push(...(browserResult.errors || []));
      }

      // 检查容器健康状态
      if (options.container && options.container.profileId && options.container.url) {
        console.log(`[unified-health] 开始容器健康检查: ${options.container.profileId} -> ${options.container.url}`);
        const containerResult = await this.containerHealth.validateContainerMatching(
          options.container.profileId,
          options.container.url
        );
        
        healthReport.container = {
          healthy: containerResult.healthy,
          details: containerResult.result
        };
        
        if (!containerResult.healthy) {
          healthReport.errors.push(`容器健康检查失败: ${containerResult.result?.error || '未知错误'}`);
        }
      }

      // 计算总体健康状态
      const browserHealthy = healthReport.browser?.healthy === true;
      const containerHealthy = !healthReport.container || healthReport.container.healthy === true;
      
      healthReport.overall = browserHealthy && containerHealthy;
      
      console.log('[unified-health] 统一健康检查完成:', healthReport.overall);
      return healthReport;
      
    } catch (err) {
      console.error('[unified-health] 统一健康检查异常:', err);
      healthReport.errors.push(err.message);
      return healthReport;
    }
  }

  async validateWeiboFresh() {
    return this.performHealthCheck({
      browser: { timeoutMs: 5000 },
      container: {
        profileId: 'weibo_fresh',
        url: 'https://weibo.com'
      }
    });
  }
}
