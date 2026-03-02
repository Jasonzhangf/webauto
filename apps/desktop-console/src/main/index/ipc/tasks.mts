import { ipcMain } from 'electron';
import type { IpcDeps } from '../ipc-handlers.mts';
import type { RunJsonSpec, SpawnSpec } from '../types.mts';

export function registerTaskHandlers(deps: IpcDeps) {
  ipcMain.handle('desktop:heartbeat', async () => deps.markUiHeartbeat());

  ipcMain.handle('cmd:spawn', async (_evt, spec: SpawnSpec) => {
    deps.markUiHeartbeat('cmd_spawn');
    const title = String(spec?.title || 'command');
    const cwd = String(spec?.cwd || deps.repoRoot);
    const args = Array.isArray(spec?.args) ? spec.args : [];
    return deps.spawnCommand({ title, cwd, args, env: spec.env, groupKey: spec.groupKey });
  });

  ipcMain.handle('cmd:kill', async (_evt, input: { runId: string }) => {
    const runId = String(input?.runId || '');
    const ok = deps.terminateRunProcess(runId, 'manual_stop');
    return { ok: Boolean(ok), error: ok ? undefined : 'not found' };
  });

  ipcMain.handle('cmd:runJson', async (_evt, spec: RunJsonSpec) => {
    const cwd = String(spec?.cwd || deps.repoRoot);
    const args = Array.isArray(spec?.args) ? spec.args : [];
    return deps.runJson({ ...spec, cwd, args });
  });

  ipcMain.handle('schedule:invoke', async (_evt, input) => (
    deps.scheduleInvoke(
      {
        repoRoot: deps.repoRoot,
        runJson: (spec) => deps.runJson(spec),
        spawnCommand: (spec) => deps.spawnCommand(spec),
      },
      input || { action: 'list' },
    )
  ));

  ipcMain.handle('task:runEphemeral', async (_evt, input) => {
    const payload = input || {};
    let baselineRunIds = new Set<string>();
    try {
      const baselineTasks = await deps.listUnifiedTasks();
      baselineRunIds = new Set(
        baselineTasks
          .map((task: any) => String(task?.runId || task?.id || '').trim())
          .filter(Boolean),
      );
    } catch {
      baselineRunIds = new Set<string>();
    }

    const result = await deps.runEphemeralTask(
      {
        repoRoot: deps.repoRoot,
        runJson: (spec) => deps.runJson(spec),
        spawnCommand: (spec) => deps.spawnCommand(spec),
      },
      payload,
    );

    if (!result?.ok) return result;

    const commandType = String(result?.commandType || payload?.commandType || '').trim().toLowerCase();
    const desktopRunId = String(result?.runId || '').trim();
    if (commandType !== 'xhs-unified' || !desktopRunId) {
      return result;
    }

    const profileId = String(result?.profile || payload?.argv?.profile || '').trim();
    const keyword = String(payload?.argv?.keyword || payload?.argv?.k || '').trim();
    const uiTriggerId = String(result?.uiTriggerId || payload?.argv?.['ui-trigger-id'] || '').trim();
    deps.appendRunLog(
      desktopRunId,
      `[wait-register] profile=${profileId || '-'} keyword=${keyword || '-'} uiTriggerId=${uiTriggerId || '-'}`,
    );
    const waited = await deps.waitForUnifiedRunRegistration({
      desktopRunId,
      profileId,
      keyword,
      uiTriggerId,
      baselineRunIds,
      timeoutMs: 30_000,
      timeoutMultiplier: 3,
    });
    if (!waited.ok) {
      deps.appendRunLog(desktopRunId, `[wait-register-failed] ${String(waited.error || 'unknown_error')}`);
      return {
        ok: false,
        error: waited.error,
        runId: desktopRunId,
        commandType: result?.commandType || 'xhs-unified',
        profile: profileId,
        uiTriggerId,
      };
    }

    deps.appendRunLog(desktopRunId, `[wait-register-ok] unifiedRunId=${waited.runId || '-'} uiTriggerId=${uiTriggerId || '-'}`);

    return {
      ...result,
      runId: desktopRunId,
      unifiedRunId: waited.runId,
      uiTriggerId,
    };
  });
}
