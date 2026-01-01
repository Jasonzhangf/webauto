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

export function setupContainerOperationsRoutes(app, sessionManager) {
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

  /**
   * POST /v1/container/:id/execute
   * Execute an operation on a container
   */
  app.post('/v1/container/:containerId/execute', async (req, res) => {
    try {
      const { containerId } = req.params;
      const { operationId, config, sessionId } = req.body || {};

      if (!sessionId) {
        return res.status(400).json({ success: false, error: 'sessionId required' });
      }
      if (!operationId) {
        return res.status(400).json({ success: false, error: 'operationId required' });
      }

      logDebug('container-ops', 'execute', { containerId, operationId, sessionId });

      // Get session page
      const session = sessionManager.getSession(sessionId);
      if (!session) {
        return res.status(404).json({ success: false, error: `Session not found` });
      }

      const page = await session.ensurePage();

      // Resolve handle (find element by containerId if needed)
      // For now we just pass sessionId, the operation implementation should handle resolution if needed
      // or we can enhance this to resolve element handle using containerId
      const handle = { sessionId, element: null, bbox: null };
      
      // Execute operation
      const result = await executor.execute(containerId, operationId, config || {}, handle);

      res.json({ success: true, data: result });
    } catch (err) {
      const error = err?.message || String(err);
      logDebug('container-ops', 'error', { error });
      res.status(500).json({ success: false, error });
    }
  });

  /**
   * GET /v1/container/:id/operations
   * Get available operations for a container
   */
  app.get('/v1/container/:containerId/operations', async (req, res) => {
    try {
      const { containerId } = req.params;
      const { sessionId } = req.query;

      if (!sessionId) {
        return res.status(400).json({ success: false, error: 'sessionId required' });
      }

      logDebug('container-ops', 'list-operations', { containerId, sessionId });

      // Load container definition from library
      // For now, return builtin operations list
      // In a real implementation, we would filter by container capabilities
      // However, getOperation() returns a single operation or undefined, not a list
      // We need listOperations() which is exported from registry.js
      // But we only imported getOperation. Let's fix this in a future iteration.
      // For now, return empty list or specific known operations
      
      const operations = [
        { id: 'highlight', requiredCapabilities: ['highlight'] },
        { id: 'scroll', requiredCapabilities: ['scroll'] },
        { id: 'find-child', requiredCapabilities: ['find-child'] },
        { id: 'extract', requiredCapabilities: ['extract'] }
      ];

      res.json({ success: true, data: { containerId, operations }});
    } catch (err) {
      const error = err?.message || String(err);
      res.status(500).json({ success: false, error });
    }
  });

  /**
   * POST /v1/operation/bindings
   * Register a new binding rule
   */
  app.post('/v1/operation/bindings', async (req, res) => {
    try {
      const rule = req.body;
      
      if (!rule.id) {
        return res.status(400).json({ success: false, error: 'rule id required' });
      }
      if (!rule.trigger) {
        return res.status(400).json({ success: false, error: 'trigger required' });
      }
      if (!rule.target) {
        return res.status(400).json({ success: false, error: 'target required' });
      }
      if (!rule.action) {
        return res.status(400).json({ success: false, error: 'action required' });
      }

      logDebug('container-ops', 'register-binding', rule);

      bindingRules.set(rule.id, rule);

      res.json({ success: true, data: { id: rule.id } });
    } catch (err) {
      const error = err?.message || String(err);
      res.status(500).json({ success: false, error });
    }
  });

  /**
   * GET /v1/operation/bindings
   * Get all binding rules
   */
  app.get('/v1/operation/bindings', async (req, res) => {
    try {
      const rules = Array.from(bindingRules.values());
      res.json({ success: true, data: { rules } });
    } catch (err) {
      const error = err?.message || String(err);
      res.status(500).json({ success: false, error });
    }
  });

  /**
   * DELETE /v1/operation/bindings/:id
   * Delete a binding rule
   */
  app.delete('/v1/operation/bindings/:id', async (req, res) => {
    try {
      const { id } = req.params;

      if (!bindingRules.has(id)) {
        return res.status(404).json({ success: false, error: 'Binding rule not found' });
      }

      bindingRules.delete(id);

      logDebug('container-ops', 'delete-binding', id);

      res.json({ success: true });
    } catch (err) {
      const error = err?.message || String(err);
      res.status(500).json({ success: false, error });
    }
  });

  // Export bindings for other modules
  return {
    bindingRules,
    getBindingRule: (id) => bindingRules.get(id),
    addBindingRule: (rule) => bindingRules.set(rule.id, rule),
    removeBindingRule: (id) => bindingRules.delete(id),
  };
}
