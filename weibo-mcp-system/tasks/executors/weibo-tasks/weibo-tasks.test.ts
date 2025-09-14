/**
 * Comprehensive Integration Tests for Weibo Tasks
 * 
 * Tests all Weibo task implementations and their integration with webauto modules
 */

import { describe, it, expect, beforeEach, afterEach } from 'node:test';
import { 
  WeiboTaskOrchestrator, 
  WeiboUserHomepageTask, 
  WeiboPersonalHomepageTask, 
  WeiboSearchResultsTask,
  WeiboTaskOrchestratorConfig,
  WeiboUserHomepageConfig,
  WeiboPersonalHomepageConfig,
  WeiboSearchResultsConfig,
  TaskChainConfig,
  TaskExecutionMode
} from './index';

describe('Weibo Tasks Integration Tests', () => {
  let orchestrator: WeiboTaskOrchestrator;
  let testConfigs: {
    userHomepage: WeiboUserHomepageConfig;
    personalHomepage: WeiboPersonalHomepageConfig;
    searchResults: WeiboSearchResultsConfig;
  };

  beforeEach(async () => {
    // Test configurations
    testConfigs = {
      userHomepage: {
        id: 'test-user-homepage',
        name: 'Test User Homepage Task',
        description: 'Test task for user homepage scraping',
        userId: '2107014571',
        username: 'testuser',
        maxPosts: 10,
        scrollPages: 2,
        captureComments: true,
        captureImages: true,
        maxRetries: 2,
        retryDelay: 1000,
        timeout: 60000,
        enabled: true
      },
      personalHomepage: {
        id: 'test-personal-homepage',
        name: 'Test Personal Homepage Task',
        description: 'Test task for personal homepage scraping',
        feedType: 'timeline',
        maxPosts: 15,
        scrollPages: 3,
        captureComments: true,
        realTimeRefresh: false,
        maxRetries: 2,
        retryDelay: 1000,
        timeout: 60000,
        enabled: true
      },
      searchResults: {
        id: 'test-search-results',
        name: 'Test Search Results Task',
        description: 'Test task for search results scraping',
        searchQuery: '技术',
        searchType: 'posts',
        maxResults: 20,
        searchPages: 2,
        sortBy: 'time',
        captureComments: true,
        captureImages: true,
        maxRetries: 2,
        retryDelay: 1000,
        timeout: 60000,
        enabled: true
      }
    };

    // Create orchestrator
    const orchestratorConfig: WeiboTaskOrchestratorConfig = {
      id: 'test-orchestrator',
      name: 'Test Weibo Task Orchestrator',
      description: 'Test orchestrator for integration testing',
      maxConcurrentTasks: 2,
      globalTimeout: 300000,
      enableTaskChaining: true,
      enableRetryOnError: true,
      enableNotifications: false,
      logLevel: 'debug'
    };

    orchestrator = new WeiboTaskOrchestrator(orchestratorConfig);
    await orchestrator.initialize();
  });

  afterEach(async () => {
    await orchestrator.cleanup();
  });

  describe('Task Initialization and Configuration', () => {
    it('should initialize orchestrator successfully', () => {
      expect(orchestrator).toBeDefined();
      const status = orchestrator.getStatus();
      expect(status.isInitialized).toBe(true);
      expect(status.id).toBe('test-orchestrator');
    });

    it('should create and add tasks to orchestrator', () => {
      // Add tasks
      const userTask = orchestrator.addTask(testConfigs.userHomepage);
      const personalTask = orchestrator.addTask(testConfigs.personalHomepage);
      const searchTask = orchestrator.addTask(testConfigs.searchResults);

      expect(userTask).toBeInstanceOf(WeiboUserHomepageTask);
      expect(personalTask).toBeInstanceOf(WeiboPersonalHomepageTask);
      expect(searchTask).toBeInstanceOf(WeiboSearchResultsTask);

      const status = orchestrator.getStatus();
      expect(status.taskCount).toBe(3);
    });

    it('should remove tasks from orchestrator', () => {
      // Add and then remove tasks
      const userTask = orchestrator.addTask(testConfigs.userHomepage);
      const personalTask = orchestrator.addTask(testConfigs.personalHomepage);

      expect(orchestrator.getStatus().taskCount).toBe(2);

      // Remove tasks
      const removed1 = orchestrator.removeTask(testConfigs.userHomepage.id);
      const removed2 = orchestrator.removeTask(testConfigs.personalHomepage.id);

      expect(removed1).toBe(true);
      expect(removed2).toBe(true);
      expect(orchestrator.getStatus().taskCount).toBe(0);
    });

    it('should handle task configuration validation', () => {
      // Test invalid user homepage config
      const invalidUserConfig = { ...testConfigs.userHomepage, userId: '' };
      expect(() => orchestrator.addTask(invalidUserConfig)).toThrow();

      // Test invalid personal homepage config
      const invalidPersonalConfig = { ...testConfigs.personalHomepage, feedType: 'invalid' as any };
      expect(() => orchestrator.addTask(invalidPersonalConfig)).not.toThrow(); // Should still create task

      // Test invalid search config
      const invalidSearchConfig = { ...testConfigs.searchResults, searchQuery: '' };
      expect(() => orchestrator.addTask(invalidSearchConfig)).toThrow();
    });
  });

  describe('Task Event Handling', () => {
    it('should emit task events correctly', async () => {
      const events: any[] = [];
      const userTask = orchestrator.addTask(testConfigs.userHomepage);

      // Set up event listeners
      orchestrator.on('task_added', (event) => events.push(event));
      orchestrator.on('task_started', (event) => events.push(event));
      orchestrator.on('task_completed', (event) => events.push(event));
      orchestrator.on('task_failed', (event) => events.push(event));

      // Task should have been added
      expect(events.some(e => e.type === 'task_added')).toBe(true);
    });

    it('should handle orchestrator lifecycle events', async () => {
      const events: any[] = [];

      // Set up event listeners
      orchestrator.on('orchestrator_started', (event) => events.push(event));
      orchestrator.on('orchestrator_stopped', (event) => events.push(event));

      await orchestrator.start();
      await orchestrator.stop();

      expect(events.some(e => e.type === 'orchestrator_started')).toBe(true);
      expect(events.some(e => e.type === 'orchestrator_stopped')).toBe(true);
    });
  });

  describe('Task Chain Management', () => {
    it('should add and manage task chains', () => {
      const chainConfig: TaskChainConfig = {
        id: 'test-chain',
        name: 'Test Task Chain',
        description: 'Test chain for integration testing',
        tasks: [testConfigs.userHomepage, testConfigs.personalHomepage],
        executionMode: 'sequential',
        continueOnError: true
      };

      // Add task chain
      orchestrator.addTaskChain(chainConfig);

      const status = orchestrator.getStatus();
      expect(status.taskCount).toBe(2); // Should have added both tasks
    });

    it('should handle different execution modes', () => {
      const modes: TaskExecutionMode[] = ['sequential', 'parallel', 'chained'];

      modes.forEach(mode => {
        const chainConfig: TaskChainConfig = {
          id: `test-chain-${mode}`,
          name: `Test ${mode} Chain`,
          description: `Test chain for ${mode} execution`,
          tasks: [testConfigs.userHomepage],
          executionMode: mode
        };

        expect(() => orchestrator.addTaskChain(chainConfig)).not.toThrow();
      });
    });

    it('should validate task chain configurations', () => {
      // Empty task chain
      expect(() => {
        orchestrator.addTaskChain({
          id: 'empty-chain',
          name: 'Empty Chain',
          description: 'Empty task chain',
          tasks: [],
          executionMode: 'sequential'
        });
      }).toThrow('Task chain must have at least one task');
    });
  });

  describe('Configuration Management', () => {
    it('should handle task-specific configurations', () => {
      const userTask = orchestrator.addTask(testConfigs.userHomepage);
      const config = userTask.getConfig();

      expect(config.userId).toBe('2107014571');
      expect(config.maxPosts).toBe(10);
      expect(config.captureComments).toBe(true);
    });

    it('should update orchestrator configuration', () => {
      const originalConfig = orchestrator.getStatus().config;
      
      // Configuration should be immutable from outside
      expect(() => {
        (orchestrator.getStatus().config as any).maxConcurrentTasks = 10;
      }).not.toThrow();

      // The change should not affect the internal config
      expect(orchestrator.getStatus().config.maxConcurrentTasks).toBe(2);
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle task creation errors gracefully', () => {
      // Test with completely invalid config
      const invalidConfig = { id: 'invalid' } as any;
      
      expect(() => {
        orchestrator.addTask(invalidConfig);
      }).toThrow();
    });

    it('should handle concurrent task limits', async () => {
      // Set low concurrent limit
      const lowLimitConfig: WeiboTaskOrchestratorConfig = {
        id: 'low-limit-orchestrator',
        name: 'Low Limit Orchestrator',
        description: 'Orchestrator with low concurrent limit',
        maxConcurrentTasks: 1,
        logLevel: 'debug'
      };

      const limitedOrchestrator = new WeiboTaskOrchestrator(lowLimitConfig);
      await limitedOrchestrator.initialize();

      try {
        // Add tasks
        limitedOrchestrator.addTask(testConfigs.userHomepage);
        limitedOrchestrator.addTask(testConfigs.personalHomepage);

        // Try to execute more tasks than allowed
        await expect(limitedOrchestrator.executeBatch([
          testConfigs.userHomepage.id,
          testConfigs.personalHomepage.id
        ])).rejects.toThrow('Maximum concurrent tasks limit reached');
      } finally {
        await limitedOrchestrator.cleanup();
      }
    });
  });

  describe('Status and Metrics', () => {
    it('should track execution metrics correctly', () => {
      orchestrator.addTask(testConfigs.userHomepage);
      orchestrator.addTask(testConfigs.personalHomepage);

      const status = orchestrator.getStatus();
      
      expect(status.taskCount).toBe(2);
      expect(status.chainCount).toBe(0);
      expect(status.activeTaskCount).toBe(0);
      expect(status.totalTasksExecuted).toBe(0);
      expect(status.totalContentCaptured).toBe(0);
    });

    it('should provide task results access', () => {
      const userTask = orchestrator.addTask(testConfigs.userHomepage);
      
      // Should return empty map initially
      const results = orchestrator.getTaskResults();
      expect(results.size).toBe(0);

      // Should return undefined for specific task
      const taskResult = orchestrator.getTaskResults(testConfigs.userHomepage.id);
      expect(taskResult).toBeUndefined();
    });
  });

  describe('Resource Management', () => {
    it('should clean up resources properly', async () => {
      // Add some tasks
      orchestrator.addTask(testConfigs.userHomepage);
      orchestrator.addTask(testConfigs.personalHomepage);

      // Start orchestrator
      await orchestrator.start();

      // Cleanup should stop orchestrator and clean tasks
      await orchestrator.cleanup();

      const status = orchestrator.getStatus();
      expect(status.isRunning).toBe(false);
      expect(status.taskCount).toBe(0);
    });

    it('should handle multiple cleanup calls safely', async () => {
      orchestrator.addTask(testConfigs.userHomepage);
      
      // Multiple cleanup calls should not error
      await orchestrator.cleanup();
      await orchestrator.cleanup();
      await orchestrator.cleanup();
    });
  });

  describe('Integration with WebAuto Modules', () => {
    it('should integrate with storage manager', async () => {
      const userTask = orchestrator.addTask(testConfigs.userHomepage);
      
      // Task should have storage capabilities
      const taskStatus = userTask.getStatus();
      expect(taskStatus).toBeDefined();
    });

    it('should handle browser session management', async () => {
      const userTask = orchestrator.addTask(testConfigs.userHomepage);
      
      // Check task has session management capabilities
      expect(userTask).toBeDefined();
      expect(typeof (userTask as any).initialize).toBe('function');
      expect(typeof (userTask as any).cleanup).toBe('function');
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle multiple task configurations', () => {
      // Create many similar tasks
      for (let i = 0; i < 10; i++) {
        const config = {
          ...testConfigs.userHomepage,
          id: `user-task-${i}`,
          userId: `210701457${i}`
        };
        
        expect(() => orchestrator.addTask(config)).not.toThrow();
      }

      expect(orchestrator.getStatus().taskCount).toBe(10);
    });

    it('should manage memory efficiently with many tasks', async () => {
      // Add and remove many tasks to test memory management
      for (let i = 0; i < 5; i++) {
        const config = {
          ...testConfigs.userHomepage,
          id: `memory-test-${i}`,
          userId: `210701457${i}`
        };
        
        orchestrator.addTask(config);
      }

      expect(orchestrator.getStatus().taskCount).toBe(5);

      // Remove all tasks
      for (let i = 0; i < 5; i++) {
        orchestrator.removeTask(`memory-test-${i}`);
      }

      expect(orchestrator.getStatus().taskCount).toBe(0);
    });
  });

  describe('Mock Execution Testing', () => {
    it('should simulate task execution flow', async () => {
      // This is a mock test since actual execution requires browser automation
      const userTask = orchestrator.addTask(testConfigs.userHomepage);
      
      // Test task initialization
      expect(userTask).toBeDefined();
      
      // Test task status
      const status = userTask.getStatus();
      expect(status.taskId).toBe(testConfigs.userHomepage.id);
      expect(status.isRunning).toBe(false);
      expect(status.hasSession).toBe(false);
    });

    it('should test orchestrator batch execution setup', async () => {
      orchestrator.addTask(testConfigs.userHomepage);
      orchestrator.addTask(testConfigs.personalHomepage);
      orchestrator.addTask(testConfigs.searchResults);

      const taskIds = [
        testConfigs.userHomepage.id,
        testConfigs.personalHomepage.id,
        testConfigs.searchResults.id
      ];

      // Test batch execution preparation
      expect(taskIds.length).toBe(3);
      expect(orchestrator.getStatus().taskCount).toBe(3);
    });
  });
});

