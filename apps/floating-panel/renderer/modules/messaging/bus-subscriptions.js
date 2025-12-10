export function registerRendererBus(bus, handlers = {}) {
  if (!bus?.subscribe) {
    return () => {};
  }
  const unsubscribers = [];
  const subscribe = (topic, listener) => {
    if (typeof listener !== 'function') return;
    const off = bus.subscribe(topic, listener);
    if (typeof off === 'function') {
      unsubscribers.push(off);
    }
  };

  subscribe('ui.window.error', (payload = {}) => {
    handlers.onWindowError?.(payload);
  });

  subscribe('ui.graph.expandDom', (payload = {}) => {
    handlers.onGraphDomExpand?.(payload);
  });

  subscribe('ui.graph.hoverDom', (payload = {}) => {
    handlers.onGraphDomHover?.(payload);
  });

  subscribe('ui.graph.hoverContainer', (payload = {}) => {
    handlers.onGraphContainerHover?.(payload);
  });

  subscribe('ui.test.ping', () => {
    if (handlers.onTestPing) {
      handlers.onTestPing();
    } else {
      bus.publish('ui.test.pong', { ts: Date.now(), ok: true });
    }
  });

  subscribe('ui.graph.requestReport', () => {
    handlers.onGraphReportRequest?.();
  });

  subscribe('ui.simulate', (payload = {}) => {
    handlers.onSimulateAction?.(payload);
  });

  subscribe('ui.highlight.result', (payload = {}) => {
    handlers.onHighlightResult?.(payload);
  });

  return () => {
    while (unsubscribers.length) {
      try {
        unsubscribers.pop()?.();
      } catch {
        // ignore
      }
    }
  };
}
