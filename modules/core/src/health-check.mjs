/**
 * 统一健康检查接口
 * 聚合各模块状态，判定业务就绪
 */

import net from 'node:net';
import { getStateBus } from './state-bus.mjs';
import { getConfigCenter } from './config-center.mjs';

export async function unifiedHealthCheck() {
  const bus = getStateBus();
  const config = await getConfigCenter();
  const ports = config.get('ports');

  const checks = [];

  // 1. 端口连通性
  for (const [name, port] of Object.entries(ports)) {
    const ok = await checkPort('127.0.0.1', port);
    checks.push({ name, type: 'port', ok, port });
  }

  // 2. 模块注册状态
  const modules = ['workflow', 'browser', 'controller'];
  for (const m of modules) {
    const state = bus.getState(m);
    const ok = state?.status === 'running';
    checks.push({ name: m, type: 'module', ok, state });
  }

  // 3. 业务就绪（容器树 + DOM + 浮窗）
  const browserState = bus.getState('browser');
  if (browserState?.status === 'running') {
    const business = await checkBusinessReady(bus);
    checks.push({ name: 'business', type: 'business', ok: business.ok, details: business });
  }

  const allOk = checks.every(c => c.ok);
  return {
    ok: allOk,
    checks,
    timestamp: Date.now()
  };
}

async function checkPort(host, port, timeout = 3000) {
  return new Promise(resolve => {
    const socket = net.createConnection({ host, port }, () => {
      socket.end();
      resolve(true);
    });
    socket.setTimeout(timeout, () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('error', () => resolve(false));
  });
}

async function checkBusinessReady(bus) {
  const browserState = bus.getState('browser');
  if (!browserState?.sessionId) return { ok: false, reason: '无活跃会话' };

  return {
    ok: true,
    sessionId: browserState.sessionId,
    containerTree: browserState.containerTree || 'unknown',
    domReady: browserState.domReady || false,
    floatingConnected: bus.getState('ui')?.connected || false
  };
}
