import { createEl } from '../../ui-components.mjs';
import { parseStdoutForEvents as parseStdoutForEventsImpl } from './live-stats/stdout-parser.mjs';
import { applyStatePatch } from './live-stats/state-patch.mjs';
import type { LiveStatsController, LiveStatsData, LiveStatsOptions, LiveStatsRuntime, ShardProgress } from './live-stats/types.mjs';

export type { LiveStatsController } from './live-stats/types.mjs';

export function createLiveStatsController(opts: LiveStatsOptions): LiveStatsController {
  const {
    maxCommentsInput,
    linksStat,
    postsStat,
    commentsStat,
    likesStat,
    likesSkipStat,
    repliesStat,
    streamStat,
    shardStatsList,
    likedList,
    repliedList,
  } = opts;

  const parentDir = (inputPath: string) => {
    const p = String(inputPath || '');
    const slash = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
    return slash > 0 ? p.slice(0, slash) : '';
  };

  const formatLineText = (input: string, max = 120) => {
    const normalized = String(input || '').replace(/\s+/g, ' ').trim();
    if (!normalized) return '';
    if (normalized.length <= max) return normalized;
    return `${normalized.slice(0, Math.max(1, max - 1))}…`;
  };

  const createEmptyShardProgress = (): ShardProgress => ({
    linksCollected: 0,
    linksTarget: 0,
    postsProcessed: 0,
    commentsCollected: 0,
    likesTotal: 0,
    likesSkippedTotal: 0,
    likeDedupSkipped: 0,
    likeAlreadySkipped: 0,
    likeGateBlocked: 0,
    repliesTotal: 0,
    phase: '',
    action: '',
    status: 'idle',
    anomaly: '',
    updatedAt: 0,
  });

  const liveStats: LiveStatsData = {
    linksCollected: 0,
    linksTarget: 0,
    postsProcessed: 0,
    currentCommentsCollected: 0,
    currentCommentsTarget: '不限',
    likesTotal: 0,
    likesSkippedTotal: 0,
    likeDedupSkipped: 0,
    likeAlreadySkipped: 0,
    likeGateBlocked: 0,
    repliesTotal: 0,
    eventsPath: '',
    noteId: '',
  };

  const activeRunIds = new Set<string>();
  const runToShard = new Map<string, string>();
  const parentRunCurrentShard = new Map<string, string>();
  const shardStats = new Map<string, ShardProgress>();
  const expectedShardProfiles = new Set<string>();
  const likedNotes = new Map<string, { count: number; path: string }>();
  const repliedNotes = new Map<string, { count: number; path: string }>();

  let stateUnsubscribe: (() => void) | null = null;

  const ensureShardStats = (shardKey: string) => {
    const key = String(shardKey || '').trim();
    if (!key) return null;
    if (!shardStats.has(key)) shardStats.set(key, createEmptyShardProgress());
    return shardStats.get(key) || null;
  };

  const aggregateShardStats = (): ShardProgress => {
    if (shardStats.size === 0) {
      return {
        ...createEmptyShardProgress(),
        linksCollected: liveStats.linksCollected,
        linksTarget: liveStats.linksTarget,
        postsProcessed: liveStats.postsProcessed,
        commentsCollected: liveStats.currentCommentsCollected,
        likesTotal: liveStats.likesTotal,
        likesSkippedTotal: liveStats.likesSkippedTotal,
        likeDedupSkipped: liveStats.likeDedupSkipped,
        likeAlreadySkipped: liveStats.likeAlreadySkipped,
        likeGateBlocked: liveStats.likeGateBlocked,
        repliesTotal: liveStats.repliesTotal,
      };
    }
    const merged = createEmptyShardProgress();
    shardStats.forEach((item) => {
      merged.linksCollected += item.linksCollected;
      merged.linksTarget += item.linksTarget;
      merged.postsProcessed += item.postsProcessed;
      merged.commentsCollected += item.commentsCollected;
      merged.likesTotal += item.likesTotal;
      merged.likesSkippedTotal += item.likesSkippedTotal;
      merged.likeDedupSkipped += item.likeDedupSkipped;
      merged.likeAlreadySkipped += item.likeAlreadySkipped;
      merged.likeGateBlocked += item.likeGateBlocked;
      merged.repliesTotal += item.repliesTotal;
    });
    if (merged.linksTarget <= 0) merged.linksTarget = liveStats.linksTarget;
    return merged;
  };

  const runtime: LiveStatsRuntime = {
    maxCommentsInput,
    liveStats,
    activeRunIds,
    runToShard,
    parentRunCurrentShard,
    shardStats,
    expectedShardProfiles,
    likedNotes,
    repliedNotes,
    activeRunId: '',
    hasStateFeed: false,
    ensureShardStats,
    formatLineText,
    parentDir,
    renderLiveStats: () => undefined,
  };

  const renderActionList = (
    container: HTMLDivElement,
    items: Map<string, { count: number; path: string }>,
    emptyText: string,
  ) => {
    container.innerHTML = '';
    if (items.size === 0) {
      container.appendChild(createEl('div', { className: 'muted' }, [emptyText]));
      return;
    }
    Array.from(items.entries()).forEach(([noteId, item]) => {
      const row = createEl('div', {
        className: 'row',
        style: 'justify-content:space-between; gap:8px; border:1px solid #1f2937; border-radius:6px; padding:6px 8px;',
      });
      row.appendChild(createEl('span', { className: 'muted' }, [`${noteId} × ${item.count}`]));
      const openBtn = createEl('button', { type: 'button', className: 'secondary', style: 'padding:2px 8px;' }, ['打开目录']) as HTMLButtonElement;
      openBtn.onclick = async () => {
        const targetPath = String(item.path || '').trim();
        if (!targetPath) {
          alert('该帖子暂无目录信息');
          return;
        }
        const ret = await window.api.osOpenPath(targetPath);
        if (!ret?.ok) alert(`打开失败：${ret?.error || 'unknown_error'}`);
      };
      row.appendChild(openBtn);
      container.appendChild(row);
    });
  };

  const statusLabel = (item: ShardProgress) => {
    if (item.status === 'error') return '异常';
    if (item.status === 'completed') return '完成';
    if (item.status === 'running') return '运行中';
    return '待机';
  };

  const renderShardStats = () => {
    shardStatsList.innerHTML = '';
    if (expectedShardProfiles.size === 0 && shardStats.size === 0) {
      shardStatsList.appendChild(createEl('div', { className: 'muted' }, ['单账号模式：未检测到分片']));
      return;
    }

    const merged = aggregateShardStats();
    const profileList = expectedShardProfiles.size > 0
      ? Array.from(expectedShardProfiles.values())
      : Array.from(shardStats.keys());
    const shardItems = profileList
      .map((profileId) => ensureShardStats(profileId))
      .filter((item): item is ShardProgress => Boolean(item));
    const runningCount = shardItems.filter((item) => item.status === 'running').length;
    const errorCount = shardItems.filter((item) => item.status === 'error').length;
    const activePhases = Array.from(
      new Set(
        shardItems
          .map((item) => String(item.phase || '').trim())
          .filter(Boolean),
      ),
    ).slice(0, 3);
    const mergedRow = createEl('div', {
      style: 'border:1px solid #1f2937; border-radius:6px; padding:6px 8px; background:#0b1220; font-size:12px;',
    });
    mergedRow.appendChild(createEl('div', { style: 'font-weight:600; margin-bottom:2px;' }, ['合并总览']));
    mergedRow.appendChild(
      createEl('div', { className: 'muted' }, [
        `链接 ${merged.linksCollected}/${merged.linksTarget || 0} · 帖子 ${merged.postsProcessed} · 评论 ${merged.commentsCollected} · 点赞 ${merged.likesTotal} · 跳过赞 ${merged.likesSkippedTotal} · 回复 ${merged.repliesTotal}`,
      ]),
    );
    mergedRow.appendChild(
      createEl('div', { className: 'muted' }, [
        `跳过明细：去重 ${merged.likeDedupSkipped} · 已赞 ${merged.likeAlreadySkipped} · 限流 ${merged.likeGateBlocked}`,
      ]),
    );
    mergedRow.appendChild(
      createEl('div', { className: 'muted' }, [
        `运行账号 ${shardItems.length} · 运行中 ${runningCount} · 异常 ${errorCount} · 阶段 ${activePhases.join(' / ') || '等待中'}`,
      ]),
    );
    shardStatsList.appendChild(mergedRow);

    profileList.forEach((profileId) => {
      const item = ensureShardStats(profileId);
      if (!item) return;
      const row = createEl('div', {
        style: 'border:1px solid #1f2937; border-radius:6px; padding:6px 8px; font-size:12px;',
      });
      row.appendChild(createEl('div', { style: 'font-weight:600; margin-bottom:2px;' }, [profileId]));
      row.appendChild(
        createEl('div', { className: 'muted' }, [
          `链接 ${item.linksCollected}/${item.linksTarget || 0} · 帖子 ${item.postsProcessed} · 评论 ${item.commentsCollected} · 点赞 ${item.likesTotal} · 跳过赞 ${item.likesSkippedTotal} · 回复 ${item.repliesTotal}`,
        ]),
      );
      row.appendChild(
        createEl('div', { className: 'muted' }, [
          `跳过明细：去重 ${item.likeDedupSkipped} · 已赞 ${item.likeAlreadySkipped} · 限流 ${item.likeGateBlocked}`,
        ]),
      );
      row.appendChild(
        createEl('div', { className: 'muted' }, [
          `阶段 ${item.phase || '未知'} · 状态 ${statusLabel(item)} · 动作 ${item.action || '等待日志'}`,
        ]),
      );
      if (item.anomaly) {
        row.appendChild(
          createEl('div', { className: 'muted', style: 'color:#fca5a5;' }, [
            `异常：${item.anomaly}`,
          ]),
        );
      }
      shardStatsList.appendChild(row);
    });
  };

  const renderLiveStats = () => {
    const merged = aggregateShardStats();
    linksStat.textContent = `链接采集：${merged.linksCollected}/${merged.linksTarget || liveStats.linksTarget || 0}`;
    postsStat.textContent = `帖子处理：${merged.postsProcessed}`;
    commentsStat.textContent = `当前帖子评论：${liveStats.currentCommentsCollected}/${liveStats.currentCommentsTarget}`;
    likesStat.textContent = `总点赞：${merged.likesTotal}`;
    likesSkipStat.textContent = `点赞跳过：${merged.likesSkippedTotal}（去重${merged.likeDedupSkipped}/已赞${merged.likeAlreadySkipped}/限流${merged.likeGateBlocked}）`;
    repliesStat.textContent = `总回复：${merged.repliesTotal}`;

    const sourceHint = activeRunIds.size > 0 ? `run=${activeRunIds.size}` : 'run=0';
    const shardHint = `shard=${Math.max(expectedShardProfiles.size, shardStats.size, 1)}`;
    const eventsHint = liveStats.eventsPath ? `, events=${liveStats.eventsPath}` : '';
    const feed = runtime.hasStateFeed ? 'state+cmd-event' : 'cmd-event';
    streamStat.textContent = `数据源：${feed}(${sourceHint}, ${shardHint}${eventsHint})`;

    renderShardStats();
    renderActionList(likedList, likedNotes, '暂无点赞命中');
    renderActionList(repliedList, repliedNotes, '暂无回复命中');
  };

  runtime.renderLiveStats = renderLiveStats;

  const parseStdoutForEvents = (line: string) => {
    parseStdoutForEventsImpl(runtime, line);
  };

  const setActiveRunId = (runId: string) => {
    const next = String(runId || '').trim();
    if (!next) return;
    runtime.activeRunId = next;
    activeRunIds.add(next);
    if (expectedShardProfiles.size === 1 && !runToShard.has(next)) {
      runToShard.set(next, Array.from(expectedShardProfiles)[0]);
    }
    if (typeof window.api?.stateGetTask === 'function') {
      void window.api.stateGetTask(next).then((task: any) => {
        applyStatePatch(runtime, task, next);
      }).catch(() => null);
    }
    renderLiveStats();
  };

  const setShardProfiles = (profiles: string[]) => {
    expectedShardProfiles.clear();
    (Array.isArray(profiles) ? profiles : [])
      .map((x) => String(x || '').trim())
      .filter(Boolean)
      .forEach((profileId) => {
        expectedShardProfiles.add(profileId);
        ensureShardStats(profileId);
      });
    if (expectedShardProfiles.size === 1 && runtime.activeRunId && !runToShard.has(runtime.activeRunId)) {
      runToShard.set(runtime.activeRunId, Array.from(expectedShardProfiles)[0]);
    }
    renderLiveStats();
  };

  const resetLiveStats = () => {
    liveStats.linksCollected = 0;
    liveStats.linksTarget = 0;
    liveStats.postsProcessed = 0;
    liveStats.currentCommentsCollected = 0;
    liveStats.currentCommentsTarget = Number(maxCommentsInput.value || 0) > 0
      ? String(Math.floor(Number(maxCommentsInput.value || 0)))
      : '不限';
    liveStats.likesTotal = 0;
    liveStats.likesSkippedTotal = 0;
    liveStats.likeDedupSkipped = 0;
    liveStats.likeAlreadySkipped = 0;
    liveStats.likeGateBlocked = 0;
    liveStats.repliesTotal = 0;
    liveStats.eventsPath = '';
    liveStats.noteId = '';

    runtime.activeRunId = '';
    runtime.hasStateFeed = false;
    activeRunIds.clear();
    runToShard.clear();
    parentRunCurrentShard.clear();
    shardStats.clear();
    expectedShardProfiles.clear();
    likedNotes.clear();
    repliedNotes.clear();
    renderLiveStats();
  };

  const setExpectedLinksTarget = (target: number) => {
    const normalized = Number.isFinite(target) ? Math.max(0, Math.floor(target)) : 0;
    if (normalized <= 0) return;
    liveStats.linksTarget = Math.max(liveStats.linksTarget, normalized);
    renderLiveStats();
  };

  maxCommentsInput.addEventListener('change', () => {
    liveStats.currentCommentsTarget = Number(maxCommentsInput.value || 0) > 0
      ? String(Math.floor(Number(maxCommentsInput.value || 0)))
      : '不限';
    renderLiveStats();
  });

  if (typeof window.api?.onStateUpdate === 'function') {
    stateUnsubscribe = window.api.onStateUpdate((update: any) => {
      const rid = String(update?.runId || '').trim();
      if (!rid) return;
      const t = String(update?.type || '').trim();
      const patch = update?.data || {};
      const looksProgress =
        t === 'progress' ||
        Number.isFinite(Number((patch as any)?.processed)) ||
        Number.isFinite(Number((patch as any)?.current)) ||
        Number.isFinite(Number((patch as any)?.total));
      const looksStats =
        t === 'stats' ||
        Number.isFinite(Number((patch as any)?.notesProcessed)) ||
        Number.isFinite(Number((patch as any)?.commentsCollected)) ||
        Number.isFinite(Number((patch as any)?.likesPerformed)) ||
        Number.isFinite(Number((patch as any)?.repliesGenerated));
      if (activeRunIds.size > 0 && !activeRunIds.has(rid) && !(looksProgress || looksStats)) return;
      if (!runtime.activeRunId) runtime.activeRunId = rid;
      activeRunIds.add(rid);
      if (t === 'progress') {
        applyStatePatch(runtime, { progress: patch }, rid);
      } else if (t === 'stats') {
        applyStatePatch(runtime, { stats: patch }, rid);
      } else {
        applyStatePatch(runtime, patch, rid);
      }
    });
  }

  const dispose = () => {
    if (typeof stateUnsubscribe === 'function') stateUnsubscribe();
    stateUnsubscribe = null;
  };

  resetLiveStats();

  return {
    resetLiveStats,
    setExpectedLinksTarget,
    setShardProfiles,
    parseStdoutForEvents,
    setActiveRunId,
    dispose,
  };
}
