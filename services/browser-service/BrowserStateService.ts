import type { SessionManager } from './SessionManager.js';

interface SessionSummary {
  profileId: string;
  mode?: string | null;
  url?: string | null;
}

interface BrowserStateSnapshot {
  service: {
    host: string;
    port: number;
    status: 'starting' | 'ready' | 'stopping' | 'stopped';
    startedAt: number | null;
    pid: number;
    autoExit: boolean;
  };
  ws: {
    enabled: boolean;
    host: string;
    port: number;
    listening: boolean;
    connections: number;
    lastStartedAt: number | null;
  };
  sessions: {
    count: number;
    list: SessionSummary[];
    lastUpdated: number | null;
  };
  autoCookies: {
    profiles: string[];
  };
  metadata: {
    version: number;
    updatedAt: number;
    lastReason: string;
  };
  events: Array<{ event: string; detail?: Record<string, any> | null; ts: number }>;
}

interface BrowserStateInit {
  host: string;
  port: number;
  wsHost: string;
  wsPort: number;
  autoExit: boolean;
  onUpdate?: (payload: { reason: string; snapshot: BrowserStateSnapshot }) => void;
}

const HISTORY_LIMIT = 200;

export class BrowserStateService {
  private snapshot: BrowserStateSnapshot;
  private onUpdate?: (payload: { reason: string; snapshot: BrowserStateSnapshot }) => void;

  constructor(init: BrowserStateInit) {
    this.snapshot = {
      service: {
        host: init.host,
        port: init.port,
        status: 'starting',
        startedAt: null,
        pid: process.pid,
        autoExit: init.autoExit,
      },
      ws: {
        enabled: false,
        host: init.wsHost,
        port: init.wsPort,
        listening: false,
        connections: 0,
        lastStartedAt: null,
      },
      sessions: {
        count: 0,
        list: [],
        lastUpdated: null,
      },
      autoCookies: {
        profiles: [],
      },
      metadata: {
        version: 1,
        updatedAt: Date.now(),
        lastReason: 'init',
      },
      events: [],
    };
    this.onUpdate = init.onUpdate;
  }

  updateService(patch: Partial<BrowserStateSnapshot['service']>, reason: string = 'service') {
    this.snapshot.service = {
      ...this.snapshot.service,
      ...patch,
    };
    this.emit(reason);
  }

  setWsState(patch: Partial<BrowserStateSnapshot['ws']>, reason: string = 'ws') {
    this.snapshot.ws = {
      ...this.snapshot.ws,
      ...patch,
    };
    this.emit(reason);
  }

  setWsConnections(count: number, reason: string = 'ws-connections') {
    if (this.snapshot.ws.connections === count) return;
    this.snapshot.ws.connections = count;
    this.emit(reason);
  }

  refreshSessions(manager: SessionManager, reason: string = 'sessions') {
    const list = manager.listSessions() || [];
    this.snapshot.sessions = {
      count: list.length,
      list: list.map((session) => {
        const currentUrl = session.current_url ?? (session as any).currentUrl ?? null;
        return {
          profileId: session.profileId,
          mode: session.mode || null,
          url: currentUrl,
        };
      }),
      lastUpdated: Date.now(),
    };
    this.emit(reason);
  }

  setAutoCookieProfiles(profiles: string[], reason: string = 'autoCookies') {
    this.snapshot.autoCookies = {
      profiles: Array.from(new Set(profiles)).sort(),
    };
    this.emit(reason);
  }

  recordEvent(event: string, detail: Record<string, any> | null = null) {
    this.snapshot.events.push({ event, detail, ts: Date.now() });
    while (this.snapshot.events.length > HISTORY_LIMIT) {
      this.snapshot.events.shift();
    }
    this.emit('event');
  }

  getSnapshot(): BrowserStateSnapshot {
    return JSON.parse(JSON.stringify(this.snapshot));
  }

  private emit(reason: string) {
    this.snapshot.metadata.updatedAt = Date.now();
    this.snapshot.metadata.lastReason = reason;
    if (typeof this.onUpdate === 'function') {
      try {
        this.onUpdate({ reason, snapshot: this.getSnapshot() });
      } catch {
        /* ignore broadcast errors */
      }
    }
  }
}
