import electron from 'electron';
const { app, BrowserWindow } = electron;



import { APP_ROOT, REPO_ROOT, XHS_SCRIPTS_ROOT, XHS_FULL_COLLECT_RE } from './index/paths.mts';
import { resolveVersionInfo } from './index/version.mts';
import { cleanupAllBrowserProcesses } from './index/process-cleanup.mts';
import { appendDesktopLifecycle, appendRunLog } from './index/lifecycle.mts';
import { createDaemonWorkerController } from './index/daemon-worker-control.mts';
import { startCoreServiceHeartbeat, stopCoreServiceHeartbeat } from './index/heartbeat.mts';
import { createRunManager, cleanupTrackedRunPidsBestEffort, getRunCount, getTrackedRunPidCount, listRunIds } from './index/runtime.mts';
import type { CmdEvent, RunJsonSpec, SpawnSpec } from './index/types.mts';
import { listUnifiedTasks, waitForUnifiedRunRegistration } from './index/unified-tasks.mts';
import { registerIpcHandlers } from './index/ipc-handlers.mts';
import { configureElectronPaths } from './index/electron-paths.mts';
import { createMainWindow } from './index/window.mts';
import { cleanupCamoSessionsBestEffort } from './index/camo-cleanup.mts';

import { readDesktopConsoleSettings, resolveDefaultDownloadRoot, writeDesktopConsoleSettings, saveCrawlConfig, loadCrawlConfig, exportConfigToFile, importConfigFromFile, type CrawlConfig } from './desktop-settings.mts';
import type { DesktopConsoleSettings } from './desktop-settings.mts';
import { startCoreDaemon, stopCoreDaemon } from './core-daemon-manager.mts';
import { createProfileStore } from './profile-store.mts';
import { decideWatchdogAction, resolveUiHeartbeatTimeoutMs } from './heartbeat-watchdog.mts';

type UiSettings = DesktopConsoleSettings;
import { stateBridge } from './state-bridge.mts';
import { checkCamoCli, checkServices, checkFirefox, checkGeoIP, checkEnvironment } from './env-check.mts';
import { UiCliBridge } from './ui-cli-bridge.mts';
import { runEphemeralTask, scheduleInvoke } from './task-gateway.mts';
const VERSION_INFO = resolveVersionInfo();
const profileStore = createProfileStore({ repoRoot: REPO_ROOT });

const APP_EXIT_CLEANUP_WAIT_MS = (() => {
  const value = Number(process.env.WEBAUTO_APP_EXIT_CLEANUP_WAIT_MS || 45_000);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 45_000;
})();
const CAMO_CLEANUP_TIMEOUT_MS = (() => {
  const value = Number(process.env.WEBAUTO_CAMO_CLEANUP_TIMEOUT_MS || 20_000);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 20_000;
})();
let appExitCleanupPromise: Promise<void> | null = null;
let appExitDrainPromise: Promise<void> | null = null;
let appExitCleanupCompleted = false;
let appExitReasonHint = 'before_quit';

const UI_HEARTBEAT_TIMEOUT_MS = resolveUiHeartbeatTimeoutMs(process.env);
let lastUiHeartbeatAt = Date.now();
let heartbeatWatchdog: NodeJS.Timeout | null = null;
let heartbeatTimeoutHandled = false;
let coreServicesStopRequested = false;
let restartRequested = false;
const daemonWorkerController = createDaemonWorkerController();
let runManager: ReturnType<typeof createRunManager> | null = null;

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function startDaemonWorkerHeartbeat() {
  daemonWorkerController.startDaemonWorkerHeartbeat((hint) => waitForAppExitCleanup(hint, { stopStateBridge: true }).catch(() => null));
}

function stopDaemonWorkerHeartbeat(reason = 'stop') {
  daemonWorkerController.stopDaemonWorkerHeartbeat(reason);
}

function resolveExitReasonHint() {
  const daemonHint = daemonWorkerController.getExitReason();
  if (daemonHint && daemonHint !== 'before_quit') return daemonHint;
  return appExitReasonHint;
}

let stateBridgeStarted = false;
function ensureStateBridge() {
  if (stateBridgeStarted) return;
  const w = getWin();
  if (w) { stateBridge.start(w); stateBridgeStarted = true; }
}

let win: BrowserWindow | null = null;
const uiCliBridge = new UiCliBridge({
  getWindow: getWin,
  onRestart: ({ reason }) => requestAppRestart(reason),
});

configureElectronPaths();

