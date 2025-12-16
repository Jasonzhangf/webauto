// 高亮服务：扁平的事件编排，不直接引用 UI。
export function createHighlightService({ bus, invokeAction, logger = console } = {}) {
  if (!bus || typeof bus.publish !== 'function') {
    throw new Error('createHighlightService requires bus.publish');
  }

  const state = {
    selector: null,
    channel: 'default',
    persistent: false,
  };

  function emitRequest() {
    if (!state.selector) return;
    bus.publish('dom:highlight_request', {
      selector: state.selector,
      channel: state.channel,
      persistent: state.persistent,
    });
  }

  function setHighlight(selector, options = {}) {
    state.selector = selector || null;
    state.channel = options.channel || 'default';
    state.persistent = Boolean(options.persistent);
    if (!state.selector) {
      bus.publish('dom:highlight_cleared', { channel: state.channel });
    } else {
      emitRequest();
    }
  }

  function clearHighlight(channel) {
    const targetChannel = channel || state.channel;
    bus.publish('dom:highlight_cleared', { channel: targetChannel });
    if (!channel || channel === state.channel) {
      state.selector = null;
      state.persistent = false;
    }
  }

  // 简单反馈转发：记录日志，通知 UI。
  if (bus.subscribe) {
    bus.subscribe('dom:highlight_feedback', (payload = {}) => {
      logger?.log?.('[highlight-service] feedback', payload);
      bus.publish('ui.highlight.feedback', payload);
    });
    bus.subscribe('dom:highlight_error', (payload = {}) => {
      logger?.warn?.('[highlight-service] error', payload);
      bus.publish('ui.highlight.error', payload);
    });
  }

  return {
    setHighlight,
    clearHighlight,
    state,
  };
}
