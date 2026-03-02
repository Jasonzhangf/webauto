import { registerAiHandlers } from './ipc/ai.mts';
import { registerEnvHandlers } from './ipc/env.mts';
import { registerRuntimeHandlers } from './ipc/runtime.mts';
import { registerTaskHandlers } from './ipc/tasks.mts';
import { registerSettingsHandlers } from './ipc/settings.mts';
import { registerUiHandlers } from './ipc/ui.mts';
import { registerFileHandlers } from './ipc/files-handlers.mts';
import type { CrawlConfig } from '../desktop-settings.mts';
import type { ProfileStore } from '../profile-store.mts';
import type { RunJsonSpec, SpawnSpec } from './types.mts';

export type IpcDeps = {
  appQuit: () => void;
  appRoot: string;
  repoRoot: string;
  versionInfo: any;
  getWin: () => any;
  readDesktopConsoleSettings: (input: { appRoot: string; repoRoot: string }) => Promise<any>;
  writeDesktopConsoleSettings: (input: { appRoot: string; repoRoot: string }, next: any) => Promise<any>;
  saveCrawlConfig: (input: { appRoot: string; repoRoot: string }, config: CrawlConfig) => Promise<void>;
  loadCrawlConfig: (input: { appRoot: string; repoRoot: string }) => Promise<CrawlConfig>;
  exportConfigToFile: (filePath: string, config: CrawlConfig) => Promise<any>;
  importConfigFromFile: (filePath: string) => Promise<any>;
  resolveDefaultDownloadRoot: () => string;
  profileStore: ProfileStore;
  checkCamoCli: () => Promise<any>;
  checkServices: () => Promise<any>;
  checkFirefox: () => Promise<any>;
  checkGeoIP: () => Promise<any>;
  checkEnvironment: () => Promise<any>;
  startCoreDaemon: () => Promise<boolean>;
  stopCoreDaemon: () => Promise<void>;
  cleanupRuntimeEnvironment: (reason: string, options: {
    stopUiBridge?: boolean;
    stopHeartbeat?: boolean;
    stopCoreServices?: boolean;
    stopStateBridge?: boolean;
    includeLockCleanup?: boolean;
  }) => Promise<void>;
  scheduleInvoke: (ctx: { repoRoot: string; runJson: (spec: RunJsonSpec) => Promise<any>; spawnCommand: (spec: SpawnSpec) => Promise<any> }, input: any) => Promise<any>;
  runEphemeralTask: (ctx: { repoRoot: string; runJson: (spec: RunJsonSpec) => Promise<any>; spawnCommand: (spec: SpawnSpec) => Promise<any> }, input: any) => Promise<any>;
  runJson: (spec: RunJsonSpec) => Promise<any>;
  spawnCommand: (spec: SpawnSpec) => Promise<any>;
  terminateRunProcess: (runId: string, reason?: string) => boolean;
  markUiHeartbeat: (source?: string) => any;
  appendRunLog: (runId: string, line: string) => void;
  listUnifiedTasks: () => Promise<any[]>;
  waitForUnifiedRunRegistration: (input: {
    desktopRunId: string;
    profileId: string;
    keyword: string;
    uiTriggerId?: string;
    baselineRunIds?: Set<string>;
    timeoutMs?: number;
    timeoutMultiplier?: number;
  }) => Promise<{ ok: boolean; runId?: string; error?: string }>;
  xhsScriptsRoot: string;
  xhsFullCollectRe: RegExp;
};

export function registerIpcHandlers(deps: IpcDeps) {
  registerUiHandlers(deps);
  registerSettingsHandlers(deps);
  registerAiHandlers();
  registerTaskHandlers(deps);
  registerFileHandlers(deps);
  registerEnvHandlers(deps);
  registerRuntimeHandlers(deps);
}
