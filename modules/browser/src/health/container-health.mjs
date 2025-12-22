/**
 * 容器健康检查模块
 */

import { BrowserControllerWebSocketClient } from '../controller/websocket-client.mjs';

export class ContainerHealthValidator {
  constructor(config = {}) {
    this.controllerClient = new BrowserControllerWebSocketClient(config.controller || {});
  }

  async checkContainerHealth(profileId, url, options = {}) {
    console.log(`[container-health] 开始检查容器健康: profile=${profileId}, url=${url}`);
    
    try {
      await this.controllerClient.connect();
      console.log('[container-health] Controller 连接成功');

      // 测试容器匹配
      const matchResult = await this.controllerClient.matchRoot(profileId, url, {
        maxDepth: options.maxDepth || 1,
        maxChildren: options.maxChildren || 3
      });

      if (matchResult?.success) {
        console.log('[container-health] 容器匹配成功:', matchResult?.data?.matched);
        return {
          success: true,
          containerMatched: !!matchResult?.data?.matched,
          container: matchResult?.data?.container,
          snapshot: matchResult?.data?.snapshot,
          profileId,
          url
        };
      } else {
        console.log('[container-health] 容器匹配失败:', matchResult?.error);
        return {
          success: false,
          error: matchResult?.error || '容器匹配失败',
          profileId,
          url
        };
      }
    } catch (err) {
      console.error('[container-health] 容器健康检查异常:', err?.message || err);
      return {
        success: false,
        error: err?.message || '容器健康检查异常',
        profileId,
        url
      };
    } finally {
      this.controllerClient.disconnect();
    }
  }

  async validateContainerMatching(profileId, url) {
    const result = await this.checkContainerHealth(profileId, url);
    return {
      healthy: result.success && result.containerMatched,
      result
    };
  }
}
