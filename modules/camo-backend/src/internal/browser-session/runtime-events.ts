import { getStateBus } from '../state-bus.js';
import { logDebug } from '../../../../logging/src/index.js';

const stateBus = getStateBus();

export interface RuntimeEventPayload {
  ts?: number;
  sessionId: string;
  type?: string;
  pageUrl?: string;
  [key: string]: any;
}

export function createRuntimeEventManager(sessionId: string) {
  const observers = new Set<(event: RuntimeEventPayload) => void>();

  function addObserver(observer: (event: RuntimeEventPayload) => void): () => void {
    observers.add(observer);
    logDebug('browser-service', 'runtimeObserver:add', { sessionId, total: observers.size });
    return () => {
      observers.delete(observer);
      logDebug('browser-service', 'runtimeObserver:remove', { sessionId, total: observers.size });
    };
  }

  function emit(event: RuntimeEventPayload): void {
    const payload: RuntimeEventPayload = {
      ts: Date.now(),
      sessionId,
      ...event,
    };
    logDebug('browser-service', 'runtimeEvent', {
      sessionId,
      type: event?.type || 'unknown',
      observers: observers.size,
    });
    observers.forEach((observer) => {
      try {
        observer(payload);
      } catch (err) {
        console.warn('[BrowserSession] runtime observer error', err);
      }
    });
    publishState(payload);
  }

  function publishState(payload: RuntimeEventPayload): void {
    try {
      stateBus.setState(`browser-session:${sessionId}`, {
        status: 'running',
        lastRuntimeEvent: payload?.type || 'unknown',
        lastUrl: payload?.pageUrl || '',
        lastUpdate: payload?.ts || Date.now(),
      });
      stateBus.publish('browser.runtime.event', payload);
    } catch (err) {
      logDebug('browser-service', 'runtimeEvent:stateBus:error', {
        sessionId,
        error: (err as Error)?.message || err,
      });
    }
  }

  function clearObservers(): void {
    observers.clear();
  }

  return {
    addObserver,
    emit,
    publishState,
    clearObservers,
  };
}
