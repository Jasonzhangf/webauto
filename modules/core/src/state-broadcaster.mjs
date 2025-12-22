/**
 * 状态广播器
 * 支持事件订阅，<1s 同步
 */

import { WebSocketServer } from 'ws';
import { getStateBus } from './state-bus.mjs';
import { getErrorHandler } from './error-handler.mjs';

export class StateBroadcaster {
  constructor() {
    this.bus = getStateBus();
    this.err = getErrorHandler();
    this._setupSubscriptions();
  }

  _setupSubscriptions() {
    // 订阅所有状态变化，广播到总线和日志
    this.bus.subscribe('broadcaster', 'state:changed', async (entry) => {
      await this.err.info('broadcaster', `状态变化: ${entry.data.module}`, entry.data);
    });
    this.bus.subscribe('broadcaster', 'module:registered', async (entry) => {
      await this.err.info('broadcaster', `模块注册: ${entry.data.module}`, entry.data);
    });
    this.bus.subscribe('broadcaster', 'module:unregistered', async (entry) => {
      await this.err.info('broadcaster', `模块注销: ${entry.data.module}`, entry.data);
    });
  }

  // 广播业务事件（容器匹配、DOM 渲染等）
  broadcastBusiness(event, data) {
    this.bus.publish(event, data);
  }

  // 获取最新事件流
  getEvents(since = 0) {
    const all = this.bus.events || [];
    return all.filter(e => e.timestamp > since);
  }

  // 启动广播服务（WebSocket，供 UI 订阅）
  startBroadcasterServer(port = 8790) {
    const wss = new WebSocketServer({ port });

    wss.on('connection', (ws) => {
      ws.on('message', (raw) => {
        // 可支持订阅特定事件
        try {
          const { type, filter } = JSON.parse(raw);
          if (type === 'subscribe') {
            ws.filter = filter; // 保存过滤器
          }
        } catch {}
      });

      // 广播新事件（仅发送符合过滤器的事件）
      const handler = (entry) => {
        if (ws.filter && !entry.event.includes(ws.filter)) return;
        ws.send(JSON.stringify(entry));
      };
      this.bus.subscribe('ui', '*', handler);
      ws.on('close', () => this.bus.subscribe('ui', '*', handler));
    });

    console.log(`[Broadcaster] WebSocket 广播服务启动: ws://127.0.0.1:${port}`);
    return wss;
  }
}

export async function getStateBroadcaster() {
  return new StateBroadcaster();
}
