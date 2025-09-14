// Base classes and interfaces
export { WeiboTaskExecutor, WeiboTaskConfig, WeiboTaskResult } from './WeiboTaskExecutor';

// Task implementations
export { 
  WeiboUserHomepageTask, 
  WeiboUserHomepageConfig, 
  WeiboUserHomepageResult 
} from './WeiboUserHomepageTask';

export { 
  WeiboPersonalHomepageTask, 
  WeiboPersonalHomepageConfig, 
  WeiboPersonalHomepageResult 
} from './WeiboPersonalHomepageTask';

export { 
  WeiboSearchResultsTask, 
  WeiboSearchResultsConfig, 
  WeiboSearchResultsResult 
} from './WeiboSearchResultsTask';

// Orchestrator
export { 
  WeiboTaskOrchestrator, 
  WeiboTaskOrchestratorConfig,
  TaskChainConfig,
  TaskExecutionMode,
  OrchestratorEventType,
  OrchestratorEvent
} from './WeiboTaskOrchestrator';

// Factory functions
export function createUserHomepageTask(config: WeiboUserHomepageConfig): WeiboUserHomepageTask {
  return new WeiboUserHomepageTask(config);
}

export function createPersonalHomepageTask(config: WeiboPersonalHomepageConfig): WeiboPersonalHomepageTask {
  return new WeiboPersonalHomepageTask(config);
}

export function createSearchResultsTask(config: WeiboSearchResultsConfig): WeiboSearchResultsTask {
  return new WeiboSearchResultsTask(config);
}

export function createTaskOrchestrator(config: WeiboTaskOrchestratorConfig): WeiboTaskOrchestrator {
  return new WeiboTaskOrchestrator(config);
}

// Default configurations
export const DEFAULT_WEIBO_TASK_CONFIG = {
  maxRetries: 3,
  retryDelay: 5000,
  timeout: 300000,
  enabled: true
};

export const DEFAULT_ORCHESTRATOR_CONFIG = {
  maxConcurrentTasks: 3,
  globalTimeout: 3600000,
  enableTaskChaining: true,
  enableRetryOnError: true,
  enableNotifications: true,
  logLevel: 'info' as const,
  taskScheduling: {
    enableScheduler: false,
    scheduleInterval: 60000,
    maxTasksPerInterval: 10
  }
};

// Utility types
export type AnyWeiboTask = 
  | WeiboUserHomepageTask 
  | WeiboPersonalHomepageTask 
  | WeiboSearchResultsTask;

export type AnyWeiboTaskConfig = 
  | WeiboUserHomepageConfig 
  | WeiboPersonalHomepageConfig 
  | WeiboSearchResultsConfig;

export type AnyWeiboTaskResult = 
  | WeiboUserHomepageResult 
  | WeiboPersonalHomepageResult 
  | WeiboSearchResultsResult;

// Version
export const PACKAGE_VERSION = '1.0.0';