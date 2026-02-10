import type { IncomingMessage, ServerResponse } from 'node:http';
import { logDebug } from '../../modules/logging/src/index.js';
import { ensureBuiltinOperations } from '../../modules/operations/src/builtin.js';

// Ensure builtin operations are registered before handling any requests
ensureBuiltinOperations();

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

    try {
      const session = sessionManager?.getSession?.(sessionId);
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }
      const page = await session.ensurePage();

      const context = {
        containerId,
        page: {
          evaluate: async (fn: (...args: any[]) => any, ...args: any[]) => page.evaluate(fn, ...args),
          keyboard: page.keyboard
            ? {
                type: async (text: string, options?: { delay?: number; submit?: boolean }) => {
                  await page.keyboard.type(text, { delay: options?.delay });
                  if (options?.submit) {
                    await page.keyboard.press('Enter');
                  }
                },
                press: async (key: string, options?: { delay?: number }) => {
                  await page.keyboard.press(key, { delay: options?.delay });
                },
              }
            : undefined,
          // Protocol mode operations read ctx.page.mouse directly.
          mouse: page.mouse
            ? {
                click: async (x: number, y: number, options?: { button?: string; clickCount?: number }) =>
                  page.mouse.click(x, y, options as any),
                move: async (x: number, y: number, options?: { steps?: number }) =>
                  page.mouse.move(x, y, options as any),
                wheel: async (deltaX: number, deltaY: number) => page.mouse.wheel(deltaX, deltaY),
              }
            : undefined,
        },
        systemInput: {
          mouseMove: async (x: number, y: number, steps?: number) => {
            if (!page.mouse?.move) throw new Error('Page mouse.move not available');
            await page.mouse.move(x, y, { steps: steps || 1 });
            return { success: true };
          },
          mouseClick: async (x: number, y: number, button?: string, clicks?: number) => {
            if (!page.mouse?.click) throw new Error('Page mouse.click not available');
            await page.mouse.click(x, y, { button: button || 'left', clickCount: clicks || 1 });
            return { success: true };
          },
          mouseWheel: async (deltaX: number, deltaY: number) => {
            if (!page.mouse?.wheel) throw new Error('Page mouse.wheel not available');
            await page.mouse.wheel(deltaX || 0, deltaY || 0);
            return { success: true };
          },
        },
        logger: {
          info: (...args: any[]) => logDebug('container-ops', 'info', args),
          warn: (...args: any[]) => logDebug('container-ops', 'warn', args),
          error: (...args: any[]) => logDebug('container-ops', 'error', args),
        },
      };

      // Avoid hung container operations (especially on camoufox) from blocking the caller forever.
      // Per-stage logging should live inside operations; this is a hard cap.
      const hardTimeoutMs =
        typeof (config as any)?.timeoutMs === 'number' && Number.isFinite((config as any).timeoutMs)
          ? Math.max(1000, Math.floor((config as any).timeoutMs))
          : 30_000;
      const hardTimeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`container_operation_timeout_${hardTimeoutMs}ms`)), hardTimeoutMs),
      );

      const result = (await Promise.race([
        executor.execute(containerId, operationId, config || {}, context),
        hardTimeout,
      ])) as any;

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
