import type { DashboardLayout } from './layout.mts';
import type { DashboardState } from './types.mts';

export function createElapsedTracker(ui: DashboardLayout, state: DashboardState) {
  function updateElapsed() {
    const base = state.stoppedAt ?? Date.now();
    const elapsed = Math.max(0, Math.floor((base - state.startTime) / 1000));
    const h = Math.floor(elapsed / 3600);
    const m = Math.floor((elapsed % 3600) / 60);
    const s = elapsed % 60;
    ui.statElapsed.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function startElapsedTimer() {
    if (state.elapsedTimer) return;
    state.elapsedTimer = setInterval(updateElapsed, 1000);
  }

  function stopElapsedTimer() {
    if (!state.elapsedTimer) return;
    clearInterval(state.elapsedTimer);
    state.elapsedTimer = null;
  }

  return {
    updateElapsed,
    startElapsedTimer,
    stopElapsedTimer,
  };
}
