// Atomic Operations System Core Exports

// Core system components  
export { SystemStateCenter } from './core/system-state-center';

// Atomic operations system
export { createAtomicOperationEngine } from './operations/core/atomic-operation-engine';
export { createAtomicOperationLibrary } from './operations/core/atomic-operation-library';
export { AtomicOperationEngine } from './operations/core/atomic-operation-engine';

// Weibo data models
export * from './operations/weibo/weibo-data-models';
export * from './operations/weibo/weibo-page-types';

// System information
export const WEIBO_ATOMIC_SYSTEM_VERSION = '1.0.0';

export const SYSTEM_INFO = {
  name: 'Weibo Atomic Operations System',
  version: WEIBO_ATOMIC_SYSTEM_VERSION,
  description: '基于原子操作的微博自动化系统'
};

// Default configuration
export const DEFAULT_CONFIG = {
  debug: false,
  enableMetrics: true,
  enableHealthMonitoring: true,
  autoDiscover: true,
  maxRetries: 3,
  timeout: 30000,
  healthCheckInterval: 30000
};