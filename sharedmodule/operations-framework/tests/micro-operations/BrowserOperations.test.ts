import { ScreenshotOperation, ScrollOperation, PageStructureOperation } from '../../src/micro-operations/BrowserOperations';
import { OperationContext, OperationConfig } from '../../src/types/operationTypes';
import { EventEmitter } from 'events';

// Mock Page class
class MockPage {
  screenshot = jest.fn();
  evaluate = jest.fn();
  content = jest.fn();
  $$ = jest.fn();
  $eval = jest.fn();
  screenshotCalledTimes = 0;

  constructor() {
    this.screenshot.mockResolvedValue(Buffer.from('fake-screenshot'));
    this.content.mockResolvedValue('<html><body>Test Content</body></html>');
    this.evaluate.mockImplementation((fn) => fn());
    this.$$.mockResolvedValue([
      { evaluate: jest.fn().mockResolvedValue('Link 1') },
      { evaluate: jest.fn().mockResolvedValue('Link 2') }
    ]);
    this.$eval.mockResolvedValue('Page Title');
  }

  async scrollIntoView(options?: any) {
    // Mock scroll implementation
  }
}

// Mock Browser class
class MockBrowser {
  newPage = jest.fn().mockResolvedValue(new MockPage());
}

describe('BrowserOperations', () => {
  let mockContext: OperationContext;
  let mockPage: MockPage;
  let mockBrowser: MockBrowser;

  beforeEach(() => {
    mockPage = new MockPage();
    mockBrowser = new MockBrowser();
    mockContext = {
      id: 'test-context',
      browser: mockBrowser as any,
      page: mockPage as any,
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

  describe('ScreenshotOperation', () => {
    let operation: ScreenshotOperation;

    beforeEach(() => {
      operation = new ScreenshotOperation();
    });

    it('should take a basic screenshot successfully', async () => {
      const result = await operation.execute(mockContext);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.fileName).toMatch(/screenshot_\d{8}_\d{6}\.png/);
      expect(result.data.fileSize).toBeGreaterThan(0);
      expect(mockPage.screenshot).toHaveBeenCalledWith({});
    });

    it('should take screenshot with custom options', async () => {
      const params = {
        type: 'jpeg',
        quality: 80,
        fullPage: true,
        clip: { x: 0, y: 0, width: 800, height: 600 }
      };

      const result = await operation.execute(mockContext, params);

      expect(result.success).toBe(true);
      expect(mockPage.screenshot).toHaveBeenCalledWith({
        type: 'jpeg',
        quality: 80,
        fullPage: true,
        clip: { x: 0, y: 0, width: 800, height: 600 }
      });
    });

    it('should handle screenshot errors', async () => {
      mockPage.screenshot.mockRejectedValue(new Error('Screenshot failed'));

      const result = await operation.execute(mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Screenshot failed');
      expect(mockContext.logger.error).toHaveBeenCalledWith(
        'Screenshot operation failed',
        expect.any(Error)
      );
    });

    it('should validate screenshot parameters', () => {
      const validParams = {
        type: 'jpeg',
        quality: 80,
        fullPage: true
      };

      const validation = operation.validateParameters(validParams);
      expect(validation.isValid).toBe(true);

      const invalidParams = {
        type: 'invalid-type',
        quality: 150
      };

      const invalidValidation = operation.validateParameters(invalidParams);
      expect(invalidValidation.isValid).toBe(false);
      expect(invalidValidation.errors).toContain('type must be either png or jpeg');
    });

    it('should capture element screenshot', async () => {
      const params = {
        selector: '#main-content',
        type: 'png'
      };

      const result = await operation.execute(mockContext, params);

      expect(result.success).toBe(true);
      expect(mockPage.screenshot).toHaveBeenCalledWith({
        type: 'png',
        clip: undefined
      });
    });
  });

  describe('ScrollOperation', () => {
    let operation: ScrollOperation;

    beforeEach(() => {
      operation = new ScrollOperation();
    });

    it('should scroll to bottom successfully', async () => {
      const params = {
        direction: 'bottom',
        behavior: 'smooth'
      };

      const result = await operation.execute(mockContext, params);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        message: 'Scrolled to bottom',
        scrollHeight: expect.any(Number),
        currentScroll: expect.any(Number)
      });
      expect(mockPage.evaluate).toHaveBeenCalled();
    });

    it('should scroll to top successfully', async () => {
      const params = {
        direction: 'top'
      };

      const result = await operation.execute(mockContext, params);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        message: 'Scrolled to top',
        scrollHeight: expect.any(Number),
        currentScroll: expect.any(Number)
      });
    });

    it('should scroll by pixel amount', async () => {
      const params = {
        direction: 'down',
        amount: 500
      };

      const result = await operation.execute(mockContext, params);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        message: 'Scrolled down by 500px',
        scrollHeight: expect.any(Number),
        currentScroll: expect.any(Number)
      });
    });

    it('should scroll to element', async () => {
      const params = {
        selector: '#target-element'
      };

      const result = await operation.execute(mockContext, params);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        message: 'Scrolled to element #target-element',
        element: '#target-element'
      });
    });

    it('should handle scroll errors', async () => {
      mockPage.evaluate.mockRejectedValue(new Error('Scroll failed'));

      const result = await operation.execute(mockContext, { direction: 'bottom' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Scroll failed');
    });

    it('should validate scroll parameters', () => {
      const validParams = {
        direction: 'bottom',
        behavior: 'smooth'
      };

      const validation = operation.validateParameters(validParams);
      expect(validation.isValid).toBe(true);

      const invalidParams = {
        direction: 'invalid-direction'
      };

      const invalidValidation = operation.validateParameters(invalidParams);
      expect(invalidValidation.isValid).toBe(false);
      expect(invalidValidation.errors).toContain('direction must be one of: top, bottom, up, down');
    });
  });

  describe('PageStructureOperation', () => {
    let operation: PageStructureOperation;

    beforeEach(() => {
      operation = new PageStructureOperation();
    });

    it('should extract page structure successfully', async () => {
      const result = await operation.execute(mockContext);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.url).toBe('about:blank');
      expect(result.data.title).toBe('Page Title');
      expect(result.data.content).toBe('<html><body>Test Content</body></html>');
      expect(result.data.elements).toBeDefined();
      expect(result.data.links).toBeDefined();
      expect(result.data.metadata).toBeDefined();
    });

    it('should extract links successfully', async () => {
      const params = {
        extractLinks: true,
        linkSelector: 'a'
      };

      const result = await operation.execute(mockContext, params);

      expect(result.success).toBe(true);
      expect(result.data.links).toHaveLength(2);
      expect(result.data.links).toContain('Link 1');
      expect(result.data.links).toContain('Link 2');
      expect(mockPage.$$).toHaveBeenCalledWith('a');
    });

    it('should extract page content', async () => {
      const params = {
        extractContent: true,
        contentSelector: 'body'
      };

      const result = await operation.execute(mockContext, params);

      expect(result.success).toBe(true);
      expect(result.data.content).toBeDefined();
      expect(mockPage.content).toHaveBeenCalled();
    });

    it('should extract specific elements', async () => {
      const params = {
        extractElements: true,
        elementSelectors: ['h1', 'p', 'div']
      };

      const result = await operation.execute(mockContext, params);

      expect(result.success).toBe(true);
      expect(result.data.elements).toBeDefined();
      expect(result.data.elements).toEqual(['h1', 'p', 'div']);
    });

    it('should analyze page metadata', async () => {
      const params = {
        analyzeMetadata: true
      };

      const result = await operation.execute(mockContext, params);

      expect(result.success).toBe(true);
      expect(result.data.metadata).toBeDefined();
      expect(result.data.metadata.loadTime).toBeGreaterThan(0);
      expect(result.data.metadata.elementCount).toBeGreaterThan(0);
    });

    it('should handle structure extraction errors', async () => {
      mockPage.content.mockRejectedValue(new Error('Content extraction failed'));

      const result = await operation.execute(mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Content extraction failed');
    });

    it('should validate page structure parameters', () => {
      const validParams = {
        extractLinks: true,
        extractContent: true,
        extractElements: true,
        analyzeMetadata: true
      };

      const validation = operation.validateParameters(validParams);
      expect(validation.isValid).toBe(true);

      const invalidParams = {
        extractLinks: 'yes'
      };

      const invalidValidation = operation.validateParameters(invalidParams);
      expect(invalidValidation.isValid).toBe(false);
      expect(invalidValidation.errors).toContain('extractLinks must be a boolean');
    });

    it('should handle missing page gracefully', async () => {
      const contextWithoutPage = {
        ...mockContext,
        page: null
      };

      const result = await operation.execute(contextWithoutPage);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Page context is required for page structure analysis');
    });
  });

  describe('Browser Operations Integration', () => {
    it('should work together in sequence', async () => {
      const screenshotOp = new ScreenshotOperation();
      const scrollOp = new ScrollOperation();
      const structureOp = new PageStructureOperation();

      // Take screenshot
      const screenshotResult = await screenshotOp.execute(mockContext);
      expect(screenshotResult.success).toBe(true);

      // Scroll page
      const scrollResult = await scrollOp.execute(mockContext, { direction: 'bottom' });
      expect(scrollResult.success).toBe(true);

      // Extract structure
      const structureResult = await structureOp.execute(mockContext, {
        extractLinks: true,
        extractContent: true
      });
      expect(structureResult.success).toBe(true);

      // Verify all operations worked correctly
      expect(mockPage.screenshot).toHaveBeenCalledTimes(1);
      expect(mockPage.evaluate).toHaveBeenCalledTimes(1);
      expect(mockPage.content).toHaveBeenCalledTimes(1);
    });
  });
});