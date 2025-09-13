/**
 * Jest测试环境设置
 */

import { jest } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

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
}));

// 模拟文件系统操作
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  readdirSync: jest.fn(),
  unlinkSync: jest.fn()
}));

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
}));

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

// 清理函数 - 在每个测试后调用
global.cleanupTestFiles = () => {
  const testDirs = [
    './test-cookies',
    './test-logs',
    './test-temp'
  ];
  
  testDirs.forEach(dir => {
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir);
      files.forEach(file => {
        fs.unlinkSync(path.join(dir, file));
      });
      fs.rmdirSync(dir);
    }
  });
};

// 在所有测试之前运行
beforeAll(() => {
  console.log('🧪 Starting Browser Assistant Test Suite');
});

// 在每个测试之前运行
beforeEach(() => {
  // 清理模拟函数的调用历史
  jest.clearAllMocks();
});

// 在所有测试之后运行
afterAll(() => {
  console.log('✅ Browser Assistant Test Suite Completed');
  global.cleanupTestFiles();
});

// 在每个测试之后运行
afterEach(() => {
  // 清理测试文件
  global.cleanupTestFiles();
});