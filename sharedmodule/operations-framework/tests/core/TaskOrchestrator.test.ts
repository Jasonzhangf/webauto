import { TaskOrchestrator } from '../../src/core/TaskOrchestrator';
import { OperationRegistry } from '../../src/core/OperationRegistry';
import { ExecutionContext } from '../../src/execution/ExecutionContext';
import { BaseOperation } from '../../src/core/BaseOperation';
import { OperationContext, OperationConfig, TaskDefinition } from '../../src/types/operationTypes';
import { EventEmitter } from 'events';

// Mock operation for testing
class MockOperation extends BaseOperation {
  constructor(private readonly result: any = { success: true }) {
    super();
  }

  async execute(context: OperationContext, params: OperationConfig = {}): Promise<any> {
    return {
      success: true,
      data: this.result,
      metadata: { executionTime: 10 }
    };
  }

  protected validateParametersImpl(params: OperationConfig): any {
    return { isValid: true };
  }
}

class MockSlowOperation extends BaseOperation {
  async execute(context: OperationContext, params: OperationConfig = {}): Promise<any> {
    await new Promise(resolve => setTimeout(resolve, 100)); // Simulate slow operation
    return {
      success: true,
      data: { delayed: true },
      metadata: { executionTime: 100 }
    };
  }

  protected validateParametersImpl(params: OperationConfig): any {
    return { isValid: true };
  }
}

class MockFailingOperation extends BaseOperation {
  constructor(private readonly error: string = 'Operation failed') {
    super();
  }

  async execute(context: OperationContext, params: OperationConfig = {}): Promise<any> {
    throw new Error(this.error);
  }

  protected validateParametersImpl(params: OperationConfig): any {
    return { isValid: true };
  }
}

