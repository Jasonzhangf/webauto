import path from 'node:path';

type ScheduleType = 'interval' | 'once' | 'daily' | 'weekly';

export type ScheduleTaskPayload = {
  id?: string;
  name?: string;
  enabled?: boolean;
  commandType?: string;
  scheduleType?: ScheduleType;
  intervalMinutes?: number;
  runAt?: string | null;
  maxRuns?: number | null;
  argv?: Record<string, any>;
};

export type ScheduleInvokeInput = {
  action: 'list' | 'get' | 'save' | 'run' | 'delete' | 'export' | 'import' | 'run-due' | 'daemon-start';
  taskId?: string;
  payload?: ScheduleTaskPayload;
  timeoutMs?: number;
  limit?: number;
  mode?: 'merge' | 'replace';
  payloadJson?: string;
  intervalSec?: number;
};

export type TaskRunEphemeralInput = {
  commandType?: string;
  argv?: Record<string, any>;
};

type RunJsonLike = (spec: {
  title: string;
  cwd: string;
  args: string[];
  timeoutMs?: number;
}) => Promise<any>;

type SpawnLike = (spec: {
  title: string;
  cwd: string;
  args: string[];
  groupKey?: string;
}) => Promise<any>;

type GatewayOptions = {
  repoRoot: string;
  runJson: RunJsonLike;
  spawnCommand: SpawnLike;
};

const KEYWORD_REQUIRED_TYPES = new Set(['xhs-unified', 'weibo-search', '1688-search']);
const RUN_AT_TYPES = new Set<ScheduleType>(['once', 'daily', 'weekly']);

function asText(value: any): string {
  return String(value ?? '').trim();
}

function asPositiveInt(value: any, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.max(1, Math.floor(n));
}

function asBool(value: any, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  const text = asText(value).toLowerCase();
  if (!text) return fallback;
  if (['1', 'true', 'yes', 'y', 'on'].includes(text)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(text)) return false;
  return fallback;
}

function asOptionalRunAt(value: any): string | null {
  const runAt = asText(value);
  return runAt ? runAt : null;
}

function normalizeScheduleType(value: any): ScheduleType {
  const raw = asText(value);
  if (raw === 'once' || raw === 'daily' || raw === 'weekly') return raw;
  return 'interval';
}

function deriveTaskName(commandType: string, argv: Record<string, any>): string {
  const keyword = asText(argv.keyword);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return keyword ? `${commandType}-${keyword}` : `${commandType}-${stamp}`;
}

function getPlatformFromCommandType(commandType: string): 'xiaohongshu' | 'weibo' | '1688' {
  const value = asText(commandType).toLowerCase();
  if (value.startsWith('weibo')) return 'weibo';
  if (value.startsWith('1688')) return '1688';
  return 'xiaohongshu';
}

function hasExplicitProfileArg(argv: Record<string, any>): boolean {
  return Boolean(asText(argv?.profile) || asText(argv?.profiles) || asText(argv?.profilepool));
}

async function pickDefaultProfileForPlatform(options: GatewayOptions, platform: 'xiaohongshu' | 'weibo' | '1688'): Promise<string> {
  const accountScript = path.join(options.repoRoot, 'apps', 'webauto', 'entry', 'account.mjs');
  const ret = await options.runJson({
    title: `account list --platform ${platform}`,
    cwd: options.repoRoot,
    args: [accountScript, 'list', '--platform', platform, '--json'],
    timeoutMs: 20_000,
  });
  if (!ret?.ok) return '';
  const rows = Array.isArray(ret?.json?.profiles) ? ret.json.profiles : [];
  const validRows = rows
    .filter((row: any) => row?.valid === true && asText(row?.accountId))
    .sort((a: any, b: any) => {
      const ta = Date.parse(asText(a?.updatedAt) || '') || 0;
      const tb = Date.parse(asText(b?.updatedAt) || '') || 0;
      if (tb !== ta) return tb - ta;
      return asText(a?.profileId).localeCompare(asText(b?.profileId));
    });
  return asText(validRows[0]?.profileId) || '';
}

