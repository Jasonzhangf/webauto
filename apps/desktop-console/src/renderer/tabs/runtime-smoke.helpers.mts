import type { DomHarness } from '../test-dom.mts';

export type MockBundle = {
  ctx: any;
  calls: any;
  emitters: any;
};

function tick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export async function flush(times = 2) {
  for (let i = 0; i < times; i += 1) await tick();
}

export function findButtonByText(root: HTMLElement, text: string): HTMLButtonElement {
  const all = Array.from(root.querySelectorAll('button')) as HTMLButtonElement[];
  const found = all.find((btn) => String(btn.textContent || '').includes(text));
  if (!found) {
    throw new Error(`button not found: ${text}`);
  }
  return found;
}

export async function waitForSelectOption(
  root: HTMLElement,
  optionValue: string,
  attempts = 20,
  visibleOnly = false,
): Promise<HTMLSelectElement | null> {
  for (let i = 0; i < attempts; i += 1) {
    const found = Array.from(root.querySelectorAll('select')).find((sel) =>
      (!visibleOnly || (sel as HTMLSelectElement).style.display !== 'none') &&
      Array.from((sel as HTMLSelectElement).options || []).some((opt) => opt.value === optionValue),
    ) as HTMLSelectElement | undefined;
    if (found) return found;
    await flush();
  }
  return null;
}

