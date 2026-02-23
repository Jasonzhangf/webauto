import assert from 'node:assert/strict';
import { test, beforeEach, afterEach } from 'node:test';
import { EventEmitter } from 'node:events';
import type { TaskState, StateUpdate } from './task-state-types.js';

/**
 * Unit tests for StateBridge without Electron dependencies.
 * The actual StateBridge uses Electron IPC; these tests mock the
 * WebSocket connection and IPC handlers to verify behavior.
 */

// Minimal mock for WebSocket
class MockWebSocket extends EventEmitter {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  readyState = MockWebSocket.CONNECTING;
  sentMessages: any[] = [];

  send(data: string) {
    this.sentMessages.push(data);
  }
  close() {
    this.readyState = MockWebSocket.CLOSED;
  }
}

// Minimal mock for BrowserWindow webContents
function createMockBrowserWindow() {
  const events: any[] = [];
  const webContents = {
    send: (channel: string, payload: any) => {
      events.push({ channel, payload });
    },
    getEvents: () => events,
    clearEvents: () => { events.length = 0; },
  };
  return { webContents };
}

// StateBridge logic extracted for testing (without Electron import at module scope)
class TestableStateBridge {
  private ws: MockWebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private win: any = null;
  private tasks: Map<string, TaskState> = new Map();
  private wsUrl: string;
  private apiUrl: string;
  private fetchImpl: typeof fetch;

  constructor(opts: { wsUrl?: string; apiUrl?: string; fetchImpl?: typeof fetch } = {}) {
    this.wsUrl = opts.wsUrl || 'ws://127.0.0.1:7701/ws';
    this.apiUrl = opts.apiUrl || 'http://127.0.0.1:7701';
    this.fetchImpl = opts.fetchImpl || globalThis.fetch;
  }

  private emitBusEvent(payload: any) {
    if (!this.win) return;
    this.win.webContents.send('bus:event', payload);
  }

  start(win: any, wsFactory: (url: string) => MockWebSocket) {
    this.win = win;
    this.connect(wsFactory);
  }

  private connect(wsFactory: (url: string) => MockWebSocket) {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    try {
      this.ws = wsFactory(this.wsUrl);
      this.ws.on('open', () => {
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
        } catch {
          // ignore
        }
      });
      this.ws.on('close', () => {
        this.emitBusEvent({ type: 'env:unified', ok: false, ts: Date.now() });
        this.scheduleReconnect(wsFactory);
      });
    } catch {
      this.scheduleReconnect(wsFactory);
    }
  }

  private scheduleReconnect(wsFactory: (url: string) => MockWebSocket) {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this.connect(wsFactory), 3000);
  }

  private handleTaskUpdate(update: StateUpdate) {
    const task = this.tasks.get(update.runId);
    if (task) {
      this.tasks.set(update.runId, { ...task, ...update.data });
    }
    this.win?.webContents.send('state:update', update);
  }

  // HTTP fallback handlers (mirrors real StateBridge)
  async getTasks(): Promise<any[]> {
    const json = await this.fetchJson(`${this.apiUrl}/api/v1/tasks`);
    return json?.data || [];
  }

  async getTask(runId: string): Promise<any> {
    const json = await this.fetchJson(`${this.apiUrl}/api/v1/tasks/${runId}`);
    return json?.data ?? null;
  }

  async getEvents(runId: string, since?: number): Promise<any[]> {
    let url = `${this.apiUrl}/api/v1/tasks/${runId}/events`;
    if (since) url += `?since=${since}`;
    const json = await this.fetchJson(url);
    return json?.data || [];
  }

  private async fetchJson(url: string): Promise<any> {
    try {
      const res = await this.fetchImpl(url, { signal: AbortSignal.timeout(5000) } as any);
      if (!res.ok) return null;
      return await res.json().catch(() => null);
    } catch {
      return null;
    }
  }

  stop() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) this.ws.close();
    this.ws = null;
    this.win = null;
  }
}

// Store original fetch
let originalFetch: any;

beforeEach(() => {
  originalFetch = (globalThis as any).fetch;
});

afterEach(() => {
  (globalThis as any).fetch = originalFetch;
});

test('StateBridge connects and subscribes to task:* via WS', async () => {
  let wsInstance: MockWebSocket | null = null;
  const wsFactory = (url: string) => {
    const ws = new MockWebSocket();
    wsInstance = ws;
    setTimeout(() => {
      ws.readyState = MockWebSocket.OPEN;
      ws.emit('open');
    }, 10);
    return ws;
  };

  const mockWin = createMockBrowserWindow();
  const bridge = new TestableStateBridge();
  bridge.start(mockWin, wsFactory);

  await new Promise(r => setTimeout(r, 50));
  assert.ok(wsInstance, 'WebSocket instance should be created');
  assert.equal(wsInstance!.sentMessages.length, 1, 'Should have sent subscription');
  const subscribeMsg = JSON.parse(wsInstance!.sentMessages[0]);
  assert.equal(subscribeMsg.type, 'subscribe');
  assert.equal(subscribeMsg.topic, 'task:*');

  bridge.stop();
});

