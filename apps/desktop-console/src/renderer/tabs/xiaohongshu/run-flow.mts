import { createEl } from '../../ui-components.mjs';

type RunFlowOptions = {
  card: HTMLDivElement;
  api: any;
  startRunBtn: HTMLButtonElement;
  orchestrateModeSelect: HTMLSelectElement;
  accountModeSelect: HTMLSelectElement;
  profilePickSel: HTMLSelectElement;
  keywordInput: HTMLInputElement;
  envInput: HTMLInputElement;
  protocolModeCheckbox: HTMLInputElement;
  headlessCheckbox: HTMLInputElement;
  dryRunCheckbox: HTMLInputElement;
  maxNotesInput: HTMLInputElement;
  maxCommentsInput: HTMLInputElement;
  commentRoundsInput: HTMLInputElement;
  gateToggle: HTMLInputElement;
  matchKeywordsInput: HTMLInputElement;
  matchModeSelect: HTMLSelectElement;
  matchMinHitsInput: HTMLInputElement;
  likesToggle: HTMLInputElement;
  maxLikesInput: HTMLInputElement;
  likeRulePreview: HTMLInputElement;
  replyToggle: HTMLInputElement;
  replyTextInput: HTMLInputElement;
  ocrToggle: HTMLInputElement;
  ocrCommandInput: HTMLInputElement;
  opOrderInput: HTMLInputElement;
  commentsToggle: HTMLInputElement;
  persistHistoryFns: Array<() => void>;
  persistLastConfig: () => void;
  getSelectedShardProfiles: () => string[];
  getEffectiveHomepageFlags: () => { doHomepage: boolean; doImages: boolean };
  focusAccountSetup: () => void;
  focusKeywordSetup: () => void;
  liveStats: {
    resetLiveStats: () => void;
    setExpectedLinksTarget: (target: number) => void;
    parseStdoutForEvents: (line: string) => void;
    setActiveRunId: (runId: string) => void;
    setShardProfiles?: (profiles: string[]) => void;
    dispose: () => void;
  };
};

export type RunFlowController = {
  runBtn: HTMLButtonElement;
  dispose: () => void;
};

