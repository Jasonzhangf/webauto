import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'node:http';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface BusMessage {
  type: 'event' | 'response';
  topic?: string;
  payload?: any;
  requestId?: string;
  data?: any;
}

export class UnifiedApiService {
  private app: express.Application;
  private server: http.Server;
  private wss: WebSocketServer;
  private busWss: WebSocketServer;
  private wsClients: Set<WebSocket> = new Set();
  private busClients: Set<WebSocket> = new Set();
  private lastContainerMatch: any = null;
  private browserMode: string = 'unknown';

  constructor(port: number = 7701) {
    this.app = express();
    this.app.use(express.json());
    this.server = http.createServer(this.app);
    this.wss = new WebSocketServer({ noServer: true });
    this.busWss = new WebSocketServer({ noServer: true });

    this.setupRoutes();
    this.setupWebSocket();
    this.setupBus();
  }

  private runCliCommand(moduleName: string, scriptPath: string, args: string[]): Promise<any> {
    return new Promise((resolve, reject) => {
      const modulePath = path.resolve(__dirname, `../../modules/${moduleName}/src/cli.ts`);
      const child = spawn('npx', ['tsx', modulePath, ...args], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, NODE_ENV: 'production' }
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        console.log(`[controller] cli exit ${moduleName}`, code);
        if (code === 0) {
          try {
            const result = JSON.parse(stdout);
            console.log(`[controller] cli stdout ${moduleName}`, result);
            resolve(result);
          } catch (e) {
            resolve({ success: true, data: stdout });
          }
        } else {
          console.error(`[controller] cli error ${moduleName}`, stderr);
          resolve({ success: false, error: stderr || `Exit code ${code}` });
        }
      });

      child.on('error', (err) => {
        console.error(`[controller] cli spawn error ${moduleName}`, err);
        reject(err);
      });
    });
  }

  private async handleAction(action: string, payload: any): Promise<any> {
    console.log(`[controller] handling action`, action, payload);
    
    switch (action) {
      case 'containers:match':
        return await this.runCliCommand('container-matcher', 'modules/container-matcher/src/cli.ts', [
          'inspect-tree',
          '--url', payload.url || 'https://weibo.com',
          '--max-depth', String(payload.maxDepth || 2),
          '--max-children', String(payload.maxChildren || 5)
        ]);
      case 'containers:inspect':
        return await this.runCliCommand('container-matcher', 'modules/container-matcher/src/cli.ts', [
          'inspect-tree',
          '--url', payload.url || 'https://weibo.com',
          '--max-depth', String(payload.maxDepth || 2),
          '--max-children', String(payload.maxChildren || 5)
        ]);
      case 'session-manager:list':
        return await this.runCliCommand('session-manager', 'modules/session-manager/src/cli.ts', ['list']);
      case 'browser-control:dom-dump':
        return await this.runCliCommand('browser-control', 'modules/browser-control/src/cli.ts', [
          'dom-dump',
          '--url', payload.url || 'https://weibo.com',
          '--headless', String(payload.headless !== false),
          '--profile', payload.profile || 'weibo_fresh'
        ]);
      default:
        return { success: false, error: `Unknown action: ${action}` };
    }
  }

  private setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', timestamp: Date.now() });
    });

    // Controller action proxy
    this.app.post('/v1/controller/action', async (req, res) => {
      try {
        const { action, payload } = req.body;
        const result = await this.handleAction(action, payload);
        res.json(result);
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    });

    // Container inspection
    this.app.post('/v1/containers/inspect', async (req, res) => {
      try {
        const result = await this.handleAction('containers:inspect', req.body);
        res.json(result);
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    });

    // Container matching
    this.app.post('/v1/containers/match', async (req, res) => {
      try {
        const result = await this.handleAction('containers:match', req.body);
        // Broadcast container match event
        if (result?.success && result?.data) {
          this.broadcastEvent('containers.matched', {
            success: true,
            snapshot: result.data,
            matched: true
          });
          // Also broadcast DOM tree if available
          if (result.data?.dom_tree) {
            this.broadcastEvent('dom.tree', {
              tree: result.data.dom_tree,
              url: result.data?.url || req.body?.url,
              timestamp: Date.now()
            });
          }
        } else {
          this.broadcastEvent('containers.matched', {
            success: false,
            matched: false,
            error: result?.error || 'Unknown error'
          });
        }
        res.json(result);
      } catch (err) {
        const errorPayload = {
          success: false,
          matched: false,
          error: err.message
        };
        this.broadcastEvent('containers.matched', errorPayload);
        res.status(500).json(errorPayload);
      }
    });

    // Browser mode events
    this.app.post('/v1/internal/events/browser-mode', async (req, res) => {
      try {
        this.broadcastEvent('browser.mode', req.body);
        res.json({ ok: true });
      } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
      }
    });

    // Health status endpoint
    this.app.get('/v1/health/status', (req, res) => {
      res.json(this.buildHealthStatus());
    });
  }

  private setupWebSocket() {
    this.server.on('upgrade', (request, socket, head) => {
      const url = new URL(request.url || '/', 'http://localhost');
      if (url.pathname === '/ws') {
        this.wss.handleUpgrade(request, socket, head, (ws) => {
          this.wss.emit('connection', ws, request);
        });
      } else if (url.pathname === '/bus') {
        this.busWss.handleUpgrade(request, socket, head, (ws) => {
          this.busWss.emit('connection', ws, request);
        });
      } else {
        socket.destroy();
      }
    });

    this.wss.on('connection', (ws: WebSocket) => {
      console.log('[unified-api] WebSocket client connected');
      this.wsClients.add(ws);

      ws.on('message', async (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString());
          if (message.type === 'action' && message.action && message.payload) {
            const result = await this.handleAction(message.action, message.payload);
            ws.send(JSON.stringify({
              type: 'response',
              requestId: message.requestId,
              data: result
            }));
          }
        } catch (err) {
          ws.send(JSON.stringify({
            type: 'error',
            error: err.message
          }));
        }
      });

      ws.on('close', () => {
        console.log('[unified-api] WebSocket client disconnected');
        this.wsClients.delete(ws);
      });

      ws.on('error', (err) => {
        console.error('[unified-api] WebSocket error:', err);
        this.wsClients.delete(ws);
      });
    });
  }

  private setupBus() {
    this.busWss.on('connection', (ws: WebSocket) => {
      console.log('[unified-api] Bus client connected');
      this.busClients.add(ws);

      // Send initial state
      ws.send(JSON.stringify({
        type: 'event',
        topic: 'health.status',
        payload: this.buildHealthStatus()
      }));

      if (this.lastContainerMatch) {
        ws.send(JSON.stringify({
          type: 'event',
          topic: 'containers.matched',
          payload: this.lastContainerMatch
        }));
      }

      ws.on('close', () => {
        console.log('[unified-api] Bus client disconnected');
        this.busClients.delete(ws);
      });

      ws.on('error', (err) => {
        console.error('[unified-api] Bus error:', err);
        this.busClients.delete(ws);
      });
    });
  }

  private buildHealthStatus() {
    return {
      unified_api: { healthy: true, port: 7701 },
      controller: { healthy: true, port: 8970 },
      browser_service: { healthy: true, port: 7704 },
      websocket: { connected: this.wsClients.size > 0 },
      bus: { connected: this.busClients.size > 0 },
      containers: { matched: !!this.lastContainerMatch?.success },
      browser: { mode: this.browserMode }
    };
  }

  private broadcastEvent(topic: string, payload: any) {
    console.log(`[unified-api] Broadcasting event: ${topic}`);
    
    // Update internal state
    if (topic === 'containers.matched') {
      this.lastContainerMatch = {
        ...(payload || {}),
        timestamp: Date.now(),
      };
    }
    if (topic === 'browser.mode') {
      this.browserMode = payload?.headless ? 'headless' : 'headful';
    }

    const message = JSON.stringify({
      type: 'event',
      topic,
      payload
    });

    // Broadcast to all WebSocket and Bus clients
    [...this.wsClients, ...this.busClients].forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    });
  }

  async start(port: number = 7701) {
    return new Promise<void>((resolve, reject) => {
      this.server.listen(port, () => {
        console.log(`[unified-api] Server running at http://127.0.0.1:${port}`);
        console.log(`[unified-api] WebSocket endpoint: ws://127.0.0.1:${port}/ws`);
        console.log(`[unified-api] Bus endpoint: ws://127.0.0.1:${port}/bus`);
        resolve();
      }).on('error', reject);
    });
  }

  async stop() {
    return new Promise<void>((resolve) => {
      this.wsClients.forEach(ws => ws.close());
      this.busClients.forEach(ws => ws.close());
      this.server.close(() => {
        console.log('[unified-api] Server stopped');
        resolve();
      });
    });
  }
}
