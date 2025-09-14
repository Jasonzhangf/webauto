import { EventEmitter } from 'eventemitter3';
import { 
  WeiboTaskExecutor, 
  WeiboTaskConfig, 
  WeiboTaskResult 
} from './WeiboTaskExecutor';
import { 
  WeiboUserHomepageTask, 
  WeiboUserHomepageConfig,
  WeiboUserHomepageResult 
} from './WeiboUserHomepageTask';
import { 
  WeiboPersonalHomepageTask, 
  WeiboPersonalHomepageConfig,
  WeiboPersonalHomepageResult 
} from './WeiboPersonalHomepageTask';
import { 
  WeiboSearchResultsTask, 
  WeiboSearchResultsConfig,
  WeiboSearchResultsResult 
} from './WeiboSearchResultsTask';
import { CapturedContent, AnalysisResult } from '@webauto/content-capturer';
import { StorageManager } from '@webauto/storage-manager';

/**
 * Orchestrator configuration
 */
export interface WeiboTaskOrchestratorConfig {
  id: string;
  name: string;
  description: string;
  maxConcurrentTasks?: number;
  globalTimeout?: number;
  storageConfig?: any;
  enableTaskChaining?: boolean;
  enableRetryOnError?: boolean;
  enableNotifications?: boolean;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  taskScheduling?: {
    enableScheduler: boolean;
    scheduleInterval?: number;
    maxTasksPerInterval?: number;
  };
}

/**
 * Task execution mode
 */
export type TaskExecutionMode = 'sequential' | 'parallel' | 'chained';

/**
 * Task chain configuration
 */
export interface TaskChainConfig {
  id: string;
  name: string;
  description: string;
  tasks: WeiboTaskConfig[];
  executionMode: TaskExecutionMode;
  continueOnError?: boolean;
  dataFlow?: 'forward' | 'bidirectional';
}

/**
 * Orchestrator event types
 */
export type OrchestratorEventType = 
  | 'orchestrator_initialized'
  | 'orchestrator_started'
  | 'orchestrator_stopped'
  | 'orchestrator_completed'
  | 'orchestrator_failed'
  | 'task_added'
  | 'task_removed'
  | 'task_started'
  | 'task_completed'
  | 'task_failed'
  | 'task_chain_started'
  | 'task_chain_completed'
  | 'task_chain_failed'
  | 'batch_started'
  | 'batch_completed'
  | 'batch_failed'
  | 'error_occurred';

/**
 * Orchestrator event data
 */
export interface OrchestratorEvent {
  type: OrchestratorEventType;
  timestamp: Date;
  data: any;
  orchestratorId: string;
}

/**
 * Main Weibo Task Orchestrator
 * 
 * Coordinates and manages multiple Weibo automation tasks
 * Supports sequential, parallel, and chained execution modes
 * Provides task scheduling, monitoring, and result aggregation
 */
export class WeiboTaskOrchestrator extends EventEmitter {
  private config: WeiboTaskOrchestratorConfig;
  private tasks: Map<string, WeiboTaskExecutor> = new Map();
  private taskChains: Map<string, TaskChainConfig> = new Map();
  private storageManager: StorageManager;
  private isRunning = false;
  private isInitialized = false;
  private executionResults: Map<string, WeiboTaskResult> = new Map();
  private activeTaskCount = 0;
  private totalTasksExecuted = 0;
  private totalContentCaptured = 0;
  private startTime: Date | null = null;

  constructor(config: WeiboTaskOrchestratorConfig) {
    super();
    this.config = {
      ...config,
      maxConcurrentTasks: config.maxConcurrentTasks || 3,
      globalTimeout: config.globalTimeout || 3600000, // 1 hour
      enableTaskChaining: config.enableTaskChaining !== false,
      enableRetryOnError: config.enableRetryOnError !== false,
      enableNotifications: config.enableNotifications !== false,
      logLevel: config.logLevel || 'info',
      taskScheduling: {
        enableScheduler: config.taskScheduling?.enableScheduler || false,
        scheduleInterval: config.taskScheduling?.scheduleInterval || 60000, // 1 minute
        maxTasksPerInterval: config.taskScheduling?.maxTasksPerInterval || 10
      }
    };

    this.storageManager = new StorageManager(this.config.storageConfig);
  }

  /**
   * Initialize the orchestrator
   */
  async initialize(): Promise<void> {
    this.emitEvent('orchestrator_initialized', { status: 'initializing' });

    try {
      // Initialize storage manager
      await this.storageManager.initialize();

      // Set up task scheduling if enabled
      if (this.config.taskScheduling.enableScheduler) {
        this.setupTaskScheduling();
      }

      this.isInitialized = true;
      this.emitEvent('orchestrator_initialized', { status: 'completed' });
    } catch (error) {
      this.emitEvent('error_occurred', { 
        error: error instanceof Error ? error.message : String(error),
        context: 'initialization'
      });
      throw error;
    }
  }

