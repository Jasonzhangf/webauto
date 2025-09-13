/**
 * 错误处理系统单元测试
 */

import {
  BrowserAssistantError,
  TimeoutError,
  ElementNotFoundError,
  ConnectionError,
  AuthenticationError,
  ConfigurationError,
  OperationError,
  ValidationError,
  NetworkError,
  SerializationError,
  SecurityError,
  ResourceError,
  BrowserError,
  PageError,
  SelectorError,
  CookieError,
  JavaScriptError,
  ScreenshotError,
  NavigationError,
  FormError,
  FileOperationError,
  WebSocketError,
  MCPError,
  UnderConstructionError,
  UnderConstructionFeatureNotAvailable,
  UnderConstructionFeatureInProgress,
  UnderConstructionFeatureBlocked,
  ErrorSeverity,
  ErrorCategory,
  ErrorHandler,
  RetryStrategy,
  CircuitBreaker,
  ErrorMonitor,
  ErrorRecovery,
  ErrorReporter,
  createErrorHandler,
  createRetryStrategy,
  createCircuitBreaker,
  createErrorMonitor,
  createErrorRecovery,
  createErrorReporter
} from '../../src/errors';
import { createAsyncMock, createAsyncErrorMock, createLogSpy } from '../test-utils';

describe('错误处理系统', () => {
  let logSpy: ReturnType<typeof createLogSpy>;

  beforeEach(() => {
    logSpy = createLogSpy();
  });

  afterEach(() => {
    logSpy.info.mockRestore();
    logSpy.warn.mockRestore();
    logSpy.error.mockRestore();
  });

  describe('错误类型定义', () => {
    test('应该正确创建基础错误', () => {
      const error = new BrowserAssistantError('Test error');
      
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('BrowserAssistantError');
      expect(error.message).toBe('Test error');
      expect(error.severity).toBe(ErrorSeverity.MEDIUM);
      expect(error.category).toBe(ErrorCategory.GENERAL);
      expect(error.timestamp).toBeInstanceOf(Date);
      expect(error.stack).toBeDefined();
    });

    test('应该正确创建超时错误', () => {
      const error = new TimeoutError('Operation timed out');
      
      expect(error).toBeInstanceOf(BrowserAssistantError);
      expect(error.name).toBe('TimeoutError');
      expect(error.severity).toBe(ErrorSeverity.HIGH);
      expect(error.category).toBe(ErrorCategory.TIMEOUT);
      expect(error.message).toBe('Operation timed out');
    });

    test('应该正确创建元素未找到错误', () => {
      const error = new ElementNotFoundError('#non-existent');
      
      expect(error).toBeInstanceOf(BrowserAssistantError);
      expect(error.name).toBe('ElementNotFoundError');
      expect(error.severity).toBe(ErrorSeverity.MEDIUM);
      expect(error.category).toBe(ErrorCategory.ELEMENT);
      expect(error.selector).toBe('#non-existent');
      expect(error.message).toBe('Element not found: #non-existent');
    });

    test('应该正确创建连接错误', () => {
      const error = new ConnectionError('Connection failed');
      
      expect(error).toBeInstanceOf(BrowserAssistantError);
      expect(error.name).toBe('ConnectionError');
      expect(error.severity).toBe(ErrorSeverity.CRITICAL);
      expect(error.category).toBe(ErrorCategory.CONNECTION);
    });

    test('应该正确创建认证错误', () => {
      const error = new AuthenticationError('Auth failed');
      
      expect(error).toBeInstanceOf(BrowserAssistantError);
      expect(error.name).toBe('AuthenticationError');
      expect(error.severity).toBe(ErrorSeverity.CRITICAL);
      expect(error.category).toBe(ErrorCategory.AUTHENTICATION);
    });

    test('应该正确创建配置错误', () => {
      const error = new ConfigurationError('Invalid config');
      
      expect(error).toBeInstanceOf(BrowserAssistantError);
      expect(error.name).toBe('ConfigurationError');
      expect(error.severity).toBe(ErrorSeverity.HIGH);
      expect(error.category).toBe(ErrorCategory.CONFIGURATION);
    });

    test('应该正确创建操作错误', () => {
      const error = new OperationError('Operation failed');
      
      expect(error).toBeInstanceOf(BrowserAssistantError);
      expect(error.name).toBe('OperationError');
      expect(error.severity).toBe(ErrorSeverity.MEDIUM);
      expect(error.category).toBe(ErrorCategory.OPERATION);
    });

    test('应该正确创建验证错误', () => {
      const error = new ValidationError('Validation failed');
      
      expect(error).toBeInstanceOf(BrowserAssistantError);
      expect(error.name).toBe('ValidationError');
      expect(error.severity).toBe(ErrorSeverity.LOW);
      expect(error.category).toBe(ErrorCategory.VALIDATION);
    });

    test('应该正确创建网络错误', () => {
      const error = new NetworkError('Network error');
      
      expect(error).toBeInstanceOf(BrowserAssistantError);
      expect(error.name).toBe('NetworkError');
      expect(error.severity).toBe(ErrorSeverity.MEDIUM);
      expect(error.category).toBe(ErrorCategory.NETWORK);
    });

    test('应该正确创建序列化错误', () => {
      const error = new SerializationError('Serialization failed');
      
      expect(error).toBeInstanceOf(BrowserAssistantError);
      expect(error.name).toBe('SerializationError');
      expect(error.severity).toBe(ErrorSeverity.LOW);
      expect(error.category).toBe(ErrorCategory.SERIALIZATION);
    });

    test('应该正确创建安全错误', () => {
      const error = new SecurityError('Security violation');
      
      expect(error).toBeInstanceOf(BrowserAssistantError);
      expect(error.name).toBe('SecurityError');
      expect(error.severity).toBe(ErrorSeverity.CRITICAL);
      expect(error.category).toBe(ErrorCategory.SECURITY);
    });

    test('应该正确创建资源错误', () => {
      const error = new ResourceError('Resource not found');
      
      expect(error).toBeInstanceOf(BrowserAssistantError);
      expect(error.name).toBe('ResourceError');
      expect(error.severity).toBe(ErrorSeverity.MEDIUM);
      expect(error.category).toBe(ErrorCategory.RESOURCE);
    });

    test('应该正确创建浏览器错误', () => {
      const error = new BrowserError('Browser crashed');
      
      expect(error).toBeInstanceOf(BrowserAssistantError);
      expect(error.name).toBe('BrowserError');
      expect(error.severity).toBe(ErrorSeverity.CRITICAL);
      expect(error.category).toBe(ErrorCategory.BROWSER);
    });

    test('应该正确创建页面错误', () => {
      const error = new PageError('Page load failed');
      
      expect(error).toBeInstanceOf(BrowserAssistantError);
      expect(error.name).toBe('PageError');
      expect(error.severity).toBe(ErrorSeverity.MEDIUM);
      expect(error.category).toBe(ErrorCategory.PAGE);
    });

    test('应该正确创建选择器错误', () => {
      const error = new SelectorError('Invalid selector');
      
      expect(error).toBeInstanceOf(BrowserAssistantError);
      expect(error.name).toBe('SelectorError');
      expect(error.severity).toBe(ErrorSeverity.LOW);
      expect(error.category).toBe(ErrorCategory.SELECTOR);
    });

    test('应该正确创建Cookie错误', () => {
      const error = new CookieError('Cookie operation failed');
      
      expect(error).toBeInstanceOf(BrowserAssistantError);
      expect(error.name).toBe('CookieError');
      expect(error.severity).toBe(ErrorSeverity.LOW);
      expect(error.category).toBe(ErrorCategory.COOKIE);
    });

    test('应该正确创建JavaScript错误', () => {
      const error = new JavaScriptError('Script execution failed');
      
      expect(error).toBeInstanceOf(BrowserAssistantError);
      expect(error.name).toBe('JavaScriptError');
      expect(error.severity).toBe(ErrorSeverity.MEDIUM);
      expect(error.category).toBe(ErrorCategory.JAVASCRIPT);
    });

    test('应该正确创建截图错误', () => {
      const error = new ScreenshotError('Screenshot failed');
      
      expect(error).toBeInstanceOf(BrowserAssistantError);
      expect(error.name).toBe('ScreenshotError');
      expect(error.severity).toBe(ErrorSeverity.LOW);
      expect(error.category).toBe(ErrorCategory.SCREENSHOT);
    });

    test('应该正确创建导航错误', () => {
      const error = new NavigationError('Navigation failed');
      
      expect(error).toBeInstanceOf(BrowserAssistantError);
      expect(error.name).toBe('NavigationError');
      expect(error.severity).toBe(ErrorSeverity.MEDIUM);
      expect(error.category).toBe(ErrorCategory.NAVIGATION);
    });

    test('应该正确创建表单错误', () => {
      const error = new FormError('Form submission failed');
      
      expect(error).toBeInstanceOf(BrowserAssistantError);
      expect(error.name).toBe('FormError');
      expect(error.severity).toBe(ErrorSeverity.MEDIUM);
      expect(error.category).toBe(ErrorCategory.FORM);
    });

    test('应该正确创建文件操作错误', () => {
      const error = new FileOperationError('File operation failed');
      
      expect(error).toBeInstanceOf(BrowserAssistantError);
      expect error.name).toBe('FileOperationError');
      expect(error.severity).toBe(ErrorSeverity.MEDIUM);
      expect(error.category).toBe(ErrorCategory.FILE_OPERATION);
    });

    test('应该正确创建WebSocket错误', () => {
      const error = new WebSocketError('WebSocket connection failed');
      
      expect(error).toBeInstanceOf(BrowserAssistantError);
      expect(error.name).toBe('WebSocketError');
      expect(error.severity).toBe(ErrorSeverity.MEDIUM);
      expect(error.category).toBe(ErrorCategory.WEBSOCKET);
    });

    test('应该正确创建MCP错误', () => {
      const error = new MCPError('MCP operation failed');
      
      expect(error).toBeInstanceOf(BrowserAssistantError);
      expect(error.name).toBe('MCPError');
      expect(error.severity).toBe(ErrorSeverity.MEDIUM);
      expect(error.category).toBe(ErrorCategory.MCP);
    });

    test('应该正确创建UnderConstruction错误', () => {
      const error = new UnderConstructionError('Feature under construction');
      
      expect(error).toBeInstanceOf(BrowserAssistantError);
      expect(error.name).toBe('UnderConstructionError');
      expect(error.severity).toBe(ErrorSeverity.INFO);
      expect(error.category).toBe(ErrorCategory.UNDER_CONSTRUCTION);
    });

    test('应该正确创建功能不可用错误', () => {
      const error = new UnderConstructionFeatureNotAvailable('user-authentication', 'Feature not available');
      
      expect(error).toBeInstanceOf(UnderConstructionError);
      expect(error.name).toBe('UnderConstructionFeatureNotAvailable');
      expect(error.featureName).toBe('user-authentication');
      expect(error.message).toBe('Feature not available: user-authentication');
    });

    test('应该正确创建功能进行中错误', () => {
      const error = new UnderConstructionFeatureInProgress('ai-analysis', 'Feature in progress');
      
      expect(error).toBeInstanceOf(UnderConstructionError);
      expect(error.name).toBe('UnderConstructionFeatureInProgress');
      expect(error.featureName).toBe('ai-analysis');
      expect(error.message).toBe('Feature in progress: ai-analysis');
    });

    test('应该正确创建功能被阻止错误', () => {
      const error = new UnderConstructionFeatureBlocked('security-features', 'Feature blocked');
      
      expect(error).toBeInstanceOf(UnderConstructionError);
      expect(error.name).toBe('UnderConstructionFeatureBlocked');
      expect(error.featureName).toBe('security-features');
      expect(error.message).toBe('Feature blocked: security-features');
    });
  });

  describe('错误处理器', () => {
    test('应该正确处理错误', () => {
      const handler = createErrorHandler();
      const error = new Error('Test error');
      
      const result = handler.handleError(error);
      
      expect(result).toBe(true);
      expect(logSpy.error).toHaveBeenCalledWith(
        '[ErrorHandler] Error handled:',
        expect.objectContaining({
          name: 'Error',
          message: 'Test error'
        })
      );
    });

    test('应该根据严重性处理错误', () => {
      const handler = createErrorHandler();
      const criticalError = new BrowserAssistantError('Critical error', ErrorSeverity.CRITICAL);
      
      handler.handleError(criticalError);
      
      expect(logSpy.error).toHaveBeenCalledWith(
        '[ErrorHandler] Critical error detected:',
        criticalError
      );
    });

    test('应该支持自定义错误处理策略', () => {
      const customStrategy = (error: Error) => {
        console.log('Custom handling:', error.message);
        return false;
      };
      
      const handler = createErrorHandler({ strategy: customStrategy });
      const error = new Error('Custom error');
      
      const result = handler.handleError(error);
      
      expect(result).toBe(false);
    });

    test('应该批量处理多个错误', () => {
      const handler = createErrorHandler();
      const errors = [
        new Error('Error 1'),
        new Error('Error 2'),
        new Error('Error 3')
      ];
      
      const results = handler.handleErrors(errors);
      
      expect(results).toEqual([true, true, true]);
      expect(logSpy.error).toHaveBeenCalledTimes(3);
    });
  });

  describe('重试策略', () => {
    test('应该实现指数退避重试', async () => {
      const strategy = createRetryStrategy({
        maxRetries: 3,
        baseDelay: 100,
        maxDelay: 1000
      });
      
      let attemptCount = 0;
      const failingOperation = jest.fn()
        .mockImplementationOnce(() => { attemptCount++; throw new Error('First failure'); })
        .mockImplementationOnce(() => { attemptCount++; throw new Error('Second failure'); })
        .mockImplementationOnce(() => { attemptCount++; return 'Success'; });
      
      const result = await strategy.execute(failingOperation);
      
      expect(result).toBe('Success');
      expect(attemptCount).toBe(3);
      expect(failingOperation).toHaveBeenCalledTimes(3);
    });

    test('应该在达到最大重试次数后放弃', async () => {
      const strategy = createRetryStrategy({
        maxRetries: 2,
        baseDelay: 50
      });
      
      const failingOperation = jest.fn().mockRejectedValue(new Error('Always fails'));
      
      await expect(strategy.execute(failingOperation))
        .rejects.toThrow('Always fails');
      
      expect(failingOperation).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    test('应该只重试可重试的错误', async () => {
      const strategy = createRetryStrategy({
        maxRetries: 3,
        retryableErrors: [TimeoutError, NetworkError]
      });
      
      const nonRetryableOperation = jest.fn()
        .mockRejectedValue(new ValidationError('Validation error'));
      
      await expect(strategy.execute(nonRetryableOperation))
        .rejects.toThrow('Validation error');
      
      expect(nonRetryableOperation).toHaveBeenCalledTimes(1); // No retries for non-retryable errors
    });

    test('应该实现断路器模式', async () => {
      const strategy = createRetryStrategy({
        maxRetries: 3,
        circuitBreaker: true,
        failureThreshold: 3,
        recoveryTimeout: 1000
      });
      
      const failingOperation = jest.fn().mockRejectedValue(new Error('Always fails'));
      
      // 触发断路器
      for (let i = 0; i < 3; i++) {
        await expect(strategy.execute(failingOperation)).rejects.toThrow();
      }
      
      // 断路器应该打开
      await expect(strategy.execute(failingOperation))
        .rejects.toThrow('Circuit breaker is open');
      
      expect(failingOperation).toHaveBeenCalledTimes(3);
    });
  });

  describe('断路器', () => {
    test('应该正确管理断路器状态', () => {
      const breaker = createCircuitBreaker({
        failureThreshold: 3,
        recoveryTimeout: 5000
      });
      
      expect(breaker.getState()).toBe('CLOSED');
      
      // 模拟失败
      for (let i = 0; i < 3; i++) {
        breaker.recordFailure();
      }
      
      expect(breaker.getState()).toBe('OPEN');
      
      // 等待恢复超时
      jest.useFakeTimers();
      jest.advanceTimersByTime(5000);
      
      expect(breaker.getState()).toBe('HALF_OPEN');
      
      // 模拟成功
      breaker.recordSuccess();
      
      expect(breaker.getState()).toBe('CLOSED');
      
      jest.useRealTimers();
    });

    test('应该在断路器打开时快速失败', async () => {
      const breaker = createCircuitBreaker({
        failureThreshold: 1,
        recoveryTimeout: 1000
      });
      
      const operation = jest.fn().mockRejectedValue(new Error('Operation failed'));
      
      // 触发断路器
      try {
        await breaker.execute(operation);
      } catch (error) {
        // Expected failure
      }
      
      // 断路器应该打开
      await expect(breaker.execute(operation))
        .rejects.toThrow('Circuit breaker is open');
      
      expect(operation).toHaveBeenCalledTimes(1);
    });
  });

  describe('错误监控', () => {
    test('应该监控错误发生频率', () => {
      const monitor = createErrorMonitor();
      
      const errors = [
        new TimeoutError('Timeout 1'),
        new NetworkError('Network error'),
        new TimeoutError('Timeout 2')
      ];
      
      errors.forEach(error => monitor.recordError(error));
      
      const stats = monitor.getStats();
      
      expect(stats.totalErrors).toBe(3);
      expect(stats.errorByType).toEqual({
        TimeoutError: 2,
        NetworkError: 1
      });
      expect(stats.errorByCategory).toEqual({
        [ErrorCategory.TIMEOUT]: 2,
        [ErrorCategory.NETWORK]: 1
      });
    });

    test('应该计算错误率', () => {
      const monitor = createErrorMonitor();
      
      // 模拟操作和错误
      for (let i = 0; i < 10; i++) {
        monitor.recordOperation();
        if (i % 2 === 0) {
          monitor.recordError(new Error('Sample error'));
        }
      }
      
      const errorRate = monitor.getErrorRate();
      
      expect(errorRate).toBe(0.5); // 5 errors out of 10 operations
    });

    test('应该检测错误模式', () => {
      const monitor = createErrorMonitor();
      
      // 模拟连续超时错误
      for (let i = 0; i < 5; i++) {
        monitor.recordError(new TimeoutError('Timeout'));
      }
      
      const patterns = monitor.detectPatterns();
      
      expect(patterns.some(p => p.type === 'consecutive_timeouts')).toBe(true);
    });
  });

  describe('错误恢复', () => {
    test('应该提供恢复策略', async () => {
      const recovery = createErrorRecovery({
        strategies: {
          [ErrorCategory.CONNECTION]: async (error) => {
            await new Promise(resolve => setTimeout(resolve, 100));
            return 'reconnected';
          },
          [ErrorCategory.TIMEOUT]: async (error) => {
            return 'retry_succeeded';
          }
        }
      });
      
      const connectionError = new ConnectionError('Connection lost');
      const result = await recovery.recover(connectionError);
      
      expect(result).toBe('reconnected');
    });

    test('应该支持自定义恢复逻辑', async () => {
      const recovery = createErrorRecovery();
      
      recovery.addStrategy(ValidationError, async (error) => {
        return 'validation_fixed';
      });
      
      const validationError = new ValidationError('Invalid input');
      const result = await recovery.recover(validationError);
      
      expect(result).toBe('validation_fixed');
    });

    test('应该处理恢复失败', async () => {
      const recovery = createErrorRecovery();
      
      const unrecoverableError = new SecurityError('Security violation');
      
      await expect(recovery.recover(unrecoverableError))
        .rejects.toThrow(SecurityError);
    });
  });

  describe('错误报告', () => {
    test('应该生成错误报告', () => {
      const reporter = createErrorReporter();
      const error = new TimeoutError('Operation timeout');
      
      const report = reporter.generateReport(error);
      
      expect(report).toEqual(expect.objectContaining({
        error: expect.objectContaining({
          name: 'TimeoutError',
          message: 'Operation timeout',
          severity: ErrorSeverity.HIGH,
          category: ErrorCategory.TIMEOUT
        }),
        context: expect.any(Object),
        timestamp: expect.any(Date)
      }));
    });

    test('应该支持多种报告格式', () => {
      const reporter = createErrorReporter();
      const error = new Error('Test error');
      
      const jsonReport = reporter.generateReport(error, 'json');
      const textReport = reporter.generateReport(error, 'text');
      
      expect(typeof jsonReport).toBe('object');
      expect(typeof textReport).toBe('string');
    });

    test('应该发送错误通知', async () => {
      const reporter = createErrorReporter({
        notificationChannels: ['console', 'file']
      });
      
      const error = new Error('Notification test');
      
      await reporter.notify(error);
      
      expect(logSpy.error).toHaveBeenCalledWith(
        '[ErrorReporter] Error notification:',
        expect.objectContaining({
          name: 'Error',
          message: 'Notification test'
        })
      );
    });
  });

  describe('错误集成测试', () => {
    test('应该完整处理错误生命周期', async () => {
      const handler = createErrorHandler();
      const strategy = createRetryStrategy({ maxRetries: 2 });
      const monitor = createErrorMonitor();
      const recovery = createErrorRecovery();
      
      // 模拟一个会失败的然后恢复的操作
      let attemptCount = 0;
      const operation = jest.fn()
        .mockImplementationOnce(() => {
          attemptCount++;
          monitor.recordError(new NetworkError('Network failure'));
          throw new NetworkError('Network failure');
        })
        .mockImplementationOnce(() => {
          attemptCount++;
          return 'Success';
        });
      
      try {
        const result = await strategy.execute(operation);
        expect(result).toBe('Success');
      } catch (error) {
        await recovery.recover(error as Error);
      }
      
      const stats = monitor.getStats();
      expect(stats.totalErrors).toBe(1);
      expect(attemptCount).toBe(2);
    });

    test('应该处理级联错误', () => {
      const handler = createErrorHandler();
      
      // 模拟一个错误导致其他错误的情况
      const primaryError = new ConnectionError('Primary connection failed');
      const secondaryErrors = [
        new TimeoutError('Secondary timeout'),
        new ValidationError('Secondary validation error')
      ];
      
      handler.handleError(primaryError);
      secondaryErrors.forEach(error => handler.handleError(error));
      
      // 应该记录所有错误
      expect(logSpy.error).toHaveBeenCalledTimes(3);
    });
  });
});