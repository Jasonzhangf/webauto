/**
 * Controller WebSocket 客户端
 * 通过 WebSocket 连接 Controller 实现容器匹配
 */

import WebSocket from 'ws';

export class BrowserControllerWebSocketClient {
  constructor(config = {}) {
    this.url = `ws://${config.host || '127.0.0.1'}:${config.port || 7701/ws}`;
    this.ws = null;
    this.requestId = 0;
    this.pending = new Map();
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);
      
      this.ws.on('open', () => {
        console.log('[Controller WS] 已连接');
        resolve();
      });

      this.ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'response' && this.pending.has(msg.requestId)) {
            const { resolve, reject } = this.pending.get(msg.requestId);
            this.pending.delete(msg.requestId);
            if (msg.ok) {
              resolve(msg);
            } else {
              reject(new Error(msg.error || 'Unknown error'));
            }
          }
        } catch (err) {
          console.error('[Controller WS] 消息解析失败:', err);
        }
      });

      this.ws.on('error', (err) => {
        console.error('[Controller WS] 连接错误:', err);
        reject(err);
      });

      this.ws.on('close', () => {
        console.log('[Controller WS] 连接关闭');
        // 清理 pending 请求
        for (const { reject } of this.pending.values()) {
          reject(new Error('WebSocket 连接关闭'));
        }
        this.pending.clear();
      });
    });
  }

  async sendCommand(action, payload = {}) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket 未连接');
    }

    const requestId = ++this.requestId;
    
    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      
      this.ws.send(JSON.stringify({
        type: 'action',
        action,
        requestId,
        payload
      }));

      // 设置超时
      setTimeout(() => {
        if (this.pending.has(requestId)) {
          this.pending.delete(requestId);
          reject(new Error('WebSocket 命令超时'));
        }
      }, 10000);
    });
  }

  async containerInspect(profileId, options = {}) {
    return this.sendCommand('containers:inspect', {
      profileId,
      maxDepth: options.maxDepth || 2,
      maxChildren: options.maxChildren || 5,
      ...options
    });
  }

  async matchRoot(profileId, url, options = {}) {
    return this.sendCommand('containers:match', {
      profileId,
      url,
      ...options
    });
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
