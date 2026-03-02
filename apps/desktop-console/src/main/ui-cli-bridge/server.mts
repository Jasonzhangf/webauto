import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { BrowserWindow } from 'electron';
import type { UiCliAction, UiCliBridgeOptions, UiCliStatus } from './utils.mts';
import { DEFAULT_ACTION_TIMEOUT_MS, DEFAULT_HOST, DEFAULT_PORT, DEFAULT_SNAPSHOT_TIMEOUT_MS, DEFAULT_WAIT_PROBE_TIMEOUT_MS } from './utils.mts';
import { readInt, sendJson, parseBody, toActionError, withTimeout } from './utils.mts';
import { buildActionScript, buildSnapshotScript } from './scripts.mts';
import { appendActionLog, removeControlFile, writeControlFile, summarizeActionForLog } from './io.mts';
import { isUiReady } from './window.mts';

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
      const actionId = `act-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
      const startedAt = Date.now();
      await appendActionLog({
        event: 'action.request',
        actionId,
        method,
        path: url.pathname,
        remoteAddress: req.socket?.remoteAddress || null,
        remotePort: Number.isFinite(Number(req.socket?.remotePort)) ? Number(req.socket?.remotePort) : null,
        userAgent: String(req.headers?.['user-agent'] || '').slice(0, 160) || null,
        payload: summarizeActionForLog(body || {}),
      });
      const result = await this.handleAction(body || {});
      await appendActionLog({
        event: 'action.response',
        actionId,
        elapsedMs: Date.now() - startedAt,
        ok: result?.ok === true,
        error: result?.ok === true ? null : String(result?.error || 'action_failed'),
      });
      return sendJson(res, result.ok ? 200 : 400, result);
    }
    return sendJson(res, 404, { ok: false, error: 'not_found' });
  }

  private async status(includeSnapshot = false): Promise<UiCliStatus> {
    const win = this.options.getWindow();
    const ready = isUiReady(win as BrowserWindow | null);
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
        snapshot = await withTimeout(
          (win as BrowserWindow).webContents.executeJavaScript(buildSnapshotScript(), true),
          readInt(process.env.WEBAUTO_UI_CLI_SNAPSHOT_TIMEOUT_MS, DEFAULT_SNAPSHOT_TIMEOUT_MS),
          'snapshot',
        );
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
    if (!action) return toActionError(input, 'missing_action');

    if (action === 'restart') {
      return this.handleRestart(input);
    }

    if (action === 'wait') {
      return this.waitForSelector(input);
    }

    const win = this.options.getWindow();
    if (!isUiReady(win)) return toActionError(input, 'window_not_ready');
    try {
      const timeoutMs = readInt(input?.timeoutMs, readInt(process.env.WEBAUTO_UI_CLI_ACTION_TIMEOUT_MS, DEFAULT_ACTION_TIMEOUT_MS));
      const out = await withTimeout(
        (win as BrowserWindow).webContents.executeJavaScript(buildActionScript(input), true),
        timeoutMs,
        'action',
      );
      return out && typeof out === 'object' ? out : toActionError(input, 'empty_result');
    } catch (err: any) {
      return toActionError(input, err?.message || String(err), { details: err?.stack || null });
    }
  }

  private async handleRestart(input: UiCliAction) {
    const onRestart = this.options.onRestart;
    if (typeof onRestart !== 'function') {
      return toActionError(input, 'restart_not_supported');
    }
    const reason = String(input?.reason || input?.value || '').trim() || 'ui_cli';
    try {
      const out = await Promise.resolve(onRestart({ reason, source: 'ui_cli_bridge' }));
      if (out && typeof out === 'object') {
        return { ok: true, restarting: true, reason, ...out };
      }
      return { ok: true, restarting: true, reason };
    } catch (err: any) {
      return toActionError(input, err?.message || String(err), { details: err?.stack || null });
    }
  }

  private async waitForSelector(input: UiCliAction) {
    const selector = String(input.selector || '').trim();
    if (!selector) return toActionError(input, 'missing_selector');
    const expected = input.state || 'visible';
    const timeoutMs = readInt(input.timeoutMs, 15_000);
    const intervalMs = readInt(input.intervalMs, 250);
    const startedAt = Date.now();

    while (Date.now() - startedAt <= timeoutMs) {
      const win = this.options.getWindow();
      if (!isUiReady(win)) return toActionError(input, 'window_not_ready');
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
        const state = await withTimeout(
          (win as BrowserWindow).webContents.executeJavaScript(checkScript, true),
          readInt(process.env.WEBAUTO_UI_CLI_WAIT_PROBE_TIMEOUT_MS, DEFAULT_WAIT_PROBE_TIMEOUT_MS),
          'wait_probe',
        );
        const exists = Boolean((state as any)?.exists);
        const visible = Boolean((state as any)?.visible);
        const text = String((state as any)?.text || '');
        const value = String((state as any)?.value || '');
        const disabled = Boolean((state as any)?.disabled);

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
            return toActionError(input, 'unsupported_state', { expected });
        }

        if (matched) {
          return { ok: true, selector, expected, exists, visible, text, value, disabled, elapsedMs: Date.now() - startedAt, reason };
        }
      } catch (err: any) {
        return toActionError(input, err?.message || String(err), { details: err?.stack || null });
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    return toActionError(input, 'wait_timeout', {
      expected,
      timeoutMs,
      elapsedMs: Date.now() - startedAt,
    });
  }
}
