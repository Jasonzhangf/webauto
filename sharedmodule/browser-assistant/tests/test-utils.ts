/**
 * 测试工具函数
 */

import { jest } from '@jest/globals';

/**
 * 创建异步函数的模拟实现
 */
export function createAsyncMock<T>(returnValue: T) {
  return jest.fn().mockResolvedValue(returnValue);
}

/**
 * 创建抛出错误的异步函数模拟
 */
export function createAsyncErrorMock(error: Error) {
  return jest.fn().mockRejectedValue(error);
}

/**
 * 创建模拟的ElementHandle
 */
export function createMockElementHandle<T = any>(elementData: Partial<T> = {}) {
  return {
    click: createAsyncMock<void>(undefined),
    type: createAsyncMock<void>(undefined),
    evaluate: createAsyncMock<any>(elementData),
    screenshot: createAsyncMock<Buffer>(Buffer.from('mock-screenshot')),
    $: jest.fn(),
    $$: jest.fn(),
    isVisible: jest.fn().mockReturnValue(true),
    isHidden: jest.fn().mockReturnValue(false),
    ...elementData
  };
}

/**
 * 创建模拟的Cookie数据
 */
export function createMockCookie(overrides = {}) {
  return {
    name: 'test-cookie',
    value: 'test-value',
    domain: 'example.com',
    path: '/',
    expires: Date.now() + 86400000,
    httpOnly: false,
    secure: false,
    sameSite: 'Lax' as const,
    ...overrides
  };
}

/**
 * 创建模拟的浏览器配置
 */
export function createMockConfig(overrides = {}) {
  return {
    headless: true,
    launchTimeout: 30000,
    defaultTimeout: 10000,
    viewport: { width: 1920, height: 1080 },
    ...overrides
  };
}

/**
 * 等待指定时间
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 验证错误类型
 */
export function expectError(error: any, expectedType: new (...args: any[]) => Error) {
  expect(error).toBeInstanceOf(expectedType);
  expect(error.message).toBeDefined();
}

/**
 * 验证函数被调用特定次数
 */
export function expectCalledTimes(mockFn: jest.Mock, times: number) {
  expect(mockFn).toHaveBeenCalledTimes(times);
}

/**
 * 验证函数被调用时使用了特定参数
 */
export function expectCalledWith(mockFn: jest.Mock, ...args: any[]) {
  expect(mockFn).toHaveBeenCalledWith(...args);
}

/**
 * 创建测试用的临时目录
 */
export function createTestDir(dirName: string): string {
  const fs = require('fs');
  const path = require('path');
  
  if (!fs.existsSync(dirName)) {
    fs.mkdirSync(dirName, { recursive: true });
  }
  
  return dirName;
}

/**
 * 清理测试目录
 */
export function cleanupTestDir(dirName: string) {
  const fs = require('fs');
  const path = require('path');
  
  if (fs.existsSync(dirName)) {
    const files = fs.readdirSync(dirName);
    files.forEach(file => {
      fs.unlinkSync(path.join(dirName, file));
    });
    fs.rmdirSync(dirName);
  }
}

/**
 * 模拟文件系统操作
 */
export function mockFileSystem() {
  const mockFs = {
    existsSync: jest.fn(),
    mkdirSync: jest.fn(),
    readFileSync: jest.fn(),
    writeFileSync: jest.fn(),
    readdirSync: jest.fn(),
    unlinkSync: jest.fn()
  };
  
  require('fs').existsSync = mockFs.existsSync;
  require('fs').mkdirSync = mockFs.mkdirSync;
  require('fs').readFileSync = mockFs.readFileSync;
  require('fs').writeFileSync = mockFs.writeFileSync;
  require('fs').readdirSync = mockFs.readdirSync;
  require('fs').unlinkSync = mockFs.unlinkSync;
  
  return mockFs;
}

/**
 * 重置文件系统模拟
 */
export function resetFileSystemMock() {
  const fs = require('fs');
  Object.keys(fs).forEach(key => {
    if (typeof fs[key] === 'function') {
      delete fs[key];
    }
  });
}

/**
 * 创建测试用的日志间谍
 */
export function createLogSpy() {
  return {
    info: jest.spyOn(console, 'log').mockImplementation(() => {}),
    warn: jest.spyOn(console, 'warn').mockImplementation(() => {}),
    error: jest.spyOn(console, 'error').mockImplementation(() => {})
  };
}

/**
 * 重置日志间谍
 */
export function resetLogSpy(spy: ReturnType<typeof createLogSpy>) {
  spy.info.mockRestore();
  spy.warn.mockRestore();
  spy.error.mockRestore();
}