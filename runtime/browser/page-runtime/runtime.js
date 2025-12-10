/* eslint-disable no-var */
(() => {
  if (typeof window === 'undefined') {
    return;
  }
  if (window.__webautoRuntime && window.__webautoRuntime.ready) {
    return;
  }

  const VERSION = '0.1.0';
  const DEFAULT_STYLE = '3px solid #34a853';
  const registry = new Map();

  const domUtils = {
    resolveRoot(selector) {
      if (selector) {
        try {
          const explicit = document.querySelector(selector);
          if (explicit) return explicit;
        } catch {
          /* ignore invalid selector */
        }
      }
      return document.querySelector('#app') || document.body || document.documentElement;
    },
    resolveByPath(path, selector) {
      if (!path || typeof path !== 'string') return null;
      const parts = path.split('/').filter(Boolean);
      if (!parts.length || parts[0] !== 'root') return null;
      let current = domUtils.resolveRoot(selector);
      for (let i = 1; i < parts.length; i += 1) {
        if (!current) break;
        const idx = Number(parts[i]);
        if (Number.isNaN(idx)) return null;
        const children = current.children || [];
        current = children[idx] || null;
      }
      return current;
    },
    buildPathForElement(el, selector) {
      if (!el || !(el instanceof Element)) return null;
      const root = domUtils.resolveRoot(selector);
      const indices = [];
      let cursor = el;
      let guard = 0;
      while (cursor && guard < 200) {
        if (cursor === root) {
          indices.push('root');
          break;
        }
        const parent = cursor.parentElement;
        if (!parent) break;
        const idx = Array.prototype.indexOf.call(parent.children || [], cursor);
        indices.push(String(idx));
        cursor = parent;
        guard += 1;
      }
      if (!indices.length) return null;
      if (indices[indices.length - 1] !== 'root') {
        indices.push('root');
      }
      return indices.reverse().join('/');
    },
    snapshotNode(el, options = {}) {
      if (!el || !(el instanceof Element)) return null;
      const path = domUtils.buildPathForElement(el, options.rootSelector);
      const childLimit = Number(options.maxChildren || 20);
      const depthLimit = Number(options.maxDepth || 3);
      return domUtils.collectNode(el, {
        path: path || 'root',
        depth: 0,
        depthLimit,
        childLimit,
      });
    },
    collectNode(el, ctx) {
      if (!el || !(el instanceof Element)) return null;
      const node = {
        path: ctx.path,
        tag: el.tagName ? el.tagName.toLowerCase() : 'node',
        id: el.id || null,
        classes: Array.from(el.classList || []),
        textSnippet: domUtils.extractText(el),
        text: domUtils.extractText(el),
        childCount: el.children ? el.children.length : 0,
        children: [],
      };
      if (ctx.depth < ctx.depthLimit && el.children && el.children.length) {
        const maxChildren = Math.max(1, ctx.childLimit);
        const len = Math.min(el.children.length, maxChildren);
        for (let i = 0; i < len; i += 1) {
          const child = el.children[i];
          const childPath = `${ctx.path}/${i}`;
          const result = domUtils.collectNode(child, {
            path: childPath,
            depth: ctx.depth + 1,
            depthLimit: ctx.depthLimit,
            childLimit: ctx.childLimit,
          });
          if (result) {
            node.children.push(result);
          }
        }
      }
      return node;
    },
    extractText(el) {
      if (!el) return '';
      return (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160);
    },
  };

  function ensureOverlayLayer() {
    let layer = document.getElementById('__webauto_highlight_layer');
    if (!layer) {
      layer = document.createElement('div');
      layer.id = '__webauto_highlight_layer';
      layer.setAttribute(
        'style',
        [
          'position:fixed',
          'left:0',
          'top:0',
          'width:100%',
          'height:100%',
          'pointer-events:none',
          'z-index:2147483646',
        ].join(';'),
      );
      document.documentElement.appendChild(layer);
    }
    return layer;
  }

  function createOverlay(el, styleText) {
    const rect = el.getBoundingClientRect();
    const overlay = document.createElement('div');
    overlay.dataset.webautoHighlight = '1';
    overlay.style.position = 'fixed';
    overlay.style.left = `${Math.round(rect.left)}px`;
    overlay.style.top = `${Math.round(rect.top)}px`;
    overlay.style.width = `${Math.max(1, Math.round(rect.width))}px`;
    overlay.style.height = `${Math.max(1, Math.round(rect.height))}px`;
    overlay.style.border = styleText || DEFAULT_STYLE;
    overlay.style.boxSizing = 'border-box';
    overlay.style.pointerEvents = 'none';
    overlay.style.borderRadius = '4px';
    overlay.style.transition = 'opacity 120ms ease-out';
    overlay.style.opacity = '1';
    overlay.style.background = 'rgba(0,0,0,0)';
    overlay.dataset.webautoHighlightTs = String(Date.now());
    ensureOverlayLayer().appendChild(overlay);
    return overlay;
  }

  function removeOverlay(node) {
    if (!node) return;
    try {
      node.style.opacity = '0';
      setTimeout(() => {
        try {
          node.remove();
        } catch {
          /* noop */
        }
      }, 100);
    } catch {
      /* noop */
    }
  }

  function clearChannel(channel) {
    const runCleanup = (record) => {
      if (!record) return;
      try {
        record.cleanup?.();
      } catch {
        /* ignore */
      }
    };
    if (channel) {
      const target = registry.get(channel);
      runCleanup(target);
      registry.delete(channel);
      return;
    }
    registry.forEach((record) => runCleanup(record));
    registry.clear();
  }

  function highlightNodes(nodes, options = {}) {
    const channel = options.channel || 'default';
    const style = options.style || DEFAULT_STYLE;
    const sticky = Boolean(options.sticky);
    const duration = typeof options.duration === 'number' ? options.duration : sticky ? 0 : 2000;
    const limit = Math.min(Math.max(Number(options.maxMatches) || nodes.length || 20, 1), 200);
    const elements = (Array.isArray(nodes) ? nodes : []).filter((node) => node instanceof Element).slice(0, limit);
    if (registry.has(channel)) {
      const record = registry.get(channel);
      record.overlays.forEach((entry) => removeOverlay(entry.overlay));
    }
    if (!elements.length) {
      registry.delete(channel);
      return { selector: options.selector || null, count: 0, channel };
    }
    const overlays = [];
    const overlayEntries = [];
    const cleanups = [];
    const updateOverlay = (overlay, el) => {
      if (!el || !el.getBoundingClientRect) {
        overlay.style.opacity = '0';
        return;
      }
      const rect = el.getBoundingClientRect();
      overlay.style.left = `${Math.round(rect.left)}px`;
      overlay.style.top = `${Math.round(rect.top)}px`;
      overlay.style.width = `${Math.max(1, Math.round(rect.width))}px`;
      overlay.style.height = `${Math.max(1, Math.round(rect.height))}px`;
      overlay.style.opacity = '1';
    };
    const createEntry = (el) => {
      const overlay = createOverlay(el, style);
      overlays.push({ element: el, overlay });
      const updater = () => updateOverlay(overlay, el);
      overlayEntries.push({ overlay, update: updater });
      updater();
      cleanups.push(() => removeOverlay(overlay));
    };
    elements.forEach((el) => {
      try {
        createEntry(el);
      } catch {
        /* ignore */
      }
    });
    let rafToken = null;
    const scheduleUpdate = () => {
      if (rafToken !== null) return;
      rafToken = window.requestAnimationFrame(() => {
        rafToken = null;
        overlayEntries.forEach((entry) => {
          try {
            entry.update();
          } catch {
            /* ignore */
          }
        });
      });
    };
    const scrollHandler = () => scheduleUpdate();
    const resizeHandler = () => scheduleUpdate();
    window.addEventListener('scroll', scrollHandler, true);
    window.addEventListener('resize', resizeHandler);
    cleanups.push(() => {
      window.removeEventListener('scroll', scrollHandler, true);
      window.removeEventListener('resize', resizeHandler);
      if (rafToken !== null) {
        window.cancelAnimationFrame(rafToken);
      }
    });
    cleanups.push(() => overlays.forEach((entry) => removeOverlay(entry.overlay)));
    const cleanup = () => {
      cleanups.forEach((fn) => {
        try {
          fn();
        } catch {
          /* ignore */
        }
      });
    };
    registry.set(channel, { overlays, sticky, cleanup });
    if (duration > 0 && !sticky) {
      window.setTimeout(() => {
        clearChannel(channel);
      }, duration);
    }
    return {
      selector: options.selector || null,
      count: overlays.length,
      channel,
    };
  }

  function highlightSelector(selector, options = {}) {
    if (!selector) {
      return { count: 0, channel: options.channel || 'default' };
    }
    const maxMatches = Math.min(Math.max(Number(options.maxMatches) || 20, 1), 200);
    const nodes = Array.from(document.querySelectorAll(selector)).slice(0, maxMatches);
    return highlightNodes(nodes, { ...options, selector });
  }

  function getDomBranch(path, options = {}) {
    const root = domUtils.resolveRoot(options.rootSelector);
    if (!root) {
      return {
        node: null,
        error: 'root-not-found',
      };
    }
    let target = root;
    if (path && path !== 'root') {
      target = domUtils.resolveByPath(path, options.rootSelector) || root;
    }
    const node = domUtils.snapshotNode(target, options);
    return {
      node,
      path: node?.path || 'root',
      capturedAt: Date.now(),
    };
  }

  function getNodeDetails(path, options = {}) {
    const el = domUtils.resolveByPath(path, options.rootSelector);
    if (!el) {
      return { path, exists: false };
    }
    const rect = el.getBoundingClientRect();
    return {
      path,
      exists: true,
      tag: el.tagName ? el.tagName.toLowerCase() : 'node',
      id: el.id || null,
      classes: Array.from(el.classList || []),
      text: domUtils.extractText(el),
      boundingRect: {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
      },
    };
  }

  function bootRuntime() {
    const runtime = {
      version: VERSION,
      ready: true,
      highlight: {
        highlightSelector,
        highlightElements: highlightNodes,
        clear: clearChannel,
      },
      dom: {
        getBranch: getDomBranch,
        getNodeDetails,
        buildPathForElement: domUtils.buildPathForElement,
      },
      ping() {
        return { ts: Date.now(), href: window.location.href };
      },
    };
    Object.defineProperty(window, '__webautoRuntime', {
      value: runtime,
      configurable: true,
      enumerable: false,
      writable: false,
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      () => {
        bootRuntime();
      },
      { once: true },
    );
  } else {
    bootRuntime();
  }
})();
