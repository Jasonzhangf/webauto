import { OperationRegistry } from '../../src/core/OperationRegistry';
import { BaseOperation } from '../../src/core/BaseOperation';
import { OperationContext, OperationConfig } from '../../src/types/operationTypes';
import { EventEmitter } from 'events';

// Mock operation classes for testing
class MockNavigationOperation extends BaseOperation {
  async execute(context: OperationContext, params: OperationConfig = {}): Promise<any> {
    return { success: true, action: 'navigate' };
  }

  protected validateParametersImpl(params: OperationConfig): any {
    return { isValid: true };
  }

  getCapabilities(): string[] {
    return ['navigation', 'url-handling'];
  }

  getCategory(): string {
    return 'browser';
  }
}

class MockFileOperation extends BaseOperation {
  async execute(context: OperationContext, params: OperationConfig = {}): Promise<any> {
    return { success: true, action: 'file' };
  }

  protected validateParametersImpl(params: OperationConfig): any {
    return { isValid: true };
  }

  getCapabilities(): string[] {
    return ['file-read', 'file-write'];
  }

  getCategory(): string {
    return 'file-system';
  }
}

class MockAIOperation extends BaseOperation {
  async execute(context: OperationContext, params: OperationConfig = {}): Promise<any> {
    return { success: true, action: 'ai' };
  }

  protected validateParametersImpl(params: OperationConfig): any {
    return { isValid: true };
  }

  getCapabilities(): string[] {
    return ['text-processing', 'content-analysis'];
  }

  getCategory(): string {
    return 'ai';
  }
}

