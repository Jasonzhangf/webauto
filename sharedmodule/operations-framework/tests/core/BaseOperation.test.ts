import { BaseOperation } from '../../src/core/BaseOperation';
import { OperationContext, OperationConfig, OperationResult, ValidationResult } from '../../src/types/operationTypes';
import { EventEmitter } from 'events';

// Mock implementation of BaseOperation for testing
class MockOperation extends BaseOperation {
  async execute(context: OperationContext, params: OperationConfig = {}): Promise<OperationResult> {
    return {
      success: true,
      data: { message: 'Mock operation executed', params },
      metadata: {
        executionTime: 10,
        operationName: 'MockOperation'
      }
    };
  }

  protected validateParametersImpl(params: OperationConfig): ValidationResult {
    if (params.requiredParam === undefined) {
      return {
        isValid: false,
        errors: ['requiredParam is required']
      };
    }
    return { isValid: true };
  }
}

describe('BaseOperation', () => {
  let operation: MockOperation;
  let mockContext: OperationContext;

  beforeEach(() => {
    operation = new MockOperation();
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
  });

  describe('Parameter Validation', () => {
    it('should validate parameters successfully', () => {
      const params = { requiredParam: 'value' };
      const result = operation.validateParameters(params);

      expect(result.isValid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('should return validation errors for missing required parameters', () => {
      const params = {};
      const result = operation.validateParameters(params);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('requiredParam is required');
    });

    it('should validate with default parameters', () => {
      const result = operation.validateParameters();

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('requiredParam is required');
    });
  });

  describe('Operation Execution', () => {
    it('should execute operation successfully with valid parameters', async () => {
      const params = { requiredParam: 'value' };
      const result = await operation.execute(mockContext, params);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        message: 'Mock operation executed',
        params: { requiredParam: 'value' }
      });
      expect(result.metadata.executionTime).toBeGreaterThan(0);
    });

    it('should throw error for invalid parameters', async () => {
      const params = {};

      await expect(operation.execute(mockContext, params))
        .rejects
        .toThrow('Parameter validation failed');
    });

    it('should handle execution errors gracefully', async () => {
      const failingOperation = new class extends BaseOperation {
        async execute(context: OperationContext, params: OperationConfig = {}): Promise<OperationResult> {
          throw new Error('Execution failed');
        }

        protected validateParametersImpl(params: OperationConfig): ValidationResult {
          return { isValid: true };
        }
      };

      const params = { requiredParam: 'value' };
      const result = await failingOperation.execute(mockContext, params);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Execution failed');
    });

    it('should include metadata in result', async () => {
      const params = { requiredParam: 'value' };
      const result = await operation.execute(mockContext, params);

      expect(result.metadata).toBeDefined();
      expect(result.metadata.operationName).toBe('MockOperation');
      expect(result.metadata.startTime).toBeDefined();
      expect(result.metadata.endTime).toBeDefined();
      expect(result.metadata.executionTime).toBeGreaterThan(0);
    });
  });

  describe('Statistics Tracking', () => {
    it('should track execution statistics', async () => {
      const params = { requiredParam: 'value' };
      await operation.execute(mockContext, params);

      const stats = operation.getStatistics();

      expect(stats.totalExecutions).toBe(1);
      expect(stats.successfulExecutions).toBe(1);
      expect(stats.failedExecutions).toBe(0);
      expect(stats.averageExecutionTime).toBeGreaterThan(0);
    });

    it('should track failed executions', async () => {
      const failingOperation = new class extends BaseOperation {
        async execute(context: OperationContext, params: OperationConfig = {}): Promise<OperationResult> {
          throw new Error('Execution failed');
        }

        protected validateParametersImpl(params: OperationConfig): ValidationResult {
          return { isValid: true };
        }
      };

      const params = { requiredParam: 'value' };
      await failingOperation.execute(mockContext, params);

      const stats = failingOperation.getStatistics();

      expect(stats.totalExecutions).toBe(1);
      expect(stats.successfulExecutions).toBe(0);
      expect(stats.failedExecutions).toBe(1);
    });

    it('should calculate average execution time correctly', async () => {
      const params = { requiredParam: 'value' };

      // Execute multiple times
      await operation.execute(mockContext, params);
      await operation.execute(mockContext, params);
      await operation.execute(mockContext, params);

      const stats = operation.getStatistics();

      expect(stats.totalExecutions).toBe(3);
      expect(stats.successfulExecutions).toBe(3);
      expect(stats.averageExecutionTime).toBeGreaterThan(0);
    });
  });

  describe('Event Emission', () => {
    it('should emit operation events', async () => {
      const params = { requiredParam: 'value' };
      const startSpy = jest.fn();
      const completeSpy = jest.fn();

      mockContext.eventBus.on('operationStarted', startSpy);
      mockContext.eventBus.on('operationCompleted', completeSpy);

      await operation.execute(mockContext, params);

      expect(startSpy).toHaveBeenCalledWith({
        operationName: 'MockOperation',
        parameters: params,
        timestamp: expect.any(Date)
      });

      expect(completeSpy).toHaveBeenCalledWith({
        operationName: 'MockOperation',
        result: expect.objectContaining({ success: true }),
        executionTime: expect.any(Number)
      });
    });
  });

  describe('Cleanup', () => {
    it('should reset statistics on cleanup', async () => {
      const params = { requiredParam: 'value' };
      await operation.execute(mockContext, params);

      operation.cleanup();

      const stats = operation.getStatistics();

      expect(stats.totalExecutions).toBe(0);
      expect(stats.successfulExecutions).toBe(0);
      expect(stats.failedExecutions).toBe(0);
      expect(stats.averageExecutionTime).toBe(0);
    });
  });
});