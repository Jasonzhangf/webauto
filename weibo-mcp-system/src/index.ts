// Minimal Weibo MCP System Core Exports

// Core interfaces and types
export * from './interfaces/core';

// Core system components  
export { SystemStateCenter } from './core/system-state-center';

// Container system
export { BaseContainer } from './containers/base-container';

// Operation system
export { BaseOperation } from './operations/base-operation';

// Version information
export const WEIBO_CONTAINER_OS_VERSION = '2.0.0';

// System information
export const SYSTEM_INFO = {
  name: 'Weibo Container OS',
  version: WEIBO_CONTAINER_OS_VERSION,
  description: '基于容器架构的微博自动化操作系统'
};

// Default configuration
export const DEFAULT_CONFIG = {
  debug: false,
  enableMetrics: true,
  enableHealthMonitoring: true,
  autoDiscover: true,
  maxRetries: 3,
  timeout: 30000,
  healthCheckInterval: 30000,
  enableInternalTraversal: true
};