/**
 * UI 客户端（Floating Panel 状态集成）
 * 连接状态总线，订阅模块状态
 */

import WebSocket from 'ws';
import { getStateBus } from '../../core/src/state-bus.mjs';

export class UIClient {
  constructor(busUrl = 'ws://127.0.0.1:8790') {
    this.busUrl = busUrl;
    this.bus = getStateBus();
    this.ws = null;
    this.connected = false;
  }

  // 连接状态总线广播服务
  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.busUrl);
      
      this.ws.on('open', () => {
        console.log('[UI] 已连接状态总线');
        this.connected = true;
        this.bus.register('ui', { client: 'floating-panel' });
        this.bus.setState('ui', { connected: true });
        resolve();
      });

      this.ws.on('message', (data) => {
        try {
          const entry = JSON.parse(data.toString());
          this._handleBusEvent(entry);
        } catch {}
      });

      this.ws.on('close', () => {
        console.log('[UI] 状态总线断开');
        this.connected = false;
        this.bus.setState('ui', { connected: false });
      });

      this.ws.on('error', (err) => {
        console.error('[UI] 连接错误:', err.message);
        reject(err);
      });
    });
  }

  // 订阅状态变化
  subscribe(filter, callback) {
    if (!this.connected) throw new Error('未连接状态总线');
    this.ws.send(JSON.stringify({ type: 'subscribe', filter }));
    this.ws.on('message', (data) => {
      try {
        const entry = JSON.parse(data.toString());
        if (entry.event.includes(filter) || filter === '*') {
          callback(entry);
        }
      } catch {}
    });
  }

  // 断开
  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  // 处理总线事件
  _handleBusEvent(entry) {
    const { event, data } = entry;
    switch (event) {
      case 'module:registered':
        console.log(`[UI] 模块注册: ${data.module}`);
        break;
      case 'state:changed':
        console.log(`[UI] 状态变化: ${data.module} -> ${data.now?.status}`);
        // 将状态广播到渲染进程（在 Electron 中可用）
        if (global.mainWindow) {
          global.mainWindow.webContents.send('bus:event', entry);
        }
        break;
    }
  }

  // 获取当前所有状态
  async getFullState() {
    const state = this.bus.getState();
    return {
      modules: this.bus.listModules(),
      state,
      timestamp: Date.now()
    };
  }
}

export default UIClient;
