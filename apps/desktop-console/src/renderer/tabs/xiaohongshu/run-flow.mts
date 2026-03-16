import { createEl } from '../../ui-components.mjs';

type RunFlowOptions = {
  card: HTMLDivElement;
  api: any;
  startRunBtn: HTMLButtonElement;
  modeSelect: HTMLSelectElement;
  profileSelect: HTMLSelectElement;
  keywordInput: HTMLInputElement;
  headlessCheckbox: HTMLInputElement;
  maxNotesInput: HTMLInputElement;
  commentsToggle: HTMLInputElement;
  maxCommentsInput: HTMLInputElement;
  likesToggle: HTMLInputElement;
  maxLikesInput: HTMLInputElement;
  likeKeywordsInput: HTMLInputElement;
  persistHistoryFns: Array<() => void>;
  persistLastConfig: () => void;
  focusAccountSetup: () => void;
  focusKeywordSetup: () => void;
  liveStats: any;
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
    modeSelect,
    profileSelect,
    keywordInput,
    headlessCheckbox,
    maxNotesInput,
    commentsToggle,
    maxCommentsInput,
    likesToggle,
    maxLikesInput,
    likeKeywordsInput,
    persistHistoryFns,
    persistLastConfig,
    focusAccountSetup,
    focusKeywordSetup,
    liveStats,
  } = opts;

  let localRunId = '';

  const setRunningUi = (running: boolean) => {
    runBtn.disabled = running;
    runBtn.textContent = running ? 'Running...' : 'Start';
    runBtn.title = running ? 'Task is running, use Stop to end' : '';
    stopBtn.disabled = !running;
  };

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

  const runBtn = createEl('button', {}, ['Start']) as HTMLButtonElement;
  const stopBtn = createEl('button', { className: 'danger' }, ['Stop']) as HTMLButtonElement;
  const logsBtn = createEl('button', { type: 'button', className: 'secondary' }, ['Logs']) as HTMLButtonElement;

  const actionsRow = createEl('div', { className: 'row', style: 'margin-bottom:12px;' }, [runBtn, stopBtn, logsBtn]);
  card.insertBefore(actionsRow, card.firstChild);

  runBtn.onclick = async () => {
    if (typeof window.api?.cmdSpawn !== 'function') {
      api?.appendLog?.('[error] cmdSpawn API unavailable in renderer');
      alert('Start failed: cmdSpawn API unavailable');
      return;
    }

    persistHistoryFns.forEach((persist) => persist());
    persistLastConfig();
    liveStats.resetLiveStats();

    const mode = String(modeSelect.value || 'unified').trim();
    const profile = String(profileSelect.value || '').trim();
    const keyword = String(keywordInput.value || '').trim();
    const targetNum = Number(maxNotesInput.value || 200);

    if (!profile) {
      focusAccountSetup();
      alert('Please select a profile first');
      return;
    }

    if (!keyword) {
      focusKeywordSetup();
      alert('Please enter a keyword');
      return;
    }

    if (!Number.isFinite(targetNum) || targetNum <= 0) {
      alert('Target posts must be a positive integer');
      return;
    }

    liveStats.setExpectedLinksTarget(Math.floor(targetNum));

    const args: string[] = [
      '--mode', 'unified',
      '--profile', profile,
      '--keyword', keyword,
      '--target', String(Math.floor(targetNum)),
      '--env', 'prod',
      '--headless', headlessCheckbox.checked ? 'true' : 'false',
      '--foreground',
    ];

    // Comments config
    args.push(
      '--do-comments', commentsToggle.checked ? 'true' : 'false',
      '--max-comments', String(maxCommentsInput.value || '50'),
    );

    // Likes config
    args.push(
      '--do-likes', likesToggle.checked ? 'true' : 'false',
      '--max-likes', String(maxLikesInput.value || '10'),
      '--like-keywords', likeKeywordsInput.value || '',
    );

    api?.appendLog?.(`[ui-run] profile=${profile} keyword=${keyword} target=${targetNum} doComments=${commentsToggle.checked} doLikes=${likesToggle.checked}`);

    const script = window.api.pathJoin('apps', 'webauto', 'entry', 'xhs-orchestrate.mjs');
    const spawnArgs = [script, ...args];
    const titleText = `xiaohongshu unified ${keyword}`.trim();

    runBtn.disabled = true;
    const prevText = runBtn.textContent;
    runBtn.textContent = 'Starting...';

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
        api?.appendLog?.('[error] spawn failed: empty runId');
        alert('Start failed: command did not start (check logs)');
      } else {
        localRunId = String(ret.runId || '');
        api.xhsActiveRunId = localRunId;
        liveStats.resetLiveStats();
        liveStats.setActiveRunId(localRunId);
        liveStats.setExpectedLinksTarget(Math.floor(targetNum));
        setRunningUi(true);
      }
    } catch (err: any) {
      api?.appendLog?.(`[error] spawn failed: ${err?.message || String(err)}`);
      alert(`Start failed: ${err?.message || String(err)}`);
    } finally {
      if (!localRunId) {
        runBtn.disabled = false;
        runBtn.textContent = prevText || 'Start';
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
      alert('No running task to stop');
      return;
    }
    try {
      const ret = await window.api.cmdKill(runId);
      if (!ret?.ok) {
        alert(`Stop failed: ${ret?.error || 'unknown_error'}`);
        return;
      }
      api?.appendLog?.(`[killed] runId=${runId}`);
      if (String(api?.xhsActiveRunId || '') === runId) api.xhsActiveRunId = '';
      localRunId = '';
      setRunningUi(false);
    } catch (err: any) {
      alert(`Stop failed: ${err?.message || String(err)}`);
    }
  };

  const cmdUnsubscribe = window.api.onCmdEvent((evt: any) => {
    const eventType = String(evt?.type || '');
    const evtRunId = String(evt?.runId || '').trim();

    if (eventType === 'started') {
      const title = String(evt?.title || '');
      if (title.includes('xiaohongshu')) {
        localRunId = String(evt?.runId || localRunId || '');
        api.xhsActiveRunId = localRunId;
        liveStats.resetLiveStats();
        liveStats.setActiveRunId(localRunId);
        const targetNum = Math.floor(Number(maxNotesInput.value || 200));
        if (Number.isFinite(targetNum) && targetNum > 0) {
          liveStats.setExpectedLinksTarget(targetNum);
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

  // Check for running tasks on init
  void recoverRunFromStateTasks();

  const dispose = () => {
    if (typeof cmdUnsubscribe === 'function') cmdUnsubscribe();
    liveStats.dispose();
  };

  return { runBtn, dispose };
}
