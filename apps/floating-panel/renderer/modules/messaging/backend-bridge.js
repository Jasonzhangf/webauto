export function createBackendBridge(options = {}) {
  const { bus, logger = console, debug = false } = options;
  const backend = window.backendAPI;
  const desktop = window.desktopAPI;
  const publishWindowCommand = (topic, payload, fallback) => {
    if (!bus) return false;
    const ok = bus.publish(topic, payload);
    if (!ok && typeof fallback === 'function') {
      try {
        fallback();
      } catch (err) {
        logger.warn?.('[floating] window command fallback failed', err);
      }
    }
    return ok;
  };
  const debugLog = (...args) => {
    if (debug) {
      (logger?.log || console.log).call(logger, '[floating-debug]', ...args);
    }
  };
  return {
    backend,
    desktop,
    publishWindowCommand,
    debugLog,
  };
}
