/**
 * Worker Pool for managing concurrent task execution
 * Handles worker lifecycle, task distribution, and load balancing
 */

import EventEmitter from 'events';
import { Worker } from 'worker_threads';
import { cpus } from 'os';
import path from 'path';
import { Logger } from '../utils/Logger';
import {
  DaemonConfig,
  Task,
  TaskResult,
  Worker as WorkerInfo,
  WorkerStatus,
  TaskStatus
} from '../types';

interface WorkerMessage {
  type: 'task:started' | 'task:completed' | 'task:failed' | 'worker:ready' | 'worker:error';
  taskId?: string;
  result?: TaskResult;
  error?: any;
  workerId: string;
}

export class WorkerPool extends EventEmitter {
  private config: DaemonConfig;
  private logger: Logger;
  private workers: Map<string, WorkerInfo> = new Map();
  private workerThreads: Map<string, Worker> = new Map();
  private taskQueue: Task[] = [];
  private runningTasks: Map<string, string> = new Map(); // taskId -> workerId
  private isInitialized: boolean = false;
  private workerScriptPath: string;

  constructor(config: DaemonConfig) {
    super();
    this.config = config;
    this.logger = new Logger(config);
    this.workerScriptPath = path.join(__dirname, '../workers/TaskWorker.js');
  }

