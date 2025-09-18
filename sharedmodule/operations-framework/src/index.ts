/**
 * Main entry point for the WebAuto Operations Framework
 * Exports the main daemon class and core interfaces
 */

import { Daemon } from './core/Daemon';
import { WorkerPool } from './core/WorkerPool';
import { Scheduler } from './core/Scheduler';
import { ResourceMonitor } from './core/ResourceMonitor';
import { CommunicationManager } from './core/CommunicationManager';
import { ConfigManager } from './core/ConfigManager';
import { Logger } from './utils/Logger';

// Export all types
export * from './types';

// Export core classes
export {
  Daemon,
  WorkerPool,
  Scheduler,
  ResourceMonitor,
  CommunicationManager,
  ConfigManager,
  Logger
};

// Export configuration helper
export { createDefaultConfig } from './config/default';

// Export utilities
export { TaskBuilder } from './utils/TaskBuilder';
export { ScheduleBuilder } from './utils/ScheduleBuilder';
export { HealthChecker } from './utils/HealthChecker';

// Framework version
export const FRAMEWORK_VERSION = '1.0.0';

/**
 * Create and initialize a new daemon instance
 */
export async function createDaemon(config?: Partial<DaemonConfig>): Promise<Daemon> {
  const defaultConfig = await import('./config/default').then(m => m.createDefaultConfig());
  const finalConfig = { ...defaultConfig, ...config };

  const daemon = new Daemon(finalConfig);
  await daemon.start();

  return daemon;
}

/**
 * Create daemon from configuration file
 */
export async function createDaemonFromFile(configPath: string): Promise<Daemon> {
  const fs = await import('fs');
  const path = await import('path');

  const absolutePath = path.resolve(configPath);
  const configData = fs.readFileSync(absolutePath, 'utf8');
  const config = JSON.parse(configData) as DaemonConfig;

  return createDaemon(config);
}