async function ensureProfileArg(options: GatewayOptions, commandType: string, argv: Record<string, any>): Promise<Record<string, any>> {
  if (hasExplicitProfileArg(argv)) return argv;
  const platform = getPlatformFromCommandType(commandType);
  const profileId = await pickDefaultProfileForPlatform(options, platform);
  if (!profileId) {
    throw new Error(`未指定 Profile，且未找到平台(${platform})有效账号。请先在账号页登录并校验后重试。`);
  }
  return {
    ...argv,
    profile: profileId,
  };
}

function normalizeWeiboTaskType(commandType: string): string {
  if (commandType === 'weibo-search') return 'search';
  if (commandType === 'weibo-monitor') return 'monitor';
  return 'timeline';
}

function normalizeSavePayload(payload: ScheduleTaskPayload | undefined) {
  const commandType = asText(payload?.commandType) || 'xhs-unified';
  const argv = (payload?.argv && typeof payload.argv === 'object')
    ? { ...payload.argv }
    : {};
  const scheduleType = normalizeScheduleType(payload?.scheduleType);
  const runAt = asOptionalRunAt(payload?.runAt);
  const intervalMinutes = asPositiveInt(payload?.intervalMinutes, 30);
  const maxRunsRaw = Number(payload?.maxRuns);
  const maxRuns = Number.isFinite(maxRunsRaw) && maxRunsRaw > 0
    ? Math.max(1, Math.floor(maxRunsRaw))
    : null;
  const name = asText(payload?.name) || deriveTaskName(commandType, argv);
  const enabled = asBool(payload?.enabled, true);
  const id = asText(payload?.id);

  if (KEYWORD_REQUIRED_TYPES.has(commandType) && !asText(argv.keyword)) {
    throw new Error('关键词不能为空');
  }
  if (commandType.startsWith('weibo-')) {
    argv['task-type'] = asText(argv['task-type']) || normalizeWeiboTaskType(commandType);
    if (commandType === 'weibo-monitor' && !asText(argv['user-id'])) {
      throw new Error('微博 monitor 任务需要 user-id');
    }
  }
  if (RUN_AT_TYPES.has(scheduleType) && !runAt) {
    throw new Error(`${scheduleType} 任务需要锚点时间`);
  }

  return {
    id,
    name,
    enabled,
    commandType,
    scheduleType,
    intervalMinutes,
    runAt,
    maxRuns,
    argv,
  };
}

async function runScheduleJson(options: GatewayOptions, args: string[], timeoutMs?: number) {
  const script = path.join(options.repoRoot, 'apps', 'webauto', 'entry', 'schedule.mjs');
  const ret = await options.runJson({
    title: `schedule ${args.join(' ')}`.trim(),
    cwd: options.repoRoot,
    args: [script, ...args, '--json'],
    timeoutMs: typeof timeoutMs === 'number' && timeoutMs > 0 ? timeoutMs : undefined,
  });
  if (!ret?.ok) {
    const reason = asText(ret?.error) || asText(ret?.stderr) || asText(ret?.stdout) || 'schedule command failed';
    return { ok: false, error: reason };
  }
  return { ok: true, json: ret?.json || {} };
}