export function createMockCtx(): MockBundle {
  const emitters: any = {
    settingsChanged: null,
    stateUpdate: null,
    cmdEvent: null,
    activeRunsChanged: null,
  };
  const calls: any = {
    spawns: [],
    kills: [],
    settingsSet: [],
    configSave: [],
    configExport: [],
    invoke: [],
    runtime: {
      focus: [],
      mark: [],
      restart: [],
      kill: [],
    },
    clipboard: '',
    logs: [],
    setStatus: [],
    setActiveTab: [],
  };

  const settings: any = {
    coreDaemonUrl: 'http://127.0.0.1:7700',
    downloadRoot: '/tmp/webauto/download',
    defaultEnv: 'prod',
    defaultKeyword: 'seedance2.0',
    defaultTarget: 50,
    defaultDryRun: false,
    profileAliases: { 'xhs-1': '主号' },
    profileColors: { 'xhs-1': '#112233' },
    timeouts: { loginTimeoutSec: 900, cmdTimeoutSec: 0 },
    aiReply: {
      enabled: false,
      baseUrl: 'http://127.0.0.1:5520',
      apiKey: '',
      model: 'iflow.glm-5',
      temperature: 0.7,
      maxChars: 20,
      timeoutMs: 25000,
      stylePreset: 'friendly',
      styleCustom: '',
    },
  };
  let scheduleSeq = 1;
  const scheduleTasks: any[] = [];

  const api: any = {
    settings,
    pathJoin: (...parts: string[]) => parts.filter(Boolean).join('/'),
    pathNormalize: (p: string) => p,
    pathSep: '/',
    osHomedir: () => '/Users/test',
    configLoadLast: async () => ({
      keyword: 'seedance2.0',
      target: 50,
      env: 'debug',
      fetchBody: true,
      fetchComments: true,
      maxComments: 80,
      autoLike: false,
      likeKeywords: '',
      headless: false,
      dryRun: true,
      lastProfileId: 'xhs-1',
    }),
    configSaveLast: async (cfg: any) => {
      calls.configSave.push(cfg);
      return { ok: true };
    },
    configExport: async (payload: any) => {
      calls.configExport.push(payload);
      return { ok: true, path: payload.filePath };
    },
    cmdRunJson: async (spec: any) => {
      const args = Array.isArray(spec?.args) ? spec.args.map((x: any) => String(x)) : [];
      if (args.some((value: string) => value.endsWith('/account.mjs')) && args.includes('list')) {
        return {
          ok: true,
          json: {
            profiles: [
              { profileId: 'xhs-1', accountRecordId: 'acc-1', accountId: 'uid-1', alias: '主号', status: 'active', valid: true },
              { profileId: 'xhs-2', accountRecordId: 'acc-2', accountId: '', alias: '', status: 'invalid', valid: false },
            ],
          },
        };
      }
      if (args.some((value: string) => value.endsWith('/schedule.mjs'))) {
        const cmd = String(args[1] || '').trim();
        if (cmd === 'list') {
          return { ok: true, json: { tasks: scheduleTasks } };
        }
        if (cmd === 'add') {
          const id = `sched-${String(scheduleSeq).padStart(4, '0')}`;
          scheduleSeq += 1;
          const argvRaw = args[args.indexOf('--argv-json') + 1] || '{}';
          let argv: any = {};
          try { argv = JSON.parse(String(argvRaw)); } catch { argv = {}; }
          const row = {
            id,
            seq: scheduleSeq,
            name: String(args[args.indexOf('--name') + 1] || id),
            enabled: String(args[args.indexOf('--enabled') + 1] || 'true') !== 'false',
            scheduleType: String(args[args.indexOf('--schedule-type') + 1] || 'interval'),
            intervalMinutes: Number(args[args.indexOf('--interval-minutes') + 1] || 30) || 30,
            runAt: String(args[args.indexOf('--run-at') + 1] || '') || null,
            maxRuns: Number(args[args.indexOf('--max-runs') + 1] || 0) > 0
              ? Number(args[args.indexOf('--max-runs') + 1])
              : null,
            nextRunAt: null,
            commandType: 'xhs-unified',
            commandArgv: argv,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            runCount: 0,
            failCount: 0,
          };
          scheduleTasks.push(row);
          return { ok: true, json: { task: row } };
        }
        if (cmd === 'update') {
          const id = String(args[2] || '').trim();
          const row = scheduleTasks.find((item) => String(item.id) === id);
          if (!row) return { ok: false, error: 'missing_task' };
          const argvRaw = args[args.indexOf('--argv-json') + 1] || '{}';
          let argv: any = {};
          try { argv = JSON.parse(String(argvRaw)); } catch { argv = {}; }
          row.name = String(args[args.indexOf('--name') + 1] || row.name);
          row.commandArgv = argv;
          row.updatedAt = new Date().toISOString();
          return { ok: true, json: { task: row } };
        }
        if (cmd === 'run') {
          const id = String(args[2] || '').trim();
          return { ok: true, json: { result: { taskId: id, runResult: { id, lastRunId: 'rid-schedule-1' } } } };
        }
      }
      if (args.some((value: string) => value.endsWith('/profilepool.mjs')) && args.includes('add')) {
        return { ok: true, json: { profileId: 'xiaohongshu-9' } };
      }
      return { ok: true, json: {} };
    },
    scheduleInvoke: async (input: any) => {
      const action = String(input?.action || '').trim();
      if (action === 'list') {
        return { ok: true, json: { tasks: scheduleTasks } };
      }
      if (action === 'save') {
        const payload = input?.payload || {};
        const id = String(payload.id || '').trim() || `sched-${String(scheduleSeq).padStart(4, '0')}`;
        const idx = scheduleTasks.findIndex((item) => String(item.id) === id);
        const row = {
          ...(idx >= 0 ? scheduleTasks[idx] : {}),
          id,
          seq: idx >= 0 ? scheduleTasks[idx].seq : scheduleSeq,
          name: String(payload.name || id),
          enabled: payload.enabled !== false,
          scheduleType: String(payload.scheduleType || 'interval'),
          intervalMinutes: Number(payload.intervalMinutes || 30) || 30,
          runAt: payload.runAt || null,
          maxRuns: Number(payload.maxRuns || 0) > 0 ? Number(payload.maxRuns) : null,
          nextRunAt: null,
          commandType: String(payload.commandType || 'xhs-unified'),
          commandArgv: payload.argv || {},
          createdAt: idx >= 0 ? scheduleTasks[idx].createdAt : new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          runCount: idx >= 0 ? scheduleTasks[idx].runCount : 0,
          failCount: idx >= 0 ? scheduleTasks[idx].failCount : 0,
        };
        if (idx >= 0) {
          scheduleTasks[idx] = row;
        } else {
          scheduleTasks.push(row);
          scheduleSeq += 1;
        }
        return { ok: true, json: { task: row } };
      }
      if (action === 'run') {
        const id = String(input?.taskId || '').trim();
        return { ok: true, json: { result: { taskId: id, runResult: { id, lastRunId: 'rid-schedule-1' } } } };
      }
      if (action === 'delete') {
        const id = String(input?.taskId || '').trim();
        const idx = scheduleTasks.findIndex((item) => String(item.id) === id);
        if (idx >= 0) scheduleTasks.splice(idx, 1);
        return { ok: true, json: { id } };
      }
      if (action === 'run-due') {
        return { ok: true, json: { count: 1, success: 1, failed: 0 } };
      }
      if (action === 'export') {
        const id = String(input?.taskId || '').trim();
        if (!id) return { ok: true, json: { tasks: scheduleTasks } };
        const row = scheduleTasks.find((item) => String(item.id) === id);
        return { ok: true, json: row ? { task: row } : {} };
      }
      if (action === 'import') {
        const payloadRaw = String(input?.payloadJson || '');
        try {
          const parsed = JSON.parse(payloadRaw);
          const items = Array.isArray(parsed?.tasks) ? parsed.tasks : [];
          for (const row of items) {
            if (!row?.id) continue;
            const id = String(row.id);
            const idx = scheduleTasks.findIndex((item) => String(item.id) === id);
            if (idx >= 0) scheduleTasks[idx] = { ...scheduleTasks[idx], ...row };
            else scheduleTasks.push(row);
          }
        } catch {
          // ignore parse errors in tests
        }
        return { ok: true, json: {} };
      }
      if (action === 'daemon-start') {
        return { ok: true, runId: `daemon-run-${scheduleSeq}` };
      }
      return { ok: true, json: {} };
    },
    cmdSpawn: async (spec: any) => {
      calls.spawns.push(spec);
      return { runId: `rid-${calls.spawns.length}` };
    },
    cmdKill: async (runId: string) => {
      calls.kills.push(runId);
      return { ok: true };
    },
    settingsSet: async (payload: any) => {
      calls.settingsSet.push(payload);
      Object.assign(settings, payload);
      if (typeof emitters.settingsChanged === 'function') emitters.settingsChanged(settings);
      return settings;
    },
    onSettingsChanged: (cb: any) => {
      emitters.settingsChanged = cb;
      return () => {
        emitters.settingsChanged = null;
      };
    },
    onStateUpdate: (cb: any) => {
      emitters.stateUpdate = cb;
      return () => {
        emitters.stateUpdate = null;
      };
    },
    onCmdEvent: (cb: any) => {
      emitters.cmdEvent = cb;
      return () => {
        emitters.cmdEvent = null;
      };
    },
    onActiveRunsChanged: (cb: any) => {
      emitters.activeRunsChanged = cb;
      return () => {
        emitters.activeRunsChanged = null;
      };
    },
    stateGetTasks: async () => [
      {
        runId: 'rid-1',
        status: 'running',
        collected: 3,
        target: 10,
        success: 2,
        failed: 1,
        phase: 'Phase2',
        action: 'collecting',
        keyword: 'seedance2.0',
        profileId: 'xhs-1',
      },
    ],
    runtimeListSessions: async () => [
      { profileId: 'xhs-1', sessionId: 'xhs-1', currentUrl: 'https://www.xiaohongshu.com', lastPhase: 'Phase2', lastActiveAt: new Date().toISOString() },
    ],
    runtimeSetBrowserTitle: async (payload: any) => {
      calls.runtime.mark.push({ type: 'title', payload });
      return { ok: true };
    },
    runtimeSetHeaderBar: async (payload: any) => {
      calls.runtime.mark.push({ type: 'header', payload });
      return { ok: true };
    },
    runtimeFocus: async (payload: any) => {
      calls.runtime.focus.push(payload);
      return { ok: true };
    },
    runtimeRestartPhase1: async (payload: any) => {
      calls.runtime.restart.push(payload);
      return { ok: true };
    },
    runtimeKill: async (payload: any) => {
      calls.runtime.kill.push(payload);
      return { ok: true };
    },
    profilesList: async () => ({ profiles: ['xhs-1', 'xhs-2', 'pool-1'] }),
    scriptsXhsFullCollect: async () => ({
      ok: true,
      scripts: [{ id: 'xhs:full', label: 'Full Collect', path: '/tmp/full-collect.mjs' }],
    }),
    resultsScan: async () => ({
      ok: true,
      entries: [
        { env: 'debug', keyword: 'seedance2.0', path: '/tmp/result', state: { status: 'running', links: 2, target: 10, completed: 1, failed: 0 } },
      ],
    }),
    fsListDir: async () => ({
      ok: true,
      entries: [
        { path: '/tmp/result/a.json', rel: 'a.json', name: 'a.json', isDir: false },
        { path: '/tmp/result/b.png', rel: 'b.png', name: 'b.png', isDir: false },
      ],
      truncated: false,
    }),
    fsReadTextPreview: async () => ({ ok: true, text: '{"ok":true}' }),
    fsReadFileBase64: async () => ({ ok: true, data: 'iVBORw0KGgo=' }),
    osOpenPath: async (_p: string) => ({ ok: true }),
    clipboardWriteText: async (text: string) => {
      calls.clipboard = text;
      return { ok: true };
    },
    invoke: async (channel: string, payload: any) => {
      calls.invoke.push({ channel, payload });
      if (channel === 'ai:listModels') return { ok: true, models: ['iflow.glm-5'], rawCount: 1 };
      if (channel === 'ai:testChatCompletion') return { ok: true, latencyMs: 88, model: payload.model };
      return { ok: false, error: 'unknown_channel' };
    },
  };

  const ctx: any = {
    api,
    settings,
    _logLines: [],
    _activeRunIds: new Set(['rid-1']),
    activeRunId: 'rid-1',
    xhsCurrentRun: { runId: 'rid-1' },
    appendLog: (line: string) => {
      calls.logs.push(line);
      ctx._logLines.push(line);
    },
    clearLog: () => {
      ctx._logLines = [];
    },
    setStatus: (text: string) => {
      calls.setStatus.push(text);
    },
    setActiveTab: (id: string) => {
      calls.setActiveTab.push(id);
    },
    onActiveRunsChanged: (cb: any) => {
      emitters.activeRunsChanged = cb;
      return () => {
        emitters.activeRunsChanged = null;
      };
    },
  };

  return { ctx, calls, emitters };
}
