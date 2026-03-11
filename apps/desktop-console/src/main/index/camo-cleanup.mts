import path from 'node:path';

export async function cleanupCamoSessionsBestEffort(input: {
  repoRoot: string;
  runJson: (spec: { title: string; cwd: string; args: string[]; timeoutMs?: number }) => Promise<any>;
  timeoutMs: number;
  reason: string;
  includeLocks: boolean;
  stopSessions?: boolean;
}) {
  const camoCli = path.join(input.repoRoot, 'bin', 'camoufox-cli.mjs');
  const invoke = async (args: string[], timeoutMs = input.timeoutMs) =>
    input.runJson({
      title: `camo ${args.join(' ')}`,
      cwd: input.repoRoot,
      args: [camoCli, ...args, '--json'],
      timeoutMs,
    }).catch((err: any) => ({ ok: false, error: err?.message || String(err) }));

  if (input.stopSessions !== false) {
    const stopAll = await invoke(['stop', 'all']);
    if (!stopAll?.ok) {
      console.warn(`[desktop-console] camo stop all failed (${input.reason})`, stopAll?.error || stopAll?.stderr || stopAll?.stdout || stopAll);
    }
  }

  if (!input.includeLocks) return;
  const cleanupLocks = await invoke(['cleanup', 'locks']);
  if (!cleanupLocks?.ok) {
    console.warn(`[desktop-console] camo cleanup locks failed (${input.reason})`, cleanupLocks?.error || cleanupLocks?.stderr || cleanupLocks?.stdout || cleanupLocks);
  }
}
