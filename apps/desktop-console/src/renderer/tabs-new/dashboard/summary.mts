import type { DashboardLayout } from './layout.mts';
import type { DashboardState } from './types.mts';
import { normalizeDetails, normalizeLink } from './helpers.mts';

export type RunSummaryDeps = {
  addLog: (line: string, type?: 'info' | 'success' | 'error' | 'warn') => void;
  updateElapsed: () => void;
  startElapsedTimer: () => void;
};

export function createRunSummaryManager(
  ctx: any,
  ui: DashboardLayout,
  state: DashboardState,
  deps: RunSummaryDeps,
) {
  const { addLog, updateElapsed, startElapsedTimer } = deps;
  const recentErrors = state.recentErrors;
  const likedLinks = state.likedLinks;

  function pushLikedLink(entry: { url: string; noteId: string | null; source: string; profileId?: string | null; ts?: string | null }) {
    const url = String(entry.url || '').trim();
    if (!url) return;
    const previous = likedLinks.get(url);
    likedLinks.set(url, {
      url,
      noteId: entry.noteId || previous?.noteId || null,
      source: entry.source || previous?.source || 'comment_like',
      profileId: entry.profileId || previous?.profileId || state.activeProfileId || null,
      ts: entry.ts || previous?.ts || new Date().toLocaleTimeString('zh-CN', { hour12: false }),
      count: (previous?.count || 0) + 1,
    });
    const keys = Array.from(likedLinks.keys());
    if (keys.length > state.maxLikedLinks) {
      likedLinks.delete(keys[0]);
    }
  }

  function renderLikedLinks() {
    ui.likedLinksList.innerHTML = '';
    const entries = Array.from(likedLinks.values());
    if (entries.length === 0) {
      ui.likedLinksEmpty.style.display = 'block';
      ui.likedLinksList.style.display = 'none';
      return;
    }
    ui.likedLinksEmpty.style.display = 'none';
    ui.likedLinksList.style.display = 'block';
    for (const item of entries) {
      const li = document.createElement('li');
      const wrap = document.createElement('div');
      wrap.style.display = 'flex';
      wrap.style.alignItems = 'center';
      wrap.style.gap = '6px';
      wrap.style.flexWrap = 'wrap';

      const label = document.createElement('span');
      label.textContent = `[${item.ts}]`;
      wrap.appendChild(label);

      const link = document.createElement('a');
      link.href = '#';
      link.textContent = item.noteId ? `note:${item.noteId}` : '打开链接';
      link.onclick = (evt) => {
        evt.preventDefault();
        void openLikedLink(item.url, item.profileId || state.activeProfileId || null);
      };
      wrap.appendChild(link);

      const hint = document.createElement('span');
      hint.style.color = 'var(--text-4)';
      hint.textContent = `(${item.source}${item.count > 1 ? ` x${item.count}` : ''})`;
      wrap.appendChild(hint);

      li.appendChild(wrap);
      ui.likedLinksList.appendChild(li);
    }
  }

  async function openLikedLink(url: string, profileId: string | null) {
    const targetUrl = String(url || '').trim();
    if (!targetUrl) return;
    const pid = String(profileId || '').trim();
    try {
      if (pid && typeof ctx.api?.cmdRunJson === 'function') {
        const ret = await ctx.api.cmdRunJson({
          title: `goto ${pid}`,
          cwd: '',
          args: [
            ctx.api.pathJoin('apps', 'webauto', 'entry', 'profilepool.mjs'),
            'goto-profile',
            pid,
            '--url',
            targetUrl,
            '--json',
          ],
          timeoutMs: 30_000,
        });
        if (ret?.ok) {
          addLog(`已在 ${pid} 打开点赞链接`, 'info');
          return;
        }
      }
      if (typeof ctx.api?.osOpenPath === 'function') {
        await ctx.api.osOpenPath(targetUrl);
        addLog('已通过系统打开点赞链接', 'warn');
      }
    } catch (err: any) {
      pushRecentError('点赞链接打开失败', 'like_link', err?.message || String(err));
    }
  }

  function renderRunSummary() {
    ui.runIdText.textContent = state.activeRunId || '-';
    if (ctx && typeof ctx === 'object') {
      ctx.activeRunId = state.activeRunId || null;
    }
    ui.errorCountText.textContent = String(state.errorCountTotal);
    ui.recentErrorsList.innerHTML = '';
    if (recentErrors.length === 0) {
      ui.recentErrorsEmpty.style.display = 'block';
      ui.recentErrorsList.style.display = 'none';
      return;
    }
    ui.recentErrorsEmpty.style.display = 'none';
    ui.recentErrorsList.style.display = 'block';
    recentErrors.forEach((item) => {
      const li = document.createElement('li');
      const line = document.createElement('div');
      line.textContent = `[${item.ts}] ${item.source}: ${item.message}`;
      li.appendChild(line);
      if (item.details) {
        const details = document.createElement('details');
        const summary = document.createElement('summary');
        summary.textContent = '详情';
        const pre = document.createElement('pre');
        pre.style.margin = '4px 0 0 0';
        pre.style.whiteSpace = 'pre-wrap';
        pre.style.wordBreak = 'break-word';
        pre.textContent = item.details;
        details.appendChild(summary);
        details.appendChild(pre);
        li.appendChild(details);
      }
      ui.recentErrorsList.appendChild(li);
    });
    renderLikedLinks();
  }

  function pushRecentError(message: string, source = 'runtime', details: any = null) {
    const msg = String(message || '').trim();
    if (!msg) return;
    state.errorCountTotal += 1;
    recentErrors.unshift({
      ts: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
      source,
      message: msg,
      details: normalizeDetails(details),
    });
    while (recentErrors.length > state.maxRecentErrors) recentErrors.pop();
    renderRunSummary();
  }

  function resetDashboardForNewRun(reason: string, startedAtMs?: number) {
    state.commentsCount = 0;
    state.likesCount = 0;
    state.likesSkippedCount = 0;
    state.likesAlreadyCount = 0;
    state.likesDedupCount = 0;
    state.errorCountTotal = 0;
    recentErrors.length = 0;
    likedLinks.clear();
    ui.logsContainer.innerHTML = '';
    ui.statCollected.textContent = '0';
    ui.statSuccess.textContent = '0';
    ui.statFailed.textContent = '0';
    ui.statRemaining.textContent = '0';
    ui.statComments.textContent = '0条';
    ui.statLikes.textContent = '0次 (跳过:0, 已赞:0, 去重:0)';
    ui.progressPercent.textContent = '0%';
    ui.progressBar.style.width = '0%';
    ui.currentAction.textContent = reason || '-';
    ui.currentPhase.textContent = '运行中';
    state.startTime = Number.isFinite(Number(startedAtMs)) && Number(startedAtMs) > 0
      ? Number(startedAtMs)
      : Date.now();
    state.stoppedAt = null;
    updateElapsed();
    startElapsedTimer();
    renderRunSummary();
  }

  return {
    pushLikedLink,
    renderRunSummary,
    pushRecentError,
    resetDashboardForNewRun,
    openLikedLink,
  };
}
