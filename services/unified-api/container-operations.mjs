/**
 * Unified API: Container Operations Endpoints (Fixed for raw HTTP server)
 * 
 * 提供以下端点：
 * - POST /v1/container/:containerId/execute - 执行容器的操作
 */

import { getContainerExecutor } from '../../modules/operations/src/executor.js';
import { ensureBuiltinOperations } from '../../modules/operations/src/builtin.js';
import { getOperation } from '../../modules/operations/src/registry.js';
import { logDebug } from '../../modules/logging/src/index.js';

const PAGE_TIMEOUT = 30000;

export function setupContainerOperationsRoutes(server, sessionManager) {
  // Initialize builtin operations
  ensureBuiltinOperations();

  // Create OperationExecutor
  const executor = getContainerExecutor();

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
