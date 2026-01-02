/**
 * Unified API: Container Operations Endpoints
 * 
 * 提供以下端点：
 * - POST /v1/container/:id/execute - 执行容器的操作
 * - GET  /v1/container/:id/operations - 获取容器可用操作列表
 * - POST /v1/operation/bindings - 注册操作绑定规则
 * - GET  /v1/operation/bindings - 获取所有绑定规则
 * - DELETE /v1/operation/bindings/:id - 删除绑定规则
 */

import { OperationExecutor } from '../../libs/containers/src/engine/OperationExecutor.js';
import { ensureBuiltinOperations } from '../../modules/operations/src/builtin.js';
import { getOperation } from '../../modules/operations/src/registry.js';
import { logDebug } from '../../modules/logging/src/index.js';

const PAGE_TIMEOUT = 30000;

export function setupContainerOperationsRoutes(server, sessionManager) {
  // Initialize builtin operations
  ensureBuiltinOperations();

  // Create OperationExecutor
  const executor = new OperationExecutor(
    (sessionId) => {
      const session = sessionManager.getSession(sessionId);
      if (!session) {
        throw new Error(`Session not found`);
      }
      return session.ensurePage();
    },
    { info: (...args) => logDebug('container-ops', 'info', args),
      warn: (...args) => logDebug('container-ops', 'warn', args),
      error: (...args) => logDebug('container-ops', 'error', args) }
  );

  // Storage for binding rules (in-memory, can be replaced with persistence)
  const bindingRules = new Map();

  // 返回路由配置供 server.ts 使用
  return {
    bindingRules,
    executor,
    sessionManager
  };
}

/**
 * 处理容器操作相关的请求（由 server.ts 统一路由分发调用）
 */
export async function handleContainerOperationRequest(url, req, res, routes, readJsonBody) {
  const { pathname } = url;
  const { bindingRules, executor, sessionManager } = routes;

  // POST /v1/container/:containerId/execute
  const executeMatch = pathname.match(/^\/v1\/container\/([^/]+)\/execute$/);
  if (executeMatch && req.method === 'POST') {
    const containerId = executeMatch[1];
    try {
      const body = await readJsonBody(req);
      const { operationId, config, sessionId } = body || {};

      if (!sessionId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'sessionId required' }));
        return true;
      }
      if (!operationId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'operationId required' }));
        return true;
      }

      logDebug('container-ops', 'execute', { containerId, operationId, sessionId });

      const session = sessionManager.getSession(sessionId);
      if (!session) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Session not found' }));
        return true;
      }

      const page = await session.ensurePage();
      const handle = { sessionId, element: null, bbox: null };
      const result = await executor.execute(containerId, operationId, config || {}, handle);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, data: result }));
      return true;
    } catch (err) {
      const error = err?.message || String(err);
      logDebug('container-ops', 'error', { error });
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error }));
      return true;
    }
  }

  return false;
}
