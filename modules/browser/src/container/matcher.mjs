/**
 * 容器匹配器（基于 Controller WebSocket）
 */

import { BrowserControllerWebSocketClient } from '../controller/websocket-client.mjs';

export class BrowserContainerMatcher {
  constructor(config = {}) {
    this.controller = new BrowserControllerWebSocketClient(config.controller || {});
    this.connected = false;
  }

  async ensureConnected() {
    if (!this.connected) {
      await this.controller.connect();
      this.connected = true;
    }
  }

  async matchRoot(profileId, url, options = {}) {
    await this.ensureConnected();
    const result = await this.controller.matchRoot(profileId, url, options);

    return {
      success: !!result?.data?.success,
      matchedContainer: result?.data?.container || result?.data?.matched_container,
      raw: result
    };
  }

  async getContainerTree(profileId, options = {}) {
    await this.ensureConnected();
    const result = await this.controller.containerInspect(profileId, options);

    return {
      success: !!result?.data?.success,
      containers: result?.data?.containers || [],
      raw: result
    };
  }

  disconnect() {
    this.controller.disconnect();
    this.connected = false;
  }
}
