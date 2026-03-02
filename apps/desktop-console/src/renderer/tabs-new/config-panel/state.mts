import type { ConfigPanelLayout } from './layout.mts';
import type { ConfigPanelState } from './types.mts';
import { nowText, readNumber } from './helpers.mts';

export function createUiStateHandlers(ui: ConfigPanelLayout, state: ConfigPanelState) {
  function scheduleSummaryText() {
    const mode = String(ui.scheduleTypeSelect.value || 'immediate').trim();
    const periodicType = String(ui.schedulePeriodicTypeSelect.value || 'interval').trim();
    const maxRunsRaw = ui.scheduleMaxRunsInput.value.trim();
    const maxRuns = maxRunsRaw ? `，最多 ${Math.max(1, Number(maxRunsRaw) || 1)} 次` : '，不限次数';
    if (mode === 'immediate') {
      return '马上执行（仅一次）';
    }
    if (mode === 'periodic') {
      if (periodicType === 'daily' || periodicType === 'weekly') {
        const label = periodicType === 'daily' ? '每天' : '每周';
        const runAtText = ui.scheduleRunAtInput.value ? ui.scheduleRunAtInput.value.replace('T', ' ') : '未设置时间';
        return `${label}，${runAtText}${maxRuns}`;
      }
      const interval = readNumber(ui.scheduleIntervalInput, 30, 1);
      return `每 ${interval} 分钟${maxRuns}`;
    }
    const runAtText = ui.scheduleRunAtInput.value ? ui.scheduleRunAtInput.value.replace('T', ' ') : '未设置时间';
    return `定时任务，${runAtText}`;
  }

  function renderConfigStatus() {
    const hasTask = Boolean(state.selectedTaskId);
    ui.configActiveTaskId.textContent = hasTask ? state.selectedTaskId : '新配置';
    ui.configEditMode.textContent = hasTask ? '编辑已有配置' : '新建配置';
    ui.configDirtyState.textContent = state.isDirty ? '未保存' : '已保存';
    ui.configDirtyState.style.color = state.isDirty ? 'var(--accent-warning)' : 'var(--accent-success)';
    ui.configSchedulePreview.textContent = scheduleSummaryText();
    ui.configLastAction.textContent = `最近操作：${state.lastActionText}`;
  }

  function markDirty(reason = '配置已修改') {
    if (state.suppressDirtyTracking) return;
    state.isDirty = true;
    state.lastActionText = `${reason} (${nowText()})`;
    renderConfigStatus();
  }

  function markSaved(reason: string) {
    state.isDirty = false;
    state.lastActionText = `${reason} (${nowText()})`;
    renderConfigStatus();
  }

  function withSilentFormApply(apply: () => void) {
    state.suppressDirtyTracking = true;
    try {
      apply();
    } finally {
      state.suppressDirtyTracking = false;
      renderConfigStatus();
    }
  }

  function updateScheduleFields() {
    const mode = String(ui.scheduleTypeSelect.value || 'immediate');
    const periodicType = String(ui.schedulePeriodicTypeSelect.value || 'interval');
    const periodic = mode === 'periodic';
    const scheduled = mode === 'scheduled';
    ui.schedulePeriodicTypeWrap.style.display = periodic ? '' : 'none';
    ui.scheduleIntervalWrap.style.display = periodic && periodicType === 'interval' ? '' : 'none';
    ui.scheduleRunAtWrap.style.display = scheduled || (periodic && periodicType !== 'interval') ? '' : 'none';
    ui.scheduleMaxRunsInput.disabled = mode === 'immediate' || mode === 'scheduled';
    if (mode === 'immediate' || mode === 'scheduled') {
      ui.scheduleMaxRunsInput.value = '';
    }
    ui.startBtn.textContent = mode === 'immediate' ? '立即执行' : '保存并执行';
    renderConfigStatus();
  }

  function updateLikeKeywordsState() {
    ui.likeKeywordsInput.disabled = false;
    ui.likeKeywordsInput.style.opacity = ui.autoLikeCb.checked ? '1' : '0.9';
    ui.maxLikesInput.disabled = false;
    ui.maxLikesInput.style.opacity = ui.autoLikeCb.checked ? '1' : '0.9';
  }

  return {
    scheduleSummaryText,
    renderConfigStatus,
    markDirty,
    markSaved,
    withSilentFormApply,
    updateScheduleFields,
    updateLikeKeywordsState,
  };
}