registerIpcHandlers({
  appQuit: () => app.quit(),
  appRoot: APP_ROOT,
  repoRoot: REPO_ROOT,
  versionInfo: VERSION_INFO,
  getWin,
  readDesktopConsoleSettings,
  writeDesktopConsoleSettings,
  saveCrawlConfig,
  loadCrawlConfig,
  exportConfigToFile,
  importConfigFromFile,
  resolveDefaultDownloadRoot,
  profileStore,
  checkCamoCli,
  checkServices,
  checkFirefox,
  checkGeoIP,
  checkEnvironment,
  startCoreDaemon,
  stopCoreDaemon,
  cleanupRuntimeEnvironment,
  scheduleInvoke,
  runEphemeralTask,
  runJson: (spec) => ensureRunManager().runJson(spec),
  spawnCommand: (spec) => ensureRunManager().spawnCommand(spec),
  terminateRunProcess: (runId, reason) => terminateRunProcess(runId, reason || 'manual'),
  markUiHeartbeat,
  appendRunLog,
  listUnifiedTasks,
  waitForUnifiedRunRegistration,
  xhsScriptsRoot: XHS_SCRIPTS_ROOT,
  xhsFullCollectRe: XHS_FULL_COLLECT_RE,
});

const singleInstanceLock = app.requestSingleInstanceLock();
if (!singleInstanceLock) {
  void appendDesktopLifecycle('single_instance_lock_failed');
  app.quit();
}

function getWin() {
  if (!win || win.isDestroyed()) return null;
  return win;
}

function requestAppRestart(reason = 'ui_cli') {
  const normalizedReason = String(reason || '').trim() || 'ui_cli';
  if (restartRequested) {
    return { accepted: false, reason: normalizedReason };
  }
  restartRequested = true;
  void appendDesktopLifecycle('restart_requested', { reason: normalizedReason });
  console.warn(`[desktop-console] restart requested: ${normalizedReason}`);
  appExitReasonHint = `restart:${normalizedReason}`;
  const w = getWin();
  if (w) {
    try {
      w.webContents.send('app:restart-requested', {
        reason: normalizedReason,
        ts: new Date().toISOString(),
      });
    } catch {
      // ignore renderer notify errors
    }
  }
  setTimeout(() => {
    try {
      app.relaunch();
    } catch (err) {
      restartRequested = false;
      console.error('[desktop-console] relaunch failed', err);
      return;
    }
    app.quit();
  }, 25);
  return { accepted: true, reason: normalizedReason };
}

if (singleInstanceLock) {
  app.on('second-instance', () => {
    const w = getWin();
    if (w) {
      if (w.isMinimized()) w.restore();
      w.focus();
      return;
    }
    if (app.isReady()) {
      createWindow();
    } else {
      app.whenReady().then(() => createWindow());
    }
  });
}

function isUiOperational() {
  const w = getWin();
  if (!w) return false;
  const wc = w.webContents;
  if (!wc || wc.isDestroyed()) return false;
  if (typeof wc.isCrashed === 'function' && wc.isCrashed()) return false;
  return true;
}

function sendEvent(evt: CmdEvent) {
  if (!win || win.isDestroyed()) return;
  win.webContents.send('cmd:event', evt);
}

function markUiHeartbeat(source = 'renderer') {
  lastUiHeartbeatAt = Date.now();
  heartbeatTimeoutHandled = false;
  return { ok: true, ts: new Date(lastUiHeartbeatAt).toISOString(), source };
}

function ensureRunManager() {
  if (!runManager) {
    runManager = createRunManager(REPO_ROOT, sendEvent);
  }
  return runManager;
}

function terminateRunProcess(runId: string, reason = 'manual') {
  return ensureRunManager().terminateRunProcess(runId, reason);
}

async function stopCoreServicesBestEffort(reason: string) {
  if (coreServicesStopRequested) return;
  coreServicesStopRequested = true;
  try {
    await stopCoreDaemon();
  } catch (err) {
    console.warn(`[desktop-console] core-daemon stop failed (${reason})`, err);
  }
}

function killAllRuns(reason = 'ui_heartbeat_timeout') {
  for (const runId of listRunIds()) {
    terminateRunProcess(runId, reason);
  }
  if (reason === 'ui_heartbeat_timeout') {
    void stopCoreServicesBestEffort(reason);
  }
}

type CleanupOptions = {
  stopUiBridge?: boolean;
  stopHeartbeat?: boolean;
  stopCoreServices?: boolean;
  stopStateBridge?: boolean;
  includeLockCleanup?: boolean;
};

