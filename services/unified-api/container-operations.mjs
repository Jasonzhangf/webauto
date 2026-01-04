/**
 * Unified API: Container Operations Endpoints (Fixed for raw HTTP server)
 * 
 * 提供以下端点：
 * - POST /v1/container/:containerId/execute - 执行容器的操作
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

  // Store executor for later use
  // We'll add it to the server object
  server._containerExecutor = executor;

  // Note: Since we're using raw HTTP server, we'll handle container operations
  // in the main server.on('request') handler, not here.
  // The original implementation used Express app which had .post() method,
  // but our server is created with http.createServer() which doesn't have those methods.
  
  return {
    executor,
    getExecutor: () => executor
  };
}
