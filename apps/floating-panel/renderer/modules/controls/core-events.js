export function bindCoreEvents(ui, handlers = {}) {
  if (!ui) return;
  const wrap = (fn) => (event) => {
    if (typeof fn === 'function') {
      fn(event);
    }
  };
  ui.refreshBrowser?.addEventListener('click', wrap(handlers.onRefreshBrowser));
  ui.refreshSessions?.addEventListener('click', wrap(handlers.onRefreshSessions));
  ui.refreshLogs?.addEventListener('click', wrap(handlers.onRefreshLogs));
  ui.linkModeButton?.addEventListener('click', wrap(handlers.onToggleLinkMode));
  ui.clearLogs?.addEventListener('click', wrap(handlers.onClearLogs));
  ui.refreshContainers?.addEventListener('click', wrap(handlers.onRefreshContainers));
  ui.sessionForm?.addEventListener('submit', (event) => {
    event?.preventDefault?.();
    handlers.onCreateSession?.(event);
  });
  ui.openInspectorButton?.addEventListener('click', wrap(handlers.onOpenInspector));
  ui.domActionReplace?.addEventListener('click', wrap(handlers.onDomReplace));
  ui.domActionCreate?.addEventListener('click', wrap(handlers.onDomCreate));
  ui.domActionHighlight?.addEventListener('click', wrap(handlers.onDomHighlight));
  ui.domActionClearHighlight?.addEventListener('click', wrap(handlers.onDomClearHighlight));
  ui.domActionPick?.addEventListener('click', wrap(handlers.onDomPick));
  ui.domActionPickSidebar?.addEventListener('click', wrap(handlers.onDomPick));
  ui.sidebarCaptureButton?.addEventListener('click', (event) => {
    event?.preventDefault?.();
    handlers.onDomPick?.(event);
  });
  ui.domActionSaveAlias?.addEventListener('click', wrap(handlers.onDomSaveAlias));
  ui.domHighlightHoldToggle?.addEventListener('change', wrap(handlers.onHighlightHoldToggle));
  ui.domActionContainerSelect?.addEventListener('change', wrap(handlers.onDomActionContainerChange));
  ui.domAliasInput?.addEventListener('input', wrap(handlers.onAliasInputChange));
  ui.containerOpsEditor?.addEventListener('input', wrap(handlers.onContainerOpsInput));
  ui.containerOpsSave?.addEventListener('click', wrap(handlers.onContainerOpsSave));
  ui.containerOpsReset?.addEventListener('click', wrap(handlers.onContainerOpsReset));
  ui.containerOpsAddHighlight?.addEventListener('click', wrap(handlers.onContainerOpsAddHighlight));
  ui.containerOpsAddExtract?.addEventListener('click', wrap(handlers.onContainerOpsAddExtract));
  ui.toolTabDom?.addEventListener('click', wrap(handlers.onToolTabDom));
  ui.toolTabContainer?.addEventListener('click', wrap(handlers.onToolTabContainer));
}