  /**
   * Add a task to the orchestrator
   */
  addTask(config: WeiboTaskConfig): WeiboTaskExecutor {
    let task: WeiboTaskExecutor;

    // Create appropriate task based on configuration
    if (this.isUserHomepageConfig(config)) {
      task = new WeiboUserHomepageTask(config as WeiboUserHomepageConfig);
    } else if (this.isPersonalHomepageConfig(config)) {
      task = new WeiboPersonalHomepageTask(config as WeiboPersonalHomepageConfig);
    } else if (this.isSearchResultsConfig(config)) {
      task = new WeiboSearchResultsTask(config as WeiboSearchResultsConfig);
    } else {
      throw new Error(`Unknown task configuration type for task: ${config.id}`);
    }

    // Set up task event listeners
    this.setupTaskEventListeners(task);

    // Store task
    this.tasks.set(config.id, task);

    this.emitEvent('task_added', { taskId: config.id, taskType: task.constructor.name });

    return task;
  }

  /**
   * Remove a task from the orchestrator
   */
  removeTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) {
      return false;
    }

    // Clean up task resources
    task.removeAllListeners();
    this.tasks.delete(taskId);
    this.executionResults.delete(taskId);

    this.emitEvent('task_removed', { taskId });

    return true;
  }

  /**
   * Add a task chain
   */
  addTaskChain(chainConfig: TaskChainConfig): void {
    // Validate chain configuration
    if (!chainConfig.tasks || chainConfig.tasks.length === 0) {
      throw new Error('Task chain must have at least one task');
    }

    // Create and add all tasks in the chain
    for (const taskConfig of chainConfig.tasks) {
      this.addTask(taskConfig);
    }

    // Store chain configuration
    this.taskChains.set(chainConfig.id, chainConfig);

    this.emitEvent('task_chain_added', { chainId: chainConfig.id, taskCount: chainConfig.tasks.length });
  }

  /**
   * Execute a single task
   */
  async executeTask(taskId: string): Promise<WeiboTaskResult> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    if (this.activeTaskCount >= this.config.maxConcurrentTasks!) {
      throw new Error(`Maximum concurrent tasks limit reached: ${this.config.maxConcurrentTasks}`);
    }

    this.activeTaskCount++;
    this.emitEvent('task_started', { taskId, activeTaskCount: this.activeTaskCount });

    try {
      // Initialize task if not already initialized
      if (!task.getStatus().hasSession) {
        await task.initialize();
      }

      // Execute task
      const result = await task.execute();

      // Store result
      this.executionResults.set(taskId, result);
      this.totalTasksExecuted++;
      this.totalContentCaptured += result.metrics.contentCaptured;

      // Store captured content
      if (result.capturedContent.length > 0) {
        await this.storeTaskResults(result);
      }

      this.emitEvent('task_completed', { taskId, result });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const failedResult: WeiboTaskResult = {
        taskId,
        success: false,
        capturedContent: [],
        extractedLinks: [],
        analysisResults: [],
        errors: [errorMessage],
        warnings: [],
        metrics: {
          executionTime: 0,
          linksExtracted: 0,
          contentCaptured: 0,
          storageOperations: 0,
          analysisPerformed: 0
        },
        timestamp: new Date()
      };

      this.executionResults.set(taskId, failedResult);
      this.emitEvent('task_failed', { taskId, error: errorMessage });

      // Retry if enabled
      if (this.config.enableRetryOnError) {
        return await this.retryTask(taskId);
      }

      return failedResult;
    } finally {
      this.activeTaskCount--;
    }
  }

  /**
   * Execute a task chain
   */
  async executeTaskChain(chainId: string): Promise<WeiboTaskResult[]> {
    const chainConfig = this.taskChains.get(chainId);
    if (!chainConfig) {
      throw new Error(`Task chain not found: ${chainId}`);
    }

    this.emitEvent('task_chain_started', { chainId, executionMode: chainConfig.executionMode });

    const results: WeiboTaskResult[] = [];

    try {
      switch (chainConfig.executionMode) {
        case 'sequential':
          results.push(...await this.executeSequentialChain(chainConfig));
          break;
        case 'parallel':
          results.push(...await this.executeParallelChain(chainConfig));
          break;
        case 'chained':
          results.push(...await this.executeChainedChain(chainConfig));
          break;
      }

      this.emitEvent('task_chain_completed', { chainId, results });
      return results;
    } catch (error) {
      this.emitEvent('task_chain_failed', { 
        chainId, 
        error: error instanceof Error ? error.message : String(error) 
      });
      throw error;
    }
  }

  /**
   * Execute multiple tasks in batch
   */
  async executeBatch(taskIds: string[]): Promise<WeiboTaskResult[]> {
    if (taskIds.length === 0) {
      return [];
    }

    this.emitEvent('batch_started', { taskIds, batchSize: taskIds.length });

    const results: WeiboTaskResult[] = [];
    const activeTasks: Promise<WeiboTaskResult>[] = [];

    for (const taskId of taskIds) {
      // Wait for slot if concurrent limit reached
      while (this.activeTaskCount >= this.config.maxConcurrentTasks!) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Start task
      const taskPromise = this.executeTask(taskId);
      activeTasks.push(taskPromise);

      // Remove completed task from active tasks
      taskPromise.then(() => {
        const index = activeTasks.indexOf(taskPromise);
        if (index > -1) {
          activeTasks.splice(index, 1);
        }
      });
    }

    try {
      // Wait for all tasks to complete
      const batchResults = await Promise.all(activeTasks);
      results.push(...batchResults);

      this.emitEvent('batch_completed', { 
        taskIds, 
        results,
        successCount: results.filter(r => r.success).length,
        failureCount: results.filter(r => !r.success).length
      });

      return results;
    } catch (error) {
      this.emitEvent('batch_failed', { 
        taskIds,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Start the orchestrator
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.startTime = new Date();

    this.emitEvent('orchestrator_started', { 
      startTime: this.startTime,
      taskCount: this.tasks.size,
      chainCount: this.taskChains.size
    });

    // Execute global timeout if configured
    if (this.config.globalTimeout) {
      setTimeout(() => {
        if (this.isRunning) {
          this.stop();
        }
      }, this.config.globalTimeout);
    }
  }

  /**
   * Stop the orchestrator
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    // Stop all running tasks
    const stopPromises = Array.from(this.tasks.values()).map(task => task.stop());
    await Promise.all(stopPromises);

    this.emitEvent('orchestrator_stopped', { 
      stopTime: new Date(),
      executionTime: this.startTime ? Date.now() - this.startTime.getTime() : 0,
      totalTasksExecuted: this.totalTasksExecuted,
      totalContentCaptured: this.totalContentCaptured
    });
  }

  /**
   * Get orchestrator status
   */
  getStatus() {
    return {
      id: this.config.id,
      isRunning: this.isRunning,
      isInitialized: this.isInitialized,
      taskCount: this.tasks.size,
      chainCount: this.taskChains.size,
      activeTaskCount: this.activeTaskCount,
      totalTasksExecuted: this.totalTasksExecuted,
      totalContentCaptured: this.totalContentCaptured,
      startTime: this.startTime,
      executionTime: this.startTime ? Date.now() - this.startTime.getTime() : 0,
      config: this.config
    };
  }

  /**
   * Get task results
   */
  getTaskResults(taskId?: string): WeiboTaskResult | Map<string, WeiboTaskResult> {
    if (taskId) {
      return this.executionResults.get(taskId);
    }
    return this.executionResults;
  }

  /**
   * Get all captured content
   */
  async getAllCapturedContent(): Promise<CapturedContent[]> {
    const allContent: CapturedContent[] = [];
    
    for (const task of this.tasks.values()) {
      if ('getCapturedPosts' in task) {
        const posts = (task as any).getCapturedPosts();
        allContent.push(...posts);
      }
      if ('getCapturedResults' in task) {
        const results = (task as any).getCapturedResults();
        allContent.push(...results);
      }
    }

    return allContent;
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    // Stop orchestrator if running
    if (this.isRunning) {
      await this.stop();
    }

    // Clean up all tasks
    const cleanupPromises = Array.from(this.tasks.values()).map(task => task.cleanup());
    await Promise.all(cleanupPromises);

    // Clean up storage manager
    await this.storageManager.destroy();

    // Clear collections
    this.tasks.clear();
    this.taskChains.clear();
    this.executionResults.clear();
  }

  // Private helper methods

  private setupTaskEventListeners(task: WeiboTaskExecutor): void {
    task.on('execution_started', (data) => {
      this.log('info', `Task ${data.taskId} started execution`);
    });

    task.on('execution_completed', (data) => {
      this.log('info', `Task ${data.taskId} completed successfully`);
    });

    task.on('execution_failed', (data) => {
      this.log('error', `Task ${data.taskId} failed: ${data.finalError}`);
    });

    task.on('content_captured', (data) => {
      this.log('debug', `Content captured for task ${data.taskId}: ${data.contentId}`);
    });

    task.on('content_stored', (data) => {
      this.log('debug', `Content stored for task ${data.taskId}: ${data.contentId}`);
    });
  }

  private setupTaskScheduling(): void {
    setInterval(() => {
      if (this.isRunning && this.activeTaskCount < this.config.maxConcurrentTasks!) {
        // Execute pending tasks based on scheduling logic
        this.executeScheduledTasks();
      }
    }, this.config.taskScheduling!.scheduleInterval);
  }

  private async executeScheduledTasks(): Promise<void> {
    // This would implement task scheduling logic
    // For now, it's a placeholder for future implementation
    this.log('debug', 'Executing scheduled tasks');
  }

  private async executeSequentialChain(chainConfig: TaskChainConfig): Promise<WeiboTaskResult[]> {
    const results: WeiboTaskResult[] = [];

    for (const taskConfig of chainConfig.tasks) {
      try {
        const result = await this.executeTask(taskConfig.id);
        results.push(result);

        // Stop chain execution if task failed and continueOnError is false
        if (!result.success && !chainConfig.continueOnError) {
          break;
        }
      } catch (error) {
        this.log('error', `Sequential chain execution failed for task ${taskConfig.id}: ${error}`);
        if (!chainConfig.continueOnError) {
          break;
        }
      }
    }

    return results;
  }

  private async executeParallelChain(chainConfig: TaskChainConfig): Promise<WeiboTaskResult[]> {
    const taskIds = chainConfig.tasks.map(task => task.id);
    return await this.executeBatch(taskIds);
  }

  private async executeChainedChain(chainConfig: TaskChainConfig): Promise<WeiboTaskResult[]> {
    const results: WeiboTaskResult[] = [];
    let previousResult: WeiboTaskResult | null = null;

    for (let i = 0; i < chainConfig.tasks.length; i++) {
      const taskConfig = chainConfig.tasks[i];
      
      try {
        // Pass data from previous task if configured
        if (previousResult && chainConfig.dataFlow === 'forward') {
          // Modify task configuration based on previous result
          // This would require specific implementation based on task types
        }

        const result = await this.executeTask(taskConfig.id);
        results.push(result);
        previousResult = result;

        // Stop chain execution if task failed and continueOnError is false
        if (!result.success && !chainConfig.continueOnError) {
          break;
        }
      } catch (error) {
        this.log('error', `Chained execution failed for task ${taskConfig.id}: ${error}`);
        if (!chainConfig.continueOnError) {
          break;
        }
      }
    }

    return results;
  }

  private async retryTask(taskId: string): Promise<WeiboTaskResult> {
    this.log('info', `Retrying task: ${taskId}`);
    
    try {
      const task = this.tasks.get(taskId);
      if (!task) {
        throw new Error(`Task not found: ${taskId}`);
      }

      // Reinitialize task
      await task.cleanup();
      await task.initialize();

      // Execute task again
      return await task.execute();
    } catch (error) {
      this.log('error', `Task retry failed for ${taskId}: ${error}`);
      throw error;
    }
  }

  private async storeTaskResults(result: WeiboTaskResult): Promise<void> {
    try {
      for (const content of result.capturedContent) {
        await this.storageManager.store(content);
      }
    } catch (error) {
      this.log('error', `Failed to store task results for ${result.taskId}: ${error}`);
    }
  }

  private isUserHomepageConfig(config: WeiboTaskConfig): config is WeiboUserHomepageConfig {
    return 'userId' in config;
  }

  private isPersonalHomepageConfig(config: WeiboTaskConfig): config is WeiboPersonalHomepageConfig {
    return 'feedType' in config;
  }

  private isSearchResultsConfig(config: WeiboTaskConfig): config is WeiboSearchResultsConfig {
    return 'searchQuery' in config;
  }

  private emitEvent(type: OrchestratorEventType, data: any): void {
    const event: OrchestratorEvent = {
      type,
      timestamp: new Date(),
      data,
      orchestratorId: this.config.id
    };

    this.emit(type, event);
  }

  private log(level: string, message: string, data?: any): void {
    if (this.config.logLevel === 'debug' || 
        (this.config.logLevel === 'info' && level !== 'debug') ||
        (this.config.logLevel === 'warn' && ['warn', 'error'].includes(level)) ||
        (this.config.logLevel === 'error' && level === 'error')) {
      
      const logData = data ? ` ${JSON.stringify(data)}` : '';
      console.log(`[${new Date().toISOString()}] [${level.toUpperCase()}] [Orchestrator] ${message}${logData}`);
    }
  }
}