import type { LiveStatsRuntime } from './types.mjs';

const extractEventsPath = (line: string) => {
  const quoted = line.match(/(?:events=|eventsPath\s*[:=]\s*)(?:"([^"]+run-events(?:\.[A-Za-z0-9_-]+)?\.jsonl)"|'([^']+run-events(?:\.[A-Za-z0-9_-]+)?\.jsonl)')/i);
  if (quoted?.[1] || quoted?.[2]) return String(quoted[1] || quoted[2] || '').trim();

  const plain = line.match(/(?:events=|eventsPath\s*[:=]\s*)([^\s]+run-events(?:\.[A-Za-z0-9_-]+)?\.jsonl)/i);
  if (!plain?.[1]) return '';
  return String(plain[1]).trim();
};

export function parseStdoutForEvents(runtime: LiveStatsRuntime, line: string) {
  const rawText = String(line || '');
  if (!rawText.trim()) return;

  const prefixedRid = rawText.match(/^\[rid:([A-Za-z0-9_-]+)\]/i);
  const prefixedRunId = String(prefixedRid?.[1] || '').trim();
  if (prefixedRunId) runtime.activeRunIds.add(prefixedRunId);

  const runIdMatch = rawText.match(/runId\s*[:=]\s*([A-Za-z0-9_-]+)/);
  const rawRunId = String(runIdMatch?.[1] || '').trim();
  if (rawRunId) runtime.activeRunIds.add(rawRunId);

  const shardHintMatch = rawText.match(/\[shard-hint\]\s*profiles=([A-Za-z0-9_,-]+)/i);
  if (shardHintMatch?.[1]) {
    String(shardHintMatch[1])
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)
      .forEach((profileId) => {
        runtime.expectedShardProfiles.add(profileId);
        runtime.ensureShardStats(profileId);
        if (prefixedRunId) {
          runtime.parentRunCurrentShard.set(prefixedRunId, profileId);
          runtime.runToShard.set(prefixedRunId, profileId);
        }
      });
  }

  const profileByLine = rawText.match(/(?:\bprofile\s*[=:]\s*|Profile\s*[:：]\s*)([A-Za-z0-9_-]+)/);
  const profileId = String(profileByLine?.[1] || '').trim();
  if (profileId) {
    runtime.expectedShardProfiles.add(profileId);
    runtime.ensureShardStats(profileId);
    if (prefixedRunId) {
      runtime.parentRunCurrentShard.set(prefixedRunId, profileId);
      runtime.runToShard.set(prefixedRunId, profileId);
    }
    if (rawRunId) runtime.runToShard.set(rawRunId, profileId);
  }

  const loggerChild = rawText.match(/\[Logger\]\s+runId=([A-Za-z0-9_-]+)/);
  const childRunId = String(loggerChild?.[1] || '').trim();
  if (childRunId && prefixedRunId) {
    const currentShard = runtime.parentRunCurrentShard.get(prefixedRunId) || runtime.runToShard.get(prefixedRunId) || '';
    if (currentShard) {
      runtime.runToShard.set(childRunId, currentShard);
      runtime.ensureShardStats(currentShard);
    }
  }

  const eventsPath = extractEventsPath(rawText);
  if (eventsPath) runtime.liveStats.eventsPath = eventsPath;

  const currentShard =
    (rawRunId ? runtime.runToShard.get(rawRunId) : '') ||
    (prefixedRunId ? runtime.runToShard.get(prefixedRunId) : '') ||
    (prefixedRunId ? runtime.parentRunCurrentShard.get(prefixedRunId) : '') ||
    (runtime.expectedShardProfiles.size === 1 ? Array.from(runtime.expectedShardProfiles)[0] : '');
  const shardStat = currentShard ? runtime.ensureShardStats(currentShard) : null;

  const text = rawText
    .replace(/^\[rid:[^\]]+\]\s*/i, '')
    .replace(/^\[(?:stdout|stderr)\]\s*/i, '')
    .trim();
  const isStderr = /\[stderr\]/i.test(rawText);

  const phaseTag = text.match(/^\[([A-Za-z0-9:_-]+)\]/);
  const normalizedPhase = String(phaseTag?.[1] || '').trim();
  const actionText = runtime.formatLineText(text.replace(/^\[[^\]]+\]\s*/, ''), 140);
  const exitCodeMatch = text.match(/^\[exit\]\s*code=([^\s]+)/i);
  const looksLikeError =
    isStderr ||
    /(?:^|\s)(?:error|exception|err_|failed|failure|失败|异常|❌)(?:\s|:|$)/i.test(text) ||
    (exitCodeMatch?.[1] && String(exitCodeMatch[1]).trim() !== '0');
  if (shardStat) {
    if (normalizedPhase) shardStat.phase = normalizedPhase;
    if (actionText) shardStat.action = actionText;
    if (exitCodeMatch?.[1]) {
      shardStat.status = String(exitCodeMatch[1]).trim() === '0' ? 'completed' : 'error';
    } else {
      shardStat.status = looksLikeError ? 'error' : 'running';
    }
    shardStat.anomaly = looksLikeError ? runtime.formatLineText(actionText || text, 160) : '';
    shardStat.updatedAt = Date.now();
  }

  const rigidGateBlocked = text.match(/\[Phase2Collect\]\s*Rigid gate blocked click index=(\d+):\s*(.+)$/i);
  if (rigidGateBlocked && shardStat) {
    const idx = Number(rigidGateBlocked[1] || -1);
    const reason = runtime.formatLineText(String(rigidGateBlocked[2] || '').trim(), 80) || 'unknown';
    shardStat.phase = 'Phase2Collect';
    shardStat.status = 'running';
    shardStat.action = `开帖点击被阻断，自动重试（index=${idx >= 0 ? idx : '?'})`;
    shardStat.anomaly = `阻断原因：${reason}`;
    shardStat.updatedAt = Date.now();
  }

  const postClickGateFailed = text.match(/\[Phase2Collect\]\s*Post-click gate FAILED:\s*explore=(\w+)\s*xsec=(\w+)/i);
  if (postClickGateFailed && shardStat) {
    const hasExplore = String(postClickGateFailed[1] || '').toLowerCase() === 'true';
    const hasXsec = String(postClickGateFailed[2] || '').toLowerCase() === 'true';
    shardStat.phase = 'Phase2Collect';
    shardStat.status = 'running';
    shardStat.action = '开帖后校验未通过，正在切换点击策略';
    shardStat.anomaly = `阻断原因：post-click gate failed (explore=${hasExplore} xsec=${hasXsec})`;
    shardStat.updatedAt = Date.now();
  }

  const clickDecision = text.match(/\[Phase2Collect\]\s*Click decision:\s*strategy=([a-z0-9:_-]+)\s+mode=([a-z0-9:_-]+)\s+focus=(\w+)\s+active=([^\s]+)/i);
  if (clickDecision && shardStat) {
    const strategy = String(clickDecision[1] || '').trim() || 'unknown';
    const mode = String(clickDecision[2] || '').trim() || 'unknown';
    const focus = String(clickDecision[3] || '').trim() || 'unknown';
    const active = runtime.formatLineText(String(clickDecision[4] || '').trim(), 80) || 'unknown';
    shardStat.phase = 'Phase2Collect';
    shardStat.status = 'running';
    shardStat.action = `Click decision: ${strategy} (${mode})`;
    shardStat.anomaly = `focus=${focus} active=${active}`;
    shardStat.updatedAt = Date.now();
  }

  const focusEnsure = text.match(/\[Phase2Collect\]\s*Focus ensure:\s*strategy=([a-z0-9:_-]+)\s+ok=(\w+)\s+beforeFocus=(\w+)\s+beforeActive=([^\s]+)\s+afterFocus=(\w+)\s+afterActive=([^\s]+)/i);
  if (focusEnsure && shardStat) {
    const strategy = String(focusEnsure[1] || '').trim() || 'unknown';
    const ok = String(focusEnsure[2] || '').trim() || 'unknown';
    const beforeFocus = String(focusEnsure[3] || '').trim() || 'unknown';
    const beforeActive = runtime.formatLineText(String(focusEnsure[4] || '').trim(), 80) || 'unknown';
    const afterFocus = String(focusEnsure[5] || '').trim() || 'unknown';
    const afterActive = runtime.formatLineText(String(focusEnsure[6] || '').trim(), 80) || 'unknown';
    shardStat.phase = 'Phase2Collect';
    shardStat.status = 'running';
    shardStat.action = `Focus ensure: ${strategy} ok=${ok}`;
    shardStat.anomaly = `before=${beforeFocus}/${beforeActive} after=${afterFocus}/${afterActive}`;
    shardStat.updatedAt = Date.now();
  }

  const clickStrategyFailed = text.match(/\[Phase2Collect\]\s*Click strategy failed:\s*strategy=([a-z_]+)\s+reason=(.+)$/i);
  if (clickStrategyFailed && shardStat) {
    const strategy = String(clickStrategyFailed[1] || '').trim() || 'unknown';
    const reason = runtime.formatLineText(String(clickStrategyFailed[2] || '').trim(), 120) || 'unknown';
    shardStat.phase = 'Phase2Collect';
    shardStat.status = 'running';
    shardStat.action = `点击未执行（${strategy}）`;
    shardStat.anomaly = `阻断原因：click dispatch failed (${reason})`;
    shardStat.updatedAt = Date.now();
  }

  const clickStrategyNoOpen = text.match(/\[Phase2Collect\]\s*Click strategy no-open:\s*strategy=([a-z_]+)\s+url=(.+?)\s+waitedMs=(\d+)/i);
  if (clickStrategyNoOpen && shardStat) {
    const strategy = String(clickStrategyNoOpen[1] || '').trim() || 'unknown';
    const url = runtime.formatLineText(String(clickStrategyNoOpen[2] || '').trim(), 100) || 'n/a';
    const waitedMs = Number(clickStrategyNoOpen[3] || 0);
    shardStat.phase = 'Phase2Collect';
    shardStat.status = 'running';
    shardStat.action = `点击已发出但未开帖（${strategy}，${waitedMs}ms）`;
    shardStat.anomaly = `阻断原因：no explore/xsec after click (url=${url})`;
    shardStat.updatedAt = Date.now();
  }

  const protocolFill = text.match(/\[Phase2Search\]\s*protocol fill:\s*selector="([^"]+)"\s*success=(\w+)(?:\s+error=(.+))?/i);
  if (protocolFill && shardStat) {
    const selector = runtime.formatLineText(String(protocolFill[1] || '').trim(), 80) || 'n/a';
    const ok = String(protocolFill[2] || '').trim() || 'unknown';
    const err = runtime.formatLineText(String(protocolFill[3] || '').trim(), 120) || '';
    shardStat.phase = 'Phase2Search';
    shardStat.status = ok === 'true' ? 'running' : 'error';
    shardStat.action = `Protocol fill (browser:fill)=${ok}`;
    shardStat.anomaly = err ? `selector=${selector} error=${err}` : `selector=${selector}`;
    shardStat.updatedAt = Date.now();
  }

  const protocolType = text.match(/\[Phase2Search\]\s*protocol input:\s*container_type\s*success=(\w+)(?:\s+error=(.+))?/i);
  if (protocolType && shardStat) {
    const ok = String(protocolType[1] || '').trim() || 'unknown';
    const err = runtime.formatLineText(String(protocolType[2] || '').trim(), 120) || '';
    shardStat.phase = 'Phase2Search';
    shardStat.status = ok === 'true' ? 'running' : 'error';
    shardStat.action = `Protocol input (container:type)=${ok}`;
    shardStat.anomaly = err ? `error=${err}` : '';
    shardStat.updatedAt = Date.now();
  }

  const phase2Fatal = text.match(/(?:❌\s*)?Phase\s*2\s*失败[:：]\s*(.+)$/i);
  if (phase2Fatal && shardStat) {
    const reason = runtime.formatLineText(String(phase2Fatal[1] || '').trim(), 160);
    shardStat.phase = 'Phase2Collect';
    shardStat.status = 'error';
    shardStat.action = 'Phase2 终止';
    shardStat.anomaly = reason || 'Phase2 执行失败';
    shardStat.updatedAt = Date.now();
  }

  const likeGateMatch = text.match(/\[Phase3Interact\]\s*Like Gate:\s*(\d+)\s*\/\s*(\d+)\s*(✅|❌)?/i);
  if (likeGateMatch && shardStat) {
    const gateCurrent = Number(likeGateMatch[1] || 0);
    const gateLimit = Number(likeGateMatch[2] || 0);
    const gateOk = String(likeGateMatch[3] || '').includes('✅');
    shardStat.phase = 'Phase3Interact';
    shardStat.action = `Like Gate ${gateCurrent}/${gateLimit} ${gateOk ? '许可通过' : '受限'}`;
    shardStat.status = gateOk ? 'running' : 'error';
    shardStat.anomaly = gateOk ? '' : `点赞速率限制 ${gateCurrent}/${gateLimit}`;
    shardStat.updatedAt = Date.now();
  }

  const phase3RoundMatch = text.match(/\[Phase3Interact\]\s*round=(\d+)/i);
  if (phase3RoundMatch) {
    const round = Number(phase3RoundMatch[1] || 0);
    const readToken = (key: string) => {
      const m = text.match(new RegExp(`${key}=(\\d+)`, 'i'));
      return Number(m?.[1] || 0);
    };
    const ruleHits = readToken('ruleHits');
    const gateBlocked = readToken('gateBlocked');
    const dedupSkipped = readToken('dedup');
    const alreadyLikedSkipped = readToken('alreadyLiked');
    const newLikes = readToken('newLikes');
    const likedTotalMatch = text.match(/likedTotal=(\d+)\s*\/\s*(\d+)/i);
    const likedTotal = Number(likedTotalMatch?.[1] || 0);
    const likedLimit = Number(likedTotalMatch?.[2] || 0);
    const endReasonMatch = text.match(/\bend=([a-z_]+)/i);
    const endReason = String(endReasonMatch?.[1] || '').trim();
    const roundSkipped = Math.max(0, dedupSkipped) + Math.max(0, alreadyLikedSkipped) + Math.max(0, gateBlocked);
    if (Number.isFinite(likedTotal)) {
      runtime.liveStats.likesTotal = Math.max(runtime.liveStats.likesTotal, likedTotal);
    }
    if (roundSkipped > 0) {
      runtime.liveStats.likesSkippedTotal += roundSkipped;
      runtime.liveStats.likeDedupSkipped += Math.max(0, dedupSkipped);
      runtime.liveStats.likeAlreadySkipped += Math.max(0, alreadyLikedSkipped);
      runtime.liveStats.likeGateBlocked += Math.max(0, gateBlocked);
    }
    if (shardStat) {
      shardStat.likesTotal = Math.max(shardStat.likesTotal, likedTotal);
      if (roundSkipped > 0) {
        shardStat.likesSkippedTotal += roundSkipped;
        shardStat.likeDedupSkipped += Math.max(0, dedupSkipped);
        shardStat.likeAlreadySkipped += Math.max(0, alreadyLikedSkipped);
        shardStat.likeGateBlocked += Math.max(0, gateBlocked);
      }
      shardStat.phase = 'Phase3Interact';
      shardStat.status = gateBlocked > 0 ? 'error' : 'running';
      shardStat.anomaly = gateBlocked > 0 ? `点赞限流阻塞 ${gateBlocked}` : '';
      shardStat.action = `Round ${round}: 命中${ruleHits} 新增赞${newLikes} 跳过${roundSkipped}(去重${dedupSkipped}/已赞${alreadyLikedSkipped}/限流${gateBlocked}) 累计${likedTotal}/${likedLimit}${endReason ? ` ${endReason}` : ''}`;
      shardStat.updatedAt = Date.now();
    }
  }

  const phase2ProgressMatch = text.match(/\[Phase2Collect(?:Links)?\][^\d]*(\d+)\s*\/\s*(\d+)/);
  if (phase2ProgressMatch) {
    const collected = Number(phase2ProgressMatch[1] || runtime.liveStats.linksCollected || 0);
    const target = Number(phase2ProgressMatch[2] || runtime.liveStats.linksTarget || 0);
    runtime.liveStats.linksCollected = Math.max(runtime.liveStats.linksCollected, collected);
    runtime.liveStats.linksTarget = Math.max(runtime.liveStats.linksTarget, target);
    if (shardStat) {
      shardStat.linksCollected = Math.max(shardStat.linksCollected, collected);
      shardStat.linksTarget = Math.max(shardStat.linksTarget, target);
    }
  }

  const linksReadyMatch = text.match(/\[Links\][^\d]*(\d+)\s*\/\s*(\d+)/);
  if (linksReadyMatch) {
    const collected = Number(linksReadyMatch[1] || 0);
    const target = Number(linksReadyMatch[2] || 0);
    runtime.liveStats.linksCollected = Math.max(runtime.liveStats.linksCollected, collected);
    runtime.liveStats.linksTarget = Math.max(runtime.liveStats.linksTarget, target);
    if (shardStat) {
      shardStat.linksCollected = Math.max(shardStat.linksCollected, collected);
      shardStat.linksTarget = Math.max(shardStat.linksTarget, target);
    }
  }

  const noteProgressMatch = text.match(/^\[(\d+)\s*\/\s*(\d+)\]\s+slot-\d+\(tab-\d+\)\s+note=([A-Za-z0-9]+)/);
  if (noteProgressMatch) {
    const processed = Number(noteProgressMatch[1] || runtime.liveStats.postsProcessed || 0);
    const target = Number(noteProgressMatch[2] || runtime.liveStats.linksTarget || 0);
    runtime.liveStats.postsProcessed = processed;
    runtime.liveStats.linksTarget = Math.max(runtime.liveStats.linksTarget, target);
    runtime.liveStats.noteId = String(noteProgressMatch[3] || '').trim();
    runtime.liveStats.currentCommentsCollected = 0;
    runtime.liveStats.currentCommentsTarget = Number(runtime.maxCommentsInput.value || 0) > 0
      ? String(Math.floor(Number(runtime.maxCommentsInput.value || 0)))
      : '不限';
    if (shardStat) {
      shardStat.postsProcessed = Math.max(shardStat.postsProcessed, processed);
      shardStat.linksTarget = Math.max(shardStat.linksTarget, target);
    }
  }

  const postsSummary = text.match(/-\s*处理帖子[:：]\s*(\d+)/);
  if (postsSummary) {
    const processed = Number(postsSummary[1] || runtime.liveStats.postsProcessed || 0);
    runtime.liveStats.postsProcessed = processed;
    if (shardStat) shardStat.postsProcessed = Math.max(shardStat.postsProcessed, processed);
  }

  const commentsSummary = text.match(/-\s*(?:评论总量|comments?)[:：]\s*(\d+)/i);
  if (commentsSummary) {
    const comments = Number(commentsSummary[1] || runtime.liveStats.currentCommentsCollected || 0);
    runtime.liveStats.currentCommentsCollected = comments;
    if (shardStat) shardStat.commentsCollected = Math.max(shardStat.commentsCollected, comments);
  }

  const likesSummary = text.match(/-\s*(?:点赞总量|likes?)[:：]\s*(\d+)/i);
  if (likesSummary) {
    const likes = Number(likesSummary[1] || runtime.liveStats.likesTotal || 0);
    runtime.liveStats.likesTotal = likes;
    if (shardStat) shardStat.likesTotal = Math.max(shardStat.likesTotal, likes);
  }

  const repliesSummary = text.match(/-\s*(?:回复总量|replies?)[:：]\s*(\d+)/i);
  if (repliesSummary) {
    const replies = Number(repliesSummary[1] || runtime.liveStats.repliesTotal || 0);
    runtime.liveStats.repliesTotal = replies;
    if (shardStat) shardStat.repliesTotal = Math.max(shardStat.repliesTotal, replies);
  }

  const donePath = text.match(/likeEvidenceDir\s*[:=]\s*(?:"([^"]+)"|'([^']+)'|([^\s]+))/);
  if ((donePath?.[1] || donePath?.[2] || donePath?.[3]) && runtime.liveStats.noteId) {
    const p = String(donePath[1] || donePath[2] || donePath[3] || '').trim();
    runtime.likedNotes.set(runtime.liveStats.noteId, {
      count: Math.max(1, runtime.liveStats.likesTotal),
      path: runtime.parentDir(p) || p,
    });
  }

  runtime.renderLiveStats();
}