  /**
   * Initialize the worker pool
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      this.logger.info('Initializing worker pool', {
        maxWorkers: this.config.maxWorkers,
        workerScriptPath: this.workerScriptPath
      });

      // Create initial worker pool
      const workerCount = Math.min(
        this.config.maxWorkers,
        cpus().length
      );

      await this.createWorkers(workerCount);

      this.isInitialized = true;
      this.logger.info('Worker pool initialized', { workerCount });

    } catch (error) {
      this.logger.error('Failed to initialize worker pool', { error });
      throw error;
    }
  }

  /**
   * Queue a task for execution
   */
  async queueTask(task: Task): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Worker pool is not initialized');
    }

    // Validate task
    this.validateTask(task);

    // Update task status
    task.status = 'queued';
    task.updatedAt = new Date();

    // Add to queue
    this.taskQueue.push(task);

    this.logger.debug('Task queued', {
      taskId: task.id,
      priority: task.priority,
      queueLength: this.taskQueue.length
    });

    // Try to assign task immediately
    await this.assignTasks();
  }

  /**
   * Shutdown the worker pool gracefully
   */
  async shutdown(): Promise<void> {
    if (!this.isInitialized) {
      return;
    }

    this.logger.info('Shutting down worker pool...');

    try {
      // Wait for running tasks to complete
      await this.waitForRunningTasks();

      // Stop all workers
      await this.stopAllWorkers();

      // Clear queues
      this.taskQueue = [];
      this.runningTasks.clear();

      this.isInitialized = false;
      this.logger.info('Worker pool shutdown completed');

    } catch (error) {
      this.logger.error('Error during worker pool shutdown', { error });
      throw error;
    }
  }

  /**
   * Get current worker status
   */
  async getWorkerStatus(): Promise<{
    healthy: boolean;
    workers: WorkerInfo[];
    stats: {
      total: number;
      active: number;
      idle: number;
      offline: number;
    };
  }> {
    const workers = Array.from(this.workers.values());
    const stats = {
      total: workers.length,
      active: workers.filter(w => w.status === 'busy').length,
      idle: workers.filter(w => w.status === 'idle').length,
      offline: workers.filter(w => w.status === 'offline').length
    };

    const healthy = stats.offline === 0 && stats.total > 0;

    return {
      healthy,
      workers,
      stats
    };
  }

  /**
   * Get worker pool statistics
   */
  async getStats() {
    const workerStatus = await this.getWorkerStatus();

    return {
      ...workerStatus.stats,
      queueLength: this.taskQueue.length,
      runningTasks: this.runningTasks.size,
      totalTasksCompleted: Array.from(this.workers.values())
        .reduce((sum, w) => sum + w.completedTasks, 0),
      totalTasksFailed: Array.from(this.workers.values())
        .reduce((sum, w) => sum + w.failedTasks, 0),
      averageTaskTime: this.calculateAverageTaskTime()
    };
  }

  /**
   * Update configuration
   */
  async updateConfig(config: DaemonConfig): Promise<void> {
    this.logger.info('Updating worker pool configuration', { config });

    const oldConfig = this.config;
    this.config = config;

    // Adjust worker count if needed
    if (config.maxWorkers !== oldConfig.maxWorkers) {
      await this.adjustWorkerCount(config.maxWorkers);
    }
  }

  /**
   * Cancel a running task
   */
  async cancelTask(taskId: string): Promise<boolean> {
    const workerId = this.runningTasks.get(taskId);
    if (!workerId) {
      return false;
    }

    const worker = this.workerThreads.get(workerId);
    if (!worker) {
      return false;
    }

    try {
      // Send cancellation message to worker
      worker.postMessage({
        type: 'task:cancel',
        taskId
      });

      // Remove from running tasks
      this.runningTasks.delete(taskId);

      this.logger.info('Task cancelled', { taskId, workerId });
      return true;

    } catch (error) {
      this.logger.error('Failed to cancel task', { taskId, error });
      return false;
    }
  }

  /**
   * Create worker threads
   */
  private async createWorkers(count: number): Promise<void> {
    const createPromises = [];

    for (let i = 0; i < count; i++) {
      createPromises.push(this.createWorker());
    }

    await Promise.all(createPromises);
  }

  /**
   * Create a single worker thread
   */
  private async createWorker(): Promise<void> {
    const workerId = `worker_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

    try {
      const worker = new Worker(this.workerScriptPath, {
        workerData: {
          workerId,
          config: this.config
        }
      });

      // Set up worker communication
      worker.on('message', (message: WorkerMessage) => {
        this.handleWorkerMessage(workerId, message);
      });

      worker.on('error', (error) => {
        this.handleWorkerError(workerId, error);
      });

      worker.on('exit', (code) => {
        this.handleWorkerExit(workerId, code);
      });

      // Create worker info
      const workerInfo: WorkerInfo = {
        id: workerId,
        pid: worker.threadId,
        status: 'idle',
        startTime: new Date(),
        lastHeartbeat: new Date(),
        totalTasks: 0,
        completedTasks: 0,
        failedTasks: 0,
        memoryUsage: 0,
        cpuUsage: 0
      };

      this.workers.set(workerId, workerInfo);
      this.workerThreads.set(workerId, worker);

      this.logger.debug('Worker created', { workerId });

      // Wait for worker to be ready
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error(`Worker ${workerId} failed to start`));
        }, 30000);

        const readyHandler = (message: WorkerMessage) => {
          if (message.type === 'worker:ready' && message.workerId === workerId) {
            clearTimeout(timeout);
            resolve();
          }
        };

        worker.on('message', readyHandler);
      });

      this.emit('worker:started', workerInfo);

    } catch (error) {
      this.logger.error('Failed to create worker', { workerId, error });
      throw error;
    }
  }

  /**
   * Handle messages from workers
   */
  private handleWorkerMessage(workerId: string, message: WorkerMessage): void {
    const worker = this.workers.get(workerId);
    if (!worker) {
      this.logger.warn('Message from unknown worker', { workerId, message });
      return;
    }

    // Update worker heartbeat
    worker.lastHeartbeat = new Date();

    switch (message.type) {
      case 'worker:ready':
        worker.status = 'idle';
        this.assignTasks();
        break;

      case 'task:started':
        if (message.taskId) {
          this.handleTaskStarted(workerId, message.taskId);
        }
        break;

      case 'task:completed':
        if (message.result) {
          this.handleTaskCompleted(message.result);
        }
        break;

      case 'task:failed':
        if (message.result) {
          this.handleTaskFailed(message.result);
        }
        break;

      case 'worker:error':
        this.handleWorkerError(workerId, message.error);
        break;

      default:
        this.logger.warn('Unknown worker message type', { workerId, type: message.type });
    }
  }

  /**
   * Handle worker errors
   */
  private handleWorkerError(workerId: string, error: any): void {
    const worker = this.workers.get(workerId);
    if (!worker) {
      return;
    }

    this.logger.error('Worker error', { workerId, error });

    // Mark worker as offline
    worker.status = 'offline';

    // Handle running tasks
    const runningTaskIds = Array.from(this.runningTasks.entries())
      .filter(([_, wid]) => wid === workerId)
      .map(([taskId]) => taskId);

    for (const taskId of runningTaskIds) {
      this.runningTasks.delete(taskId);

      // Requeue failed tasks
      const task = this.taskQueue.find(t => t.id === taskId);
      if (task) {
        this.logger.warn('Requeuing task from failed worker', { taskId, workerId });
        this.taskQueue.push(task);
      }
    }

    this.emit('worker:error', { workerId, error });
  }

  /**
   * Handle worker exit
   */
  private handleWorkerExit(workerId: string, code: number): void {
    const worker = this.workers.get(workerId);
    if (!worker) {
      return;
    }

    this.logger.info('Worker exited', { workerId, code });

    // Clean up worker data
    this.workers.delete(workerId);
    this.workerThreads.delete(workerId);

    // Remove from running tasks
    const runningTaskIds = Array.from(this.runningTasks.entries())
      .filter(([_, wid]) => wid === workerId)
      .map(([taskId]) => taskId);

    for (const taskId of runningTaskIds) {
      this.runningTasks.delete(taskId);
    }

    this.emit('worker:stopped', { workerId, code });

    // Auto-restart worker if not shutting down
    if (this.isInitialized && code !== 0) {
      this.logger.info('Restarting crashed worker', { workerId, code });
      this.createWorker().catch(error => {
        this.logger.error('Failed to restart worker', { workerId, error });
      });
    }
  }

  /**
   * Handle task started event
   */
  private handleTaskStarted(workerId: string, taskId: string): void {
    const worker = this.workers.get(workerId);
    if (!worker) {
      return;
    }

    worker.status = 'busy';
    worker.totalTasks++;
    worker.lastHeartbeat = new Date();

    const task = this.taskQueue.find(t => t.id === taskId);
    if (task) {
      task.status = 'running';
      task.updatedAt = new Date();
      this.runningTasks.set(taskId, workerId);
    }

    this.logger.debug('Task started', { taskId, workerId });
    this.emit('task:started', task);
  }

  /**
   * Handle task completion
   */
  private handleTaskCompleted(result: TaskResult): void {
    const workerId = this.runningTasks.get(result.taskId);
    if (!workerId) {
      return;
    }

    const worker = this.workers.get(workerId);
    if (worker) {
      worker.status = 'idle';
      worker.completedTasks++;
      worker.lastHeartbeat = new Date();

      // Update worker metrics
      if (result.metrics) {
        worker.memoryUsage = result.metrics.memoryUsed;
        worker.cpuUsage = result.metrics.cpuUsed;
      }
    }

    // Remove from running tasks
    this.runningTasks.delete(result.taskId);

    // Remove from queue
    this.taskQueue = this.taskQueue.filter(t => t.id !== result.taskId);

    this.logger.debug('Task completed', { taskId: result.taskId, duration: result.duration });
    this.emit('task:completed', result);

    // Assign next task
    this.assignTasks();
  }

  /**
   * Handle task failure
   */
  private handleTaskFailed(result: TaskResult): void {
    const workerId = this.runningTasks.get(result.taskId);
    if (!workerId) {
      return;
    }

    const worker = this.workers.get(workerId);
    if (worker) {
      worker.status = 'idle';
      worker.failedTasks++;
      worker.lastHeartbeat = new Date();
    }

    // Remove from running tasks
    this.runningTasks.delete(result.taskId);

    // Handle retry logic
    const task = this.taskQueue.find(t => t.id === result.taskId);
    if (task && task.retryCount < task.maxRetries) {
      task.retryCount++;
      task.status = 'retrying';
      task.updatedAt = new Date();

      this.logger.info('Retrying task', {
        taskId: task.id,
        retryCount: task.retryCount,
        maxRetries: task.maxRetries
      });
    } else {
      // Remove from queue if max retries reached
      this.taskQueue = this.taskQueue.filter(t => t.id !== result.taskId);
    }

    this.logger.error('Task failed', {
      taskId: result.taskId,
      error: result.error,
      retryCount: task?.retryCount
    });
    this.emit('task:failed', result);

    // Assign next task
    this.assignTasks();
  }

  /**
   * Assign tasks to available workers
   */
  private async assignTasks(): Promise<void> {
    if (this.taskQueue.length === 0) {
      return;
    }

    // Sort tasks by priority and creation time
    const sortedTasks = [...this.taskQueue].sort((a, b) => {
      const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
      if (priorityDiff !== 0) {
        return priorityDiff;
      }
      return a.createdAt.getTime() - b.createdAt.getTime();
    });

    // Get available workers
    const availableWorkers = Array.from(this.workers.values())
      .filter(w => w.status === 'idle');

    // Assign tasks to workers
    for (const task of sortedTasks) {
      if (availableWorkers.length === 0) {
        break;
      }

      const worker = availableWorkers.shift()!;
      const workerThread = this.workerThreads.get(worker.id);

      if (workerThread) {
        try {
          workerThread.postMessage({
            type: 'task:execute',
            task
          });

          this.logger.debug('Task assigned to worker', {
            taskId: task.id,
            workerId: worker.id
          });

        } catch (error) {
          this.logger.error('Failed to assign task to worker', {
            taskId: task.id,
            workerId: worker.id,
            error
          });
        }
      }
    }
  }

  /**
   * Wait for running tasks to complete
   */
  private async waitForRunningTasks(): Promise<void> {
    const maxWaitTime = 60000; // 1 minute
    const startTime = Date.now();

    while (this.runningTasks.size > 0 && Date.now() - startTime < maxWaitTime) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    if (this.runningTasks.size > 0) {
      this.logger.warn('Some tasks did not complete during shutdown', {
        remainingTasks: this.runningTasks.size
      });
    }
  }

  /**
   * Stop all workers
   */
  private async stopAllWorkers(): Promise<void> {
    const stopPromises = Array.from(this.workerThreads.entries()).map(([workerId, worker]) => {
      return new Promise<void>((resolve) => {
        worker.once('exit', () => resolve());
        worker.postMessage({ type: 'worker:shutdown' });
      });
    });

    await Promise.all(stopPromises);
  }

  /**
   * Adjust worker count
   */
  private async adjustWorkerCount(newCount: number): Promise<void> {
    const currentCount = this.workers.size;

    if (newCount > currentCount) {
      // Add workers
      await this.createWorkers(newCount - currentCount);
    } else if (newCount < currentCount) {
      // Remove excess workers
      const workersToRemove = Array.from(this.workers.values())
        .filter(w => w.status === 'idle')
        .slice(0, currentCount - newCount);

      await Promise.all(
        workersToRemove.map(w => this.stopWorker(w.id))
      );
    }
  }

  /**
   * Stop a specific worker
   */
  private async stopWorker(workerId: string): Promise<void> {
    const worker = this.workerThreads.get(workerId);
    if (!worker) {
      return;
    }

    return new Promise<void>((resolve) => {
      worker.once('exit', () => {
        this.workers.delete(workerId);
        this.workerThreads.delete(workerId);
        resolve();
      });
      worker.postMessage({ type: 'worker:shutdown' });
    });
  }

  /**
   * Validate task before queuing
   */
  private validateTask(task: Task): void {
    if (!task.id) {
      throw new Error('Task must have an ID');
    }

    if (!task.name) {
      throw new Error('Task must have a name');
    }

    if (!task.operation) {
      throw new Error('Task must specify an operation');
    }

    if (task.timeout <= 0) {
      throw new Error('Task timeout must be positive');
    }
  }

  /**
   * Calculate average task time
   */
  private calculateAverageTaskTime(): number {
    const allWorkers = Array.from(this.workers.values());
    const totalTasks = allWorkers.reduce((sum, w) => sum + w.completedTasks, 0);

    if (totalTasks === 0) {
      return 0;
    }

    // This is a simplified calculation
    // In a real implementation, you'd track actual execution times
    return 5000; // 5 seconds average
  }
}