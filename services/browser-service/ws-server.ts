import fs from 'fs';
import path from 'path';
import os from 'os';
import { WebSocketServer, WebSocket } from 'ws';
import type { RawData } from 'ws';
import { SessionManager } from './SessionManager.js';
import { ContainerMatcher } from './ContainerMatcher.js';
import { ensurePageRuntime } from './pageRuntime.js';

interface WsServerOptions {
  host?: string;
  port?: number;
  sessionManager: SessionManager;
}

interface CommandPayload {
  command_type: string;
  [key: string]: any;
}

const logsDir = path.join(os.homedir(), '.webauto', 'logs');
const domPickerLogPath = path.join(logsDir, 'dom-picker-debug.log');
const highlightLogPath = path.join(logsDir, 'highlight-debug.log');

function appendLog(target: string, event: string, payload: Record<string, any> = {}) {
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      event,
      ...payload,
    });
    fs.appendFileSync(target, `${line}\n`, 'utf-8');
  } catch {
    /* ignore log errors */
  }
}

const appendDomPickerLog = (event: string, payload: Record<string, any> = {}) => appendLog(domPickerLogPath, event, payload);
const appendHighlightLog = (event: string, payload: Record<string, any> = {}) => appendLog(highlightLogPath, event, payload);

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

  private async handleDomPick(session: any, parameters: Record<string, any>) {
    const timeoutMs = Math.min(Math.max(Number(parameters?.timeout) || 25000, 3000), 60000);
    const page = await session.ensurePage();
    const sessionId = session?.id || 'unknown';
    appendDomPickerLog('start', { sessionId, timeoutMs });

    await ensurePageRuntime(page);
    try {
      await page.bringToFront();
    } catch {
      /* ignore */
    }

    const hasRuntime = await page.evaluate(() => {
      const w: any = window as any;
      return Boolean(w.__domPicker && typeof w.__domPicker.startSession === 'function' && typeof w.__domPicker.getLastState === 'function');
    });

    if (!hasRuntime) {
      appendDomPickerLog('runtime-missing', { sessionId });
      return {
        success: false,
        error: 'domPicker runtime unavailable',
        cancelled: false,
        timeout: false,
      };
    }

    const rootSelector = parameters.root_selector || parameters.rootSelector || null;
    await page.evaluate((opts: { timeoutMs: number; rootSelector: string | null }) => {
      const w: any = window as any;
      try {
        w.__domPicker.startSession({ mode: 'hover-select', timeoutMs: opts.timeoutMs, rootSelector: opts.rootSelector });
      } catch (err) {
        // swallow, polling below will observe error/idle state
        // eslint-disable-next-line no-console
        console.warn('[dom-picker] startSession error', err);
      }
    }, { timeoutMs, rootSelector });

    const startedState = await page.evaluate(() => {
      const w: any = window as any;
      return w.__domPicker ? w.__domPicker.getLastState() : null;
    });
    appendDomPickerLog('started', { sessionId, state: startedState });

    const startedAt = Date.now();
    const hardTimeout = timeoutMs + 2000;

    // Poll state until selected / cancelled / timeout
    // We keep polling even after logical timeoutMs so that page-side timeout can mark phase = 'timeout'.
    while (true) {
      const elapsed = Date.now() - startedAt;
      if (elapsed > hardTimeout) {
        appendDomPickerLog('hard-timeout', { sessionId, elapsed });
        return {
          success: false,
          error: 'domPicker hard timeout',
          cancelled: false,
          timeout: true,
        };
      }

      const state: any = await page.evaluate(() => {
        const w: any = window as any;
        return w.__domPicker ? w.__domPicker.getLastState() : null;
      });

      if (!state) {
        appendDomPickerLog('state-missing', { sessionId });
        return {
          success: false,
          error: 'domPicker state unavailable',
          cancelled: false,
          timeout: false,
        };
      }

      const phase = state.phase;

      if (phase === 'selected' && state.selection) {
        const sel: {
          path?: string;
          selector?: string;
          rect?: { x: number; y: number; width: number; height: number };
          tag?: string;
          id?: string | null;
          text?: string;
          classes?: string[];
        } = state.selection;
        appendDomPickerLog('selected', { sessionId, selection: sel });
        return {
          success: true,
          dom_path: sel.path || '',
          selector: sel.selector || '',
          bounding_rect: sel.rect || { x: 0, y: 0, width: 0, height: 0 },
          tag: sel.tag || '',
          id: sel.id || null,
          classes: Array.isArray(sel.classes) ? sel.classes : [],
          text: sel.text || '',
          cancelled: false,
          timeout: false,
        };
      }

      if (phase === 'cancelled') {
        appendDomPickerLog('cancelled', { sessionId });
        return {
          success: false as const,
          error: state.error || 'cancelled',
          dom_path: null as string | null,
          selector: null as string | null,
          bounding_rect: null as { x: number; y: number; width: number; height: number } | null,
          tag: null as string | null,
          id: null as string | null,
          classes: [] as string[],
          text: '' as string,
          cancelled: true as const,
          timeout: false as const,
        };
      }

      if (phase === 'timeout') {
        appendDomPickerLog('timeout', { sessionId });
        return {
          success: false as const,
          error: state.error || 'timeout',
          dom_path: null as string | null,
          selector: null as string | null,
          bounding_rect: null as { x: number; y: number; width: number; height: number } | null,
          tag: null as string | null,
          id: null as string | null,
          classes: [] as string[],
          text: '' as string,
          cancelled: false as const,
          timeout: true as const,
        };
      }

      await new Promise((r) => setTimeout(r, 100));
    }
  }

  async stop() {
    if (!this.wss) return;
    await new Promise<void>((resolve) => this.wss?.close(() => resolve()));
    this.wss = undefined;
  }

  private async handleDomPickerLoopback(session: any, parameters: Record<string, any>) {
    const page = await session.ensurePage();
    const selector = parameters.selector || 'body';
    const timeoutMs = Math.min(Math.max(Number(parameters?.timeout) || 10000, 1000), 60000);
    const settleMs = Math.min(Math.max(Number(parameters?.settle_ms) || 32, 0), 2000);
    const sessionId = session?.id || 'unknown';
    appendDomPickerLog('loopback_start', { sessionId, selector, timeoutMs, settleMs });

    await ensurePageRuntime(page);

    // Real loopback: compute element center, move the real browser mouse, then read picker state.
    const prep = await page.evaluate((sel: string) => {
      const runtime: any = (window as any).__webautoRuntime;
      const picker: any = (window as any).__domPicker;
      if (!runtime || !runtime.ready) {
        return { ok: false, error: '__webautoRuntime not ready' };
      }
      if (!picker || typeof picker.startSession !== 'function' || typeof picker.getLastState !== 'function') {
        return { ok: false, error: '__domPicker unavailable' };
      }
      const info = picker.findElementCenter ? picker.findElementCenter(sel) : null;
      const el = typeof sel === 'string' ? document.querySelector(sel) : null;
      if (!info || !info.found || !el) {
        return { ok: false, error: 'selector_not_found' };
      }
      const point = { x: Math.round(info.x), y: Math.round(info.y) };
      const rect = info.rect;
      const buildPath = runtime?.dom?.buildPathForElement;
      const targetPath = buildPath && el instanceof Element ? buildPath(el, null) : null;
      const fromPoint = document.elementFromPoint(point.x, point.y);
      const fromPointPath = buildPath && fromPoint instanceof Element ? buildPath(fromPoint, null) : null;
      const before = picker.getLastState();
      if (!before?.phase || before.phase === 'idle') {
        picker.startSession({ timeoutMs: 8000 });
      }
      return {
        ok: true,
        selector: sel,
        point,
        targetRect: rect,
        targetPath,
        fromPointPath,
        stateBefore: before,
      };
    }, selector);

    if (!prep?.ok) {
      appendDomPickerLog('loopback_runtime_missing', { sessionId, selector, error: prep?.error });
      return { success: false, error: prep?.error || 'loopback_prep_failed' };
    }

    await page.mouse.move(prep.point.x, prep.point.y);
    if (settleMs > 0) {
      await new Promise((r) => setTimeout(r, settleMs));
    }

    const after = await page.evaluate(() => {
      const picker: any = (window as any).__domPicker;
      return picker?.getLastState?.() || null;
    });

    await page.evaluate((sel: string) => {
      const runtime: any = (window as any).__webautoRuntime;
      runtime?.highlight?.highlightSelector?.(sel, { persistent: true, channel: 'dom-picker-loopback' });
    }, prep.selector);

    const result = {
      selector: prep.selector,
      point: prep.point,
      targetRect: prep.targetRect,
      hoveredPath: after?.selection?.path || after?.hovered?.path || after?.selected?.path || after?.path || null,
      targetPath: prep.targetPath,
      fromPointPath: prep.fromPointPath,
      overlayRect: after?.selection?.rect || after?.hovered?.rect || after?.selected?.rect || after?.rect || null,
      stateBefore: prep.stateBefore,
      stateAfter: after,
      matches:
        Boolean(prep.targetPath) &&
        (after?.selection?.path || after?.hovered?.path || after?.selected?.path || after?.path) === prep.targetPath &&
        Boolean(after?.selection?.rect || after?.hovered?.rect || after?.selected?.rect || after?.rect),
    };

    appendDomPickerLog('loopback_result', { sessionId, selector, result });
    return {
      success: true,
      data: result,
    };
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
      case 'dev_command':
        return this.handleDevCommand(sessionId, command);
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
          container: match.container,
          selector: match.container?.matched_selector || match.match_details?.selector,
          domPath: match.match_details?.dom_path || null,
          match_details: match.match_details,
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
    if (command.action === 'inspect_dom_branch') {
      const branch = await this.matcher.inspectDomBranch(session, pageContext, command.parameters || {});
      return {
        success: true,
        data: branch,
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
      case 'pick_dom': {
        const result = await this.handleDomPick(session, parameters);
        return {
          success: true,
          data: result,
        };
      }
      case 'dom_pick_loopback': {
        const result = await this.handleDomPickerLoopback(session, parameters);
        return {
          success: true,
          data: result,
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

  private async handleDevCommand(sessionId: string, command: CommandPayload) {
    if (!sessionId) {
      throw new Error('session_id required for dev_command');
    }
    const session = this.options.sessionManager.getSession(sessionId);
    if (!session) {
      return {
        success: false,
        error: `Session ${sessionId} not found`,
      };
    }
    const action = command.action;
    const parameters = command.parameters || {};
    switch (action) {
      case 'highlight_element': {
        const selector = (parameters.selector || '').trim();
        if (!selector) {
          return { success: false, error: 'selector required' };
        }
        const channel = (parameters.channel || 'ui-action').trim() || 'ui-action';
        const style = typeof parameters.style === 'string' ? parameters.style : undefined;
        const duration = typeof parameters.duration === 'number' ? parameters.duration : Number(parameters.duration || 0);
        const sticky = typeof parameters.sticky === 'boolean' ? parameters.sticky : Boolean(parameters.hold || false);
        const rootSelector = parameters.root_selector || parameters.rootSelector || null;

        appendHighlightLog('request', { sessionId, channel, selector, style, duration, sticky, rootSelector });
        const page = await session.ensurePage();
        const result = await page.evaluate(
          (config) => {
            if (!(window as any).__webautoRuntime?.highlight?.highlightSelector) {
              throw new Error('highlight runtime unavailable');
            }
            const res = (window as any).__webautoRuntime.highlight.highlightSelector(config.selector, {
              channel: config.channel,
              ...(config.style ? { style: config.style } : {}),
              ...(Number.isFinite(config.duration) && config.duration > 0 ? { duration: config.duration } : {}),
              ...(typeof config.sticky === 'boolean' ? { sticky: config.sticky } : {}),
              ...(config.rootSelector ? { rootSelector: config.rootSelector } : {}),
            });
            const count = typeof res === 'number' ? res : Number(res?.count || res?.matched || 0);
            return { count: Number.isFinite(count) ? count : 0, channel: config.channel };
          },
          { selector, channel, style, duration: Number.isFinite(duration) ? duration : 0, sticky, rootSelector },
        );
        appendHighlightLog('result', { sessionId, channel, selector, count: result?.count || 0 });
        return { success: true, data: result };
      }
      case 'clear_highlight': {
        const channel = (parameters.channel || 'ui-action').trim() || 'ui-action';
        appendHighlightLog('clear', { sessionId, channel });
        const page = await session.ensurePage();
        await page.evaluate((ch) => {
          (window as any).__webautoRuntime?.highlight?.clear?.(ch);
        }, channel);
        return {
          success: true,
          data: { cleared: true },
        };
      }
      case 'highlight_dom_path': {
        const path = (parameters.path || parameters.dom_path || '').trim();
        if (!path) {
          return { success: false, error: 'path required' };
        }
        const channel = (parameters.channel || 'ui-action').trim() || 'ui-action';
        const style = typeof parameters.style === 'string' ? parameters.style : undefined;
        const duration = typeof parameters.duration === 'number' ? parameters.duration : Number(parameters.duration || 0);
        const sticky = typeof parameters.sticky === 'boolean' ? parameters.sticky : Boolean(parameters.hold || false);
        const rootSelector = parameters.root_selector || parameters.rootSelector || null;
        appendHighlightLog('request', { sessionId, channel, path, style, duration, sticky, rootSelector });
        const page = await session.ensurePage();
        const result = await page.evaluate(
          (config) => {
            const runtime: any = (window as any).__webautoRuntime;
            if (!runtime?.highlight?.highlightElements) {
              throw new Error('highlight runtime unavailable');
            }
            const resolveRoot = (sel: string | null) => {
              if (!sel) return document.body || document.documentElement;
              return document.querySelector(sel) || document.body || document.documentElement;
            };
            const normalizePath = (raw: string) => {
              const tokens = String(raw || '')
                .split('/')
                .filter((t) => t.length);
              if (!tokens.length) return ['root'];
              if (tokens[0] !== 'root') tokens.unshift('root');
              return tokens;
            };
            const parts = normalizePath(config.path);
            let node = resolveRoot(config.rootSelector);
            if (!node) return { count: 0, channel: config.channel };
            if (parts.length > 1) {
              for (let i = 1; i < parts.length; i += 1) {
                const idx = Number(parts[i]);
                const children = node.children ? Array.from(node.children) : [];
                if (!Number.isFinite(idx) || idx < 0 || idx >= children.length) {
                  node = null;
                  break;
                }
                node = children[idx];
                if (!node) break;
              }
            }
            if (!node) return { count: 0, channel: config.channel };
            runtime.highlight.highlightElements([node], {
              channel: config.channel,
              ...(config.style ? { style: config.style } : {}),
              ...(Number.isFinite(config.duration) && config.duration > 0 ? { duration: config.duration } : {}),
              ...(typeof config.sticky === 'boolean' ? { sticky: config.sticky } : {}),
              ...(config.rootSelector ? { rootSelector: config.rootSelector } : {}),
            });
            return { count: 1, channel: config.channel };
          },
          { path, channel, style, duration: Number.isFinite(duration) ? duration : 0, sticky, rootSelector },
        );
        appendHighlightLog('result', { sessionId, channel, path, count: result?.count || 0 });
        return { success: true, data: result };
      }
      case 'cancel_dom_pick': {
        const result = await this.cancelDomPicker(session);
        return {
          success: true,
          data: result,
        };
      }
      default:
        return {
          success: false,
          error: `Unsupported dev command: ${action}`,
        };
    }
  }

  private async highlightViaRuntime() {
    return { count: 0 };
  }

  private async clearHighlightOverlays() {
    return { cleared: 0 };
  }

  private async cancelDomPicker(session: any) {
    const page = await session.ensurePage();
    return page.evaluate(() => {
      const cancel = (window as any).__webautoDomPickerCancel;
      if (typeof cancel === 'function') {
        try {
          cancel();
          (window as any).__webautoDomPickerCancel = null;
          return { cancelled: true };
        } catch (err) {
          return { cancelled: false, error: (err as Error).message };
        }
      }
      return { cancelled: false }; 
    });
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
