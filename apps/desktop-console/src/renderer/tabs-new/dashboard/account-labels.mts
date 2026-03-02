import { listAccountProfiles } from '../../account-source.mts';
import type { DashboardLayout } from './layout.mts';
import type { DashboardState } from './types.mts';

export function createAccountLabelManager(
  ctx: any,
  ui: DashboardLayout,
  state: DashboardState,
) {
  const resolveAccountLabel = (profileIdLike: any) => {
    const profileId = String(profileIdLike || '').trim();
    if (!profileId) return '-';
    return state.accountLabelByProfile.get(profileId) || profileId;
  };

  const applyAccountLabel = (profileIdLike: any) => {
    const profileId = String(profileIdLike || '').trim();
    if (!profileId) return;
    state.activeProfileId = profileId;
    ui.taskAccount.textContent = resolveAccountLabel(profileId);
    if (!state.accountLabelByProfile.has(profileId)) {
      void refreshAccountLabels(true);
    }
  };

  async function refreshAccountLabels(force = false) {
    if (state.accountLabelRefreshInFlight) return;
    if (!force && (Date.now() - state.accountLabelRefreshedAt) < state.accountLabelRefreshTtlMs) return;
    if (typeof ctx.api?.cmdRunJson !== 'function') return;
    if (typeof ctx.api?.pathJoin !== 'function') return;
    state.accountLabelRefreshInFlight = true;
    try {
      const rows = await listAccountProfiles(ctx.api, { platform: 'xiaohongshu' });
      state.accountLabelByProfile.clear();
      for (const row of rows) {
        const profileId = String(row?.profileId || '').trim();
        if (!profileId) continue;
        const label = String(row?.alias || row?.name || profileId).trim() || profileId;
        state.accountLabelByProfile.set(profileId, label);
      }
      state.accountLabelRefreshedAt = Date.now();
      if (state.activeProfileId) {
        ui.taskAccount.textContent = resolveAccountLabel(state.activeProfileId);
      }
    } catch {
      // ignore account label refresh errors; keep profile id fallback
    } finally {
      state.accountLabelRefreshInFlight = false;
    }
  }

  function startAccountLabelPoll() {
    if (state.accountLabelPollTimer) return;
    state.accountLabelPollTimer = setInterval(() => {
      if (state.paused) return;
      void refreshAccountLabels(false);
    }, 30_000);
  }

  function stopAccountLabelPoll() {
    if (!state.accountLabelPollTimer) return;
    clearInterval(state.accountLabelPollTimer);
    state.accountLabelPollTimer = null;
  }

  return {
    resolveAccountLabel,
    applyAccountLabel,
    refreshAccountLabels,
    startAccountLabelPoll,
    stopAccountLabelPoll,
  };
}
