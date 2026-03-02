import { resolveUnifiedApiBaseUrl } from './paths.mts';
import { getRunLifecycle } from './run-lifecycle.mts';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

function toEpochMs(value: any): number {
  const raw = String(value ?? '').trim();
  if (!raw) return 0;
  const asNum = Number(raw);
  if (Number.isFinite(asNum) && asNum > 0) return asNum;
  const asDate = Date.parse(raw);
  return Number.isFinite(asDate) ? asDate : 0;
}

export async function listUnifiedTasks() {
  const baseUrl = resolveUnifiedApiBaseUrl().replace(/\/+$/, '');
  const res = await fetch(`${baseUrl}/api/v1/tasks`, { signal: AbortSignal.timeout(3000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const payload = await res.json().catch(() => ({} as any));
  return Array.isArray(payload?.data) ? payload.data : [];
}

export function pickUnifiedRunId(tasks: any[], options: {
  profileId: string;
  keyword: string;
  uiTriggerId?: string;
  minTs: number;
  baselineRunIds?: Set<string>;
}) {
  const profileId = String(options.profileId || '').trim();
  const keyword = String(options.keyword || '').trim();
  const uiTriggerId = String(options.uiTriggerId || '').trim();
  const minTs = Number(options.minTs || 0);
  const baselineRunIds = options.baselineRunIds instanceof Set ? options.baselineRunIds : new Set<string>();
  const rows = tasks
    .filter((task) => {
      const runId = String(task?.runId || task?.id || '').trim();
      if (!runId) return false;
      if (baselineRunIds.has(runId)) return false;
      const phase = String(task?.phase || task?.lastPhase || '').trim().toLowerCase();
      if (phase !== 'unified') return false;
      const taskProfile = String(task?.profileId || '').trim();
      const taskKeyword = String(task?.keyword || '').trim();
      const taskTrigger = String(
        task?.uiTriggerId
        || task?.triggerId
        || task?.meta?.uiTriggerId
        || task?.context?.uiTriggerId
        || '',
      ).trim();
      if (uiTriggerId && taskTrigger !== uiTriggerId) return false;
      if (profileId && taskProfile && taskProfile !== profileId) return false;
      if (keyword && taskKeyword && taskKeyword !== keyword) return false;
      const createdTs = toEpochMs(task?.createdAt);
      const startedTs = toEpochMs(task?.startedAt);
      const ts = createdTs || startedTs;
      return ts >= minTs;
    })
    .sort((a, b) => {
      const ta = toEpochMs(a?.createdAt) || toEpochMs(a?.startedAt);
      const tb = toEpochMs(b?.createdAt) || toEpochMs(b?.startedAt);
      return tb - ta;
    });
  const picked = rows[0] || null;
  return String(picked?.runId || picked?.id || '').trim();
}

export async function waitForUnifiedRunRegistration(input: {
  desktopRunId: string;
  profileId: string;
  keyword: string;
  uiTriggerId?: string;
  baselineRunIds?: Set<string>;
  timeoutMs?: number;
  timeoutMultiplier?: number;
}) {
  const desktopRunId = String(input.desktopRunId || '').trim();
  const profileId = String(input.profileId || '').trim();
  const keyword = String(input.keyword || '').trim();
  const uiTriggerId = String(input.uiTriggerId || '').trim();
  const baseTimeoutMs = Math.max(2_000, Number(input.timeoutMs || 20_000) || 20_000);
  const timeoutMultiplierRaw = Number(
    input.timeoutMultiplier
    ?? process.env.WEBAUTO_RUN_REGISTER_TIMEOUT_MULTIPLIER
    ?? 3,
  );
  const timeoutMultiplier = Number.isFinite(timeoutMultiplierRaw) && timeoutMultiplierRaw >= 1
    ? Math.floor(timeoutMultiplierRaw)
    : 3;
  const timeoutMs = baseTimeoutMs * timeoutMultiplier;
  const startedAt = Date.now();
  const minTs = startedAt - 30_000;
  const baselineRunIds = input.baselineRunIds instanceof Set ? input.baselineRunIds : new Set<string>();
  let lastFetchError = '';

  while ((Date.now() - startedAt) < timeoutMs) {
    try {
      const tasks = await listUnifiedTasks();
      const unifiedRunId = pickUnifiedRunId(tasks, {
        profileId,
        keyword,
        uiTriggerId,
        minTs,
        baselineRunIds,
      });
      if (unifiedRunId) return { ok: true, runId: unifiedRunId };
      lastFetchError = '';
    } catch (err: any) {
      lastFetchError = err?.message || String(err);
    }

    const lifecycle = getRunLifecycle(desktopRunId);
    if (lifecycle?.state === 'exited') {
      const detail = lifecycle.lastError || `exit=${lifecycle.exitCode ?? 'null'}`;
      return { ok: false, error: `任务进程提前退出，未注册 unified runId (${detail})` };
    }
    await sleep(500);
  }

  const lifecycle = getRunLifecycle(desktopRunId);
  if (lifecycle?.state === 'queued') {
    return {
      ok: false,
      error: `任务仍在排队，未进入运行态（已等待 ${Math.round(timeoutMs / 1000)}s，基础超时 ${Math.round(baseTimeoutMs / 1000)}s x${timeoutMultiplier}）`,
    };
  }
  if (lifecycle?.state === 'running') {
    return {
      ok: false,
      error: `任务进程已启动，但在超时内未注册 unified runId（已等待 ${Math.round(timeoutMs / 1000)}s，基础超时 ${Math.round(baseTimeoutMs / 1000)}s x${timeoutMultiplier}）`,
    };
  }
  const suffix = lastFetchError ? `: ${lastFetchError}` : '';
  return {
    ok: false,
    error: `未检测到 unified runId（已等待 ${Math.round(timeoutMs / 1000)}s，基础超时 ${Math.round(baseTimeoutMs / 1000)}s x${timeoutMultiplier}）${suffix}`,
  };
}
