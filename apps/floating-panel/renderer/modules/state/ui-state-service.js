const BASE_STATE = {
  window: {
    mode: 'boot',
    collapsed: false,
    headless: false,
    serviceHealthy: false,
    lastServiceCheckAt: 0,
  },
  sessions: {
    selected: null,
    list: [],
    lastUpdated: 0,
  },
  containers: {
    rootId: null,
    pageUrl: null,
    capturedAt: 0,
    containerCount: 0,
    domCount: 0,
  },
  hover: {
    domPath: null,
    containerId: null,
    lastUpdated: 0,
  },
  highlight: {
    channel: null,
    selector: null,
    status: 'idle',
    count: 0,
    lastUpdated: 0,
  },
  meta: {
    version: 1,
  },
};

const HISTORY_LIMIT = 200;

export function createUiStateService({ bus, logger } = {}) {
  const state = structuredClone(BASE_STATE);
  const history = [];
  const unsubscribers = [];

  const publishSnapshot = (reason = 'manual', meta = {}) => {
    const payload = {
      reason,
      ts: Date.now(),
      state: structuredClone(state),
      ...meta,
    };
    try {
      bus?.publish?.('ui.state.snapshot', payload);
    } catch (err) {
      logger?.warn?.('[ui-state] snapshot publish failed', err);
    }
  };

  const mergeSection = (section, patch = {}, reason = section, meta = {}) => {
    if (!section || typeof patch !== 'object') return;
    const current = state[section] || {};
    state[section] = { ...current, ...patch };
    publishSnapshot(reason, { section, ...meta });
  };

  const recordEvent = (event, detail = {}) => {
    const entry = {
      event,
      detail,
      ts: Date.now(),
    };
    history.push(entry);
    while (history.length > HISTORY_LIMIT) {
      history.shift();
    }
    try {
      bus?.publish?.('ui.state.event', { ...entry });
    } catch (err) {
      logger?.warn?.('[ui-state] event publish failed', err);
    }
  };

  if (bus?.subscribe) {
    unsubscribers.push(
      bus.subscribe('ui.state.request', (payload = {}) => {
        const requestId = payload?.requestId || null;
        publishSnapshot(payload?.reason || 'request', { requestId });
      }),
    );
  }

  function dispose() {
    while (unsubscribers.length) {
      try {
        unsubscribers.pop()?.();
      } catch {
        /* ignore */
      }
    }
  }

  return {
    updateWindow: (patch, reason = 'window') => mergeSection('window', patch, reason),
    updateSessions: (patch, reason = 'sessions') => mergeSection('sessions', patch, reason),
    updateContainers: (patch, reason = 'containers') => mergeSection('containers', patch, reason),
    updateHover: (patch, reason = 'hover') => mergeSection('hover', patch, reason),
    updateHighlight: (patch, reason = 'highlight') => mergeSection('highlight', patch, reason),
    recordEvent,
    getSnapshot: () => structuredClone(state),
    getHistory: () => structuredClone(history),
    dispose,
  };
}
