/**
 * Individual worker process for executing tasks
 * Handles task execution, error handling, and communication with the main daemon
 */

import { parentPort, workerData } from 'worker_threads';
import { Task, TaskResult, TaskStatus, DaemonConfig } from '../types';
import { Logger } from '../utils/Logger';

if (!parentPort) {
  throw new Error('TaskWorker must be run as a worker thread');
}

class TaskWorker {
  private config: DaemonConfig;
  private logger: Logger;
  private workerId: string;
  private currentTask?: Task;
  private isReady: boolean = false;
  private isShuttingDown: boolean = false;

  constructor(workerId: string, config: DaemonConfig) {
    this.workerId = workerId;
    this.config = config;
    this.logger = new Logger({ ...config, defaultMeta: { workerId } });

    this.setupMessageHandlers();
  }

  /**
   * Initialize the worker
   */
  async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing task worker', { workerId: this.workerId });

      // Perform any initialization needed for task execution
      await this.initializeTaskEnvironment();

      this.isReady = true;
      this.sendReady();

      this.logger.info('Task worker initialized successfully');

    } catch (error) {
      this.logger.error('Failed to initialize task worker', { error });
      this.sendError('initialization_failed', error);
    }
  }

  /**
   * Execute a task
   */
  async executeTask(task: Task): Promise<void> {
    if (this.currentTask) {
      throw new Error('Worker is already executing a task');
    }

    this.currentTask = task;
    const startTime = Date.now();

    try {
      this.logger.info('Starting task execution', {
        taskId: task.id,
        operation: task.operation,
        category: task.category
      });

      // Update task status
      this.sendTaskStarted(task.id);

      // Validate task before execution
      this.validateTask(task);

      // Execute the task
      const result = await this.doExecuteTask(task);

      // Calculate execution time
      const duration = Date.now() - startTime;

      // Send success result
      this.sendTaskCompleted({
        taskId: task.id,
        success: true,
        data: result.data,
        duration,
        timestamp: new Date(),
        logs: result.logs || []
      });

      this.logger.info('Task completed successfully', {
        taskId: task.id,
        duration,
        dataSize: JSON.stringify(result.data).length
      });

    } catch (error) {
      const duration = Date.now() - startTime;

      this.logger.error('Task execution failed', {
        taskId: task.id,
        error,
        duration
      });

      // Send failure result
      this.sendTaskFailed({
        taskId: task.id,
        success: false,
        error: {
          message: error instanceof Error ? error.message : String(error),
          code: 'EXECUTION_ERROR',
          stack: error instanceof Error ? error.stack : undefined,
          details: {
            operation: task.operation,
            category: task.category,
            parameters: task.parameters
          }
        },
        duration,
        timestamp: new Date(),
        logs: []
      });
    } finally {
      this.currentTask = undefined;
    }
  }

  /**
   * Cancel current task
   */
  async cancelTask(taskId: string): Promise<boolean> {
    if (!this.currentTask || this.currentTask.id !== taskId) {
      return false;
    }

    try {
      this.logger.info('Cancelling task', { taskId });

      // Implement task cancellation logic
      // This depends on the specific task being executed
      await this.doCancelTask(this.currentTask);

      this.currentTask = undefined;
      return true;

    } catch (error) {
      this.logger.error('Failed to cancel task', { taskId, error });
      return false;
    }
  }

  /**
   * Shutdown the worker gracefully
   */
  async shutdown(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    this.logger.info('Shutting down task worker');

    try {
      // Cancel current task if running
      if (this.currentTask) {
        await this.cancelTask(this.currentTask.id);
      }

      // Perform cleanup
      await this.cleanup();

      this.logger.info('Task worker shutdown completed');

    } catch (error) {
      this.logger.error('Error during worker shutdown', { error });
    } finally {
      // Exit the worker thread
      process.exit(0);
    }
  }

  /**
   * Set up message handlers from parent
   */
  private setupMessageHandlers(): void {
    parentPort!.on('message', async (message) => {
      try {
        await this.handleMessage(message);
      } catch (error) {
        this.logger.error('Error handling message from parent', { message, error });
        this.sendError('message_handling_error', error);
      }
    });
  }

  /**
   * Handle incoming messages from parent
   */
  private async handleMessage(message: any): Promise<void> {
    this.logger.debug('Received message from parent', { type: message.type });

    switch (message.type) {
      case 'task:execute':
        await this.executeTask(message.task);
        break;

      case 'task:cancel':
        await this.cancelTask(message.taskId);
        break;

      case 'worker:shutdown':
        await this.shutdown();
        break;

      case 'worker:ping':
        this.sendPong();
        break;

      default:
        this.logger.warn('Unknown message type', { type: message.type });
    }
  }

  /**
   * Send message to parent
   */
  private sendMessage(type: string, payload: any): void {
    if (parentPort) {
      parentPort.postMessage({
        type,
        payload,
        workerId: this.workerId,
        timestamp: new Date()
      });
    }
  }

  /**
   * Send ready signal to parent
   */
  private sendReady(): void {
    this.sendMessage('worker:ready', {});
  }

  /**
   * Send task started signal
   */
  private sendTaskStarted(taskId: string): void {
    this.sendMessage('task:started', { taskId });
  }

  /**
   * Send task completion result
   */
  private sendTaskCompleted(result: Omit<TaskResult, 'taskId'>): void {
    this.sendMessage('task:completed', { result });
  }

  /**
   * Send task failure result
   */
  private sendTaskFailed(result: Omit<TaskResult, 'taskId'>): void {
    this.sendMessage('task:failed', { result });
  }

  /**
   * Send error to parent
   */
  private sendError(code: string, error: any): void {
    this.sendMessage('worker:error', {
      code,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      details: error
    });
  }

  /**
   * Send pong response
   */
  private sendPong(): void {
    this.sendMessage('worker:pong', { timestamp: Date.now() });
  }

  /**
   * Initialize task execution environment
   */
  private async initializeTaskEnvironment(): Promise<void> {
    // This would include setting up:
    // - Database connections
    // - External API clients
    // - Browser instances
    // - File system access
    // - Security contexts

    // For now, this is a placeholder implementation
    this.logger.debug('Task execution environment initialized');
  }

  /**
   * Validate task before execution
   */
  private validateTask(task: Task): void {
    if (!task.id) {
      throw new Error('Task ID is required');
    }

    if (!task.operation) {
      throw new Error('Task operation is required');
    }

    if (!task.category) {
      throw new Error('Task category is required');
    }

    if (task.timeout && task.timeout <= 0) {
      throw new Error('Task timeout must be positive');
    }

    // Validate based on task category
    switch (task.category) {
      case 'browser':
        this.validateBrowserTask(task);
        break;
      case 'file':
        this.validateFileTask(task);
        break;
      case 'ai':
        this.validateAITask(task);
        break;
      case 'communication':
        this.validateCommunicationTask(task);
        break;
      default:
        throw new Error(`Unknown task category: ${task.category}`);
    }
  }

  /**
   * Validate browser-specific tasks
   */
  private validateBrowserTask(task: Task): void {
    if (!task.parameters?.url && !task.parameters?.selector) {
      throw new Error('Browser tasks require either url or selector parameter');
    }
  }

  /**
   * Validate file-specific tasks
   */
  private validateFileTask(task: Task): void {
    if (!task.parameters?.path && !task.parameters?.content) {
      throw new Error('File tasks require either path or content parameter');
    }
  }

  /**
   * Validate AI-specific tasks
   */
  private validateAITask(task: Task): void {
    if (!task.parameters?.prompt && !task.parameters?.data) {
      throw new Error('AI tasks require either prompt or data parameter');
    }
  }

  /**
   * Validate communication-specific tasks
   */
  private validateCommunicationTask(task: Task): void {
    if (!task.parameters?.endpoint && !task.parameters?.message) {
      throw new Error('Communication tasks require either endpoint or message parameter');
    }
  }

  /**
   * Execute the actual task
   */
  private async doExecuteTask(task: Task): Promise<{ data: any; logs: any[] }> {
    const startTime = Date.now();
    const logs: any[] = [];

    // Add execution log
    logs.push({
      timestamp: new Date(),
      level: 'info',
      message: `Executing ${task.category}:${task.operation}`,
      source: 'TaskWorker',
      taskId: task.id
    });

    try {
      // This is where the actual task execution happens
      // The implementation would vary based on the task category and operation

      let result: any;

      switch (task.category) {
        case 'browser':
          result = await this.executeBrowserTask(task);
          break;
        case 'file':
          result = await this.executeFileTask(task);
          break;
        case 'ai':
          result = await this.executeAITask(task);
          break;
        case 'communication':
          result = await this.executeCommunicationTask(task);
          break;
        default:
          throw new Error(`Unknown task category: ${task.category}`);
      }

      const duration = Date.now() - startTime;

      logs.push({
        timestamp: new Date(),
        level: 'info',
        message: `Task completed in ${duration}ms`,
        source: 'TaskWorker',
        taskId: task.id
      });

      return {
        data: result,
        logs
      };

    } catch (error) {
      const duration = Date.now() - startTime;

      logs.push({
        timestamp: new Date(),
        level: 'error',
        message: `Task failed after ${duration}ms: ${error instanceof Error ? error.message : String(error)}`,
        source: 'TaskWorker',
        taskId: task.id
      });

      throw error;
    }
  }

  /**
   * Execute browser task
   */
  private async executeBrowserTask(task: Task): Promise<any> {
    // Placeholder for browser task execution
    // This would integrate with Playwright, Puppeteer, etc.
    this.logger.debug('Executing browser task', { operation: task.operation, parameters: task.parameters });

    // Simulate browser operation
    await new Promise(resolve => setTimeout(resolve, 1000));

    return {
      success: true,
      message: `Browser task ${task.operation} completed`,
      data: task.parameters,
      timestamp: new Date()
    };
  }

  /**
   * Execute file task
   */
  private async executeFileTask(task: Task): Promise<any> {
    // Placeholder for file task execution
    this.logger.debug('Executing file task', { operation: task.operation, parameters: task.parameters });

    const fs = await import('fs');
    const path = await import('path');

    const filePath = task.parameters.path;
    const content = task.parameters.content;

    if (filePath) {
      // File operation based on task operation
      switch (task.operation) {
        case 'read':
          if (fs.existsSync(filePath)) {
            return fs.readFileSync(filePath, 'utf8');
          } else {
            throw new Error(`File not found: ${filePath}`);
          }
        case 'write':
          fs.writeFileSync(filePath, content || '');
          return { success: true, path: filePath };
        case 'delete':
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            return { success: true, path: filePath };
          } else {
            throw new Error(`File not found: ${filePath}`);
          }
        default:
          throw new Error(`Unknown file operation: ${task.operation}`);
      }
    }

    throw new Error('File path is required for file operations');
  }

  /**
   * Execute AI task
   */
  private async executeAITask(task: Task): Promise<any> {
    // Placeholder for AI task execution
    this.logger.debug('Executing AI task', { operation: task.operation, parameters: task.parameters });

    // Simulate AI processing
    await new Promise(resolve => setTimeout(resolve, 2000));

    return {
      result: `AI analysis completed for ${task.operation}`,
      confidence: 0.95,
      timestamp: new Date()
    };
  }

  /**
   * Execute communication task
   */
  private async executeCommunicationTask(task: Task): Promise<any> {
    // Placeholder for communication task execution
    this.logger.debug('Executing communication task', { operation: task.operation, parameters: task.parameters });

    // Simulate network request
    await new Promise(resolve => setTimeout(resolve, 500));

    return {
      success: true,
      response: `Communication task ${task.operation} completed`,
      timestamp: new Date()
    };
  }

  /**
   * Cancel current task execution
   */
  private async doCancelTask(task: Task): Promise<void> {
    this.logger.info('Cancelling task execution', { taskId: task.id });

    // This would implement actual cancellation logic
    // For now, we'll just log the cancellation
  }

  /**
   * Cleanup resources
   */
  private async cleanup(): Promise<void> {
    this.logger.debug('Cleaning up worker resources');

    // Close any open connections, files, etc.
    // This would include:
    // - Database connections
    // - Browser instances
    // - File handles
    // - Network connections
  }
}

// Initialize the worker
const { workerId, config } = workerData as { workerId: string; config: DaemonConfig };
const worker = new TaskWorker(workerId, config);

// Start the worker and send ready signal
worker.initialize().catch(error => {
  console.error('Failed to initialize worker:', error);
  process.exit(1);
});