test('StateBridge forwards task:update to renderer via state:update', async () => {
  let wsInstance: MockWebSocket | null = null;
  const wsFactory = (url: string) => {
    const ws = new MockWebSocket();
    wsInstance = ws;
    setTimeout(() => {
      ws.readyState = MockWebSocket.OPEN;
      ws.emit('open');
    }, 10);
    return ws;
  };

  const mockWin = createMockBrowserWindow();
  const bridge = new TestableStateBridge();
  bridge.start(mockWin, wsFactory);
  await new Promise(r => setTimeout(r, 50));

  const update: StateUpdate = {
    runId: 'run-123',
    data: { status: 'running', progress: 50 } as TaskState,
  };
  wsInstance!.emit('message', Buffer.from(JSON.stringify({ type: 'task:update', data: update })));
  await new Promise(r => setTimeout(r, 10));

  const events = mockWin.webContents.getEvents();
  const stateUpdateEvent = events.find((e: any) => e.channel === 'state:update');
  assert.ok(stateUpdateEvent, 'Should emit state:update event');
  assert.equal(stateUpdateEvent.payload.runId, 'run-123');
  assert.equal(stateUpdateEvent.payload.data.status, 'running');

  bridge.stop();
});

test('StateBridge handles WS close and schedules reconnect', async () => {
  let wsInstance: MockWebSocket | null = null;
  let wsCount = 0;
  const wsFactory = (url: string) => {
    const ws = new MockWebSocket();
    wsCount++;
    wsInstance = ws;
    setTimeout(() => {
      ws.readyState = MockWebSocket.OPEN;
      ws.emit('open');
    }, 10);
    return ws;
  };

  const mockWin = createMockBrowserWindow();
  const bridge = new TestableStateBridge();
  bridge.start(mockWin, wsFactory);
  await new Promise(r => setTimeout(r, 50));

  assert.equal(wsCount, 1, 'Initial connection');

  wsInstance!.emit('close');
  await new Promise(r => setTimeout(r, 3100));
  assert.equal(wsCount, 2, 'Should reconnect after close');

  bridge.stop();
});

test('StateBridge state:getTasks uses HTTP fallback', async () => {
  const fetchedUrls: string[] = [];
  const mockFetch = async (url: string) => {
    fetchedUrls.push(url);
    if (url.includes('/api/v1/tasks')) {
      return {
        ok: true,
        json: async () => ({ data: [{ runId: 't1', status: 'running' }] }),
      };
    }
    return { ok: false };
  };

  const bridge = new TestableStateBridge({ fetchImpl: mockFetch as any });
  const result = await bridge.getTasks();
  
  assert.equal(result.length, 1);
  assert.equal(result[0].runId, 't1');
  assert.ok(fetchedUrls.some(u => u.includes('/api/v1/tasks')), 'Should fetch from API');
});

test('StateBridge state:getTask returns single task', async () => {
  const mockFetch = async (url: string) => {
    if (url.includes('/api/v1/tasks/run-456')) {
      return {
        ok: true,
        json: async () => ({ data: { runId: 'run-456', status: 'completed' } }),
      };
    }
    return { ok: false };
  };

  const bridge = new TestableStateBridge({ fetchImpl: mockFetch as any });
  const result = await bridge.getTask('run-456');
  
  assert.equal(result.runId, 'run-456');
  assert.equal(result.status, 'completed');
});

test('StateBridge state:getEvents supports since parameter', async () => {
  const fetchedUrls: string[] = [];
  const mockFetch = async (url: string) => {
    fetchedUrls.push(url);
    if (url.includes('/api/v1/tasks/run-789/events')) {
      return {
        ok: true,
        json: async () => ({ data: [{ type: 'progress', value: 100 }] }),
      };
    }
    return { ok: false };
  };

  const bridge = new TestableStateBridge({ fetchImpl: mockFetch as any });
  const result = await bridge.getEvents('run-789', 12345);
  
  assert.equal(result.length, 1);
  assert.ok(fetchedUrls.some(u => u.includes('since=12345')), 'Should include since parameter');
});

test('StateBridge emits env:unified on connection open/close', async () => {
  let wsInstance: MockWebSocket | null = null;
  const wsFactory = (url: string) => {
    const ws = new MockWebSocket();
    wsInstance = ws;
    setTimeout(() => {
      ws.readyState = MockWebSocket.OPEN;
      ws.emit('open');
    }, 10);
    return ws;
  };

  const mockWin = createMockBrowserWindow();
  const bridge = new TestableStateBridge();
  bridge.start(mockWin, wsFactory);
  await new Promise(r => setTimeout(r, 50));

  const events = mockWin.webContents.getEvents();
  const connectedEvent = events.find((e: any) => e.channel === 'bus:event' && e.payload.type === 'env:unified' && e.payload.ok === true);
  assert.ok(connectedEvent, 'Should emit env:unified ok=true on connect');

  mockWin.webContents.clearEvents();
  wsInstance!.emit('close');
  await new Promise(r => setTimeout(r, 50));

  const closeEvents = mockWin.webContents.getEvents();
  const disconnectedEvent = closeEvents.find((e: any) => e.channel === 'bus:event' && e.payload.type === 'env:unified' && e.payload.ok === false);
  assert.ok(disconnectedEvent, 'Should emit env:unified ok=false on close');

  bridge.stop();
});
