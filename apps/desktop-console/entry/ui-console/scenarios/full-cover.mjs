import path from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

export async function runFullCover(runner, args) {
  runner.log('Starting full-cover real test (no mock)', 'test');
  const portableRoot = path.join(process.cwd(), '.tmp', `ui-full-cover-${Date.now()}`);
  mkdirSync(portableRoot, { recursive: true });
  const isolatedEnv = { ...process.env, WEBAUTO_PORTABLE_ROOT: portableRoot };
  const accountScript = path.join(process.cwd(), 'apps/webauto/entry/account.mjs');
  const scheduleScript = path.join(process.cwd(), 'apps/webauto/entry/schedule.mjs');
  const xhsInstallScript = path.join(process.cwd(), 'apps/webauto/entry/xhs-install.mjs');
  const xhsStatusScript = path.join(process.cwd(), 'apps/webauto/entry/xhs-status.mjs');
  const runIds = [];
  let unifiedServer = null;
  try {
    runner.log('Step 1/4: ensure backend dependencies', 'info');
    await runner.runNodeScript(xhsInstallScript, ['--ensure-backend'], 180000);

    runner.log('Step 2/4: account controls (add/get/update/list/delete)', 'info');
    const addRes = await runner.runJsonNodeScript(
      accountScript,
      ['add', '--platform', 'xiaohongshu', '--alias', 'ui-e2e', '--status', 'pending', '--json'],
      90000,
      { env: isolatedEnv },
    );
    const accountId = String(addRes?.account?.id || '').trim();
    runner.ensure(accountId, 'account add did not return account id');
    const profileId = String(addRes?.account?.profileId || '').trim();
    runner.ensure(profileId, 'account add did not return profile id');

    const getRes = await runner.runJsonNodeScript(accountScript, ['get', accountId, '--json'], 30000, { env: isolatedEnv });
    runner.ensure(getRes?.ok === true, 'account get failed');

    const updateAccountRes = await runner.runJsonNodeScript(
      accountScript,
      ['update', accountId, '--alias', 'ui-e2e-updated', '--json'],
      30000,
      { env: isolatedEnv },
    );
    runner.ensure(updateAccountRes?.ok === true, 'account update failed');

    const listRes = await runner.runJsonNodeScript(accountScript, ['list', '--json'], 30000, { env: isolatedEnv });
    runner.ensure(Number(listRes?.count || 0) >= 1, 'account list returned empty unexpectedly');

    const deleteRes = await runner.runJsonNodeScript(
      accountScript,
      ['delete', accountId, '--delete-profile', '--delete-fingerprint', '--json'],
      90000,
      { env: isolatedEnv },
    );
    runner.ensure(deleteRes?.ok === true, 'account delete failed');

    runner.log('Step 3/4: scheduler controls (CRUD/import-export/run/daemon)', 'info');
    const runAt = new Date(Date.now() + (60 * 60 * 1000)).toISOString();
    const argvJson = JSON.stringify({
      profile: 'xhs-e2e-profile',
      keyword: runner.keyword,
      'max-notes': Math.max(1, Number(runner.target) || 1),
      env: 'debug',
      'do-comments': false,
      'do-likes': false,
      'dry-run': true,
    });

    const addInterval = await runner.runJsonNodeScript(
      scheduleScript,
      ['add', '--name', 'ui-interval', '--schedule-type', 'interval', '--interval-minutes', '5', '--max-runs', '2', '--argv-json', argvJson, '--json'],
      60000,
      { env: isolatedEnv },
    );
    const addOnce = await runner.runJsonNodeScript(
      scheduleScript,
      ['add', '--name', 'ui-once', '--schedule-type', 'once', '--run-at', runAt, '--max-runs', '1', '--argv-json', argvJson, '--json'],
      60000,
      { env: isolatedEnv },
    );
    const addDaily = await runner.runJsonNodeScript(
      scheduleScript,
      ['add', '--name', 'ui-daily', '--schedule-type', 'daily', '--run-at', runAt, '--max-runs', '3', '--argv-json', argvJson, '--json'],
      60000,
      { env: isolatedEnv },
    );
    const addWeekly = await runner.runJsonNodeScript(
      scheduleScript,
      ['add', '--name', 'ui-weekly', '--schedule-type', 'weekly', '--run-at', runAt, '--max-runs', '4', '--argv-json', argvJson, '--json'],
      60000,
      { env: isolatedEnv },
    );
    const taskIds = [
      String(addInterval?.task?.id || '').trim(),
      String(addOnce?.task?.id || '').trim(),
      String(addDaily?.task?.id || '').trim(),
      String(addWeekly?.task?.id || '').trim(),
    ].filter(Boolean);
    runner.ensure(taskIds.length === 4, 'schedule add did not create all 4 tasks');

    const listTasks = await runner.runJsonNodeScript(scheduleScript, ['list', '--json'], 30000, { env: isolatedEnv });
    runner.ensure(Number(listTasks?.count || 0) >= 4, 'schedule list count < 4');

    const firstTaskId = taskIds[0];
    const getTask = await runner.runJsonNodeScript(scheduleScript, ['get', firstTaskId, '--json'], 30000, { env: isolatedEnv });
    runner.ensure(String(getTask?.task?.id || '') === firstTaskId, 'schedule get did not return target task');

    const updateTask = await runner.runJsonNodeScript(
      scheduleScript,
      ['update', firstTaskId, '--name', 'ui-interval-updated', '--enabled', 'true', '--schedule-type', 'interval', '--interval-minutes', '10', '--max-runs', '5', '--argv-json', argvJson, '--json'],
      60000,
      { env: isolatedEnv },
    );
    runner.ensure(updateTask?.ok === true, 'schedule update failed');

    const exportAll = await runner.runJsonNodeScript(scheduleScript, ['export', '--json'], 30000, { env: isolatedEnv });
    runner.ensure(Array.isArray(exportAll?.tasks) && exportAll.tasks.length >= 4, 'schedule export returned no tasks');

    const importMerge = await runner.runJsonNodeScript(
      scheduleScript,
      ['import', '--payload-json', JSON.stringify(exportAll), '--mode', 'merge', '--json'],
      60000,
      { env: isolatedEnv },
    );
    runner.ensure(importMerge?.ok === true, 'schedule import merge failed');

    const runDue = await runner.runJsonNodeScript(scheduleScript, ['run-due', '--limit', '20', '--json'], 120000, { env: isolatedEnv });
    runner.ensure(runDue?.ok === true, 'schedule run-due failed');

    const daemonOnce = await runner.runJsonNodeScript(
      scheduleScript,
      ['daemon', '--interval-sec', '5', '--limit', '20', '--once', '--json'],
      120000,
      { env: isolatedEnv },
    );
    runner.ensure(daemonOnce?.ok === true, 'schedule daemon --once failed');

    for (const taskId of taskIds) {
      const del = await runner.runJsonNodeScript(scheduleScript, ['delete', taskId, '--json'], 30000, { env: isolatedEnv });
      runner.ensure(del?.ok === true, `schedule delete failed: ${taskId}`);
    }

    runner.log('Step 4/4: real state/status coverage via unified API + xhs-status', 'info');
    unifiedServer = await runner.ensureUnifiedServer();
    const runId = `ui-full-${Date.now()}`;
    runIds.push(runId);

    const createRes = await fetch('http://127.0.0.1:7701/api/v1/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        runId,
        profileId: 'ui-cover-profile',
        keyword: runner.keyword,
        phase: 'unified',
        status: 'starting',
        progress: { total: 100, processed: 0, failed: 0 },
      }),
    });
    runner.ensure(createRes.ok, 'POST /api/v1/tasks failed');

    const updateRes = await fetch(`http://127.0.0.1:7701/api/v1/tasks/${encodeURIComponent(runId)}/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'running',
        progress: { total: 100, processed: 40, failed: 1 },
        stats: { notesProcessed: 40, commentsCollected: 88, likesPerformed: 3, repliesGenerated: 0, imagesDownloaded: 0, ocrProcessed: 0 },
      }),
    });
    runner.ensure(updateRes.ok, 'POST /api/v1/tasks/<runId>/update failed');

    const eventRes = await fetch(`http://127.0.0.1:7701/api/v1/tasks/${encodeURIComponent(runId)}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'autoscript:operation_error',
        data: { runId, message: 'ui_full_cover_simulated_error', ts: new Date().toISOString() },
      }),
    });
    runner.ensure(eventRes.ok, 'POST /api/v1/tasks/<runId>/events failed');

    const statusJson = await runner.runJsonNodeScript(
      xhsStatusScript,
      ['--run-id', runId, '--json'],
      30000,
    );
    runner.ensure(statusJson?.ok === true, 'xhs-status returned non-ok');
    runner.ensure(Number(statusJson?.summary?.totals?.total || 0) >= 1, 'xhs-status total tasks is 0');
    runner.ensure(String(statusJson?.detail?.runId || '') === runId, 'xhs-status detail runId mismatch');
    runner.ensure((statusJson?.detail?.errorEvents || []).length >= 1, 'xhs-status errorEvents not populated');

    runner.log('Full-cover real test PASSED', 'success');
    return {
      passed: true,
      portableRoot,
      runIds,
      covered: {
        account: true,
        scheduler: true,
        state: true,
      },
    };
  } catch (err) {
    runner.log(`FAILED: ${err.message}`, 'fail');
    return { passed: false, error: err.message, portableRoot, runIds };
  } finally {
    for (const rid of runIds) {
      try {
        await fetch(`http://127.0.0.1:7701/api/v1/tasks/${encodeURIComponent(rid)}`, {
          method: 'DELETE',
        });
      } catch {}
    }
    if (unifiedServer?.owned && unifiedServer?.child) {
      try { unifiedServer.child.kill('SIGTERM'); } catch {}
    }
    try { rmSync(portableRoot, { recursive: true, force: true }); } catch {}
  }
}
