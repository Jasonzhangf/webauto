import type { SchedulerLayout } from './layout.mts';
import type { SchedulerState } from './types.mts';

export function createSchedulerUiHelpers(ctx: any, ui: SchedulerLayout, state: SchedulerState) {
  function setDaemonStatus(text: string) {
    ui.daemonStatus.textContent = text;
  }

  function setActiveTaskContext(taskId: string) {
    const id = String(taskId || '').trim();
    ui.activeTaskIdText.textContent = id || '-';
    if (ctx && typeof ctx === 'object') {
      ctx.activeTaskConfigId = id;
    }
  }

  function openConfigTab(taskId: string) {
    setActiveTaskContext(taskId);
    if (typeof ctx.setActiveTab === 'function') {
      ctx.setActiveTab('tasks');
    }
  }

  return {
    setDaemonStatus,
    setActiveTaskContext,
    openConfigTab,
  };
}
