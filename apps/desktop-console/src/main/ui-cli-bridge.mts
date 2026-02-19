import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import type { BrowserWindow } from 'electron';

type UiCliAction = {
  action: string;
  selector?: string;
  value?: string;
  text?: string;
  key?: string;
  tabId?: string;
  tabLabel?: string;
  state?: 'exists' | 'visible' | 'hidden' | 'text_contains' | 'text_equals' | 'value_equals' | 'not_disabled';
  nth?: number;
  exact?: boolean;
  timeoutMs?: number;
  intervalMs?: number;
  detailed?: boolean;
};

type UiCliStatus = {
  ok: boolean;
  pid: number;
  ready: boolean;
  host: string;
  port: number;
  ts: string;
  snapshot?: any;
  error?: string;
};

type UiCliBridgeOptions = {
  getWindow: () => BrowserWindow | null;
  host?: string;
  port?: number;
};

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 7716;
const CONTROL_FILE = path.join(os.homedir(), '.webauto', 'run', 'ui-cli.json');

function readInt(input: unknown, fallback: number): number {
  const n = Number(input);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function sendJson(res: ServerResponse, code: number, payload: any) {
  const body = JSON.stringify(payload);
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Length', Buffer.byteLength(body));
  res.end(body);
}

function parseBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

function isUiReady(win: BrowserWindow | null) {
  if (!win || win.isDestroyed()) return false;
  const wc = win.webContents;
  if (!wc || wc.isDestroyed()) return false;
  if (typeof wc.isCrashed === 'function' && wc.isCrashed()) return false;
  return true;
}

async function writeControlFile(host: string, port: number) {
  const payload = {
    pid: process.pid,
    host,
    port,
    startedAt: new Date().toISOString(),
  };
  try {
    await fs.mkdir(path.dirname(CONTROL_FILE), { recursive: true });
    await fs.writeFile(CONTROL_FILE, JSON.stringify(payload, null, 2), 'utf8');
  } catch {
    // ignore control file write errors
  }
}

async function removeControlFile() {
  try {
    await fs.unlink(CONTROL_FILE);
  } catch {
    // ignore cleanup errors
  }
}

function buildSnapshotScript() {
  return `(() => {
    const text = (sel) => {
      const el = document.querySelector(sel);
      return el ? String(el.textContent || '').trim() : '';
    };
    const value = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return '';
      if ('value' in el) return String(el.value ?? '');
      return String(el.textContent || '').trim();
    };
    const activeTab = document.querySelector('.tab.active');
    const errors = Array.from(document.querySelectorAll('#recent-errors-list li'))
      .map((el) => String(el.textContent || '').trim())
      .filter(Boolean)
      .slice(0, 20);
    return {
      ready: true,
      activeTabId: String(activeTab?.dataset?.tabId || '').trim(),
      activeTabLabel: String(activeTab?.textContent || '').trim(),
      status: text('#status'),
      runId: text('#run-id-text'),
      errorCount: text('#error-count-text'),
      currentPhase: text('#current-phase'),
      currentAction: text('#current-action'),
      progressPercent: text('#progress-percent'),
      keyword: value('#keyword-input'),
      target: value('#target-input'),
      account: value('#account-select'),
      env: value('#env-select'),
      recentErrors: errors,
      ts: new Date().toISOString(),
    };
  })()`;
}

function buildActionScript(action: UiCliAction) {
  const payloadJson = JSON.stringify(action);
  const snapshotScript = buildSnapshotScript();
  
  return `(() => {
    const payload = ${payloadJson};
    const normalize = (v) => String(v || '').trim();
    const isVisible = (el) => {
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) return false;
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    };
    const query = (selector) => {
      const s = normalize(selector);
      if (!s) return null;
      return document.querySelector(s);
    };
    const queryAll = (selector) => {
      const s = normalize(selector) || 'body';
      return Array.from(document.querySelectorAll(s));
    };
    const findByText = ({ selector, text, exact, nth }) => {
      const q = normalize(selector) || 'button';
      const target = normalize(text);
      const lower = target.toLowerCase();
      if (!target) return null;
      const nodes = Array.from(document.querySelectorAll(q));
      const matched = nodes.filter((el) => {
        const t = normalize(el.textContent);
        if (!t) return false;
        if (exact === true) return t === target;
        return t.toLowerCase().includes(lower);
      });
      const index = Number.isFinite(Number(nth)) ? Math.max(0, Math.floor(Number(nth))) : 0;
      return matched[index] || null;
    };
    const getElementDetails = (el) => {
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      const attrs = {};
      for (const attr of el.attributes) {
        attrs[attr.name] = attr.value;
      }
      return {
        rect: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          top: Math.round(rect.top),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          bottom: Math.round(rect.bottom),
        },
        computedStyle: {
          display: style.display,
          visibility: style.visibility,
          opacity: style.opacity,
          backgroundColor: style.backgroundColor,
          color: style.color,
          fontSize: style.fontSize,
          fontFamily: style.fontFamily,
          position: style.position,
          zIndex: style.zIndex,
        },
        attributes: attrs,
        innerText: el.innerText,
        outerHTML: el.outerHTML?.slice(0, 2000),
        tagName: el.tagName,
        className: el.className,
        id: el.id,
      };
    };
    const focusEl = (el) => {
      if (!el || typeof el.focus !== 'function') return false;
      el.focus();
      return document.activeElement === el;
    };
    const clickEl = (el) => {
      if (!el || typeof el.click !== 'function') return false;
      if (typeof el.scrollIntoView === 'function') {
        try { el.scrollIntoView({ block: 'center', inline: 'nearest' }); } catch {}
      }
      focusEl(el);
      el.click();
      return true;
    };
    const setInputValue = (el, value) => {
      if (!el) return false;
      const text = String(value ?? '');
      if ('value' in el) {
        el.value = text;
      } else {
        el.textContent = text;
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    };
    const pressKey = (el, key) => {
      const k = normalize(key) || 'Enter';
      const target = el || document.activeElement || document.body;
      const code = k === 'Escape' ? 'Escape' : k === 'Enter' ? 'Enter' : k;
      const init = { key: k, code, bubbles: true, cancelable: true };
      target.dispatchEvent(new KeyboardEvent('keydown', init));
      target.dispatchEvent(new KeyboardEvent('keyup', init));
      return true;
    };
    const findTab = () => {
      const tabId = normalize(payload.tabId || payload.value);
      const tabLabel = normalize(payload.tabLabel || payload.selector);
      const tabs = Array.from(document.querySelectorAll('.tab'));
      if (tabId) {
        const byId = tabs.find((el) => normalize(el?.dataset?.tabId) === tabId);
        if (byId) return byId;
      }
      if (tabLabel) {
        const lower = tabLabel.toLowerCase();
        return tabs.find((el) => normalize(el.textContent).toLowerCase().includes(lower)) || null;
      }
      return null;
    };

    if (payload.action === 'snapshot') {
      return { ok: true, snapshot: ${snapshotScript} };
    }
    if (payload.action === 'dialogs') {
      const mode = normalize(payload.value).toLowerCase();
      const w = window;
      const key = '__webauto_ui_cli_dialogs__';
      if (mode === 'silent') {
        if (!w[key]) {
          w[key] = {
            alert: w.alert,
            confirm: w.confirm,
            prompt: w.prompt,
          };
        }
        w.alert = () => {};
        w.confirm = () => true;
        w.prompt = () => '';
        return { ok: true, mode: 'silent' };
      }
      if (mode === 'restore') {
        if (w[key]) {
          w.alert = w[key].alert;
          w.confirm = w[key].confirm;
          w.prompt = w[key].prompt;
          delete w[key];
        }
        return { ok: true, mode: 'restore' };
      }
      return { ok: false, error: 'unsupported_dialog_mode' };
    }
    if (payload.action === 'tab') {
      const tab = findTab();
      if (!tab) return { ok: false, error: 'tab_not_found' };
      clickEl(tab);
      return { ok: true, tab: normalize(tab.textContent), tabId: normalize(tab?.dataset?.tabId) };
    }
    if (payload.action === 'click') {
      const el = query(payload.selector);
      if (!el) return { ok: false, error: 'selector_not_found', selector: normalize(payload.selector) };
      clickEl(el);
      return { ok: true };
    }
    if (payload.action === 'focus') {
      const el = query(payload.selector);
      if (!el) return { ok: false, error: 'selector_not_found', selector: normalize(payload.selector) };
      const focused = focusEl(el);
      return { ok: focused, focused };
    }
    if (payload.action === 'input') {
      const el = query(payload.selector);
      if (!el) return { ok: false, error: 'selector_not_found', selector: normalize(payload.selector) };
      focusEl(el);
      const written = setInputValue(el, payload.value || '');
      return { ok: written, value: String(payload.value || '') };
    }
    if (payload.action === 'select') {
      const el = query(payload.selector);
      if (!el || el.tagName !== 'SELECT') return { ok: false, error: 'select_not_found', selector: normalize(payload.selector) };
      el.value = String(payload.value || '');
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return { ok: true, value: el.value };
    }
    if (payload.action === 'press') {
      const el = query(payload.selector);
      const ok = pressKey(el, payload.key);
      return { ok, key: normalize(payload.key) || 'Enter' };
    }
    if (payload.action === 'click_text') {
      const el = findByText({
        selector: payload.selector,
        text: payload.text || payload.value,
        exact: payload.exact === true,
        nth: payload.nth,
      });
      if (!el) return { ok: false, error: 'text_not_found', text: normalize(payload.text || payload.value), selector: normalize(payload.selector) };
      clickEl(el);
      return { ok: true, text: normalize(el.textContent) };
    }
    if (payload.action === 'probe') {
      const selector = normalize(payload.selector) || 'body';
      const nodes = queryAll(selector);
      const first = nodes[0] || null;
      const firstVisible = isVisible(first);
      const text = normalize(first?.textContent);
      const value = first && 'value' in first ? String(first.value ?? '') : text;
      const checked = Boolean(first && 'checked' in first && first.checked === true);
      const disabled = Boolean(first && 'disabled' in first && first.disabled === true);
      const probeText = normalize(payload.text || payload.value);
      let details = null;
      if (first && payload.detailed === true) {
        details = getElementDetails(first);
      }
      let textMatchedCount = 0;
      if (probeText) {
        const target = payload.exact === true ? probeText : probeText.toLowerCase();
        textMatchedCount = nodes.filter((el) => {
          const current = normalize(el.textContent);
          if (!current) return false;
          if (payload.exact === true) return current === target;
          return current.toLowerCase().includes(target);
        }).length;
      }
      return {
        ok: true,
        selector,
        exists: Boolean(first),
        count: nodes.length,
        visible: firstVisible,
        text,
        value,
        checked,
        disabled,
        tagName: first?.tagName || '',
        className: first?.className || '',
        details,
        textMatchedCount,
      };
    }
    if (payload.action === 'close_window') {
      window.close();
      return { ok: true };
    }
    return { ok: false, error: 'unsupported_action', action: normalize(payload.action) };
  })()`;
}

export class UiCliBridge {
  private server: Server | null = null;
  private options: UiCliBridgeOptions;
  private host: string;
  private port: number;

  constructor(options: UiCliBridgeOptions) {
    this.options = options;
    this.host = String(options.host || process.env.WEBAUTO_UI_CLI_HOST || DEFAULT_HOST);
    this.port = readInt(options.port || process.env.WEBAUTO_UI_CLI_PORT, DEFAULT_PORT);
  }

  getAddress() {
    return { host: this.host, port: this.port };
  }

  async start() {
    if (this.server) return this.getAddress();
    await new Promise<void>((resolve, reject) => {
      const server = createServer((req, res) => {
        void this.handleRequest(req, res);
      });
      server.on('error', (err) => reject(err));
      server.listen(this.port, this.host, () => {
        this.server = server;
        resolve();
      });
    });
    await writeControlFile(this.host, this.port);
    return this.getAddress();
  }

  async stop() {
    if (!this.server) {
      await removeControlFile();
      return;
    }
    const srv = this.server;
    this.server = null;
    await new Promise<void>((resolve) => srv.close(() => resolve()));
    await removeControlFile();
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse) {
    const method = String(req.method || 'GET').toUpperCase();
    const url = new URL(req.url || '/', `http://${this.host}:${this.port}`);
    if (method === 'GET' && url.pathname === '/health') {
      return sendJson(res, 200, await this.status());
    }
    if (method === 'GET' && (url.pathname === '/status' || url.pathname === '/snapshot')) {
      return sendJson(res, 200, await this.status(true));
    }
    if (method === 'POST' && url.pathname === '/action') {
      const body = await parseBody(req);
      const result = await this.handleAction(body || {});
      return sendJson(res, result.ok ? 200 : 400, result);
    }
    return sendJson(res, 404, { ok: false, error: 'not_found' });
  }

  private async status(includeSnapshot = false): Promise<UiCliStatus> {
    const win = this.options.getWindow();
    const ready = isUiReady(win);
    if (!ready) {
      return {
        ok: false,
        pid: process.pid,
        ready: false,
        host: this.host,
        port: this.port,
        ts: new Date().toISOString(),
        error: 'window_not_ready',
      };
    }

    let snapshot: any;
    if (includeSnapshot) {
      try {
        snapshot = await win!.webContents.executeJavaScript(buildSnapshotScript(), true);
      } catch (err: any) {
        return {
          ok: false,
          pid: process.pid,
          ready,
          host: this.host,
          port: this.port,
          ts: new Date().toISOString(),
          error: err?.message || String(err),
        };
      }
    }

    return {
      ok: true,
      pid: process.pid,
      ready,
      host: this.host,
      port: this.port,
      ts: new Date().toISOString(),
      snapshot,
    };
  }

  private async handleAction(input: UiCliAction) {
    const action = String(input?.action || '').trim();
    if (!action) return { ok: false, error: 'missing_action' };

    if (action === 'wait') {
      return this.waitForSelector(input);
    }

    const win = this.options.getWindow();
    if (!isUiReady(win)) return { ok: false, error: 'window_not_ready' };
    try {
      const out = await win!.webContents.executeJavaScript(buildActionScript(input), true);
      return out && typeof out === 'object' ? out : { ok: false, error: 'empty_result' };
    } catch (err: any) {
      return { ok: false, error: err?.message || String(err), details: err?.stack || null };
    }
  }

  private async waitForSelector(input: UiCliAction) {
    const selector = String(input.selector || '').trim();
    if (!selector) return { ok: false, error: 'missing_selector' };
    const expected = input.state || 'visible';
    const timeoutMs = readInt(input.timeoutMs, 15_000);
    const intervalMs = readInt(input.intervalMs, 250);
    const startedAt = Date.now();

    while (Date.now() - startedAt <= timeoutMs) {
      const win = this.options.getWindow();
      if (!isUiReady(win)) return { ok: false, error: 'window_not_ready' };
      try {
        const checkScript = `(() => {
          const el = document.querySelector(${JSON.stringify(selector)});
          const visible = (() => {
            if (!el) return false;
            const rect = el.getBoundingClientRect();
            if (!rect || rect.width <= 0 || rect.height <= 0) return false;
            const style = window.getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
          })();
          const text = String(el?.textContent || '').trim();
          const value = el && 'value' in el ? String(el.value ?? '') : '';
          const disabled = Boolean(el && 'disabled' in el && el.disabled === true);
          return { exists: Boolean(el), visible, text, value, disabled };
        })()`;
        const state = await win!.webContents.executeJavaScript(checkScript, true);
        const exists = Boolean(state?.exists);
        const visible = Boolean(state?.visible);
        const text = String(state?.text || '');
        const value = String(state?.value || '');
        const disabled = Boolean(state?.disabled);

        let matched = false;
        let reason = '';

        switch (expected) {
          case 'exists':
            matched = exists;
            reason = exists ? 'element exists' : 'element not found';
            break;
          case 'visible':
            matched = visible;
            reason = visible ? 'element visible' : 'element not visible';
            break;
          case 'hidden':
            matched = !exists || !visible;
            reason = matched ? 'element hidden or absent' : 'element is visible';
            break;
          case 'text_contains':
            matched = exists && text.includes(String(input.value || ''));
            reason = matched ? 'text matched' : `text '${text}' does not contain '${input.value || ''}'`;
            break;
          case 'text_equals':
            matched = exists && text === String(input.value || '');
            reason = matched ? 'text matched' : `text '${text}' !== '${input.value || ''}'`;
            break;
          case 'value_equals':
            matched = exists && value === String(input.value || '');
            reason = matched ? 'value matched' : `value '${value}' !== '${input.value || ''}'`;
            break;
          case 'not_disabled':
            matched = exists && !disabled;
            reason = matched ? 'element enabled' : 'element disabled';
            break;
          default:
            return { ok: false, error: 'unsupported_state', state: expected };
        }

        if (matched) {
          return { ok: true, selector, expected, exists, visible, text, value, disabled, elapsedMs: Date.now() - startedAt, reason };
        }
      } catch (err: any) {
        return { ok: false, error: err?.message || String(err) };
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    return { ok: false, error: 'wait_timeout', selector, expected, timeoutMs };
  }
}

export default UiCliBridge;