describe('TaskOrchestrator', () => {
  let orchestrator: TaskOrchestrator;
  let registry: OperationRegistry;
  let executionContext: ExecutionContext;
  let mockContext: OperationContext;

  beforeEach(() => {
    registry = new OperationRegistry();
    executionContext = new ExecutionContext();
    orchestrator = new TaskOrchestrator(registry, executionContext);

    mockContext = {
      id: 'test-context',
      browser: null,
      page: null,
      metadata: {
        startTime: new Date(),
        userAgent: 'test-agent',
        viewport: { width: 1920, height: 1080 }
      },
      logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn()
      },
      eventBus: new EventEmitter()
    };

    // Register mock operations
    registry.register('test-operation', new MockOperation({ data: 'test-result' }));
    registry.register('slow-operation', new MockSlowOperation());
    registry.register('failing-operation', new MockFailingOperation());
    registry.register('conditional-operation', new MockOperation({ shouldProceed: true }));
  });

  afterEach(() => {
    orchestrator.stop();
  });

  describe('Task Registration', () => {
    it('should register a task successfully', () => {
      const taskDefinition: TaskDefinition = {
        name: 'Simple Task',
        description: 'A simple test task',
        workflow: {
          name: 'simple-workflow',
          description: 'Simple workflow',
          steps: [
            {
              name: 'step1',
              operation: 'test-operation'
            }
          ]
        },
        schedule: {
          type: 'immediate'
        }
      };

      const result = orchestrator.registerTask('simple-task', taskDefinition);

      expect(result).toBe(true);
      expect(orchestrator.hasTask('simple-task')).toBe(true);
    });

    it('should not allow duplicate task names', () => {
      const taskDefinition: TaskDefinition = {
        name: 'Duplicate Task',
        description: 'A duplicate task',
        workflow: {
          name: 'duplicate-workflow',
          description: 'Duplicate workflow',
          steps: [
            {
              name: 'step1',
              operation: 'test-operation'
            }
          ]
        },
        schedule: {
          type: 'immediate'
        }
      };

      orchestrator.registerTask('duplicate', taskDefinition);
      const result = orchestrator.registerTask('duplicate', taskDefinition);

      expect(result).toBe(false);
    });

    it('should validate task definition', () => {
      const invalidTask: TaskDefinition = {
        name: 'Invalid Task',
        description: 'An invalid task',
        workflow: undefined as any
      };

      expect(() => {
        orchestrator.registerTask('invalid', invalidTask);
      }).toThrow('Invalid task definition');
    });
  });

  describe('Task Execution', () => {
    it('should execute a task immediately', async () => {
      const taskDefinition: TaskDefinition = {
        name: 'Immediate Task',
        description: 'A task that runs immediately',
        workflow: {
          name: 'immediate-workflow',
          description: 'Immediate workflow',
          steps: [
            {
              name: 'step1',
              operation: 'test-operation'
            }
          ]
        },
        schedule: {
          type: 'immediate'
        }
      };

      orchestrator.registerTask('immediate-task', taskDefinition);
      const execution = await orchestrator.executeTask('immediate-task');

      expect(execution).toBeDefined();
      expect(execution.taskId).toBe('immediate-task');
      expect(execution.status).toBe('completed');
      expect(execution.result.success).toBe(true);
    });

    it('should handle task execution errors', async () => {
      const taskDefinition: TaskDefinition = {
        name: 'Failing Task',
        description: 'A task that fails',
        workflow: {
          name: 'failing-workflow',
          description: 'Failing workflow',
          steps: [
            {
              name: 'step1',
              operation: 'failing-operation'
            }
          ]
        },
        schedule: {
          type: 'immediate'
        }
      };

      orchestrator.registerTask('failing-task', taskDefinition);
      const execution = await orchestrator.executeTask('failing-task');

      expect(execution).toBeDefined();
      expect(execution.status).toBe('failed');
      expect(execution.result.success).toBe(false);
      expect(execution.result.error).toBe('Operation failed');
    });

    it('should execute task with parameters', async () => {
      const taskDefinition: TaskDefinition = {
        name: 'Parameterized Task',
        description: 'A task with parameters',
        workflow: {
          name: 'parameterized-workflow',
          description: 'Parameterized workflow',
          steps: [
            {
              name: 'step1',
              operation: 'test-operation',
              parameters: { input: '${input}' }
            }
          ]
        },
        schedule: {
          type: 'immediate'
        }
      };

      orchestrator.registerTask('parameterized-task', taskDefinition);
      const execution = await orchestrator.executeTask('parameterized-task', { input: 'test-value' });

      expect(execution).toBeDefined();
      expect(execution.status).toBe('completed');
      expect(execution.result.success).toBe(true);
    });
  });

  describe('Task Scheduling', () => {
    it('should schedule a task with cron expression', async () => {
      const taskDefinition: TaskDefinition = {
        name: 'Scheduled Task',
        description: 'A scheduled task',
        workflow: {
          name: 'scheduled-workflow',
          description: 'Scheduled workflow',
          steps: [
            {
              name: 'step1',
              operation: 'test-operation'
            }
          ]
        },
        schedule: {
          type: 'cron',
          expression: '0 */5 * * * *' // Every 5 minutes
        }
      };

      orchestrator.registerTask('scheduled-task', taskDefinition);
      const result = orchestrator.scheduleTask('scheduled-task');

      expect(result).toBe(true);
      expect(orchestrator.getScheduledTasks()).toContain('scheduled-task');
    });

    it('should schedule a task with interval', async () => {
      const taskDefinition: TaskDefinition = {
        name: 'Interval Task',
        description: 'An interval task',
        workflow: {
          name: 'interval-workflow',
          description: 'Interval workflow',
          steps: [
            {
              name: 'step1',
              operation: 'test-operation'
            }
          ]
        },
        schedule: {
          type: 'interval',
          interval: 30000 // 30 seconds
        }
      };

      orchestrator.registerTask('interval-task', taskDefinition);
      const result = orchestrator.scheduleTask('interval-task');

      expect(result).toBe(true);
      expect(orchestrator.getScheduledTasks()).toContain('interval-task');
    });

    it('should unschedule a task', async () => {
      const taskDefinition: TaskDefinition = {
        name: 'To Unschedule',
        description: 'A task to unschedule',
        workflow: {
          name: 'unschedule-workflow',
          description: 'Unschedule workflow',
          steps: [
            {
              name: 'step1',
              operation: 'test-operation'
            }
          ]
        },
        schedule: {
          type: 'interval',
          interval: 60000
        }
      };

      orchestrator.registerTask('unschedule-task', taskDefinition);
      orchestrator.scheduleTask('unschedule-task');

      expect(orchestrator.getScheduledTasks()).toContain('unschedule-task');

      const result = orchestrator.unscheduleTask('unschedule-task');
      expect(result).toBe(true);
      expect(orchestrator.getScheduledTasks()).not.toContain('unschedule-task');
    });
  });

  describe('Task Dependencies', () => {
    it('should handle task dependencies', async () => {
      const task1: TaskDefinition = {
        name: 'Dependency Task 1',
        description: 'First dependency task',
        workflow: {
          name: 'dependency-workflow-1',
          description: 'First dependency workflow',
          steps: [
            {
              name: 'step1',
              operation: 'test-operation'
            }
          ]
        },
        schedule: {
          type: 'immediate'
        }
      };

      const task2: TaskDefinition = {
        name: 'Dependency Task 2',
        description: 'Second dependency task',
        workflow: {
          name: 'dependency-workflow-2',
          description: 'Second dependency workflow',
          steps: [
            {
              name: 'step1',
              operation: 'test-operation'
            }
          ]
        },
        schedule: {
          type: 'immediate'
        },
        dependencies: ['dependency-task-1']
      };

      orchestrator.registerTask('dependency-task-1', task1);
      orchestrator.registerTask('dependency-task-2', task2);

      // Execute both tasks
      const execution1 = await orchestrator.executeTask('dependency-task-1');
      const execution2 = await orchestrator.executeTask('dependency-task-2');

      expect(execution1.status).toBe('completed');
      expect(execution2.status).toBe('completed');
    });

    it('should wait for dependencies to complete', async () => {
      const slowTask: TaskDefinition = {
        name: 'Slow Dependency Task',
        description: 'A slow dependency task',
        workflow: {
          name: 'slow-dependency-workflow',
          description: 'Slow dependency workflow',
          steps: [
            {
              name: 'step1',
              operation: 'slow-operation'
            }
          ]
        },
        schedule: {
          type: 'immediate'
        }
      };

      const dependentTask: TaskDefinition = {
        name: 'Dependent Task',
        description: 'A task that depends on slow task',
        workflow: {
          name: 'dependent-workflow',
          description: 'Dependent workflow',
          steps: [
            {
              name: 'step1',
              operation: 'test-operation'
            }
          ]
        },
        schedule: {
          type: 'immediate'
        },
        dependencies: ['slow-dependency-task']
      };

      orchestrator.registerTask('slow-dependency-task', slowTask);
      orchestrator.registerTask('dependent-task', dependentTask);

      // Start slow task
      const slowExecution = orchestrator.executeTask('slow-dependency-task');

      // Try to execute dependent task immediately
      const dependentExecution = orchestrator.executeTask('dependent-task');

      // Wait for both to complete
      const [slowResult, dependentResult] = await Promise.all([
        slowExecution,
        dependentExecution
      ]);

      expect(slowResult.status).toBe('completed');
      expect(dependentResult.status).toBe('completed');
    });
  });

  describe('Task Queueing', () => {
    it('should queue tasks when at capacity', async () => {
      // Set a low concurrency limit for testing
      orchestrator = new TaskOrchestrator(registry, executionContext, { maxConcurrency: 1 });

      const taskDefinition: TaskDefinition = {
        name: 'Queued Task',
        description: 'A task that gets queued',
        workflow: {
          name: 'queued-workflow',
          description: 'Queued workflow',
          steps: [
            {
              name: 'step1',
              operation: 'slow-operation'
            }
          ]
        },
        schedule: {
          type: 'immediate'
        }
      };

      orchestrator.registerTask('queued-task', taskDefinition);

      // Start a slow task
      const slowExecution = orchestrator.executeTask('queued-task');

      // Start another task while the first is running
      const queuedExecution = orchestrator.executeTask('queued-task');

      // Both should eventually complete
      const [slowResult, queuedResult] = await Promise.all([
        slowExecution,
        queuedExecution
      ]);

      expect(slowResult.status).toBe('completed');
      expect(queuedResult.status).toBe('completed');
    });

    it('should handle task queue priority', async () => {
      orchestrator = new TaskOrchestrator(registry, executionContext, { maxConcurrency: 1 });

      const highPriorityTask: TaskDefinition = {
        name: 'High Priority Task',
        description: 'A high priority task',
        workflow: {
          name: 'high-priority-workflow',
          description: 'High priority workflow',
          steps: [
            {
              name: 'step1',
              operation: 'test-operation'
            }
          ]
        },
        schedule: {
          type: 'immediate'
        },
        priority: 'high'
      };

      const lowPriorityTask: TaskDefinition = {
        name: 'Low Priority Task',
        description: 'A low priority task',
        workflow: {
          name: 'low-priority-workflow',
          description: 'Low priority workflow',
          steps: [
            {
              name: 'step1',
              operation: 'test-operation'
            }
          ]
        },
        schedule: {
          type: 'immediate'
        },
        priority: 'low'
      };

      orchestrator.registerTask('high-priority-task', highPriorityTask);
      orchestrator.registerTask('low-priority-task', lowPriorityTask);

      // Start a slow task to block the queue
      const slowExecution = orchestrator.executeTask('queued-task');

      // Queue both priority tasks
      const highPriorityExecution = orchestrator.executeTask('high-priority-task');
      const lowPriorityExecution = orchestrator.executeTask('low-priority-task');

      // All should complete, with high priority potentially executing first
      const [slowResult, highPriorityResult, lowPriorityResult] = await Promise.all([
        slowExecution,
        highPriorityExecution,
        lowPriorityExecution
      ]);

      expect(slowResult.status).toBe('completed');
      expect(highPriorityResult.status).toBe('completed');
      expect(lowPriorityResult.status).toBe('completed');
    });
  });

  describe('Task Monitoring', () => {
    it('should track task execution statistics', async () => {
      const taskDefinition: TaskDefinition = {
        name: 'Stats Task',
        description: 'A task for statistics',
        workflow: {
          name: 'stats-workflow',
          description: 'Stats workflow',
          steps: [
            {
              name: 'step1',
              operation: 'test-operation'
            }
          ]
        },
        schedule: {
          type: 'immediate'
        }
      };

      orchestrator.registerTask('stats-task', taskDefinition);

      // Execute task multiple times
      await orchestrator.executeTask('stats-task');
      await orchestrator.executeTask('stats-task');
      await orchestrator.executeTask('stats-task');

      const stats = orchestrator.getTaskStatistics('stats-task');

      expect(stats).toBeDefined();
      expect(stats.totalExecutions).toBe(3);
      expect(stats.successfulExecutions).toBe(3);
      expect(stats.failedExecutions).toBe(0);
    });

    it('should get all tasks status', async () => {
      const taskDefinition: TaskDefinition = {
        name: 'Status Task',
        description: 'A task for status',
        workflow: {
          name: 'status-workflow',
          description: 'Status workflow',
          steps: [
            {
              name: 'step1',
              operation: 'test-operation'
            }
          ]
        },
        schedule: {
          type: 'immediate'
        }
      };

      orchestrator.registerTask('status-task', taskDefinition);

      // Execute task
      const execution = await orchestrator.executeTask('status-task');

      // Get all tasks status
      const status = orchestrator.getAllTasksStatus();

      expect(status).toBeDefined();
      expect(status['status-task']).toBeDefined();
      expect(status['status-task'].totalExecutions).toBe(1);
    });
  });

  describe('Task Events', () => {
    it('should emit task events', async () => {
      const startSpy = jest.fn();
      const completeSpy = jest.fn();
      const failedSpy = jest.fn();

      orchestrator.on('taskStarted', startSpy);
      orchestrator.on('taskCompleted', completeSpy);
      orchestrator.on('taskFailed', failedSpy);

      const taskDefinition: TaskDefinition = {
        name: 'Event Task',
        description: 'A task for events',
        workflow: {
          name: 'event-workflow',
          description: 'Event workflow',
          steps: [
            {
              name: 'step1',
              operation: 'test-operation'
            }
          ]
        },
        schedule: {
          type: 'immediate'
        }
      };

      orchestrator.registerTask('event-task', taskDefinition);
      await orchestrator.executeTask('event-task');

      expect(startSpy).toHaveBeenCalledWith({
        taskId: 'event-task',
        timestamp: expect.any(Date)
      });

      expect(completeSpy).toHaveBeenCalledWith({
        taskId: 'event-task',
        execution: expect.objectContaining({ status: 'completed' }),
        executionTime: expect.any(Number)
      });

      expect(failedSpy).not.toHaveBeenCalled();
    });

    it('should emit task failed events', async () => {
      const failedSpy = jest.fn();

      orchestrator.on('taskFailed', failedSpy);

      const taskDefinition: TaskDefinition = {
        name: 'Failed Event Task',
        description: 'A task that fails',
        workflow: {
          name: 'failed-event-workflow',
          description: 'Failed event workflow',
          steps: [
            {
              name: 'step1',
              operation: 'failing-operation'
            }
          ]
        },
        schedule: {
          type: 'immediate'
        }
      };

      orchestrator.registerTask('failed-event-task', taskDefinition);
      await orchestrator.executeTask('failed-event-task');

      expect(failedSpy).toHaveBeenCalledWith({
        taskId: 'failed-event-task',
        execution: expect.objectContaining({ status: 'failed' }),
        error: expect.any(String)
      });
    });
  });

  describe('Task Templates', () => {
    it('should create task from template', async () => {
      const template = {
        name: 'Template Task',
        description: 'A task template',
        workflow: {
          name: 'template-workflow',
          description: 'Template workflow',
          steps: [
            {
              name: 'step1',
              operation: 'test-operation',
              parameters: { input: '${input}' }
            }
          ]
        },
        schedule: {
          type: 'immediate'
        }
      };

      const task = orchestrator.createTaskFromTemplate('template-task', template, {
        input: 'template-value'
      });

      expect(task).toBeDefined();
      expect(task.workflow.steps[0].parameters.input).toBe('template-value');

      const execution = await orchestrator.executeTask('template-task', { input: 'template-value' });

      expect(execution.status).toBe('completed');
      expect(execution.result.success).toBe(true);
    });
  });
});