async function cleanupRuntimeEnvironment(reason: string, options: CleanupOptions = {}) {
  stopDaemonWorkerHeartbeat(reason);
  killAllRuns(reason);
  await cleanupTrackedRunPidsBestEffort(reason);
  await cleanupCamoSessionsBestEffort({
    repoRoot: REPO_ROOT,
    runJson: (spec) => ensureRunManager().runJson(spec),
    timeoutMs: CAMO_CLEANUP_TIMEOUT_MS,
    reason,
    includeLocks: options.includeLockCleanup !== false,
  });
  
  // Cleanup all tracked browser processes
  cleanupAllBrowserProcesses(reason);

  if (options.stopUiBridge) {
    await uiCliBridge.stop().catch(() => null);
  }
  if (options.stopHeartbeat) {
    stopCoreServiceHeartbeat();
  }
  if (heartbeatWatchdog) {
    clearInterval(heartbeatWatchdog);
    heartbeatWatchdog = null;
  }
  if (options.stopCoreServices) {
    await stopCoreServicesBestEffort(reason);
  }
  if (options.stopStateBridge) {
    stateBridge.stop();
  }
}

async function resetRuntimeForStartup() {
  await appendDesktopLifecycle('startup_runtime_reset_start');
  try {
    await cleanupRuntimeEnvironment('startup_runtime_reset', {
      stopUiBridge: false,
      stopHeartbeat: false,
      stopCoreServices: true,
      stopStateBridge: false,
      includeLockCleanup: true,
    });
    // Startup reset may stop daemon; allow normal shutdown cleanup to run again later in this process.
    coreServicesStopRequested = false;
    await appendDesktopLifecycle('startup_runtime_reset_done');
  } catch (err: any) {
    await appendDesktopLifecycle('startup_runtime_reset_failed', {
      error: err?.message || String(err),
    });
    throw err;
  }
}

function ensureAppExitCleanup(reason: string, options: CleanupOptions = {}) {
  if (appExitCleanupPromise) return appExitCleanupPromise;
  appExitCleanupPromise = cleanupRuntimeEnvironment(reason, {
    stopUiBridge: true,
    stopHeartbeat: true,
    stopCoreServices: true,
    stopStateBridge: options.stopStateBridge === true,
    includeLockCleanup: true,
  }).finally(() => {
    appExitCleanupPromise = null;
  });
  return appExitCleanupPromise;
}

function waitForAppExitCleanup(reason: string, options: CleanupOptions = {}) {
  const normalizedReason = String(reason || '').trim() || resolveExitReasonHint() || 'before_quit';
  appExitReasonHint = normalizedReason;
  if (appExitDrainPromise) return appExitDrainPromise;

  appExitDrainPromise = (async () => {
    const startedAt = Date.now();
    let timedOut = false;
    await appendDesktopLifecycle('app_exit_cleanup_start', {
      reason: normalizedReason,
      waitMs: APP_EXIT_CLEANUP_WAIT_MS,
    });
    try {
      await Promise.race([
        ensureAppExitCleanup(normalizedReason, options),
        sleep(APP_EXIT_CLEANUP_WAIT_MS).then(() => {
          timedOut = true;
        }),
      ]);
      if (timedOut) {
        console.warn(`[desktop-console] app exit cleanup timeout after ${APP_EXIT_CLEANUP_WAIT_MS}ms (${normalizedReason})`);
        await appendDesktopLifecycle('app_exit_cleanup_timeout', {
          reason: normalizedReason,
          waitMs: APP_EXIT_CLEANUP_WAIT_MS,
        });
      } else {
        const remainingRuns = getRunCount();
        const remainingRunPids = getTrackedRunPidCount();
        if (remainingRuns > 0 || remainingRunPids > 0) {
          console.warn(
            `[desktop-console] app exit cleanup completed with residual state (${normalizedReason}): runs=${remainingRuns}, pids=${remainingRunPids}`,
          );
        }
        await appendDesktopLifecycle('app_exit_cleanup_done', {
          reason: normalizedReason,
          elapsedMs: Date.now() - startedAt,
          remainingRuns,
          remainingRunPids,
        });
      }
    } catch (err: any) {
      console.warn(`[desktop-console] app exit cleanup failed (${normalizedReason})`, err);
      await appendDesktopLifecycle('app_exit_cleanup_failed', {
        reason: normalizedReason,
        error: err?.message || String(err),
      });
    } finally {
      appExitCleanupCompleted = true;
    }
  })().finally(() => {
    appExitDrainPromise = null;
  });
  return appExitDrainPromise;
}

