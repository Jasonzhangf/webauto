import fs from 'fs';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import type { RawData } from 'ws';
import { SessionManager } from './SessionManager.js';
import { ContainerMatcher } from './ContainerMatcher.js';

interface WsServerOptions {
  host?: string;
  port?: number;
  sessionManager: SessionManager;
}

interface CommandPayload {
  command_type: string;
  [key: string]: any;
}

export class BrowserWsServer {
  private wss?: WebSocketServer;
  private matcher = new ContainerMatcher();
  private capabilityMap = new Map<string, string[]>();

  constructor(private options: WsServerOptions) {}

  async start() {
    if (this.wss) return;
    const host = this.options.host || '127.0.0.1';
    const port = Number(this.options.port || 8765);
    this.wss = new WebSocketServer({ host, port });
    this.wss.on('connection', (socket) => {
      socket.on('message', (data) => this.handleMessage(socket, data));
    });
    this.wss.on('listening', () => {
      console.log(`[browser-ws] listening on ws://${host}:${port}`);
    });
    this.wss.on('error', (err) => {
      console.error('[browser-ws] server error:', err);
    });
  }

  async stop() {
    if (!this.wss) return;
    await new Promise<void>((resolve) => this.wss?.close(() => resolve()));
    this.wss = undefined;
  }

  private async handleMessage(socket: WebSocket, raw: RawData) {
    let payload: any;
    try {
      payload = JSON.parse(this.rawToString(raw));
    } catch (err) {
      this.send(socket, {
        type: 'error',
        message: `Invalid JSON payload: ${(err as Error).message}`,
      });
      return;
    }

    if (payload?.type !== 'command') {
      this.send(socket, {
        type: 'error',
        message: 'Unsupported message type',
      });
      return;
    }

    const sessionId = String(payload.session_id || '');
    const command: CommandPayload = payload.data || {};
    try {
      const data = await this.dispatchCommand(sessionId, command);
      this.send(socket, {
        type: 'response',
        session_id: sessionId,
        data,
      });
    } catch (err) {
      this.send(socket, {
        type: 'response',
        session_id: sessionId,
        data: {
          success: false,
          error: (err as Error).message,
        },
      });
    }
  }

  private async dispatchCommand(sessionId: string, command: CommandPayload) {
    const type = command.command_type;
    switch (type) {
      case 'session_control':
        return this.handleSessionControl(sessionId, command);
      case 'mode_switch':
        return this.handleModeSwitch(sessionId, command);
      case 'container_operation':
        return this.handleContainerOperation(sessionId, command);
      case 'node_execute':
        return this.handleNodeExecute(sessionId, command);
      case 'dev_control':
        return this.handleDevControl(sessionId, command);
      default:
        throw new Error(`Unknown command_type: ${type}`);
    }
  }

  private async handleSessionControl(sessionId: string, command: CommandPayload) {
    const action = command.action;
    if (action === 'create') {
      const capabilities: string[] = command.capabilities || ['dom'];
      const browserConfig = command.browser_config || {};
      const profileId = browserConfig.profile_id || browserConfig.session_name || `session_${Date.now().toString(36)}`;
      const headless = browserConfig.headless ?? false;
      const viewport = browserConfig.viewport;
      const userAgent = browserConfig.user_agent;
      const initialUrl = browserConfig.initial_url || command.initial_url;

      const result = await this.options.sessionManager.createSession({
        profileId,
        sessionName: browserConfig.session_name || profileId,
        headless,
        viewport,
        userAgent,
        initialUrl,
      });
      this.capabilityMap.set(result.sessionId, capabilities);
      return {
        success: true,
        session_id: result.sessionId,
        status: 'ready',
        capabilities,
      };
    }

    if (action === 'list') {
      const sessions = this.options.sessionManager.listSessions().map((session) => ({
        session_id: session.session_id || session.profileId,
        profileId: session.profileId,
        current_url: session.current_url,
        mode: session.mode,
        status: 'ready',
        capabilities: this.capabilityMap.get(session.profileId) || [],
      }));
      return {
        success: true,
        sessions,
      };
    }

    if (action === 'info') {
      if (!sessionId) {
        throw new Error('session_id required for info action');
      }
      const info = await this.options.sessionManager.getSessionInfo(sessionId);
      if (!info) {
        return {
          success: false,
          error: `Session ${sessionId} not found`,
        };
      }
      return {
        success: true,
        session_info: {
          ...info,
          capabilities: this.capabilityMap.get(sessionId) || [],
        },
      };
    }

    if (action === 'delete') {
      if (!sessionId) {
        throw new Error('session_id required for delete action');
      }
      const deleted = await this.options.sessionManager.deleteSession(sessionId);
      this.capabilityMap.delete(sessionId);
      return {
        success: deleted,
        session_id: sessionId,
      };
    }

    throw new Error(`Unknown session action: ${action}`);
  }

  private async handleModeSwitch(sessionId: string, command: CommandPayload) {
    if (!sessionId) {
      throw new Error('session_id required for mode switch');
    }
    const session = this.options.sessionManager.getSession(sessionId);
    if (!session) {
      return {
        success: false,
        error: `Session ${sessionId} not found`,
      };
    }
    const target = command.target_mode || 'dev';
    session.setMode(target);
    return {
      success: true,
      session_id: sessionId,
      new_mode: target,
    };
  }

