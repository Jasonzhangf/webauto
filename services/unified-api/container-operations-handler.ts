import type { IncomingMessage, ServerResponse } from 'node:http';
import { logDebug } from '../../modules/logging/src/index.js';

export async function handleContainerOperations(
  req: IncomingMessage,
  res: ServerResponse,
  sessionManager: any,
  executor: any
): Promise<boolean> {
  const url = new URL(req.url || '', `http://${req.headers.host}`);

  // POST /v1/container/:containerId/execute
  const executeMatch = url.pathname.match(/^\/v1\/container\/([^/]+)\/execute$/);
  if (executeMatch && req.method === 'POST') {
    const containerId = executeMatch[1];
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

    try {
      const page = await session.ensurePage();
      const handle = { sessionId, element: null, bbox: null };
      const result = await executor.execute(containerId, operationId, config || {}, handle);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, data: result }));
    } catch (err: any) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message || String(err) }));
    }
    return true;
  }

  return false;
}

async function readJsonBody(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  return JSON.parse(raw);
}
