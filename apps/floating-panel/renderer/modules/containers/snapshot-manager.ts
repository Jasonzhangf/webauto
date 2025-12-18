import { resetGraphStore, ingestContainerTree } from '../../graph/store.js';

export function createSnapshotManager(options: any = {}) {
  const { state, invokeAction, uiStateService } = options;

  async function loadContainerSnapshot() {
    const selectedSession = state?.selectedSession;
    if (!selectedSession?.profile_id) return;
    const result = await invokeAction('containers:inspect', { profile: selectedSession.profile_id });
    const snapshot = result?.data || result;
    resetGraphStore(state.graphStore);
    if (snapshot?.container_tree) {
      ingestContainerTree(state.graphStore, snapshot.container_tree);
    }
    state.containerSnapshot = snapshot;
    uiStateService?.updateContainers?.(
      {
        rootId: snapshot?.container_tree?.id || null,
        pageUrl: snapshot?.page_url || snapshot?.url || null,
        capturedAt: Date.now(),
        containerCount: null,
        domCount: null,
      },
      'snapshot-applied',
    );
  }

  function applyContainerSnapshotData(snapshot: any) {
    resetGraphStore(state.graphStore);
    if (snapshot?.container_tree) {
      ingestContainerTree(state.graphStore, snapshot.container_tree);
    }
    state.containerSnapshot = snapshot;
  }

  return { loadContainerSnapshot, applyContainerSnapshotData };
}
