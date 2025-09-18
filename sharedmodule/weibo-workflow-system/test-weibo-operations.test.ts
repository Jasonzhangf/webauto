/**
 * Weibo Operations Test Suite
 * 微博操作子测试套件
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockFs } from './test-setup';
import { WeiboNavigationOperation } from './src/operations/core/WeiboNavigationOperation';
import { WeiboContentExtractionOperation } from './src/operations/core/WeiboContentExtractionOperation';
import { WeiboLoginOperation } from './src/operations/core/WeiboLoginOperation';
import { WeiboWorkflowSystem } from './src/operations/index';

// Mock browser page
const createMockPage = () => ({
  url: () => 'https://weibo.com',
  goto: vi.fn().mockResolvedValue(true),
  waitForSelector: vi.fn().mockResolvedValue(true),
  waitForTimeout: vi.fn(),
  click: vi.fn(),
  $: vi.fn().mockResolvedValue(null),
  textContent: vi.fn().mockResolvedValue(''),
  evaluate: vi.fn().mockImplementation((fn, args) => {
    if (typeof fn === 'function') {
      // Mock DOM environment for evaluate calls
      const mockDocument = {
        querySelector: vi.fn(),
        querySelectorAll: vi.fn().mockReturnValue([])
      };
      const mockWindow = {
        location: { pathname: '/u/123456' },
        scrollTo: vi.fn()
      };

      try {
        return fn({ document: mockDocument, window: mockWindow }, args);
      } catch (error) {
        // Return empty array for posts/comments extraction
        if (args && (args.contentType === 'posts' || args.contentType === 'comments')) {
          return [];
        }
        // Return empty object for profile extraction
        if (args && args.contentType === 'profile') {
          return {};
        }
        // Return boolean for login status
        if (fn.toString().includes('login')) {
          return true;
        }
        return {};
      }
    }
    return {};
  }),
  context: () => ({
    addCookies: vi.fn(),
    cookies: vi.fn().mockResolvedValue([]),
    clearCookies: vi.fn()
  })
});

// Mock browser context
const createMockBrowserContext = () => ({
  page: createMockPage(),
  context: {
    newPage: vi.fn().mockResolvedValue(createMockPage())
  },
  browser: {
    newContext: vi.fn().mockResolvedValue({
      newPage: vi.fn().mockResolvedValue(createMockPage())
    })
  }
});

describe('Weibo Navigation Operation', () => {
  let navigationOperation: WeiboNavigationOperation;
  let mockContext: any;

  beforeEach(() => {
    navigationOperation = new WeiboNavigationOperation();
    mockContext = {
      browser: createMockBrowserContext(),
      weibo: {},
      startTime: Date.now()
    };
  });

  describe('Navigation to Homepage', () => {
    it('should navigate to weibo homepage successfully', async () => {
      const result = await navigationOperation.execute(mockContext, {
        target: 'homepage',
        timeout: 30000
      });

      expect(result.success).toBe(true);
      expect(result.result.target).toBe('homepage');
      expect(result.result.pageType).toBeDefined();
      expect(result.metadata.navigationType).toBe('weibo');
    });

    it('should handle navigation errors', async () => {
      mockContext.browser.page.goto.mockRejectedValue(new Error('Network error'));

      const result = await navigationOperation.execute(mockContext, {
        target: 'homepage'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Network error');
    });
  });

  describe('Navigation to Profile', () => {
    it('should navigate to user profile with valid userId', async () => {
      const result = await navigationOperation.execute(mockContext, {
        target: 'profile',
        userId: '123456',
        timeout: 30000
      });

      expect(result.success).toBe(true);
      expect(result.result.target).toBe('profile');
      expect(result.result.targetUrl).toContain('123456');
    });

    it('should fail without userId for profile navigation', async () => {
      const result = await navigationOperation.execute(mockContext, {
        target: 'profile'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('User ID is required');
    });
  });

  describe('Navigation to Post', () => {
    it('should navigate to specific post with valid postId', async () => {
      const result = await navigationOperation.execute(mockContext, {
        target: 'post',
        postId: '789012',
        timeout: 30000
      });

      expect(result.success).toBe(true);
      expect(result.result.target).toBe('post');
      expect(result.result.targetUrl).toContain('789012');
    });

    it('should fail without postId for post navigation', async () => {
      const result = await navigationOperation.execute(mockContext, {
        target: 'post'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Post ID is required');
    });
  });

  describe('Navigation to Search', () => {
    it('should navigate to search results with valid query', async () => {
      const result = await navigationOperation.execute(mockContext, {
        target: 'search',
        query: 'test query',
        timeout: 30000
      });

      expect(result.success).toBe(true);
      expect(result.result.target).toBe('search');
      expect(result.result.targetUrl).toContain(encodeURIComponent('test query'));
    });

    it('should fail without query for search navigation', async () => {
      const result = await navigationOperation.execute(mockContext, {
        target: 'search'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Search query is required');
    });
  });
});

describe('Weibo Content Extraction Operation', () => {
  let contentExtractionOperation: WeiboContentExtractionOperation;
  let mockContext: any;

  beforeEach(() => {
    contentExtractionOperation = new WeiboContentExtractionOperation();
    mockContext = {
      browser: createMockBrowserContext(),
      weibo: {},
      startTime: Date.now()
    };
  });

  describe('Post Extraction', () => {
    it('should extract posts from current page', async () => {
      mockContext.browser.page.evaluate.mockResolvedValue([
        {
          id: 'test-post-1',
          author: { id: 'author1', name: 'Test Author' },
          content: { text: 'Test post content' },
          metadata: { likes: 10, comments: 5, reposts: 2 }
        }
      ]);

      const result = await contentExtractionOperation.execute(mockContext, {
        contentType: 'posts',
        maxItems: 10,
        timeout: 30000
      });

      expect(result.success).toBe(true);
      expect(result.result).toHaveLength(1);
      expect(result.result[0].author.name).toBe('Test Author');
      expect(result.metadata.contentType).toBe('posts');
    });

    it('should handle post extraction errors', async () => {
      mockContext.browser.page.evaluate.mockRejectedValue(new Error('Extraction failed'));

      const result = await contentExtractionOperation.execute(mockContext, {
        contentType: 'posts'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Extraction failed');
    });
  });

  describe('Comment Extraction', () => {
    it('should extract comments from specific post', async () => {
      mockContext.browser.page.evaluate.mockResolvedValue([
        {
          id: 'test-comment-1',
          postId: 'test-post-1',
          author: { id: 'user1', name: 'Test User' },
          content: 'Test comment',
          metadata: { likes: 3 }
        }
      ]);

      const result = await contentExtractionOperation.execute(mockContext, {
        contentType: 'comments',
        postId: 'test-post-1',
        maxItems: 50,
        timeout: 30000
      });

      expect(result.success).toBe(true);
      expect(result.result).toHaveLength(1);
      expect(result.result[0].postId).toBe('test-post-1');
      expect(result.metadata.contentType).toBe('comments');
    });

    it('should fail without postId for comment extraction', async () => {
      const result = await contentExtractionOperation.execute(mockContext, {
        contentType: 'comments'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Post ID is required');
    });
  });

  describe('Profile Extraction', () => {
    it('should extract user profile with valid userId', async () => {
      mockContext.browser.page.evaluate.mockResolvedValue({
        id: '123456',
        screenName: 'testuser',
        name: 'Test User',
        stats: { followers: 1000, following: 500, posts: 200 }
      });

      const result = await contentExtractionOperation.execute(mockContext, {
        contentType: 'profile',
        userId: '123456',
        timeout: 30000
      });

      expect(result.success).toBe(true);
      expect(result.result.name).toBe('Test User');
      expect(result.result.stats.followers).toBe(1000);
      expect(result.metadata.contentType).toBe('profile');
    });
  });
});

describe('Weibo Login Operation', () => {
  let loginOperation: WeiboLoginOperation;
  let mockContext: any;

  beforeEach(() => {
    loginOperation = new WeiboLoginOperation();
    mockContext = {
      browser: createMockBrowserContext(),
      weibo: {},
      startTime: Date.now()
    };
  });

  describe('Login Status Check', () => {
    it('should check login status successfully', async () => {
      mockContext.browser.page.evaluate.mockResolvedValue(true);

      const result = await loginOperation.execute(mockContext, {
        action: 'check-status',
        timeout: 30000
      });

      expect(result.success).toBe(true);
      expect(result.result).toBe(true);
      expect(result.metadata.loginStatus).toBe('logged-in');
    });

    it('should handle login status check errors', async () => {
      mockContext.browser.page.evaluate.mockRejectedValue(new Error('Status check failed'));

      const result = await loginOperation.execute(mockContext, {
        action: 'check-status'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Status check failed');
    });
  });

  describe('QR Login', () => {
    it('should initiate QR login process', async () => {
      mockContext.browser.page.waitForSelector.mockResolvedValue(true);
      mockContext.browser.page.evaluate.mockImplementation((fn, args) => {
        if (args && args.maxWaitTime) {
          return new Promise(resolve => setTimeout(() => resolve(true), 100));
        }
        return true;
      });

      const result = await loginOperation.execute(mockContext, {
        action: 'qr-login',
        maxQRWaitTime: 60000,
        saveSession: true
      });

      expect(result.success).toBe(true);
      expect(result.metadata.loginMethod).toBe('qr-code');
    });

    it('should handle QR login timeout', async () => {
      mockContext.browser.page.waitForSelector.mockResolvedValue(true);
      mockContext.browser.page.evaluate.mockImplementation((fn, args) => {
        if (args && args.maxWaitTime) {
          return new Promise(resolve => setTimeout(() => resolve(false), 100));
        }
        return false;
      });

      const result = await loginOperation.execute(mockContext, {
        action: 'qr-login',
        maxQRWaitTime: 1000 // Short timeout for testing
      });

      expect(result.success).toBe(true);
      expect(result.result).toBe(false);
    });
  });

  describe('Cookie Management', () => {
    it('should handle load cookies operation', async () => {
      // Ensure file doesn't exist
      mockFs.existsSync.mockReturnValue(false);

      const result = await loginOperation.execute(mockContext, {
        action: 'load-cookies',
        cookiePath: './test-cookies.json'
      });

      expect(result.success).toBe(false); // Should fail because file doesn't exist
      expect(result.error).toContain('Cookie file not found');
    });

    it('should handle save cookies operation', async () => {
      const result = await loginOperation.execute(mockContext, {
        action: 'save-cookies',
        cookiePath: './test-cookies.json'
      });

      expect(result.success).toBe(true);
      expect(result.metadata.saved).toBe(true);
    });
  });
});

describe('Weibo Workflow System Integration', () => {
  let workflowSystem: WeiboWorkflowSystem;
  let mockContext: any;

  beforeEach(() => {
    workflowSystem = new WeiboWorkflowSystem();
    mockContext = {
      browser: createMockBrowserContext(),
      weibo: {},
      startTime: Date.now()
    };
  });

  describe('System Initialization', () => {
    it('should initialize weibo workflow system successfully', () => {
      const status = workflowSystem.getSystemStatus();

      expect(status.name).toBe('Weibo Workflow System');
      expect(status.operations.count).toBe(3);
      expect(status.operations.list).toContain('weibo-navigation');
      expect(status.operations.list).toContain('weibo-content-extraction');
      expect(status.operations.list).toContain('weibo-login');
    });

    it('should provide system metrics', () => {
      const metrics = workflowSystem.getSystemMetrics();

      expect(metrics.operations).toBeDefined();
      expect(metrics.performance).toBeDefined();
      expect(metrics.health).toBeDefined();
      expect(metrics.performance.uptime).toBeGreaterThan(0);
    });
  });

  describe('Workflow Execution', () => {
    it('should execute complete workflow successfully', async () => {
      // Set a shorter timeout for this test
      vi.useFakeTimers();
      const workflow = {
        id: 'test-workflow',
        type: 'weibo-data-collection',
        steps: [
          {
            id: 'step1',
            name: 'Navigate to Homepage',
            operation: 'navigation',
            params: { target: 'homepage' },
            required: true
          },
          {
            id: 'step2',
            name: 'Extract Posts',
            operation: 'content-extraction',
            params: { contentType: 'posts', maxItems: 10 },
            required: true
          }
        ]
      };

      const result = await workflowSystem.executeWorkflow(mockContext, workflow);

      expect(result.success).toBe(true);
      expect(result.workflowId).toBe('test-workflow');
      expect(result.results).toHaveLength(2);
      expect(result.steps.completed).toBe(2);
      expect(result.steps.failed).toBe(0);
    });

    it('should handle workflow with failed steps', async () => {
      const workflow = {
        id: 'test-workflow-failure',
        type: 'weibo-data-collection',
        steps: [
          {
            id: 'step1',
            name: 'Navigate to Invalid Page',
            operation: 'navigation',
            params: { target: 'invalid-target' },
            required: true
          }
        ]
      };

      const result = await workflowSystem.executeWorkflow(mockContext, workflow);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown navigation target');
      expect(result.steps.completed).toBe(0);
      expect(result.steps.failed).toBe(1);
    });

    it('should handle workflow with optional failed steps', async () => {
      const workflow = {
        id: 'test-workflow-optional',
        type: 'weibo-data-collection',
        steps: [
          {
            id: 'step1',
            name: 'Navigate to Homepage',
            operation: 'navigation',
            params: { target: 'homepage' },
            required: true
          },
          {
            id: 'step2',
            name: 'Invalid Step',
            operation: 'navigation',
            params: { target: 'invalid-target' },
            required: false
          }
        ]
      };

      const result = await workflowSystem.executeWorkflow(mockContext, workflow);

      expect(result.success).toBe(true);
      expect(result.steps.completed).toBe(1);
      expect(result.steps.failed).toBe(1);
    });
  });

  describe('Health Check', () => {
    it('should pass health check', async () => {
      const health = await workflowSystem.healthCheck();

      expect(health.overall).toBe('healthy');
      expect(health.operations.navigation.status).toBe('healthy');
      expect(health.operations.contentExtraction.status).toBe('healthy');
      expect(health.operations.login.status).toBe('healthy');
    });
  });

  describe('Direct Operation Methods', () => {
    it('should provide direct navigation method', async () => {
      const result = await workflowSystem.navigate(mockContext, 'homepage');

      expect(result.success).toBe(true);
      expect(result.result.target).toBe('homepage');
    });

    it('should provide direct content extraction method', async () => {
      mockContext.browser.page.evaluate.mockResolvedValue([]);

      const result = await workflowSystem.extractContent(mockContext, 'posts');

      expect(result.success).toBe(true);
      expect(result.metadata.contentType).toBe('posts');
    });

    it('should provide direct login method', async () => {
      const result = await workflowSystem.handleLogin(mockContext, 'check-status');

      expect(result.success).toBe(true);
      expect(result.metadata.loginStatus).toBeDefined();
    });
  });
});