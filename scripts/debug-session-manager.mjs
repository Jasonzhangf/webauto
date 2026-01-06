/**
 * 调试 Unified API Server 内部的 SessionManager 状态
 * 这个脚本需要被集成到 server.ts 中运行，或者通过某种后门访问
 * 这里我们模拟 server.ts 的部分逻辑来排查
 */

import { SessionManager } from '../services/browser-service/SessionManager.js';

async function test() {
  const manager = new SessionManager({});
  console.log('Created manager');
  
  await manager.createSession({ profileId: 'test_session', url: 'about:blank', headless: true });
  console.log('Created session');
  
  const session = manager.getSession('test_session');
  console.log('Get session:', !!session);
  
  const sessions = manager.listSessions();
  console.log('List sessions:', sessions);
}

// test().catch(console.error);