export async function scheduleInvoke(options: GatewayOptions, input: ScheduleInvokeInput) {
  try {
    const action = asText(input?.action);
    const timeoutMs = input?.timeoutMs;
    if (action === 'list') return runScheduleJson(options, ['list'], timeoutMs);
    if (action === 'get') {
      const taskId = asText(input?.taskId);
      if (!taskId) return { ok: false, error: 'missing taskId' };
      return runScheduleJson(options, ['get', taskId], timeoutMs);
    }
    if (action === 'save') {
      const payload = normalizeSavePayload(input?.payload);
      payload.argv = await ensureProfileArg(options, payload.commandType, payload.argv);
      const args = payload.id ? ['update', payload.id] : ['add'];
      args.push('--name', payload.name);
      args.push('--enabled', String(payload.enabled));
      args.push('--command-type', payload.commandType);
      args.push('--schedule-type', payload.scheduleType);
      if (RUN_AT_TYPES.has(payload.scheduleType)) {
        args.push('--run-at', String(payload.runAt || ''));
      } else {
        args.push('--interval-minutes', String(payload.intervalMinutes));
      }
      args.push('--max-runs', payload.maxRuns === null ? '0' : String(payload.maxRuns));
      args.push('--argv-json', JSON.stringify(payload.argv));
      return runScheduleJson(options, args, timeoutMs);
    }
    if (action === 'run') {
      const taskId = asText(input?.taskId);
      if (!taskId) return { ok: false, error: 'missing taskId' };
      return runScheduleJson(options, ['run', taskId], timeoutMs);
    }
    if (action === 'delete') {
      const taskId = asText(input?.taskId);
      if (!taskId) return { ok: false, error: 'missing taskId' };
      return runScheduleJson(options, ['delete', taskId], timeoutMs);
    }
    if (action === 'export') {
      const taskId = asText(input?.taskId);
      return taskId ? runScheduleJson(options, ['export', taskId], timeoutMs) : runScheduleJson(options, ['export'], timeoutMs);
    }
    if (action === 'import') {
      const payloadJson = asText(input?.payloadJson);
      if (!payloadJson) return { ok: false, error: 'missing payloadJson' };
      const mode = asText(input?.mode) === 'replace' ? 'replace' : 'merge';
      return runScheduleJson(options, ['import', '--payload-json', payloadJson, '--mode', mode], timeoutMs);
    }
    if (action === 'run-due') {
      const limit = asPositiveInt(input?.limit, 20);
      return runScheduleJson(options, ['run-due', '--limit', String(limit)], timeoutMs);
    }
    if (action === 'daemon-start') {
      const interval = asPositiveInt(input?.intervalSec, 30);
      const limit = asPositiveInt(input?.limit, 20);
      const script = path.join(options.repoRoot, 'apps', 'webauto', 'entry', 'schedule.mjs');
      const ret = await options.spawnCommand({
        title: `schedule daemon ${interval}s`,
        cwd: options.repoRoot,
        args: [script, 'daemon', '--interval-sec', String(Math.max(5, interval)), '--limit', String(limit), '--json'],
        groupKey: 'scheduler',
      });
      return { ok: true, runId: asText(ret?.runId) };
    }
    return { ok: false, error: `unsupported action: ${action || '<empty>'}` };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}

export async function runEphemeralTask(options: GatewayOptions, input: TaskRunEphemeralInput) {
  try {
    const commandType = asText(input?.commandType) || 'xhs-unified';
    let argv = (input?.argv && typeof input.argv === 'object') ? { ...input.argv } : {};
    argv = await ensureProfileArg(options, commandType, argv);
    const profile = asText(argv.profile);
    const keyword = asText(argv.keyword);
    const target = asPositiveInt(argv['max-notes'] ?? argv.target, 50);
    const env = asText(argv.env) || 'debug';

    if (!profile) return { ok: false, error: '请输入 Profile ID' };
    if (KEYWORD_REQUIRED_TYPES.has(commandType) && !keyword) {
      return { ok: false, error: '请输入关键词' };
    }

    if (commandType === 'xhs-unified') {
      const script = path.join(options.repoRoot, 'apps', 'webauto', 'entry', 'xhs-unified.mjs');
      const ret = await options.spawnCommand({
        title: `xhs unified: ${keyword}`,
        cwd: options.repoRoot,
        groupKey: 'xhs-unified',
        args: [
          script,
          '--profile', profile,
          '--keyword', keyword,
          '--target', String(target),
          '--max-notes', String(target),
          '--env', env,
          '--do-comments', String(asBool(argv['do-comments'], true)),
          '--fetch-body', String(asBool(argv['fetch-body'], true)),
          '--do-likes', String(asBool(argv['do-likes'], false)),
          '--like-keywords', asText(argv['like-keywords']),
        ],
      });
      return { ok: true, runId: asText(ret?.runId), commandType, profile };
    }

    if (commandType === 'weibo-search') {
      const script = path.join(options.repoRoot, 'apps', 'webauto', 'entry', 'weibo-unified.mjs');
      const ret = await options.spawnCommand({
        title: `weibo: ${keyword}`,
        cwd: options.repoRoot,
        groupKey: 'weibo-search',
        args: [
          script,
          'search',
          '--profile', profile,
          '--keyword', keyword,
          '--target', String(target),
          '--env', env,
        ],
      });
      return { ok: true, runId: asText(ret?.runId), commandType, profile };
    }

    return { ok: false, error: `当前任务类型暂不支持仅执行(不保存): ${commandType}` };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}
