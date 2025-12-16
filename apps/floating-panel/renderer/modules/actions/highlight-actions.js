// 高亮动作：只负责按钮事件与 UI 交互，不直接发 invokeAction。
export function createHighlightActions({ bus, ui }) {
  if (!bus || !ui) return {};

  let persistent = false;

  // DOM 请求高亮（按钮点击）
  bus.subscribe('ui.action.highlight', ({ selector, options }) => {
    bus.publish('dom:highlight_request', {
      selector,
      channel: options.channel || 'default',
      persistent: Boolean(options.persistent),
    });
  });

  // 清除高亮（按钮点击）
  bus.subscribe('ui.action.clearHighlight', ({ channel }) => {
    bus.publish('dom:highlight_cleared', { channel: channel || 'default' });
  });

  // 保持高亮开关（切换）
  bus.subscribe('ui.action.togglePersistent', () => {
    persistent = !persistent;
    bus.publish('ui.highlight.options', { persistent });
  });

  // 绑定 UI
  if (ui.domActionHighlight) {
    ui.domActionHighlight.addEventListener('click', () => {
      bus.publish('ui.action.highlight', { selector: ui.state?.selectedDomPath, options: { persistent } });
    });
  }
  if (ui.domActionClearHighlight) {
    ui.domActionClearHighlight.addEventListener('click', () => {
      bus.publish('ui.action.clearHighlight', {});
    });
  }
  if (ui.domHighlightHoldToggle) {
    ui.domHighlightHoldToggle.addEventListener('change', (e) => {
      persistent = e.target.checked;
      bus.publish('ui.action.togglePersistent');
    });
  }

  // 反馈/UI 同步
  bus.subscribe('dom:highlight_feedback', (payload) => {
    if (payload.status === 'success' && payload.count > 0 && payload.selector) {
      // 更新 UI 状态
      ui.domActionStatus?.classList.remove('hidden');
      ui.domActionStatus.textContent = `命中 ${payload.count} 个元素`;
    } else if (payload.error) {
      ui.domActionStatus.textContent = payload.error;
    } else {
      ui.domActionStatus.textContent = '未命中';
    }
  });
  bus.subscribe('dom:highlight_error', (payload) => {
    ui.domActionStatus.textContent = payload.error || '高亮失败';
  });
  bus.subscribe('ui.highlight.options', ({ persistent: p }) => {
    if (ui.domHighlightHoldToggle) ui.domHighlightHoldToggle.checked = p;
    });

  return { bus, ui };
}
