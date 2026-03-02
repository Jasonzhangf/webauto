type RunLifecycleState = 'queued' | 'running' | 'exited';
export type RunLifecycleEntry = {
  runId: string;
  state: RunLifecycleState;
  title: string;
  queuedAt: number;
  startedAt?: number;
  exitedAt?: number;
  pid?: number;
  exitCode?: number | null;
  signal?: string | null;
  lastError?: string;
};

const runLifecycle = new Map<string, RunLifecycleEntry>();

export function setRunLifecycle(runId: string, patch: Partial<RunLifecycleEntry>) {
  const rid = String(runId || '').trim();
  if (!rid) return;
  const current = runLifecycle.get(rid) || {
    runId: rid,
    state: 'queued' as RunLifecycleState,
    title: '',
    queuedAt: Date.now(),
  };
  const next: RunLifecycleEntry = {
    ...current,
    ...patch,
    runId: rid,
  };
  runLifecycle.set(rid, next);
  if (runLifecycle.size > 400) {
    const rows = Array.from(runLifecycle.values()).sort((a, b) => (a.queuedAt || 0) - (b.queuedAt || 0));
    const toDrop = rows.slice(0, Math.max(0, rows.length - 200));
    for (const row of toDrop) runLifecycle.delete(row.runId);
  }
}

export function getRunLifecycle(runId: string): RunLifecycleEntry | null {
  const rid = String(runId || '').trim();
  if (!rid) return null;
  return runLifecycle.get(rid) || null;
}
