/**
 * Basic unit tests - JavaScript version to bypass TypeScript issues
 */

const { CamoufoxManager } = require('../dist-simple/browser/CamoufoxManager');
const { CookieManager } = require('../dist-simple/browser/SimpleCookieManager');
const { PageOperationCenter } = require('../dist-simple/operations/SimplePageOperationCenter');
const { SmartElementSelector } = require('../dist-simple/operations/SimpleSmartElementSelector');
const { createBrowserAssistant } = require('../dist-simple/index-simple');
const { BrowserAssistantError } = require('../dist-simple/errors');

// Mock dependencies
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

jest.mock('fs', () => ({
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  readdirSync: jest.fn(),
  unlinkSync: jest.fn()
}));

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

// Test utilities
const createMockPage = () => ({
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

const createMockElementHandle = () => ({
  click: jest.fn(),
  type: jest.fn(),
  screenshot: jest.fn(),
  evaluate: jest.fn(),
  boundingBox: jest.fn().mockReturnValue({ x: 0, y: 0, width: 100, height: 50 }),
  isVisible: jest.fn().mockResolvedValue(true)
});

describe('Basic Component Tests (JavaScript)', () => {
  let mockPage;

  beforeEach(() => {
    mockPage = createMockPage();
    jest.clearAllMocks();
  });

  describe('CamoufoxManager', () => {
    test('should create instance', () => {
      const manager = new CamoufoxManager();
      expect(manager).toBeInstanceOf(CamoufoxManager);
    });

    test('should get configuration', () => {
      const manager = new CamoufoxManager({ headless: false });
      const config = manager.getConfig();
      expect(config.headless).toBe(false);
    });

    test('should update configuration', () => {
      const manager = new CamoufoxManager();
      manager.updateConfig({ headless: true });
      const config = manager.getConfig();
      expect(config.headless).toBe(true);
    });
  });

  describe('CookieManager', () => {
    test('should create instance', () => {
      const cookieManager = new CookieManager('./test-cookies');
      expect(cookieManager).toBeInstanceOf(CookieManager);
    });

    test('should use default path', () => {
      const cookieManager = new CookieManager();
      expect(cookieManager).toBeInstanceOf(CookieManager);
    });

    test('should get cookie statistics', () => {
      const cookieManager = new CookieManager();
      const stats = cookieManager.getCookieStats();
      expect(stats).toEqual({
        totalDomains: 0,
        totalCookies: 0,
        domainStats: {}
      });
    });
  });

  describe('PageOperationCenter', () => {
    let operationCenter;

    beforeEach(() => {
      operationCenter = new PageOperationCenter();
    });

    test('should create instance', () => {
      expect(operationCenter).toBeInstanceOf(PageOperationCenter);
    });

    test('should navigate to URL', async () => {
      await operationCenter.navigate(mockPage, 'https://example.com');
      expect(mockPage.goto).toHaveBeenCalledWith('https://example.com', expect.any(Object));
    });

    test('should handle click operation', async () => {
      await operationCenter.click(mockPage, '#test-button');
      expect(mockPage.click).toHaveBeenCalledWith('#test-button', expect.any(Object));
    });

    test('should handle type operation', async () => {
      await operationCenter.type(mockPage, '#input-field', 'test text');
      expect(mockPage.type).toHaveBeenCalledWith('#input-field', 'test text', expect.any(Object));
    });

    test('should handle waiting for element', async () => {
      await operationCenter.waitFor(mockPage, '#test-element');
      expect(mockPage.waitForSelector).toHaveBeenCalledWith('#test-element', expect.any(Object));
    });
  });

  describe('SmartElementSelector', () => {
    let selector;

    beforeEach(() => {
      selector = new SmartElementSelector();
    });

    test('should create instance', () => {
      expect(selector).toBeInstanceOf(SmartElementSelector);
    });

    test('should select element by attributes', async () => {
      const mockElement = createMockElementHandle();
      mockPage.evaluate.mockResolvedValue(mockElement);
      
      const result = await selector.selectByAttributes(mockPage, { id: 'test-element' });
      expect(result).toHaveProperty('method', 'attributes');
      expect(result).toHaveProperty('selector', '[id="test-element"]');
    });

    test('should select element by text', async () => {
      const mockElement = createMockElementHandle();
      mockPage.evaluate.mockResolvedValue(mockElement);
      
      const result = await selector.selectByText(mockPage, 'Test Text');
      expect(result).toHaveProperty('method', 'text');
      expect(result).toHaveProperty('selector', 'text=Test Text');
    });
  });

  describe('Error Handling', () => {
    test('should create error instance', () => {
      const error = new BrowserAssistantError('Test error');
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe('Test error');
    });

    test('should handle operation failure', async () => {
      const operationCenter = new PageOperationCenter();
      mockPage.click.mockRejectedValue(new Error('Click failed'));
      
      await expect(operationCenter.click(mockPage, '#nonexistent-element'))
        .rejects.toThrow('Click failed');
    });
  });

  describe('Browser Assistant Factory', () => {
    test('should create browser assistant', () => {
      const assistant = createBrowserAssistant();
      expect(assistant).toBeDefined();
      expect(assistant).toBeInstanceOf(CamoufoxManager);
    });
  });

  describe('Type Safety', () => {
    test('should handle configuration validation', () => {
      const manager = new CamoufoxManager();
      
      const defaultConfig = manager.getConfig();
      expect(defaultConfig.headless).toBe(true);
      
      manager.updateConfig({ headless: false });
      const updatedConfig = manager.getConfig();
      expect(updatedConfig.headless).toBe(false);
    });

    test('should handle invalid configuration', () => {
      const manager = new CamoufoxManager();
      
      manager.updateConfig({ viewport: { width: 800, height: 600 } });
      const config = manager.getConfig();
      expect(config.viewport).toEqual({ width: 800, height: 600 });
      expect(config.headless).toBe(true); // Other config should remain unchanged
    });
  });

  describe('Async Operations', () => {
    test('should handle parallel async operations', async () => {
      const operationCenter = new PageOperationCenter();
      
      await Promise.all([
        operationCenter.click(mockPage, '#button1'),
        operationCenter.type(mockPage, '#input1', 'text1'),
        operationCenter.waitFor(mockPage, '#element1')
      ]);
      
      expect(mockPage.click).toHaveBeenCalledWith('#button1', expect.any(Object));
      expect(mockPage.type).toHaveBeenCalledWith('#input1', 'text1', expect.any(Object));
      expect(mockPage.waitForSelector).toHaveBeenCalledWith('#element1', expect.any(Object));
    });

    test('should handle async errors', async () => {
      const operationCenter = new PageOperationCenter();
      mockPage.waitForSelector.mockRejectedValue(new Error('Element not found'));
      
      await expect(operationCenter.waitFor(mockPage, '#nonexistent-element'))
        .rejects.toThrow('Element not found');
    });
  });
});