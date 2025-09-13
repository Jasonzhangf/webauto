/**
 * 简化版Jest测试环境设置
 */

import { jest } from '@jest/globals';

// 设置测试环境变量
process.env.NODE_ENV = 'test';
process.env.BROWSER_ASSISTANT_TEST_MODE = 'true';

// 模拟浏览器环境，避免实际浏览器启动
jest.mock('playwright', () => ({
  chromium: {
    launch: jest.fn().mockImplementation(async () => ({
      newContext: jest.fn().mockResolvedValue({
        newPage: jest.fn().mockResolvedValue({
          url: jest.fn().mockReturnValue('https://example.com'),
          title: jest.fn().mockResolvedValue('Test Page'),
          goto: jest.fn(),
          click: jest.fn(),
          type: jest.fn(),
          screenshot: jest.fn().mockResolvedValue(Buffer.from('fake-screenshot')),
          evaluate: jest.fn(),
          waitForSelector: jest.fn(),
          $: jest.fn(),
          $$: jest.fn(),
          close: jest.fn(),
          context: jest.fn().mockReturnValue({
            cookies: jest.fn().mockResolvedValue([]),
            clearCookies: jest.fn(),
            addCookies: jest.fn()
          }),
          setDefaultTimeout: jest.fn()
        }),
        cookies: jest.fn().mockResolvedValue([]),
        clearCookies: jest.fn(),
        addCookies: jest.fn(),
        close: jest.fn()
      }),
      close: jest.fn()
    }))
  }
}) as any);

// 模拟文件系统操作
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  readdirSync: jest.fn(),
  unlinkSync: jest.fn()
}) as any);

// 模拟加密模块
jest.mock('crypto', () => ({
  createCipheriv: jest.fn().mockReturnValue({
    update: jest.fn().mockReturnValue('encrypted'),
    final: jest.fn().mockReturnValue('data')
  }),
  createDecipheriv: jest.fn().mockReturnValue({
    update: jest.fn().mockReturnValue('decrypted'),
    final: jest.fn().mockReturnValue('data')
  }),
  randomBytes: jest.fn().mockReturnValue('random-bytes')
}) as any);

// 模拟RCC模块
jest.mock('rcc-basemodule', () => ({
  BaseBrowserModule: class {
    config = {};
    logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    getLogger = () => this.logger;
    onInitialize = jest.fn();
    onCleanup = jest.fn();
    registerCapabilities = jest.fn();
    checkHealth = jest.fn();
  }
}) as any);

jest.mock('rcc-errorhandling', () => ({
  BaseErrorHandler: class {
    handleError = jest.fn();
  }
}) as any);

jest.mock('rcc-underconstruction', () => ({
  UnderConstructionModule: class {
    callUnderConstructionFeature = jest.fn();
  }
}) as any);

// 扩展全局类型
declare global {
  var createMockPage: () => any;
  var createMockContext: () => any;
  var createMockBrowser: () => any;
  var cleanupTestFiles: () => void;
}

// 全局测试工具
global.createMockPage = () => ({
  url: jest.fn().mockReturnValue('https://example.com'),
  title: jest.fn().mockResolvedValue('Test Page'),
  goto: jest.fn(),
  click: jest.fn(),
  type: jest.fn(),
  screenshot: jest.fn().mockResolvedValue(Buffer.from('fake-screenshot')),
  evaluate: jest.fn(),
  waitForSelector: jest.fn(),
  $: jest.fn(),
  $$: jest.fn(),
  close: jest.fn(),
  context: jest.fn().mockReturnValue({
    cookies: jest.fn().mockResolvedValue([]),
    clearCookies: jest.fn(),
    addCookies: jest.fn()
  }),
  setDefaultTimeout: jest.fn()
});

global.createMockContext = () => ({
  cookies: jest.fn().mockResolvedValue([]),
  clearCookies: jest.fn(),
  addCookies: jest.fn(),
  newPage: jest.fn().mockResolvedValue(global.createMockPage()),
  close: jest.fn()
});

global.createMockBrowser = () => ({
  newContext: jest.fn().mockResolvedValue(global.createMockContext()),
  close: jest.fn()
});

// 在所有测试之前运行
beforeAll(() => {
  console.log('🧪 Starting Browser Assistant Test Suite (Simplified)');
});

// 在每个测试之前运行
beforeEach(() => {
  // 清理模拟函数的调用历史
  jest.clearAllMocks();
});

// 在所有测试之后运行
afterAll(() => {
  console.log('✅ Browser Assistant Test Suite Completed (Simplified)');
});