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
    const rootSelector = parameters?.root_selector || parameters?.rootSelector || null;
    const page = await session.ensurePage();
    const sessionId = session?.id || 'unknown';
    appendDomPickerLog('start', { sessionId, timeoutMs, rootSelector });
    const logFunctionName = `__webautoDomPickerLog_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    try {
      await page.exposeFunction(logFunctionName, (entry: any) => {
        appendDomPickerLog('page-event', { sessionId, ...entry });
      });
    } catch (err) {
      appendDomPickerLog('expose-error', { sessionId, error: (err as Error)?.message || String(err) });
    }
    const result = await page.evaluate(
      ({ timeoutMs: timeout, rootSelector: selector, logFn }: { timeoutMs: number; rootSelector: string | null; logFn: string }) =>
        new Promise((resolve) => {
          const resolveRoot = () => {
            if (selector) {
              try {
                const target = document.querySelector(selector);
                if (target) return target;
              } catch {
                /* ignore invalid selector */
              }
            }
            return document.getElementById('app') || document.body || document.documentElement;
          };
          const isElement = (node: any) => !!node && typeof node === 'object' && node.nodeType === 1;
          const rootEl = resolveRoot();
          const runtimeHighlight = (window as any).__webautoRuntime?.highlight || null;
          if (!runtimeHighlight?.highlightElements) {
            resolve({ success: false, error: 'runtime highlight unavailable' });
            return;
          }
          const highlightChannel = '__webauto_dom_picker';
          const cleanupHighlight = () => {
            if (runtimeHighlight?.clear) {
              try {
                runtimeHighlight.clear(highlightChannel);
              } catch {
                /* ignore */
              }
            }
          };
          let active = true;
          let lastHover: any = null;
          const cleanup = (payload: any) => {
            if (!active) return;
            active = false;
            document.removeEventListener('mousemove', onMove, true);
            document.removeEventListener('mousedown', onDown, true);
            document.removeEventListener('click', blockClick, true);
            document.removeEventListener('keydown', onKeyDown, true);
            document.removeEventListener('mouseleave', onMouseLeave, true);
            window.removeEventListener('scroll', onScroll, true);
            window.removeEventListener('blur', cancelOnBlur, true);
            window.removeEventListener('mouseout', onWindowMouseOut, true);
            clearTimeout(timer);
            cleanupHighlight();
            try {
              const cancelFn = (window as any).__webautoDomPickerCancel;
              if (cancelFn && cancelFn === globalCancelRef) {
                (window as any).__webautoDomPickerCancel = null;
              }
            } catch {
              /* ignore */
            }
            resolve(payload);
          };
          let globalCancelRef: (() => void) | null = null;
          try {
            const previous = (window as any).__webautoDomPickerCancel;
            if (typeof previous === 'function') {
              try {
                previous();
              } catch {
                /* ignore */
              }
            }
          } catch {
            /* noop */
          }
          const registerGlobalCancel = () => {
            globalCancelRef = () => cleanup({ success: false, cancelled: true, reason: 'force-cancelled' });
            (window as any).__webautoDomPickerCancel = globalCancelRef;
          };
          registerGlobalCancel();
          const timer = window.setTimeout(() => cleanup({ success: false, timeout: true }), timeout);
          const buildDomPath = (el: any) => {
            if (!el) return null;
            const indices: string[] = [];
            let current: any = el;
            let guard = 0;
            while (current && guard < 120) {
              if (rootEl && current === rootEl) {
                break;
              }
              const parent = current.parentElement;
              if (!parent) break;
              const idx = Array.prototype.indexOf.call(parent.children || [], current);
              indices.unshift(String(idx));
              current = parent;
              guard += 1;
            }
            return ['root'].concat(indices).join('/');
          };
          const buildSelector = (el: any) => {
            if (!el) return '';
            if (el.id) return `#${el.id}`;
            if (el.classList && el.classList.length) {
              return `${el.tagName.toLowerCase()}.${Array.from(el.classList).join('.')}`;
            }
            return el.tagName ? el.tagName.toLowerCase() : '';
          };
          const emitLog = (payload: Record<string, any>) => {
            try {
              if (logFn && typeof (window as any)[logFn] === 'function') {
                (window as any)[logFn](payload);
              }
            } catch {
              /* noop */
            }
          };
          const highlight = (el: any) => {
            if (!runtimeHighlight?.highlightElements) {
              return;
            }
            if (!el) {
              runtimeHighlight.clear(highlightChannel);
              emitLog({ type: 'highlight', state: 'none' });
              return;
            }
            runtimeHighlight.highlightElements([el], {
              channel: highlightChannel,
              style: '2px dashed #fbbc05',
              duration: 0,
              sticky: true,
            });
            const rect = el.getBoundingClientRect();
            emitLog({ type: 'highlight', state: 'visible', rect: { x: rect.left, y: rect.top, w: rect.width, h: rect.height } });
          };
          const extractText = (el: any) => {
            if (!el) return '';
            return (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160);
          };
          const findElement = (event: any) => {
            const rejectList = new Set<Element>();
            const pickFromList = (list: any[]) => {
              if (!Array.isArray(list)) return null;
              for (const entry of list) {
                if (isElement(entry) && !rejectList.has(entry)) {
                  return entry;
                }
              }
              return null;
            };
            const fromComposedPath = () => {
              if (event?.composedPath) {
                const pathList: any[] = event.composedPath();
                const candidate = pickFromList(pathList);
                if (candidate) return candidate;
              }
              return null;
            };
            const fromPoint = () => {
              if (typeof event?.clientX === 'number' && typeof event?.clientY === 'number') {
                if (typeof document.elementsFromPoint === 'function') {
                  const stack = document.elementsFromPoint(event.clientX, event.clientY);
                  const candidate = pickFromList(stack);
                  if (candidate) return candidate;
                }
                const fallback = document.elementFromPoint(event.clientX, event.clientY);
                if (isElement(fallback) && !rejectList.has(fallback)) {
                  return fallback;
                }
              }
              return null;
            };
            const directTarget = () => {
              let target = event?.target || event;
              while (target && !isElement(target)) {
                target = target?.parentElement;
              }
              if (isElement(target) && !rejectList.has(target)) {
                return target;
              }
              return null;
            };
            const candidate = fromComposedPath() || fromPoint() || directTarget();
            if (candidate) {
              emitLog({ type: 'hover-candidate', tag: candidate.tagName, id: candidate.id || null, classes: Array.from(candidate.classList || []) });
            }
            return candidate;
          };
          const finalizeSelection = (el: any) => {
            if (!el) {
              cleanup({ success: false, error: '未选中元素' });
              return;
            }
            const rect = el.getBoundingClientRect();
            emitLog({ type: 'finalize', tag: el.tagName, id: el.id || null, classes: Array.from(el.classList || []) });
            cleanup({
              success: true,
              dom_path: buildDomPath(el),
              selector: buildSelector(el),
              tag: el.tagName,
              id: el.id || null,
              classes: Array.from(el.classList || []),
              text: extractText(el),
              bounding_rect: {
                x: Math.round(rect.left),
                y: Math.round(rect.top),
                width: Math.round(rect.width),
                height: Math.round(rect.height),
              },
            });
          };
          const onMove = (event: any) => {
            if (!active) return;
            const target = findElement(event);
            if (target) {
              lastHover = target;
              highlight(target);
            } else {
              lastHover = null;
              highlight(null);
            }
          };
          const onScroll = () => {
            if (lastHover) {
              highlight(lastHover);
            }
          };
          const onDown = (event: any) => {
            if (!active) return;
            if (typeof event.button === 'number' && event.button !== 0) {
              return;
            }
            event.preventDefault();
            event.stopPropagation();
            emitLog({ type: 'mouse-down' });
            finalizeSelection(findElement(event));
          };
          const blockClick = (event: any) => {
            event.preventDefault();
            event.stopPropagation();
          };
          const onKeyDown = (event: any) => {
            if (!active) return;
            if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              emitLog({ type: 'escape' });
              cleanup({ success: false, cancelled: true });
            }
          };
          const cancelOnBlur = () => {
            emitLog({ type: 'blur-cancel' });
            cleanup({ success: false, cancelled: true });
          };
          const onMouseLeave = () => {
            if (!active) return;
            lastHover = null;
            highlight(null);
            emitLog({ type: 'mouseleave' });
          };
          const onWindowMouseOut = (event: any) => {
            if (!active) return;
            const nextTarget = event?.relatedTarget || event?.toElement;
            const shouldClear = !nextTarget || nextTarget === window || nextTarget === document;
            if (shouldClear) {
              onMouseLeave();
            }
          };
          document.addEventListener('mousemove', onMove, true);
          document.addEventListener('mousedown', onDown, true);
          document.addEventListener('click', blockClick, true);
          document.addEventListener('keydown', onKeyDown, true);
          window.addEventListener('scroll', onScroll, true);
          window.addEventListener('blur', cancelOnBlur, true);
          window.addEventListener('mouseout', onWindowMouseOut, true);
        }),
      { timeoutMs, rootSelector, logFn: logFunctionName },
    );
    appendDomPickerLog('result', { sessionId, success: result?.success !== false });
    await page.evaluate((fnName: string) => {
      try {
        delete (window as any)[fnName];
      } catch {
        /* noop */
      }
    }, logFunctionName).catch(() => {});
    return result;
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
        const selector = parameters.selector || parameters.css;
        if (!selector) {
          throw new Error('highlight_element requires selector');
        }
        const channel = parameters.channel || 'default';
        const style = parameters.style || '2px solid #34a853';
        const duration = typeof parameters.duration === 'number' ? parameters.duration : 2000;
        const sticky = Boolean(parameters.sticky);
        const maxMatches = Math.min(Math.max(Number(parameters.max_matches) || 20, 1), 200);
        appendHighlightLog('request', { sessionId, selector, style, duration, channel, sticky, maxMatches });
        const data = await this.highlightViaRuntime(session, {
          selector,
          channel,
          style,
          duration,
          sticky,
          maxMatches,
        });
        appendHighlightLog('result', { sessionId, selector, channel, count: data?.count ?? 0 });
        return {
          success: true,
          data,
        };
      }
      case 'clear_highlight': {
        const channel = parameters.channel || null;
        appendHighlightLog('clear', { sessionId, channel });
        const result = await this.clearHighlightOverlays(session, channel);
        return {
          success: true,
          data: result,
        };
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

  private async highlightViaRuntime(
    session: any,
    options: { selector: string; channel: string; style: string; duration: number; sticky: boolean; maxMatches: number },
  ) {
    const page = await session.ensurePage();
    await ensurePageRuntime(page);
    return page.evaluate((payload: { selector: string; channel: string; style: string; duration: number; sticky: boolean; maxMatches: number }) => {
      const runtime = (window as any).__webautoRuntime;
      if (!runtime || !runtime.highlight) {
        throw new Error('runtime highlight unavailable');
      }
      return runtime.highlight.highlightSelector(payload.selector, {
        channel: payload.channel,
        style: payload.style,
        duration: payload.duration,
        sticky: payload.sticky,
        maxMatches: payload.maxMatches,
      });
    }, options);
  }

  private async clearHighlightOverlays(session: any, channel?: string | null) {
    const page = await session.ensurePage();
    await ensurePageRuntime(page);
    return page.evaluate((targetChannel: string | null) => {
      const runtime = (window as any).__webautoRuntime;
      if (!runtime || !runtime.highlight) {
        return { cleared: 0 };
      }
      runtime.highlight.clear(targetChannel || null);
      return { cleared: targetChannel ? 1 : -1 };
    }, channel || null);
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
