/**
 * Main daemon process for the WebAuto Operations Framework
 * Handles worker management, scheduling, and system coordination
 */

import EventEmitter from 'events';
import { WorkerPool } from './WorkerPool';
import { Scheduler } from './Scheduler';
import { ResourceMonitor } from './ResourceMonitor';
import { CommunicationManager } from './CommunicationManager';
import { ConfigManager } from './ConfigManager';
import { Logger } from '../utils/Logger';
import {
  DaemonConfig,
  Task,
  Worker,
  HealthStatus,
  DaemonEvent,
  ResourceMetrics
} from '../types';

export class Daemon extends EventEmitter {
  private config: DaemonConfig;
  private logger: Logger;
  private workerPool: WorkerPool;
  private scheduler: Scheduler;
  private resourceMonitor: ResourceMonitor;
  private communicationManager: CommunicationManager;
  private configManager: ConfigManager;
  private startTime: Date;
  private isRunning: boolean = false;
  private isShuttingDown: boolean = false;
  private healthCheckInterval?: NodeJS.Timeout;

  constructor(config: DaemonConfig) {
    super();
    this.config = config;
    this.startTime = new Date();
    this.logger = new Logger(config);

    // Initialize core components
    this.workerPool = new WorkerPool(config);
    this.scheduler = new Scheduler(config);
    this.resourceMonitor = new ResourceMonitor(config);
    this.communicationManager = new CommunicationManager(config);
    this.configManager = new ConfigManager(config);

    this.setupEventHandlers();
  }

  /**
   * Initialize and start the daemon
   */
  async start(): Promise<void> {
    try {
      this.logger.info('Starting WebAuto Operations Framework Daemon', {
        version: this.config.version,
        config: this.config
      });

      // Initialize components in order
      await this.configManager.initialize();
      await this.resourceMonitor.initialize();
      await this.workerPool.initialize();
      await this.communicationManager.initialize();
      await this.scheduler.initialize();

      // Start health checks
      this.startHealthChecks();

      // Set up signal handlers for graceful shutdown
      this.setupSignalHandlers();

      this.isRunning = true;
      this.emit('daemon:started', {
        timestamp: new Date(),
        uptime: Date.now() - this.startTime.getTime()
      });

      this.logger.info('Daemon started successfully');

    } catch (error) {
      this.logger.error('Failed to start daemon', { error });
      throw error;
    }
  }

  /**
   * Stop the daemon gracefully
   */
  async stop(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    this.logger.info('Initiating graceful shutdown...');

    try {
      // Stop accepting new tasks
      this.scheduler.stop();

      // Stop health checks
      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval);
      }

      // Gracefully shutdown workers
      await this.workerPool.shutdown();

      // Shutdown other components
      await this.communicationManager.shutdown();
      await this.resourceMonitor.shutdown();
      await this.configManager.shutdown();

      this.isRunning = false;
      this.emit('daemon:stopped', {
        timestamp: new Date(),
        uptime: Date.now() - this.startTime.getTime()
      });