export function createRunFlowController(opts: RunFlowOptions): RunFlowController {
  const {
    card,
    api,
    startRunBtn,
    orchestrateModeSelect,
    accountModeSelect,
    profilePickSel,
    keywordInput,
    envInput,
    protocolModeCheckbox,
    headlessCheckbox,
    dryRunCheckbox,
    maxNotesInput,
    maxCommentsInput,
    commentRoundsInput,
    gateToggle,
    matchKeywordsInput,
    matchModeSelect,
    matchMinHitsInput,
    likesToggle,
    maxLikesInput,
    likeRulePreview,
    replyToggle,
    replyTextInput,
    ocrToggle,
    ocrCommandInput,
    opOrderInput,
    commentsToggle,
    persistHistoryFns,
    persistLastConfig,
    getSelectedShardProfiles,
    getEffectiveHomepageFlags,
    focusAccountSetup,
    focusKeywordSetup,
    liveStats,
  } = opts;

  let localRunId = '';

  const setRunningUi = (running: boolean) => {
    runBtn.disabled = running;
    runBtn.textContent = running ? '编排运行中...' : '开始执行编排';
    runBtn.title = running ? '当前已有编排在运行，请使用“停止当前任务”结束' : '';
    stopBtn.disabled = !running;
  };

  const getActiveRuns = () => (
    api?._activeRunIds instanceof Set ? api._activeRunIds as Set<string> : new Set<string>()
  );

  const isRunningStatus = (status: any) => {
    const normalized = String(status || '').trim().toLowerCase();
    return normalized === 'running' || normalized === 'starting' || normalized === 'queued' || normalized === 'pending';
  };

  const recoverRunFromStateTasks = async () => {
    if (typeof window.api?.stateGetTasks !== 'function') return '';
    try {
      const tasks = await window.api.stateGetTasks();
      const arr = Array.isArray(tasks) ? tasks : [];
      const running = arr
        .filter((task: any) => {
          const runId = String(task?.runId || '').trim();
          if (!runId) return false;
          return isRunningStatus(task?.status);
        })
        .sort((a: any, b: any) => Number(b?.updatedAt || 0) - Number(a?.updatedAt || 0));
      const rid = String(running[0]?.runId || '').trim();
      if (!rid) return '';
      localRunId = rid;
      api.xhsActiveRunId = rid;
      liveStats.setActiveRunId(rid);
      setRunningUi(true);
      return rid;
    } catch {
      return '';
    }
  };

  const resolveRunningXhsRunId = () => {
    const activeRuns = getActiveRuns();
    const fromCache = String(api?.xhsActiveRunId || '').trim();
    if (fromCache && activeRuns.has(fromCache)) return fromCache;
    const fromActive = String(api?.activeRunId || '').trim();
    if (fromActive && activeRuns.has(fromActive)) return fromActive;

    const lines = Array.isArray(api?._logLines) ? api._logLines as string[] : [];
    const exits = new Set<string>();
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      const line = String(lines[i] || '');
      const exitMatch = line.match(/^\[rid:([A-Za-z0-9_-]+)\]\s*\[exit\]/);
      if (exitMatch?.[1]) {
        exits.add(String(exitMatch[1]));
        continue;
      }
      const started = line.match(/^\[rid:([A-Za-z0-9_-]+)\]\s*\[started\]\s+xiaohongshu orchestrate/i);
      const rid = String(started?.[1] || '').trim();
      if (!rid) continue;
      if (exits.has(rid)) continue;
      if (activeRuns.size > 0 && !activeRuns.has(rid)) continue;
      return rid;
    }
    return '';
  };

  const replayRunLogs = (runId: string) => {
    const rid = String(runId || '').trim();
    if (!rid) return;
    const lines = Array.isArray(api?._logLines) ? api._logLines as string[] : [];
    if (lines.length === 0) return;
    const from = Math.max(0, lines.length - 4000);
    for (let i = from; i < lines.length; i += 1) {
      const line = String(lines[i] || '');
      if (!line) continue;
      if (!line.includes(`[rid:${rid}]`) && !line.includes(`runId=${rid}`) && !line.includes('[shard-hint]')) continue;
      liveStats.parseStdoutForEvents(line);
    }
  };

  const runBtn = createEl('button', {}, ['开始执行编排']) as HTMLButtonElement;
  const stopBtn = createEl('button', { className: 'danger' }, ['停止当前任务']) as HTMLButtonElement;
  const logsBtn = createEl('button', { type: 'button', className: 'secondary' }, ['日志']) as HTMLButtonElement;
  const syncShardProfilesFromSelection = () => {
    const mode = String(accountModeSelect.value || 'single').trim();
    if (mode === 'shards') {
      liveStats.setShardProfiles?.(getSelectedShardProfiles());
      return;
    }
    const profile = String(profilePickSel.value || '').trim();
    liveStats.setShardProfiles?.(profile ? [profile] : []);
  };
  syncShardProfilesFromSelection();

  const actionsRow = createEl('div', { className: 'row', style: 'margin-bottom:12px;' }, [runBtn, stopBtn, logsBtn]);
  card.insertBefore(actionsRow, card.firstChild);

  runBtn.onclick = async () => {
    if (typeof window.api?.cmdSpawn !== 'function') {
      api?.appendLog?.('[error] cmdSpawn API unavailable in renderer');
      alert('启动失败：cmdSpawn API 不可用');
      return;
    }

    persistHistoryFns.forEach((persist) => persist());
    persistLastConfig();
    liveStats.resetLiveStats();

    const mode = String(orchestrateModeSelect.value || 'phase1-phase2-unified').trim();
    const accountMode = String(accountModeSelect.value || 'single').trim();
    const singleProfile = String(profilePickSel.value || '').trim();
    const shardProfiles = getSelectedShardProfiles();
    const jumpToAccountSetup = () => {
      try {
        focusAccountSetup();
      } catch {
        // ignore navigation errors and keep alert fallback
      }
    };
    const jumpToKeywordSetup = () => {
      try {
        focusKeywordSetup();
      } catch {
        // ignore navigation errors and keep alert fallback
      }
    };

    const profileArgs: string[] = [];
    if (accountMode === 'shards') {
      if (shardProfiles.length === 0) {
        jumpToAccountSetup();
        alert('当前为分片模式：请先到【账号检查与登录引导】里至少勾选一个 profile');
        return;
      }
      api?.appendLog?.(`[shard-hint] profiles=${shardProfiles.join(',')}`);
      profileArgs.push('--profiles', shardProfiles.join(','));
    } else {
      if (!singleProfile) {
        jumpToAccountSetup();
        alert('当前为单账号模式：请先到【账号检查与登录引导】里选择一个 profile');
        return;
      }
      profileArgs.push('--profile', singleProfile);
    }

    const needKeyword = mode !== 'phase1-only';
    const targetNum = Number(maxNotesInput.value || 0);
    if (needKeyword && !String(keywordInput.value || '').trim()) {
      jumpToKeywordSetup();
      alert('该编排模式需要关键词，请先在运行配置里填写关键词');
      return;
    }
    if (mode !== 'phase1-only' && (!Number.isFinite(targetNum) || targetNum <= 0)) {
      alert('目标帖子必须是正整数');
      return;
    }
    liveStats.setExpectedLinksTarget(mode === 'phase1-only' ? 0 : Math.floor(targetNum));
    if (accountMode === 'shards') liveStats.setShardProfiles?.(shardProfiles);
    else if (singleProfile) liveStats.setShardProfiles?.([singleProfile]);

    const unifiedEnabled = mode === 'phase1-phase2-unified' || mode === 'unified-only';
    if (unifiedEnabled && replyToggle.checked && !gateToggle.checked) {
      alert('开启“自动回复”时，请同时开启“评论命中规则”。');
      return;
    }

    const args: string[] = [
      '--mode', mode,
      ...profileArgs,
      '--env', envInput.value || 'debug',
      '--input-mode', protocolModeCheckbox.checked ? 'protocol' : 'system',
      '--headless', headlessCheckbox.checked ? 'true' : 'false',
      '--foreground',
    ];

    if (needKeyword) {
      args.push('--keyword', keywordInput.value || '黄金走势');
    }
    if (mode !== 'phase1-only') {
      args.push('--target', String(Math.floor(targetNum)));
    }

    if (dryRunCheckbox.checked) args.push('--dry-run');
    else args.push('--no-dry-run');
    api?.appendLog?.(`[ui-run-flags] dryRun=${dryRunCheckbox.checked} doLikes=${likesToggle.checked} maxLikes=${String(maxLikesInput.value || 2)}`);

    if (unifiedEnabled) {
      const homepageFlags = getEffectiveHomepageFlags();
      api?.appendLog?.(`[ui-run-flags] doHomepage=${homepageFlags.doHomepage} doImages=${homepageFlags.doImages}`);
      args.push(
        '--do-homepage', homepageFlags.doHomepage ? 'true' : 'false',
        '--do-images', homepageFlags.doImages ? 'true' : 'false',
        '--do-comments', commentsToggle.checked ? 'true' : 'false',
        '--max-comments', String(maxCommentsInput.value || 0),
        '--comment-rounds', String(commentRoundsInput.value || 0),
        '--match-keywords', gateToggle.checked ? (matchKeywordsInput.value || '') : '',
        '--match-mode', gateToggle.checked ? (matchModeSelect.value || 'any') : 'any',
        '--match-min-hits', gateToggle.checked ? String(matchMinHitsInput.value || 2) : '1',
        '--do-likes', likesToggle.checked ? 'true' : 'false',
        '--max-likes', String(maxLikesInput.value || 2),
        '--like-keywords', likeRulePreview.value || '',
        '--do-reply', replyToggle.checked ? 'true' : 'false',
        '--reply-text', replyTextInput.value || '',
        '--do-ocr', ocrToggle.checked ? 'true' : 'false',
      );
      if (ocrToggle.checked && String(ocrCommandInput.value || '').trim()) {
        args.push('--ocr-command', String(ocrCommandInput.value || '').trim());
      }
      if (String(opOrderInput.value || '').trim()) {
        args.push('--op-order', String(opOrderInput.value || '').trim());
      }
    }

    const script = window.api.pathJoin('apps', 'webauto', 'entry', 'xhs-orchestrate.mjs');
    const spawnArgs = [script, ...args];
    const titleText = `xiaohongshu orchestrate ${mode} ${keywordInput.value || ''}`.trim();

    runBtn.disabled = true;
    const prevText = runBtn.textContent;
    runBtn.textContent = '启动中...';

    try {
      api?.clearLog?.();
      const ret = await window.api.cmdSpawn({
        title: titleText || 'xiaohongshu unified',
        cwd: '',
        args: spawnArgs,
        groupKey: 'xiaohongshu',
        env: { WEBAUTO_DAEMON: '1' },
      });
      if (!ret || !ret.runId) {
        api?.appendLog?.('[error] unified spawn failed: empty runId');
        alert('启动失败：命令未启动（请查看日志）');
      } else {
        localRunId = String(ret.runId || '');
        api.xhsActiveRunId = localRunId;
        liveStats.resetLiveStats();
        liveStats.setActiveRunId(localRunId);
        if (mode !== 'phase1-only' && Number.isFinite(targetNum) && targetNum > 0) {
          liveStats.setExpectedLinksTarget(Math.floor(targetNum));
        }
        setRunningUi(true);
      }
    } catch (err: any) {
      api?.appendLog?.(`[error] unified spawn failed: ${err?.message || String(err)}`);
      alert(`启动失败：${err?.message || String(err)}`);
    } finally {
      if (!localRunId) {
        runBtn.disabled = false;
        runBtn.textContent = prevText || '开始执行编排';
      }
    }
  };

  startRunBtn.onclick = () => {
    runBtn.click();
  };

  logsBtn.onclick = () => {
    if (typeof api?.setActiveTab === 'function') api.setActiveTab('logs');
  };

  stopBtn.onclick = async () => {
    const runId = String(localRunId || api?.activeRunId || '').trim();
    if (!runId) {
      alert('当前没有可停止的运行任务');
      return;
    }
    try {
      const ret = await window.api.cmdKill(runId);
      if (!ret?.ok) {
        alert(`停止失败：${ret?.error || 'unknown_error'}`);
        return;
      }
      api?.appendLog?.(`[killed] runId=${runId}`);
      if (String(api?.xhsActiveRunId || '') === runId) api.xhsActiveRunId = '';
      localRunId = '';
      setRunningUi(false);
    } catch (err: any) {
      alert(`停止失败：${err?.message || String(err)}`);
    }
  };

  const cmdUnsubscribe = window.api.onCmdEvent((evt: any) => {
    const eventType = String(evt?.type || '');
    const evtRunId = String(evt?.runId || '').trim();

    if (eventType === 'started') {
      const title = String(evt?.title || '');
      if (title.includes('xiaohongshu orchestrate')) {
        localRunId = String(evt?.runId || localRunId || '');
        api.xhsActiveRunId = localRunId;
        liveStats.resetLiveStats();
        liveStats.setActiveRunId(localRunId);
        const runMode = String(orchestrateModeSelect.value || 'phase1-phase2-unified').trim();
        const targetNum = Math.floor(Number(maxNotesInput.value || 0));
        if (runMode !== 'phase1-only' && Number.isFinite(targetNum) && targetNum > 0) {
          liveStats.setExpectedLinksTarget(targetNum);
        }
        const mode = String(accountModeSelect.value || 'single').trim();
        if (mode === 'shards') liveStats.setShardProfiles?.(getSelectedShardProfiles());
        else {
          const profile = String(profilePickSel.value || '').trim();
          if (profile) liveStats.setShardProfiles?.([profile]);
        }
        setRunningUi(true);
      }
      return;
    }

    if (eventType === 'stdout' || eventType === 'stderr') {
      if (!localRunId) return;
      if (evtRunId && evtRunId !== localRunId) return;
      liveStats.parseStdoutForEvents(String(evt?.line || ''));
      return;
    }

    if (!localRunId || evtRunId !== localRunId) return;

    if (eventType === 'exit') {
      const exitedRunId = localRunId;
      liveStats.parseStdoutForEvents(
        `[rid:${evtRunId || localRunId}] [exit] code=${evt?.exitCode ?? 'null'} signal=${evt?.signal ?? 'null'}`,
      );
      if (String(api?.xhsActiveRunId || '') === localRunId) api.xhsActiveRunId = '';
      localRunId = '';
      void recoverRunFromStateTasks().then((restored) => {
        if (!restored || restored === exitedRunId) setRunningUi(false);
      });
    }
  });

  const restoredRunId = resolveRunningXhsRunId();
  if (restoredRunId) {
    localRunId = restoredRunId;
    api.xhsActiveRunId = restoredRunId;
    syncShardProfilesFromSelection();
    liveStats.setActiveRunId(restoredRunId);
    replayRunLogs(restoredRunId);
    setRunningUi(true);
  } else {
    setRunningUi(false);
    void recoverRunFromStateTasks();
  }

  const dispose = () => {
    if (typeof cmdUnsubscribe === 'function') cmdUnsubscribe();
    liveStats.dispose();
  };

  return { runBtn, dispose };
}