  private async handleContainerOperation(sessionId: string, command: CommandPayload) {
    if (!sessionId) {
      throw new Error('session_id required for container operations');
    }
    const session = this.options.sessionManager.getSession(sessionId);
    if (!session) {
      return {
        success: false,
        error: `Session ${sessionId} not found`,
      };
    }
    const pageContext = command.page_context || {};
    if (command.action === 'match_root') {
      const match = await this.matcher.matchRoot(session, pageContext);
      if (!match) {
        return {
          success: false,
          error: 'No matching container found',
        };
      }
      return {
        success: true,
        data: {
          ...match,
          matched_container: match.container,
        },
      };
    }
    if (command.action === 'inspect_tree') {
      const snapshot = await this.matcher.inspectTree(session, pageContext, command.parameters || {});
      return {
        success: true,
        data: snapshot,
      };
    }
    throw new Error(`Unsupported container action: ${command.action}`);
  }

  private async handleNodeExecute(sessionId: string, command: CommandPayload) {
    if (!sessionId) {
      throw new Error('session_id required for node_execute');
    }
    const session = this.options.sessionManager.getSession(sessionId);
    if (!session) {
      return {
        success: false,
        error: `Session ${sessionId} not found`,
      };
    }
    const nodeType = command.node_type;
    const parameters = command.parameters || {};

    switch (nodeType) {
      case 'navigate': {
        const url = parameters.url;
        if (!url) {
          throw new Error('Navigate node requires url');
        }
        await session.goto(url);
        return {
          success: true,
          data: {
            action: 'navigated',
            url,
          },
        };
      }
      case 'click': {
        const selector = parameters.selector;
        if (!selector) throw new Error('Click node requires selector');
        await session.click(selector);
        return {
          success: true,
          data: { action: 'clicked', selector },
        };
      }
      case 'type': {
        const selector = parameters.selector;
        if (!selector) throw new Error('Type node requires selector');
        const text = parameters.text ?? parameters.value ?? '';
        await session.fill(selector, String(text));
        return {
          success: true,
          data: { action: 'typed', selector, text },
        };
      }
      case 'screenshot': {
        const filename = parameters.filename || `screenshot_${Date.now()}.png`;
        const fullPage = parameters.full_page !== false;
        const dir = path.resolve(process.cwd(), 'screenshots');
        await fs.promises.mkdir(dir, { recursive: true });
        const target = path.join(dir, filename);
        const buffer = await session.screenshot(fullPage);
        await fs.promises.writeFile(target, buffer);
        return {
          success: true,
          data: {
            action: 'screenshot',
            screenshot_path: target,
            full_page: fullPage,
          },
        };
      }
      case 'query': {
        const selector = parameters.selector;
        if (!selector) throw new Error('Query node requires selector');
        const limit = Number(parameters.max_items || parameters.maxItems || 5);
        const page = await session.ensurePage();
        const result = await page.$$eval(selector, (els, lim) => {
          const sample = [];
          const max = Math.max(0, Number(lim) || 0);
          for (let i = 0; i < Math.min(max, els.length); i++) {
            const el = els[i] as HTMLElement;
            sample.push({
              tag: el.tagName,
              id: el.id || null,
              classes: Array.from(el.classList || []),
              text: (el.textContent || '').trim().slice(0, 120),
            });
          }
          return {
            count: els.length,
            sample,
          };
        }, limit);
        return {
          success: true,
          data: {
            selector,
            count: result.count,
            sample: result.sample,
          },
        };
      }
      case 'dom_info': {
        const page = await session.ensurePage();
        const info = await page.evaluate(() => {
          const doc = document;
          const html = doc.documentElement;
          const body = doc.body;
          const serialize = (el: Element | null) => {
            if (!el) return null;
            return {
              tag: el.tagName,
              id: el.id || null,
              classes: Array.from((el as HTMLElement).classList || []),
            };
          };
          const firstChildren = (el: Element | null, limit = 8) => {
            if (!el || !el.children) return [];
            return Array.from(el.children)
              .slice(0, limit)
              .map((child) => serialize(child));
          };
          return {
            html: serialize(html),
            body: serialize(body),
            app: serialize(doc.getElementById('app')),
            appChildren: firstChildren(doc.getElementById('app')),
            bodyChildren: firstChildren(body),
          };
        });
        return {
          success: true,
          data: info,
        };
      }
      case 'eval':
      case 'evaluate':
      case 'evaluate_js': {
        const expression = parameters.expression || parameters.script;
        if (!expression) {
          throw new Error('Eval node requires expression');
        }
        const arg = parameters.arg;
        const result = await session.evaluate(expression, arg);
        return {
          success: true,
          data: { result },
        };
      }
      default:
        throw new Error(`Unsupported node type: ${nodeType}`);
    }
  }

  private async handleDevControl(sessionId: string, command: CommandPayload) {
    if (command.action === 'enable_overlay') {
      return {
        success: true,
        data: {
          enabled: true,
          message: 'Overlay not implemented in TS service yet',
        },
      };
    }
    return {
      success: false,
      error: `Unsupported dev control action: ${command.action}`,
    };
  }

  private send(socket: WebSocket, payload: Record<string, any>) {
    try {
      socket.send(JSON.stringify(payload));
    } catch (err) {
      console.error('[browser-ws] failed to send message:', err);
    }
  }

  private rawToString(data: RawData): string {
    if (typeof data === 'string') return data;
    if (Buffer.isBuffer(data)) return data.toString('utf-8');
    if (Array.isArray(data)) {
      return Buffer.concat(data).toString('utf-8');
    }
    return Buffer.from(data).toString('utf-8');
  }
}