function ensureHeartbeatWatchdog() {
  if (heartbeatWatchdog) return;
  heartbeatWatchdog = setInterval(() => {
    const staleMs = Date.now() - lastUiHeartbeatAt;
    const decision = decideWatchdogAction({
      staleMs,
      timeoutMs: UI_HEARTBEAT_TIMEOUT_MS,
      alreadyHandled: heartbeatTimeoutHandled,
      runCount: getRunCount(),
      uiOperational: isUiOperational(),
    });
    heartbeatTimeoutHandled = decision.nextHandled;

    if (decision.action === 'none') {
      if (decision.reason === 'stale_ui_alive') {
        console.warn(
          `[desktop-heartbeat] stale ${staleMs}ms > ${UI_HEARTBEAT_TIMEOUT_MS}ms, UI still alive, skip kill (likely timer throttling)`,
        );
      }
      return;
    }

    if (decision.action === 'kill_runs') {
      console.warn(`[desktop-heartbeat] stale ${staleMs}ms > ${UI_HEARTBEAT_TIMEOUT_MS}ms, killing ${getRunCount()} run(s)`);
      killAllRuns('ui_heartbeat_timeout');
      return;
    }

    console.warn(`[desktop-heartbeat] stale ${staleMs}ms > ${UI_HEARTBEAT_TIMEOUT_MS}ms, stopping core services`);
    void stopCoreServicesBestEffort('heartbeat_stop_only');
  }, 5_000);
  heartbeatWatchdog.unref();
}

function createWindow() {
  win = createMainWindow({
    versionInfo: VERSION_INFO,
    ensureStateBridge,
  });
}

app.on('window-all-closed', () => {
  void appendDesktopLifecycle('window_all_closed');
  appExitReasonHint = 'window_closed';
  // macOS 下关闭窗口后也退出应用，避免命令行挂起
  app.quit();
});

// 确保窗口关闭时命令行能退出
app.on('before-quit', (event) => {
  void appendDesktopLifecycle('before_quit');
  if (appExitCleanupCompleted) return;
  event.preventDefault();
  const reason = appExitReasonHint || (restartRequested ? 'restart_requested' : 'before_quit');
  void waitForAppExitCleanup(reason, { stopStateBridge: true })
    .catch(() => null)
    .finally(() => {
      app.quit();
    });
});

app.on('will-quit', () => {
  void appendDesktopLifecycle('will_quit');
});

app.on('quit', (_evt, exitCode) => {
  void appendDesktopLifecycle('quit', { exitCode });
});

process.on('exit', (code) => {
  stopDaemonWorkerHeartbeat(`process_exit_${code}`);
  void appendDesktopLifecycle('process_exit', { code });
});

app.whenReady().then(async () => {
  void appendDesktopLifecycle('app_ready');
  try {
    await resetRuntimeForStartup();
  } catch (err) {
    console.error('[desktop-console] startup runtime reset failed', err);
    await ensureAppExitCleanup('startup_runtime_reset_failed', { stopStateBridge: true }).catch(() => null);
    app.exit(1);
    return;
  }
  const started = await startCoreDaemon().catch((err) => {
    console.error('[desktop-console] core services startup failed', err);
    return false;
  });
  if (!started) {
    console.error('[desktop-console] core services are not healthy at startup; exiting');
    await ensureAppExitCleanup('core_startup_failed', { stopStateBridge: true }).catch(() => null);
    app.exit(1);
    return;
  }
  const startupServices = await checkServices().catch(() => ({ unifiedApi: false, camoRuntime: false }));
  void appendDesktopLifecycle('startup_self_check', {
    unifiedApi: Boolean(startupServices?.unifiedApi),
    camoRuntime: Boolean(startupServices?.camoRuntime),
  });
  if (!startupServices?.unifiedApi || !startupServices?.camoRuntime) {
    console.error('[desktop-console] startup self-check failed', startupServices);
    await ensureAppExitCleanup('startup_self_check_failed', { stopStateBridge: true }).catch(() => null);
    app.exit(1);
    return;
  }
  coreServicesStopRequested = false;
  startCoreServiceHeartbeat();
  startDaemonWorkerHeartbeat();
  markUiHeartbeat('main_ready');
  ensureHeartbeatWatchdog();
  createWindow();
  try {
    await uiCliBridge.start();
    void appendDesktopLifecycle('ui_cli_bridge_started');
  } catch (err) {
    void appendDesktopLifecycle('ui_cli_bridge_start_failed', {
      error: (err as any)?.message || String(err),
    });
    console.error('[desktop-console] ui-cli bridge start failed', err);
    await ensureAppExitCleanup('ui_cli_bridge_start_failed', { stopStateBridge: true }).catch(() => null);
    app.exit(1);
  }
}).catch(async (err) => {
  void appendDesktopLifecycle('app_startup_exception', {
    error: (err as any)?.message || String(err),
  });
  console.error('[desktop-console] fatal startup error', err);
  await ensureAppExitCleanup('startup_exception', { stopStateBridge: true }).catch(() => null);
  app.exit(1);
});
