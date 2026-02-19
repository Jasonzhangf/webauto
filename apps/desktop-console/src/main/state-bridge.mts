// apps/desktop-console/src/main/state-bridge.mts
// Bridge between unified-api state and Desktop UI (webauto-04b)

import { ipcMain, BrowserWindow } from 'electron';
import WebSocket from 'ws';
import type { TaskState, StateUpdate } from './task-state-types.js';

const UNIFIED_API_WS = process.env.WEBAUTO_UNIFIED_WS || 'ws://127.0.0.1:7701/ws';

// Fallback if unified-api is not available
const API_URL = 'http://127.0.0.1:7701';

class StateBridge {
  private ws: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private win: BrowserWindow | null = null;
  private tasks: Map<string, TaskState> = new Map();
  private handlersRegistered = false;
  private emitBusEvent(payload: any) {
    if (!this.win) return;
    this.win.webContents.send('bus:event', payload);
  }

  start(win: BrowserWindow) {
    this.win = win;
    this.connect();
    this.setupIPCHandlers();
  }

  private connect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    try {
      this.ws = new WebSocket(UNIFIED_API_WS);
      this.ws.on('open', () => {
        console.log('[StateBridge] connected to', UNIFIED_API_WS);
        this.ws?.send(JSON.stringify({ type: 'subscribe', topic: 'task:*' }));
        this.emitBusEvent({ type: 'env:unified', ok: true, ts: Date.now() });
      });
      this.ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'task:update' && msg.data) {
            this.handleTaskUpdate(msg.data);
            return;
          }
          if (msg.type === 'event' && msg.topic === 'bus.message') {
            const raw = msg?.payload?.data;
            if (typeof raw === 'string' && raw.trim()) {
              try {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object') {
                  this.emitBusEvent(parsed);
                }
              } catch {
                // ignore parse errors
              }
            }
          }
        } catch (err) {
          console.warn('[StateBridge] parse error:', err);
        }
      });
      this.ws.on('close', () => {
        console.log('[StateBridge] disconnected, reconnecting...');
        this.emitBusEvent({ type: 'env:unified', ok: false, ts: Date.now() });
        this.scheduleReconnect();
      });
      this.ws.on('error', (err) => {
        console.warn('[StateBridge] error:', err.message);
      });
    } catch (err) {
      console.warn('[StateBridge] connect failed:', err);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this.connect(), 3000);
  }

  private handleTaskUpdate(update: StateUpdate) {
    const task = this.tasks.get(update.runId);
    if (task) {
      this.tasks.set(update.runId, { ...task, ...update.data });
    }
    this.win?.webContents.send('state:update', update);
  }

  private setupIPCHandlers() {
    if (this.handlersRegistered) return;
    this.handlersRegistered = true;

    const fetchJson = async (url: string) => {
      try {
        const res = await globalThis.fetch(url, { signal: AbortSignal.timeout(5000) });
        if (!res.ok) return null;
        return await res.json().catch(() => null);
      } catch {
        return null;
      }
    };

    ipcMain.handle('state:getTasks', async () => {
      const json = await fetchJson(`${API_URL}/api/v1/tasks`);
      return json?.data || [];
    });

    ipcMain.handle('state:getTask', async (_e, runId: string) => {
      const json = await fetchJson(`${API_URL}/api/v1/tasks/${runId}`);
      return json?.data ?? null;
    });

    ipcMain.handle('state:getEvents', async (_e, runId: string, since?: number) => {
      let url = `${API_URL}/api/v1/tasks/${runId}/events`;
      if (since) url += `?since=${since}`;
      const json = await fetchJson(url);
      return json?.data || [];
    });
  }

  stop() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) this.ws.close();
    this.ws = null;
    this.win = null;
  }
}

export const stateBridge = new StateBridge();
export default stateBridge;
