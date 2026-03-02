export type MockBundle = {
  ctx: any;
  calls: {
    scheduleInvoke: any[];
    taskRunEphemeral: any[];
    cmdKill: any[];
    setActiveTab: string[];
    setStatus: string[];
  };
  state: {
    tasks: any[];
    nextId: number;
    cmdEventCb: ((evt: any) => void) | null;
    unsubscribed: boolean;
    failListOnce: boolean;
  };
};

export function tick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export async function flush(times = 4) {
  for (let i = 0; i < times; i += 1) await tick();
}

export function findButtonByText(root: HTMLElement, text: string, nth = 0): HTMLButtonElement {
  const buttons = Array.from(root.querySelectorAll('button')) as HTMLButtonElement[];
  const matched = buttons.filter((btn) => String(btn.textContent || '').includes(text));
  const button = matched[nth];
  if (!button) throw new Error(`button not found: ${text}#${nth}`);
  return button;
}

export function findButtonByTextIn(container: HTMLElement, text: string, nth = 0): HTMLButtonElement {
  const buttons = Array.from(container.querySelectorAll('button')) as HTMLButtonElement[];
  const matched = buttons.filter((btn) => String(btn.textContent || '').includes(text));
  const button = matched[nth];
  if (!button) throw new Error(`button not found in container: ${text}#${nth}`);
  return button;
}

