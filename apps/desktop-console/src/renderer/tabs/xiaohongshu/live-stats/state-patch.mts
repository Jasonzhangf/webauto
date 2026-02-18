import type { LiveStatsRuntime } from './types.mjs';

export function applyStatePatch(runtime: LiveStatsRuntime, patch: any, runId?: string) {
  if (!patch || typeof patch !== 'object') return;
  const rid = String(runId || '').trim();
  const shardKey = (rid ? runtime.runToShard.get(rid) : '') || (runtime.expectedShardProfiles.size === 1 ? Array.from(runtime.expectedShardProfiles)[0] : '');
  const shardStat = shardKey ? runtime.ensureShardStats(shardKey) : null;
  const progress =
    patch.progress && typeof patch.progress === 'object'
      ? patch.progress
      : (('current' in patch) || ('processed' in patch) || ('total' in patch) || ('percent' in patch))
        ? patch
        : null;
  if (progress) {
    const processed = Number(progress.processed ?? progress.current);
    const total = Number(progress.total);
    if (Number.isFinite(processed)) runtime.liveStats.linksCollected = Math.max(0, Math.floor(processed));
    if (Number.isFinite(total)) runtime.liveStats.linksTarget = Math.max(runtime.liveStats.linksTarget, Math.floor(total));
    if (shardStat) {
      if (Number.isFinite(processed)) shardStat.linksCollected = Math.max(shardStat.linksCollected, Math.floor(processed));
      if (Number.isFinite(total)) shardStat.linksTarget = Math.max(shardStat.linksTarget, Math.floor(total));
    }
  }
  const stats =
    patch.stats && typeof patch.stats === 'object'
      ? patch.stats
      : (('notesProcessed' in patch) || ('commentsCollected' in patch) || ('likesPerformed' in patch) || ('repliesGenerated' in patch))
        ? patch
        : null;
  if (stats) {
    const notes = Number(stats.notesProcessed);
    const comments = Number(stats.commentsCollected);
    const likes = Number(stats.likesPerformed);
    const likesSkipped = Number((stats as any).likesSkippedTotal ?? (stats as any).likesSkipped ?? (stats as any).likeSkipped);
    const likeDedupSkipped = Number((stats as any).likeDedupSkipped ?? (stats as any).dedupSkipped);
    const likeAlreadySkipped = Number((stats as any).likeAlreadySkipped ?? (stats as any).alreadyLikedSkipped);
    const likeGateBlocked = Number((stats as any).likeGateBlocked ?? (stats as any).gateBlocked);
    const replies = Number(stats.repliesGenerated);
    if (Number.isFinite(notes)) runtime.liveStats.postsProcessed = Math.max(runtime.liveStats.postsProcessed, Math.floor(notes));
    if (Number.isFinite(comments)) runtime.liveStats.currentCommentsCollected = Math.max(runtime.liveStats.currentCommentsCollected, Math.floor(comments));
    if (Number.isFinite(likes)) runtime.liveStats.likesTotal = Math.max(runtime.liveStats.likesTotal, Math.floor(likes));
    if (Number.isFinite(likesSkipped)) runtime.liveStats.likesSkippedTotal = Math.max(runtime.liveStats.likesSkippedTotal, Math.floor(likesSkipped));
    if (Number.isFinite(likeDedupSkipped)) runtime.liveStats.likeDedupSkipped = Math.max(runtime.liveStats.likeDedupSkipped, Math.floor(likeDedupSkipped));
    if (Number.isFinite(likeAlreadySkipped)) runtime.liveStats.likeAlreadySkipped = Math.max(runtime.liveStats.likeAlreadySkipped, Math.floor(likeAlreadySkipped));
    if (Number.isFinite(likeGateBlocked)) runtime.liveStats.likeGateBlocked = Math.max(runtime.liveStats.likeGateBlocked, Math.floor(likeGateBlocked));
    if (Number.isFinite(replies)) runtime.liveStats.repliesTotal = Math.max(runtime.liveStats.repliesTotal, Math.floor(replies));
    if (shardStat) {
      if (Number.isFinite(notes)) shardStat.postsProcessed = Math.max(shardStat.postsProcessed, Math.floor(notes));
      if (Number.isFinite(comments)) shardStat.commentsCollected = Math.max(shardStat.commentsCollected, Math.floor(comments));
      if (Number.isFinite(likes)) shardStat.likesTotal = Math.max(shardStat.likesTotal, Math.floor(likes));
      if (Number.isFinite(likesSkipped)) shardStat.likesSkippedTotal = Math.max(shardStat.likesSkippedTotal, Math.floor(likesSkipped));
      if (Number.isFinite(likeDedupSkipped)) shardStat.likeDedupSkipped = Math.max(shardStat.likeDedupSkipped, Math.floor(likeDedupSkipped));
      if (Number.isFinite(likeAlreadySkipped)) shardStat.likeAlreadySkipped = Math.max(shardStat.likeAlreadySkipped, Math.floor(likeAlreadySkipped));
      if (Number.isFinite(likeGateBlocked)) shardStat.likeGateBlocked = Math.max(shardStat.likeGateBlocked, Math.floor(likeGateBlocked));
      if (Number.isFinite(replies)) shardStat.repliesTotal = Math.max(shardStat.repliesTotal, Math.floor(replies));
    }
  }
  if (shardStat) {
    const phase = String((patch as any)?.phase || '').trim();
    const status = String((patch as any)?.status || '').trim().toLowerCase();
    const errText =
      String((patch as any)?.lastError?.message || (patch as any)?.error || '').trim();
    if (phase) shardStat.phase = phase;
    if (status === 'failed' || status === 'error') {
      shardStat.status = 'error';
      shardStat.anomaly = runtime.formatLineText(errText || status, 160);
    } else if (status === 'completed' || status === 'done' || status === 'success') {
      shardStat.status = 'completed';
      shardStat.anomaly = '';
    } else if (progress || stats) {
      shardStat.status = 'running';
      if (!errText) shardStat.anomaly = '';
    }
    const action = String((patch as any)?.message || (patch as any)?.step || '').trim();
    if (action) shardStat.action = runtime.formatLineText(action, 140);
    if ((progress || stats || phase || status || action) && !shardStat.updatedAt) shardStat.updatedAt = Date.now();
    if (progress || stats) shardStat.updatedAt = Date.now();
  }
  runtime.hasStateFeed = true;
  runtime.renderLiveStats();
}
