import { createDomTreeStore } from '../../dom-tree/store.js';
import { createGraphStore } from '../../graph/store.js';

export function createUiState(options = {}) {
  const config = options.config || {};
  return {
    browserStatus: null,
    sessions: [],
    logs: [],
    operations: [],
    selectedSession: null,
    containerSnapshot: null,
    selectedContainerId: null,
    selectedDomPath: null,
    domNeedsReset: false,
    domTreeStore: createDomTreeStore(),
    graphStore: createGraphStore(),
    linkMode: {
      active: false,
      containerId: null,
      busy: false,
    },
    headless: Boolean(config.headless),
    messageTimer: null,
    loading: {
      browser: false,
      sessions: false,
      logs: false,
      containers: false,
    },
    isCollapsed: false,
    pendingContainerDom: new Set(),
    domActions: {
      selectedContainerId: null,
      aliasDraft: '',
      aliasDirty: false,
      aliasContainerId: null,
      parentContainerId: null,
      busy: false,
      lastSuggestionDomPath: null,
    },
    highlightFeedback: {
      selector: null,
      status: 'idle',
      message: '',
      timestamp: 0,
      persistent: false,
    },
    highlightOptions: {
      sticky: true,
    },
    highlightRuntime: {
      channelQueues: new Map(),
      persistedSelector: null,
    },
    domPicker: {
      status: 'idle',
      message: '',
      result: null,
      lastError: '',
    },
    uiPanels: {
      activeTool: 'dom',
    },
    coverage: {
      lastMissingKey: '',
    },
    snapshotMeta: {
      url: null,
      capturedAt: 0,
    },
    autoRefreshTimer: null,
    autoRefreshBusy: false,
    containerDepthCache: new Map(),
    containerOpsEditor: {
      containerId: null,
      text: '[]',
      dirty: false,
      error: '',
      lastSerialized: '[]',
      saving: false,
    },
  };
}

export function createLayoutState() {
  return {
    fitTimer: null,
    resizeObserver: null,
  };
}