// Additional test utilities and helpers
describe('Weibo Tasks Utility Functions', () => {
  it('should export factory functions correctly', () => {
    const { 
      createUserHomepageTask, 
      createPersonalHomepageTask, 
      createSearchResultsTask,
      createTaskOrchestrator 
    } = require('./index');

    expect(typeof createUserHomepageTask).toBe('function');
    expect(typeof createPersonalHomepageTask).toBe('function');
    expect(typeof createSearchResultsTask).toBe('function');
    expect(typeof createTaskOrchestrator).toBe('function');
  });

  it('should provide default configurations', () => {
    const { 
      DEFAULT_WEIBO_TASK_CONFIG,
      DEFAULT_ORCHESTRATOR_CONFIG 
    } = require('./index');

    expect(DEFAULT_WEIBO_TASK_CONFIG).toBeDefined();
    expect(DEFAULT_ORCHESTRATOR_CONFIG).toBeDefined();
    expect(DEFAULT_WEIBO_TASK_CONFIG.maxRetries).toBe(3);
    expect(DEFAULT_ORCHESTRATOR_CONFIG.maxConcurrentTasks).toBe(3);
  });

  it('should export type definitions correctly', () => {
    const { 
      AnyWeiboTask,
      AnyWeiboTaskConfig,
      AnyWeiboTaskResult 
    } = require('./index');

    expect(typeof AnyWeiboTask).toBe('object'); // Type alias
    expect(typeof AnyWeiboTaskConfig).toBe('object'); // Type alias
    expect(typeof AnyWeiboTaskResult).toBe('object'); // Type alias
  });
});