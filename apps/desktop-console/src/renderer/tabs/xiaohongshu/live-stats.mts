import { createEl } from '../../ui-components.mjs';

type LiveStatsOptions = {
  maxCommentsInput: HTMLInputElement;
  linksStat: HTMLSpanElement;
  postsStat: HTMLSpanElement;
  commentsStat: HTMLSpanElement;
  likesStat: HTMLSpanElement;
  likesSkipStat: HTMLSpanElement;
  repliesStat: HTMLSpanElement;
  streamStat: HTMLSpanElement;
  shardStatsList: HTMLDivElement;
  likedList: HTMLDivElement;
  repliedList: HTMLDivElement;
};

export type LiveStatsController = {
  resetLiveStats: () => void;
  setExpectedLinksTarget: (target: number) => void;
  setShardProfiles: (profiles: string[]) => void;
  parseStdoutForEvents: (line: string) => void;
  setActiveRunId: (runId: string) => void;
  dispose: () => void;
};

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

  type ShardProgress = {
    linksCollected: number;
    linksTarget: number;
    postsProcessed: number;
    commentsCollected: number;
    likesTotal: number;
    likesSkippedTotal: number;
    likeDedupSkipped: number;
    likeAlreadySkipped: number;
    likeGateBlocked: number;
    repliesTotal: number;
    phase: string;
    action: string;
    status: 'idle' | 'running' | 'error' | 'completed';
    anomaly: string;
    updatedAt: number;
  };

  const parentDir = (inputPath: string) => {
    const p = String(inputPath || '');
    const slash = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
    return slash > 0 ? p.slice(0, slash) : '';
  };

  const liveStats = {
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
  let activeRunId = '';
  let hasStateFeed = false;
  let stateUnsubscribe: (() => void) | null = null;
  const likedNotes = new Map<string, { count: number; path: string }>();
  const repliedNotes = new Map<string, { count: number; path: string }>();

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

  const ensureShardStats = (shardKey: string) => {
    const key = String(shardKey || '').trim();
    if (!key) return null;
    if (!shardStats.has(key)) {
      shardStats.set(key, {
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
    }
    return shardStats.get(key) || null;
  };

  const aggregateShardStats = (): ShardProgress => {
    if (shardStats.size === 0) {
      return {
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
        phase: '',
        action: '',
        status: 'idle',
        anomaly: '',
        updatedAt: 0,
      };
    }
    const merged: ShardProgress = {
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
    };
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

  const formatLineText = (input: string, max = 120) => {
    const normalized = String(input || '').replace(/\s+/g, ' ').trim();
    if (!normalized) return '';
    if (normalized.length <= max) return normalized;
    return `${normalized.slice(0, Math.max(1, max - 1))}…`;
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
    const feed = hasStateFeed ? 'state+cmd-event' : 'cmd-event';
    streamStat.textContent = `数据源：${feed}(${sourceHint}, ${shardHint}${eventsHint})`;

    renderShardStats();
    renderActionList(likedList, likedNotes, '暂无点赞命中');
    renderActionList(repliedList, repliedNotes, '暂无回复命中');
  };

  const extractEventsPath = (line: string) => {
    const quoted = line.match(/(?:events=|eventsPath\s*[:=]\s*)(?:"([^"]+run-events(?:\.[A-Za-z0-9_-]+)?\.jsonl)"|'([^']+run-events(?:\.[A-Za-z0-9_-]+)?\.jsonl)')/i);
    if (quoted?.[1] || quoted?.[2]) return String(quoted[1] || quoted[2] || '').trim();

    const plain = line.match(/(?:events=|eventsPath\s*[:=]\s*)([^\s]+run-events(?:\.[A-Za-z0-9_-]+)?\.jsonl)/i);
    if (!plain?.[1]) return '';
    return String(plain[1]).trim();
  };

  const parseStdoutForEvents = (line: string) => {
    const rawText = String(line || '');
    if (!rawText.trim()) return;

    const prefixedRid = rawText.match(/^\[rid:([A-Za-z0-9_-]+)\]/i);
    const prefixedRunId = String(prefixedRid?.[1] || '').trim();
    if (prefixedRunId) activeRunIds.add(prefixedRunId);

    const runIdMatch = rawText.match(/runId\s*[:=]\s*([A-Za-z0-9_-]+)/);
    const rawRunId = String(runIdMatch?.[1] || '').trim();
    if (rawRunId) activeRunIds.add(rawRunId);

    const shardHintMatch = rawText.match(/\[shard-hint\]\s*profiles=([A-Za-z0-9_,-]+)/i);
    if (shardHintMatch?.[1]) {
      String(shardHintMatch[1])
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)
        .forEach((profileId) => {
          expectedShardProfiles.add(profileId);
          ensureShardStats(profileId);
          if (prefixedRunId) {
            parentRunCurrentShard.set(prefixedRunId, profileId);
            runToShard.set(prefixedRunId, profileId);
          }
        });
    }

    const profileByLine = rawText.match(/(?:\bprofile\s*[=:]\s*|Profile\s*[:：]\s*)([A-Za-z0-9_-]+)/);
    const profileId = String(profileByLine?.[1] || '').trim();
    if (profileId) {
      expectedShardProfiles.add(profileId);
      ensureShardStats(profileId);
      if (prefixedRunId) {
        parentRunCurrentShard.set(prefixedRunId, profileId);
        runToShard.set(prefixedRunId, profileId);
      }
      if (rawRunId) runToShard.set(rawRunId, profileId);
    }

    const loggerChild = rawText.match(/\[Logger\]\s+runId=([A-Za-z0-9_-]+)/);
    const childRunId = String(loggerChild?.[1] || '').trim();
    if (childRunId && prefixedRunId) {
      const currentShard = parentRunCurrentShard.get(prefixedRunId) || runToShard.get(prefixedRunId) || '';
      if (currentShard) {
        runToShard.set(childRunId, currentShard);
        ensureShardStats(currentShard);
      }
    }

    const eventsPath = extractEventsPath(rawText);
    if (eventsPath) liveStats.eventsPath = eventsPath;

    const currentShard =
      (rawRunId ? runToShard.get(rawRunId) : '') ||
      (prefixedRunId ? runToShard.get(prefixedRunId) : '') ||
      (prefixedRunId ? parentRunCurrentShard.get(prefixedRunId) : '') ||
      (expectedShardProfiles.size === 1 ? Array.from(expectedShardProfiles)[0] : '');
    const shardStat = currentShard ? ensureShardStats(currentShard) : null;

    const text = rawText
      .replace(/^\[rid:[^\]]+\]\s*/i, '')
      .replace(/^\[(?:stdout|stderr)\]\s*/i, '')
      .trim();
    const isStderr = /\[stderr\]/i.test(rawText);

    const phaseTag = text.match(/^\[([A-Za-z0-9:_-]+)\]/);
    const normalizedPhase = String(phaseTag?.[1] || '').trim();
    const actionText = formatLineText(text.replace(/^\[[^\]]+\]\s*/, ''), 140);
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
      shardStat.anomaly = looksLikeError ? formatLineText(actionText || text, 160) : '';
      shardStat.updatedAt = Date.now();
    }

    const rigidGateBlocked = text.match(/\[Phase2Collect\]\s*Rigid gate blocked click index=(\d+):\s*(.+)$/i);
    if (rigidGateBlocked && shardStat) {
      const idx = Number(rigidGateBlocked[1] || -1);
      const reason = formatLineText(String(rigidGateBlocked[2] || '').trim(), 80) || 'unknown';
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
      const active = formatLineText(String(clickDecision[4] || '').trim(), 80) || 'unknown';
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
      const beforeActive = formatLineText(String(focusEnsure[4] || '').trim(), 80) || 'unknown';
      const afterFocus = String(focusEnsure[5] || '').trim() || 'unknown';
      const afterActive = formatLineText(String(focusEnsure[6] || '').trim(), 80) || 'unknown';
      shardStat.phase = 'Phase2Collect';
      shardStat.status = 'running';
      shardStat.action = `Focus ensure: ${strategy} ok=${ok}`;
      shardStat.anomaly = `before=${beforeFocus}/${beforeActive} after=${afterFocus}/${afterActive}`;
      shardStat.updatedAt = Date.now();
    }

    const clickStrategyFailed = text.match(/\[Phase2Collect\]\s*Click strategy failed:\s*strategy=([a-z_]+)\s+reason=(.+)$/i);
    if (clickStrategyFailed && shardStat) {
      const strategy = String(clickStrategyFailed[1] || '').trim() || 'unknown';
      const reason = formatLineText(String(clickStrategyFailed[2] || '').trim(), 120) || 'unknown';
      shardStat.phase = 'Phase2Collect';
      shardStat.status = 'running';
      shardStat.action = `点击未执行（${strategy}）`;
      shardStat.anomaly = `阻断原因：click dispatch failed (${reason})`;
      shardStat.updatedAt = Date.now();
    }

    const clickStrategyNoOpen = text.match(/\[Phase2Collect\]\s*Click strategy no-open:\s*strategy=([a-z_]+)\s+url=(.+?)\s+waitedMs=(\d+)/i);
    if (clickStrategyNoOpen && shardStat) {
      const strategy = String(clickStrategyNoOpen[1] || '').trim() || 'unknown';
      const url = formatLineText(String(clickStrategyNoOpen[2] || '').trim(), 100) || 'n/a';
      const waitedMs = Number(clickStrategyNoOpen[3] || 0);
      shardStat.phase = 'Phase2Collect';
      shardStat.status = 'running';
      shardStat.action = `点击已发出但未开帖（${strategy}，${waitedMs}ms）`;
      shardStat.anomaly = `阻断原因：no explore/xsec after click (url=${url})`;
      shardStat.updatedAt = Date.now();
    }

    const protocolFill = text.match(/\[Phase2Search\]\s*protocol fill:\s*selector="([^"]+)"\s*success=(\w+)(?:\s+error=(.+))?/i);
    if (protocolFill && shardStat) {
      const selector = formatLineText(String(protocolFill[1] || '').trim(), 80) || 'n/a';
      const ok = String(protocolFill[2] || '').trim() || 'unknown';
      const err = formatLineText(String(protocolFill[3] || '').trim(), 120) || '';
      shardStat.phase = 'Phase2Search';
      shardStat.status = ok === 'true' ? 'running' : 'error';
      shardStat.action = `Protocol fill (browser:fill)=${ok}`;
      shardStat.anomaly = err ? `selector=${selector} error=${err}` : `selector=${selector}`;
      shardStat.updatedAt = Date.now();
    }

    const protocolType = text.match(/\[Phase2Search\]\s*protocol input:\s*container_type\s*success=(\w+)(?:\s+error=(.+))?/i);
    if (protocolType && shardStat) {
      const ok = String(protocolType[1] || '').trim() || 'unknown';
      const err = formatLineText(String(protocolType[2] || '').trim(), 120) || '';
      shardStat.phase = 'Phase2Search';
      shardStat.status = ok === 'true' ? 'running' : 'error';
      shardStat.action = `Protocol input (container:type)=${ok}`;
      shardStat.anomaly = err ? `error=${err}` : '';
      shardStat.updatedAt = Date.now();
    }

    const phase2Fatal = text.match(/(?:❌\s*)?Phase\s*2\s*失败[:：]\s*(.+)$/i);
    if (phase2Fatal && shardStat) {
      const reason = formatLineText(String(phase2Fatal[1] || '').trim(), 160);
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
        liveStats.likesTotal = Math.max(liveStats.likesTotal, likedTotal);
      }
      if (roundSkipped > 0) {
        liveStats.likesSkippedTotal += roundSkipped;
        liveStats.likeDedupSkipped += Math.max(0, dedupSkipped);
        liveStats.likeAlreadySkipped += Math.max(0, alreadyLikedSkipped);
        liveStats.likeGateBlocked += Math.max(0, gateBlocked);
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
      const collected = Number(phase2ProgressMatch[1] || liveStats.linksCollected || 0);
      const target = Number(phase2ProgressMatch[2] || liveStats.linksTarget || 0);
      liveStats.linksCollected = Math.max(liveStats.linksCollected, collected);
      liveStats.linksTarget = Math.max(liveStats.linksTarget, target);
      if (shardStat) {
        shardStat.linksCollected = Math.max(shardStat.linksCollected, collected);
        shardStat.linksTarget = Math.max(shardStat.linksTarget, target);
      }
    }

    const linksReadyMatch = text.match(/\[Links\][^\d]*(\d+)\s*\/\s*(\d+)/);
    if (linksReadyMatch) {
      const collected = Number(linksReadyMatch[1] || 0);
      const target = Number(linksReadyMatch[2] || 0);
      liveStats.linksCollected = Math.max(liveStats.linksCollected, collected);
      liveStats.linksTarget = Math.max(liveStats.linksTarget, target);
      if (shardStat) {
        shardStat.linksCollected = Math.max(shardStat.linksCollected, collected);
        shardStat.linksTarget = Math.max(shardStat.linksTarget, target);
      }
    }

    const noteProgressMatch = text.match(/^\[(\d+)\s*\/\s*(\d+)\]\s+slot-\d+\(tab-\d+\)\s+note=([A-Za-z0-9]+)/);
    if (noteProgressMatch) {
      const processed = Number(noteProgressMatch[1] || liveStats.postsProcessed || 0);
      const target = Number(noteProgressMatch[2] || liveStats.linksTarget || 0);
      liveStats.postsProcessed = processed;
      liveStats.linksTarget = Math.max(liveStats.linksTarget, target);
      liveStats.noteId = String(noteProgressMatch[3] || '').trim();
      liveStats.currentCommentsCollected = 0;
      liveStats.currentCommentsTarget = Number(maxCommentsInput.value || 0) > 0
        ? String(Math.floor(Number(maxCommentsInput.value || 0)))
        : '不限';
      if (shardStat) {
        shardStat.postsProcessed = Math.max(shardStat.postsProcessed, processed);
        shardStat.linksTarget = Math.max(shardStat.linksTarget, target);
      }
    }

    const postsSummary = text.match(/-\s*处理帖子[:：]\s*(\d+)/);
    if (postsSummary) {
      const processed = Number(postsSummary[1] || liveStats.postsProcessed || 0);
      liveStats.postsProcessed = processed;
      if (shardStat) shardStat.postsProcessed = Math.max(shardStat.postsProcessed, processed);
    }

    const commentsSummary = text.match(/-\s*(?:评论总量|comments?)[:：]\s*(\d+)/i);
    if (commentsSummary) {
      const comments = Number(commentsSummary[1] || liveStats.currentCommentsCollected || 0);
      liveStats.currentCommentsCollected = comments;
      if (shardStat) shardStat.commentsCollected = Math.max(shardStat.commentsCollected, comments);
    }

    const likesSummary = text.match(/-\s*(?:点赞总量|likes?)[:：]\s*(\d+)/i);
    if (likesSummary) {
      const likes = Number(likesSummary[1] || liveStats.likesTotal || 0);
      liveStats.likesTotal = likes;
      if (shardStat) shardStat.likesTotal = Math.max(shardStat.likesTotal, likes);
    }

    const repliesSummary = text.match(/-\s*(?:回复总量|replies?)[:：]\s*(\d+)/i);
    if (repliesSummary) {
      const replies = Number(repliesSummary[1] || liveStats.repliesTotal || 0);
      liveStats.repliesTotal = replies;
      if (shardStat) shardStat.repliesTotal = Math.max(shardStat.repliesTotal, replies);
    }

    const donePath = text.match(/likeEvidenceDir\s*[:=]\s*(?:"([^"]+)"|'([^']+)'|([^\s]+))/);
    if ((donePath?.[1] || donePath?.[2] || donePath?.[3]) && liveStats.noteId) {
      const p = String(donePath[1] || donePath[2] || donePath[3] || '').trim();
      likedNotes.set(liveStats.noteId, {
        count: Math.max(1, liveStats.likesTotal),
        path: parentDir(p) || p,
      });
    }

    renderLiveStats();
  };

  const applyStatePatch = (patch: any, runId?: string) => {
    if (!patch || typeof patch !== 'object') return;
    const rid = String(runId || '').trim();
    const shardKey = (rid ? runToShard.get(rid) : '') || (expectedShardProfiles.size === 1 ? Array.from(expectedShardProfiles)[0] : '');
    const shardStat = shardKey ? ensureShardStats(shardKey) : null;
    const progress =
      patch.progress && typeof patch.progress === 'object'
        ? patch.progress
        : (('current' in patch) || ('processed' in patch) || ('total' in patch) || ('percent' in patch))
          ? patch
          : null;
    if (progress) {
      const processed = Number(progress.processed ?? progress.current);
      const total = Number(progress.total);
      if (Number.isFinite(processed)) liveStats.linksCollected = Math.max(0, Math.floor(processed));
      if (Number.isFinite(total)) liveStats.linksTarget = Math.max(liveStats.linksTarget, Math.floor(total));
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
      if (Number.isFinite(notes)) liveStats.postsProcessed = Math.max(liveStats.postsProcessed, Math.floor(notes));
      if (Number.isFinite(comments)) liveStats.currentCommentsCollected = Math.max(liveStats.currentCommentsCollected, Math.floor(comments));
      if (Number.isFinite(likes)) liveStats.likesTotal = Math.max(liveStats.likesTotal, Math.floor(likes));
      if (Number.isFinite(likesSkipped)) liveStats.likesSkippedTotal = Math.max(liveStats.likesSkippedTotal, Math.floor(likesSkipped));
      if (Number.isFinite(likeDedupSkipped)) liveStats.likeDedupSkipped = Math.max(liveStats.likeDedupSkipped, Math.floor(likeDedupSkipped));
      if (Number.isFinite(likeAlreadySkipped)) liveStats.likeAlreadySkipped = Math.max(liveStats.likeAlreadySkipped, Math.floor(likeAlreadySkipped));
      if (Number.isFinite(likeGateBlocked)) liveStats.likeGateBlocked = Math.max(liveStats.likeGateBlocked, Math.floor(likeGateBlocked));
      if (Number.isFinite(replies)) liveStats.repliesTotal = Math.max(liveStats.repliesTotal, Math.floor(replies));
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
        shardStat.anomaly = formatLineText(errText || status, 160);
      } else if (status === 'completed' || status === 'done' || status === 'success') {
        shardStat.status = 'completed';
        shardStat.anomaly = '';
      } else if (progress || stats) {
        shardStat.status = 'running';
        if (!errText) shardStat.anomaly = '';
      }
      const action = String((patch as any)?.message || (patch as any)?.step || '').trim();
      if (action) shardStat.action = formatLineText(action, 140);
      if ((progress || stats || phase || status || action) && !shardStat.updatedAt) shardStat.updatedAt = Date.now();
      if (progress || stats) shardStat.updatedAt = Date.now();
    }
    hasStateFeed = true;
    renderLiveStats();
  };

  const setActiveRunId = (runId: string) => {
    const next = String(runId || '').trim();
    if (!next) return;
    activeRunId = next;
    activeRunIds.add(next);
    if (expectedShardProfiles.size === 1 && !runToShard.has(next)) {
      runToShard.set(next, Array.from(expectedShardProfiles)[0]);
    }
    if (typeof window.api?.stateGetTask === 'function') {
      void window.api.stateGetTask(next).then((task: any) => {
        applyStatePatch(task, next);
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
    if (expectedShardProfiles.size === 1 && activeRunId && !runToShard.has(activeRunId)) {
      runToShard.set(activeRunId, Array.from(expectedShardProfiles)[0]);
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
    activeRunId = '';
    hasStateFeed = false;
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
      if (!activeRunId) activeRunId = rid;
      activeRunIds.add(rid);
      if (t === 'progress') {
        applyStatePatch({ progress: patch }, rid);
      } else if (t === 'stats') {
        applyStatePatch({ stats: patch }, rid);
      } else {
        applyStatePatch(patch, rid);
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
