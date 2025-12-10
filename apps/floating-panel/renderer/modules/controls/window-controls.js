export function initWindowControls({
  ui,
  desktop,
  state,
  publishWindowCommand,
  toggleHeadlessMode,
  updateHeadlessButton,
  invokeAction,
  showMessage,
}) {
  if (!ui) return;
  ui.closeButton?.addEventListener('click', () => desktop?.close?.());
  ui.minButton?.addEventListener('click', () => desktop?.minimize?.());
  ui.collapseButton?.addEventListener('click', (event) => {
    event.preventDefault();
    if (!publishWindowCommand) return;
    const collapsed = Boolean(state?.isCollapsed);
    if (collapsed) {
      publishWindowCommand('ui.window.restoreFromBall', null, () => desktop?.toggleCollapse?.(false));
    } else {
      publishWindowCommand('ui.window.shrinkToBall', null, () => desktop?.toggleCollapse?.(true));
    }
  });
  ui.collapsedStrip?.addEventListener('click', (event) => {
    event.preventDefault();
    publishWindowCommand?.('ui.window.restoreFromBall', null, () => desktop?.toggleCollapse?.(false));
  });
  ui.expandCollapsedButton?.addEventListener('click', (event) => {
    event.stopPropagation();
    publishWindowCommand?.('ui.window.restoreFromBall', null, () => desktop?.toggleCollapse?.(false));
  });
  ui.headlessButton?.addEventListener('click', () => {
    toggleHeadlessMode?.();
  });
  ui.stickBrowserButton?.addEventListener('click', () => {
    const fallback = () =>
      invokeAction?.('window:stick-browser').catch((err) => {
        showMessage?.(err?.message || '浏览器贴边失败', 'error');
      });
    publishWindowCommand?.('ui.window.stickToBrowser', { browserWidthRatio: 0.68 }, fallback);
  });
  updateHeadlessButton?.();
}

export function subscribeDesktopState({ desktop, state, ui, queueFitWindow, updateHeadlessButton, uiStateService }) {
  desktop?.onCollapseState?.((payload = {}) => {
    const collapsed = Boolean(payload?.isCollapsed);
    if (state) {
      state.isCollapsed = collapsed;
    }
    document.body.classList.toggle('is-collapsed', collapsed);
    ui?.collapsedStrip?.classList.toggle('hidden', !collapsed);
    if (ui?.collapseButton) {
      ui.collapseButton.textContent = collapsed ? '▢' : '◻︎';
      ui.collapseButton.title = collapsed ? '展开浮窗' : '贴边收起';
    }
    if (!collapsed) {
      queueFitWindow?.();
    }
    uiStateService?.updateWindow(
      {
        mode: collapsed ? 'ball' : 'normal',
        collapsed,
      },
      'window-collapse',
    );
  });
  desktop?.onHeadlessState?.((payload = {}) => {
    if (state) {
      state.headless = Boolean(payload?.headless);
    }
    updateHeadlessButton?.();
    uiStateService?.updateWindow(
      {
        headless: Boolean(payload?.headless),
      },
      'window-headless',
    );
  });
}