export function createMockCtx(): MockBundle {
  const calls = {
    scheduleInvoke: [] as any[],
    taskRunEphemeral: [] as any[],
    cmdKill: [] as any[],
    setActiveTab: [] as string[],
    setStatus: [] as string[],
  };
  const state = {
    tasks: [
      {
        id: 'sched-0001',
        name: 'daily-seed',
        enabled: true,
        scheduleType: 'interval',
        intervalMinutes: 30,
        runAt: null,
        maxRuns: null,
        nextRunAt: null,
        commandType: 'xhs-unified',
        commandArgv: {
          profile: 'xiaohongshu-batch-0',
          keyword: 'seedance2.0',
          'max-notes': 30,
          env: 'debug',
          'do-comments': true,
          'do-likes': false,
          'like-keywords': '',
          headless: false,
          'dry-run': true,
        },
        lastRunAt: null,
        lastStatus: null,
        lastError: null,
        runCount: 0,
        failCount: 0,
        runHistory: [
          {
            timestamp: '2026-02-20T10:00:00.000Z',
            status: 'success',
            durationMs: 4321,
          },
        ],
      },
    ] as any[],
    nextId: 2,
    cmdEventCb: null as ((evt: any) => void) | null,
    unsubscribed: false,
    failListOnce: false,
  };

  const api: any = {
    scheduleInvoke: async (input: any) => {
      calls.scheduleInvoke.push(input);
      const action = String(input?.action || '').trim();
      if (action === 'list') {
        if (state.failListOnce) {
          state.failListOnce = false;
          return { ok: false, error: 'list_failed' };
        }
        return { ok: true, json: { tasks: state.tasks } };
      }
      if (action === 'save') {
        const payload = input?.payload || {};
        const argv = payload?.argv || {};
        const commandType = String(payload?.commandType || 'xhs-unified');
        if (!argv.profile && !argv.profiles && !argv.profilepool) {
          return { ok: false, error: 'profile/profiles/profilepool 至少填写一个' };
        }
        if ((commandType === 'xhs-unified' || commandType === 'weibo-search' || commandType === '1688-search') && !argv.keyword) {
          return { ok: false, error: '关键词不能为空' };
        }
        if (commandType === 'weibo-monitor' && !argv['user-id']) {
          return { ok: false, error: '微博 monitor 任务需要 user-id' };
        }
        if ((payload.scheduleType === 'once' || payload.scheduleType === 'daily' || payload.scheduleType === 'weekly') && !payload.runAt) {
          return { ok: false, error: `${payload.scheduleType} 任务需要锚点时间` };
        }
        const id = String(payload.id || '').trim() || `sched-${String(state.nextId).padStart(4, '0')}`;
        const idx = state.tasks.findIndex((x) => String(x.id) === id);
        const row = {
          ...(idx >= 0 ? state.tasks[idx] : {}),
          id,
          name: String(payload.name || id),
          enabled: payload.enabled !== false,
          scheduleType: String(payload.scheduleType || 'interval'),
          intervalMinutes: Number(payload.intervalMinutes || 30) || 30,
          runAt: payload.runAt || null,
          maxRuns: Number(payload.maxRuns || 0) > 0 ? Number(payload.maxRuns) : null,
          nextRunAt: null,
          commandType: String(payload.commandType || 'xhs-unified'),
          commandArgv: payload.argv || {},
          lastRunAt: idx >= 0 ? state.tasks[idx].lastRunAt : null,
          lastStatus: idx >= 0 ? state.tasks[idx].lastStatus : null,
          lastError: idx >= 0 ? state.tasks[idx].lastError : null,
          runCount: idx >= 0 ? state.tasks[idx].runCount : 0,
          failCount: idx >= 0 ? state.tasks[idx].failCount : 0,
        };
        if (idx >= 0) state.tasks[idx] = row;
        else {
          state.tasks.push(row);
          state.nextId += 1;
        }
        return { ok: true, json: { task: row } };
      }
      if (action === 'run') {
        const id = String(input?.taskId || '').trim();
        const row = state.tasks.find((x) => String(x.id) === id);
        if (row) {
          row.runCount = Number(row.runCount || 0) + 1;
          row.lastStatus = 'success';
          row.lastRunAt = new Date().toISOString();
        }
        return { ok: true, json: { result: { runResult: { lastRunId: `rid-${id}` } } } };
      }
      if (action === 'delete') {
        const id = String(input?.taskId || '').trim();
        state.tasks = state.tasks.filter((x) => String(x.id) !== id);
        return { ok: true, json: { id } };
      }
      if (action === 'run-due') {
        return { ok: true, json: { count: 1, success: 1, failed: 0 } };
      }
      if (action === 'export') {
        const maybeId = String(input?.taskId || '').trim();
        if (!maybeId) return { ok: true, json: { tasks: state.tasks } };
        const row = state.tasks.find((x) => String(x.id) === maybeId);
        return { ok: true, json: row ? { task: row } : {} };
      }
      if (action === 'import') {
        const payloadRaw = String(input?.payloadJson || '');
        try {
          const parsed = JSON.parse(payloadRaw);
          const tasks = Array.isArray(parsed?.tasks) ? parsed.tasks : [];
          for (const row of tasks) {
            if (!row?.id) continue;
            const id = String(row.id);
            const idx = state.tasks.findIndex((x) => String(x.id) === id);
            if (idx >= 0) state.tasks[idx] = { ...state.tasks[idx], ...row };
            else state.tasks.push(row);
          }
        } catch {
          // ignore parse failures in tests
        }
        return { ok: true, json: {} };
      }
      if (action === 'daemon-start') {
        const runId = `daemon-run-${calls.scheduleInvoke.filter((item) => item.action === 'daemon-start').length}`;
        return { ok: true, runId };
      }
      return { ok: true, json: {} };
    },
    taskRunEphemeral: async (input: any) => {
      calls.taskRunEphemeral.push(input);
      return { ok: true, runId: `ephemeral-${calls.taskRunEphemeral.length}` };
    },
    cmdKill: async (payload: any) => {
      calls.cmdKill.push(payload);
      return { ok: true };
    },
    onCmdEvent: (cb: (evt: any) => void) => {
      state.cmdEventCb = cb;
      return () => {
        state.unsubscribed = true;
        state.cmdEventCb = null;
      };
    },
  };

  return {
    ctx: {
      api,
      setActiveTab: (id: string) => calls.setActiveTab.push(id),
      setStatus: (text: string) => calls.setStatus.push(text),
    },
    calls,
    state,
  };
}