describe('OperationRegistry', () => {
  let registry: OperationRegistry;
  let mockContext: OperationContext;

  beforeEach(() => {
    registry = new OperationRegistry();
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

  afterEach(() => {
    registry.clear();
  });

  describe('Operation Registration', () => {
    it('should register operations successfully', () => {
      const operation = new MockNavigationOperation();
      const result = registry.register('navigation', operation);

      expect(result).toBe(true);
      expect(registry.isRegistered('navigation')).toBe(true);
    });

    it('should not allow duplicate operation names', () => {
      const operation1 = new MockNavigationOperation();
      const operation2 = new MockNavigationOperation();

      registry.register('navigation', operation1);
      const result = registry.register('navigation', operation2);

      expect(result).toBe(false);
    });

    it('should throw error for invalid operation', () => {
      expect(() => {
        registry.register('invalid', {} as any);
      }).toThrow('Invalid operation instance');
    });
  });

  describe('Operation Retrieval', () => {
    it('should retrieve registered operations', () => {
      const operation = new MockNavigationOperation();
      registry.register('navigation', operation);

      const retrieved = registry.get('navigation');

      expect(retrieved).toBe(operation);
    });

    it('should return undefined for unregistered operations', () => {
      const retrieved = registry.get('nonexistent');

      expect(retrieved).toBeUndefined();
    });

    it('should list all registered operations', () => {
      const navOp = new MockNavigationOperation();
      const fileOp = new MockFileOperation();

      registry.register('navigation', navOp);
      registry.register('file-read', fileOp);

      const operations = registry.list();

      expect(operations).toEqual(['navigation', 'file-read']);
    });
  });

  describe('Operation Finding', () => {
    beforeEach(() => {
      registry.register('navigation', new MockNavigationOperation());
      registry.register('file-read', new MockFileOperation());
      registry.register('text-analysis', new MockAIOperation());
    });

    it('should find operations by category', () => {
      const browserOps = registry.findByCategory('browser');
      const fileOps = registry.findByCategory('file-system');
      const aiOps = registry.findByCategory('ai');

      expect(browserOps).toHaveLength(1);
      expect(browserOps[0].name).toBe('navigation');

      expect(fileOps).toHaveLength(1);
      expect(fileOps[0].name).toBe('file-read');

      expect(aiOps).toHaveLength(1);
      expect(aiOps[0].name).toBe('text-analysis');
    });

    it('should return empty array for non-existent category', () => {
      const ops = registry.findByCategory('non-existent');

      expect(ops).toHaveLength(0);
    });

    it('should find operations by capability', () => {
      const navOps = registry.findByCapability('navigation');
      const fileOps = registry.findByCapability('file-read');
      const aiOps = registry.findByCapability('text-processing');

      expect(navOps).toHaveLength(1);
      expect(navOps[0].name).toBe('navigation');

      expect(fileOps).toHaveLength(1);
      expect(fileOps[0].name).toBe('file-read');

      expect(aiOps).toHaveLength(1);
      expect(aiOps[0].name).toBe('text-analysis');
    });

    it('should return empty array for non-existent capability', () => {
      const ops = registry.findByCapability('non-existent');

      expect(ops).toHaveLength(0);
    });

    it('should find operations by multiple capabilities', () => {
      const ops = registry.findByCapability(['navigation', 'url-handling']);

      expect(ops).toHaveLength(1);
      expect(ops[0].name).toBe('navigation');
    });

    it('should find best operation for capability', () => {
      const bestOp = registry.findBestForCapability('navigation');

      expect(bestOp).toBeDefined();
      expect(bestOp!.name).toBe('navigation');
    });

    it('should return undefined for non-existent capability', () => {
      const bestOp = registry.findBestForCapability('non-existent');

      expect(bestOp).toBeUndefined();
    });
  });

  describe('Operation Execution', () => {
    it('should execute operations by name', async () => {
      const operation = new MockNavigationOperation();
      jest.spyOn(operation, 'execute');

      registry.register('navigation', operation);

      const result = await registry.execute('navigation', mockContext, { url: 'https://example.com' });

      expect(result.success).toBe(true);
      expect(operation.execute).toHaveBeenCalledWith(mockContext, { url: 'https://example.com' });
    });

    it('should throw error for unregistered operation execution', async () => {
      await expect(registry.execute('nonexistent', mockContext))
        .rejects
        .toThrow('Operation nonexistent not found');
    });

    it('should batch execute operations', async () => {
      const navOp = new MockNavigationOperation();
      const fileOp = new MockFileOperation();

      jest.spyOn(navOp, 'execute');
      jest.spyOn(fileOp, 'execute');

      registry.register('navigation', navOp);
      registry.register('file-read', fileOp);

      const results = await registry.batchExecute([
        { name: 'navigation', params: { url: 'https://example.com' } },
        { name: 'file-read', params: { path: '/test.txt' } }
      ], mockContext);

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
      expect(navOp.execute).toHaveBeenCalledTimes(1);
      expect(fileOp.execute).toHaveBeenCalledTimes(1);
    });

    it('should handle batch execution with partial failures', async () => {
      const failingOp = new class extends MockNavigationOperation {
        async execute(context: OperationContext, params: OperationConfig = {}): Promise<any> {
          throw new Error('Execution failed');
        }
      }();

      registry.register('navigation', new MockNavigationOperation());
      registry.register('failing', failingOp);

      const results = await registry.batchExecute([
        { name: 'navigation', params: { url: 'https://example.com' } },
        { name: 'failing', params: {} }
      ], mockContext);

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[1].error).toBe('Execution failed');
    });
  });

  describe('Operation Management', () => {
    it('should unregister operations', () => {
      const operation = new MockNavigationOperation();

      registry.register('navigation', operation);
      expect(registry.isRegistered('navigation')).toBe(true);

      registry.unregister('navigation');
      expect(registry.isRegistered('navigation')).toBe(false);
    });

    it('should clear all operations', () => {
      registry.register('navigation', new MockNavigationOperation());
      registry.register('file-read', new MockFileOperation());

      expect(registry.list()).toHaveLength(2);

      registry.clear();

      expect(registry.list()).toHaveLength(0);
    });

    it('should get operation statistics', () => {
      const operation = new MockNavigationOperation();
      registry.register('navigation', operation);

      const stats = registry.getStatistics();

      expect(stats).toBeDefined();
      expect(stats.totalOperations).toBe(1);
      expect(stats.byCategory).toEqual({
        'browser': 1
      });
      expect(stats.byCapability).toEqual({
        'navigation': 1,
        'url-handling': 1
      });
    });
  });

  describe('Registry Events', () => {
    it('should emit events on operation registration', () => {
      const spy = jest.fn();
      registry.on('operationRegistered', spy);

      const operation = new MockNavigationOperation();
      registry.register('navigation', operation);

      expect(spy).toHaveBeenCalledWith({
        name: 'navigation',
        operation: operation,
        category: 'browser'
      });
    });

    it('should emit events on operation unregistration', () => {
      const operation = new MockNavigationOperation();
      registry.register('navigation', operation);

      const spy = jest.fn();
      registry.on('operationUnregistered', spy);

      registry.unregister('navigation');

      expect(spy).toHaveBeenCalledWith({
        name: 'navigation',
        operation: operation
      });
    });
  });
});