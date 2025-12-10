import { setDomTreeSnapshot } from '../../dom-tree/store.js';
import { getDomTree } from '../../dom-tree/store.js';
import { resetGraphStore, ingestContainerTree, ingestDomTree } from '../../graph/store.js';

export function createSnapshotManager(options = {}) {
  const {
    state,
    ui,
    domSnapshotOptions,
    invokeAction,
    debugLog,
    showMessage,
    setLoading,
    annotateDomTreeWithMatches,
    findAllDomPathsForContainer,
    resetDomVisibility,
    ensureContainerDomMapping,
    scheduleAutoExpand,
    syncContainerOpsEditor,
    ensureAutoRefreshTimer,
    resolveCurrentPageUrl,
    onSnapshotApplied,
    onSnapshotCleared,
    resetAutoExpandTrigger,
    uiStateService,
  } = options;
  if (!state || typeof invokeAction !== 'function') {
    throw new Error('snapshot manager requires state and invokeAction');
  }

  async function loadContainerSnapshot(skipLoading = false) {
    if (!state.selectedSession) {
      debugLog?.('loadContainerSnapshot: no session selected');
      clearSnapshot();
      onSnapshotCleared?.();
      return;
    }
    if (!skipLoading) {
      setLoading?.('containers', true);
    }
    try {
      const selected = state.sessions.find((s) => s.profileId === state.selectedSession);
      const url = selected?.current_url || selected?.currentUrl;
      if (!url) throw new Error('会话没有 URL');
      const res = await invokeAction('containers:inspect', {
        profile: state.selectedSession,
        url,
        ...(domSnapshotOptions || {}),
      });
      debugLog?.('loadContainerSnapshot result', res);
      applyContainerSnapshotData(res, { toastMessage: `容器树已捕获 (${state.selectedSession})` });
      onSnapshotApplied?.();
    } catch (err) {
      clearSnapshot();
      showMessage?.(err?.message || '容器树捕获失败', 'error');
      onSnapshotCleared?.(err);
    } finally {
      setLoading?.('containers', false);
    }
  }

  function clearSnapshot() {
    state.containerSnapshot = null;
    setDomTreeSnapshot(state.domTreeStore, null);
    state.selectedDomPath = null;
    state.domNeedsReset = false;
    uiStateService?.updateContainers(
      {
        rootId: null,
        pageUrl: null,
        capturedAt: 0,
        containerCount: 0,
        domCount: 0,
      },
      'snapshot-cleared',
    );
  }

  function applyContainerSnapshotData(result, options = {}) {
    const snapshot = result?.snapshot || result?.containerSnapshot || result;
    if (!snapshot || !snapshot.container_tree) {
      throw new Error('容器树为空');
    }
    state.containerSnapshot = snapshot;
    state.containerDepthCache = new Map();
    setDomTreeSnapshot(state.domTreeStore, snapshot?.dom_tree || result?.domTree || null);
    annotateDomTreeWithMatches?.(snapshot?.matches);
    const domTree = getDomTree(state.domTreeStore);
    if (domTree) {
      state.containerSnapshot.dom_tree = domTree;
    }
    const snapshotUrl =
      snapshot?.metadata?.page_url ||
      snapshot?.metadata?.pageUrl ||
      resolveCurrentPageUrl?.();
    const capturedAt = snapshot?.metadata?.captured_at || Date.now();
    state.snapshotMeta = {
      url: snapshotUrl || state.snapshotMeta.url || null,
      capturedAt,
    };
    resetGraphStore(state.graphStore);
    if (snapshot?.container_tree) {
      ingestContainerTree(state.graphStore, snapshot.container_tree);
    }
    if (domTree) {
      ingestDomTree(state.graphStore, domTree);
    }
    if (snapshot?.container_tree?.id) {
      state.selectedContainerId = snapshot.container_tree.id;
    }
    if (domTree?.path) {
      state.selectedDomPath = domTree.path;
    }
    const initialPaths = domTree
      ? findAllDomPathsForContainer?.(state.selectedContainerId, domTree) || []
      : [];
    if (!state.selectedDomPath && initialPaths.length) {
      state.selectedDomPath = initialPaths[0];
    }
    state.domNeedsReset = true;
    if (options.toastMessage) {
      showMessage?.(options.toastMessage, 'success');
    }
    if (state.selectedContainerId) {
      ensureContainerDomMapping?.(state.selectedContainerId);
    }
    resetAutoExpandTrigger?.();
    scheduleAutoExpand?.();
    syncContainerOpsEditor?.(state.selectedContainerId, { force: true });
    ensureAutoRefreshTimer?.();
    const containerCount = countContainers(snapshot?.container_tree);
    const domCount = countDomNodes(domTree);
    uiStateService?.updateContainers(
      {
        rootId: snapshot?.container_tree?.id || null,
        pageUrl: state.snapshotMeta?.url || null,
        capturedAt,
        containerCount,
        domCount,
      },
      'snapshot-applied',
    );
  }

  return {
    loadContainerSnapshot,
    applyContainerSnapshotData,
  };
}

function countContainers(node) {
  if (!node) return 0;
  let count = 1;
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      count += countContainers(child);
    }
  }
  return count;
}

function countDomNodes(node) {
  if (!node) return 0;
  let total = 1;
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      total += countDomNodes(child);
    }
  }
  return total;
}
