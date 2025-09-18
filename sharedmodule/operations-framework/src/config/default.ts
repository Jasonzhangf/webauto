/**
 * Default configuration for the WebAuto Operations Framework
 */

import { DaemonConfig } from '../types';
import * as path from 'path';
import * as os from 'os';

/**
 * Create default configuration with sensible defaults
 */
export function createDefaultConfig(): DaemonConfig {
  const homedir = os.homedir();
  const storagePath = path.join(homedir, '.webauto', 'operations-framework');

  return {
    name: 'WebAuto Operations Framework',
    version: '1.0.0',
    port: 8080,
    host: 'localhost',
    logLevel: 'info',
    maxWorkers: Math.max(1, os.cpus().length - 1),
    taskTimeout: 300000, // 5 minutes
    healthCheckInterval: 30000, // 30 seconds
    storagePath,
    enableMetrics: true,
    enableWebSocket: true
  };
}

/**
 * Development configuration
 */
export function createDevConfig(): DaemonConfig {
  return {
    ...createDefaultConfig(),
    name: 'WebAuto Operations Framework (Dev)',
    logLevel: 'debug',
    port: 8081,
    maxWorkers: 2,
    taskTimeout: 60000, // 1 minute
    healthCheckInterval: 10000, // 10 seconds
    storagePath: path.join(process.cwd(), '.webauto-dev')
  };
}

/**
 * Production configuration
 */
export function createProdConfig(): DaemonConfig {
  return {
    ...createDefaultConfig(),
    name: 'WebAuto Operations Framework (Prod)',
    logLevel: 'warn',
    maxWorkers: Math.max(2, os.cpus().length),
    taskTimeout: 600000, // 10 minutes
    healthCheckInterval: 60000, // 1 minute
    enableMetrics: true,
    enableWebSocket: false // Disable WebSocket in production by default
  };
}