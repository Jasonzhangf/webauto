// apps/desktop-console/src/main/state-bridge.mts
// Bridge between unified-api state and Desktop UI (webauto-04b)

import { ipcMain, BrowserWindow } from 'electron';
import nodeFetch from 'node-fetch';
import WebSocket from 'ws';
import type { TaskState, StateUpdate } from './task-state-types.js';

const UNIFIED_API_WS = process.env.WEBAUTO_UNIFIED_WS || 'ws://127.0.0.1:7701/ws';

// Fallback if unified-api is not available
const API_URL = 'http://127.0.0.1:7701';

// Polyfill fetch for Node.js < 18
if (!globalThis.fetch) {
  globalThis.fetch = nodeFetch as any;
}

class StateBridge {
  private ws: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private win: BrowserWindow | null = null;
  private tasks: Map<string, TaskState> = new Map();

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
      });
      this.ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'task:update' && msg.data) {
            this.handleTaskUpdate(msg.data);
          }
        } catch (err) {
          console.warn('[StateBridge] parse error:', err);
        }
      });
      this.ws.on('close', () => {
        console.log('[StateBridge] disconnected, reconnecting...');
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
    ipcMain.handle('state:getTasks', async () => {
      const res = await globalThis.fetch(`${API_URL}/api/v1/tasks`);
      const json = await res.json();
      return json.data || [];
    });

    ipcMain.handle('state:getTask', async (_e, runId: string) => {
      const res = await globalThis.fetch(`${API_URL}/api/v1/tasks/${runId}`);
      const json = await res.json();
      return json.data;
    });

    ipcMain.handle('state:getEvents', async (_e, runId: string, since?: number) => {
      let url = `${API_URL}/api/v1/tasks/${runId}/events`;
      if (since) url += `?since=${since}`;
      const res = await globalThis.fetch(url);
      const json = await res.json();
      return json.data || [];
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