      this.logger.info('Daemon stopped gracefully');

    } catch (error) {
      this.logger.error('Error during shutdown', { error });
      throw error;
    }
  }

  /**
   * Submit a new task for execution
   */
  async submitTask(task: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'status'>): Promise<string> {
    if (!this.isRunning) {
      throw new Error('Daemon is not running');
    }

    const fullTask: Task = {
      ...task,
      id: this.generateTaskId(),
      createdAt: new Date(),
      updatedAt: new Date(),
      status: 'pending'
    };

    this.logger.info('Task submitted', { taskId: fullTask.id, task: fullTask });

    // Emit event and queue task
    this.emit('task:submitted', fullTask);
    await this.workerPool.queueTask(fullTask);

    return fullTask.id;
  }

  /**
   * Get current system health status
   */
  async getHealthStatus(): Promise<HealthStatus> {
    const resourceMetrics = await this.resourceMonitor.getCurrentMetrics();
    const workerStatus = await this.workerPool.getWorkerStatus();
    const schedulerStatus = await this.scheduler.getStatus();

    const health: HealthStatus = {
      status: this.calculateOverallHealth(resourceMetrics, workerStatus, schedulerStatus),
      timestamp: new Date(),
      uptime: Date.now() - this.startTime.getTime(),
      version: this.config.version,
      components: {
        scheduler: schedulerStatus.healthy,
        workers: workerStatus.healthy,
        storage: true, // TODO: Implement storage health check
        communication: await this.communicationManager.isHealthy(),
        metrics: true
      },
      issues: [],
      metrics: resourceMetrics
    };

    return health;
  }

  /**
   * Get current resource metrics
   */
  async getResourceMetrics(): Promise<ResourceMetrics> {
    return await this.resourceMonitor.getCurrentMetrics();
  }

  /**
   * Update daemon configuration
   */
  async updateConfig(updates: Partial<DaemonConfig>): Promise<void> {
    this.logger.info('Updating daemon configuration', { updates });

    // Validate updates
    const newConfig = { ...this.config, ...updates };
    await this.configManager.validateConfig(newConfig);

    // Apply updates
    this.config = newConfig;

    // Notify components of config changes
    await this.workerPool.updateConfig(newConfig);
    await this.scheduler.updateConfig(newConfig);
    await this.resourceMonitor.updateConfig(newConfig);
    await this.communicationManager.updateConfig(newConfig);

    this.emit('config:updated', {
      timestamp: new Date(),
      oldConfig: this.config,
      newConfig
    });

    this.logger.info('Configuration updated successfully');
  }

  /**
   * Get current daemon statistics
   */
  async getStats() {
    const [workerStats, schedulerStats, resourceStats] = await Promise.all([
      this.workerPool.getStats(),
      this.scheduler.getStats(),
      this.resourceMonitor.getCurrentMetrics()
    ]);

    return {
      uptime: Date.now() - this.startTime.getTime(),
      version: this.config.version,
      isRunning: this.isRunning,
      workers: workerStats,
      scheduler: schedulerStats,
      resources: resourceStats
    };
  }

  /**
   * Setup event handlers between components
   */
  private setupEventHandlers(): void {
    // Worker pool events
    this.workerPool.on('worker:started', (worker: Worker) => {
      this.emit('worker:started', worker);
      this.logger.info('Worker started', { workerId: worker.id });
    });

    this.workerPool.on('worker:stopped', (worker: Worker) => {
      this.emit('worker:stopped', worker);
      this.logger.info('Worker stopped', { workerId: worker.id });
    });

    this.workerPool.on('task:started', (task: Task) => {
      this.emit('task:started', task);
      this.logger.info('Task started', { taskId: task.id });
    });

    this.workerPool.on('task:completed', (result) => {
      this.emit('task:completed', result);
      this.logger.info('Task completed', { taskId: result.taskId });
    });

    this.workerPool.on('task:failed', (result) => {
      this.emit('task:failed', result);
      this.logger.error('Task failed', { taskId: result.taskId, error: result.error });
    });

    // Scheduler events
    this.scheduler.on('schedule:triggered', (schedule) => {
      this.emit('schedule:triggered', schedule);
      this.logger.info('Schedule triggered', { scheduleId: schedule.id });
    });

    // Resource monitor events
    this.resourceMonitor.on('resource:warning', (warning) => {
      this.emit('resource:warning', warning);
      this.logger.warn('Resource warning', warning);
    });

    this.resourceMonitor.on('resource:critical', (critical) => {
      this.emit('resource:critical', critical);
      this.logger.error('Resource critical', critical);
    });

    // Communication manager events
    this.communicationManager.on('message:received', (message) => {
      this.handleIncomingMessage(message);
    });
  }

  /**
   * Setup signal handlers for graceful shutdown
   */
  private setupSignalHandlers(): void {
    const signals = ['SIGINT', 'SIGTERM', 'SIGQUIT'];

    signals.forEach(signal => {
      process.on(signal as NodeJS.Signals, async () => {
        this.logger.info(`Received ${signal}, initiating graceful shutdown...`);
        await this.stop();
        process.exit(0);
      });
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', async (error) => {
      this.logger.error('Uncaught exception', { error });
      await this.stop();
      process.exit(1);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', async (reason, promise) => {
      this.logger.error('Unhandled promise rejection', { reason, promise });
      await this.stop();
      process.exit(1);
    });
  }

  /**
   * Start periodic health checks
   */
  private startHealthChecks(): void {
    this.healthCheckInterval = setInterval(async () => {
      try {
        const health = await this.getHealthStatus();
        this.emit('health:check', health);

        // Log health status
        this.logger.debug('Health check completed', {
          status: health.status,
          issues: health.issues.length
        });

        // Handle critical health issues
        if (health.status === 'unhealthy') {
          this.logger.error('System health critical', { issues: health.issues });
          // Could implement auto-recovery here
        }

      } catch (error) {
        this.logger.error('Health check failed', { error });
      }
    }, this.config.healthCheckInterval);
  }

  /**
   * Handle incoming messages from communication manager
   */
  private handleIncomingMessage(message: any): void {
    this.logger.debug('Incoming message received', { message });

    switch (message.type) {
      case 'task:submit':
        this.submitTask(message.payload);
        break;
      case 'status:request':
        this.sendStatusUpdate(message.source);
        break;
      case 'config:update':
        this.updateConfig(message.payload);
        break;
      default:
        this.logger.warn('Unknown message type', { type: message.type });
    }
  }

  /**
   * Send status update to communication source
   */
  private async sendStatusUpdate(source: string): Promise<void> {
    try {
      const stats = await this.getStats();
      await this.communicationManager.send(source, {
        type: 'status:update',
        payload: stats,
        timestamp: new Date()
      });
    } catch (error) {
      this.logger.error('Failed to send status update', { error });
    }
  }

  /**
   * Calculate overall health status
   */
  private calculateOverallHealth(
    resources: ResourceMetrics,
    workers: { healthy: boolean },
    scheduler: { healthy: boolean }
  ): 'healthy' | 'degraded' | 'unhealthy' {

    // Check critical resources
    if (resources.memory.percentage > 90 || resources.cpu.usage > 90) {
      return 'unhealthy';
    }

    // Check component health
    const allComponentsHealthy = workers.healthy && scheduler.healthy;

    if (!allComponentsHealthy) {
      return 'unhealthy';
    }

    // Check resource warnings
    if (resources.memory.percentage > 80 || resources.cpu.usage > 80) {
      return 'degraded';
    }

    return 'healthy';
  }

  /**
   * Generate unique task ID
   */
  private generateTaskId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Check if daemon is running
   */
  isDaemonRunning(): boolean {
    return this.isRunning && !this.isShuttingDown;
  }
}