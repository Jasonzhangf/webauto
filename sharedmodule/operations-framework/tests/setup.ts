import * as fs from 'fs';
import * as path from 'path';

// Mock fs/promises for Jest tests
jest.mock('fs/promises', () => ({
  access: jest.fn(),
  readdir: jest.fn(),
  readFile: jest.fn(),
  writeFile: jest.fn(),
  mkdir: jest.fn(),
  unlink: jest.fn(),
  stat: jest.fn(),
  rm: jest.fn(),
}));

// Test setup file that runs before all tests
export function setupTestEnvironment() {
  // Create test directories
  const testDirs = [
    'test-temp',
    'test-logs',
    'test-output',
    'test-data'
  ];

  testDirs.forEach(dir => {
    const fullPath = path.join(process.cwd(), dir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }
  });

  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.WEBAUTO_TEST_MODE = 'true';
  process.env.WEBAUTO_TEMP_DIR = path.join(process.cwd(), 'test-temp');
  process.env.WEBAUTO_LOG_DIR = path.join(process.cwd(), 'test-logs');
  process.env.WEBAUTO_OUTPUT_DIR = path.join(process.cwd(), 'test-output');

  // Set default test timeouts
  jest.setTimeout(30000);
}

// Clean up test environment
export function cleanupTestEnvironment() {
  const testDirs = [
    'test-temp',
    'test-logs',
    'test-output',
    'test-data'
  ];

  testDirs.forEach(dir => {
    const fullPath = path.join(process.cwd(), dir);
    if (fs.existsSync(fullPath)) {
      fs.rmSync(fullPath, { recursive: true, force: true });
    }
  });
}

// Create test data files
export function createTestDataFiles() {
  const testDataDir = path.join(process.cwd(), 'test-data');

  // Create sample JSON files for testing
  const sampleFiles = [
    {
      name: 'sample-weibo-data.json',
      content: {
        posts: [
          {
            id: '123',
            text: 'Sample post content',
            user: {
              id: 'user1',
              name: 'Test User'
            },
            stats: {
              likes: 10,
              comments: 5,
              shares: 2
            }
          }
        ]
      }
    },
    {
      name: 'sample-config.json',
      content: {
        operations: {
          browser: {
            timeout: 30000,
            viewport: {
              width: 1920,
              height: 1080
            }
          },
          ai: {
            provider: 'mock',
            model: 'test-model'
          }
        }
      }
    }
  ];

  sampleFiles.forEach(file => {
    const filePath = path.join(testDataDir, file.name);
    fs.writeFileSync(filePath, JSON.stringify(file.content, null, 2));
  });
}

// Mock file system operations for testing
export function mockFileSystem() {
  const mockFs = {
    readFileSync: jest.fn(),
    writeFileSync: jest.fn(),
    existsSync: jest.fn(),
    mkdirSync: jest.fn(),
    readdirSync: jest.fn(),
    statSync: jest.fn(),
    rmSync: jest.fn(),
    watch: jest.fn()
  };

  // Mock implementations
  mockFs.existsSync.mockReturnValue(true);
  mockFs.mkdirSync.mockReturnValue(undefined);
  mockFs.readdirSync.mockReturnValue([]);
  mockFs.statSync.mockReturnValue({
    isFile: () => true,
    size: 1024
  } as any);
  mockFs.rmSync.mockReturnValue(undefined);
  mockFs.watch.mockReturnValue({
    on: jest.fn(),
    close: jest.fn()
  });

  return mockFs;
}

// Mock browser operations for testing
export function mockBrowser() {
  const mockPage = {
    screenshot: jest.fn().mockResolvedValue(Buffer.from('screenshot')),
    evaluate: jest.fn().mockImplementation((fn) => fn()),
    content: jest.fn().mockResolvedValue('<html><body>Test Content</body></html>'),
    $$: jest.fn().mockResolvedValue([]),
    $eval: jest.fn().mockResolvedValue('Test Title'),
    goto: jest.fn().mockResolvedValue({ status: 200 }),
    click: jest.fn().mockResolvedValue(undefined),
    type: jest.fn().mockResolvedValue(undefined),
    waitForSelector: jest.fn().mockResolvedValue(undefined),
    waitForNavigation: jest.fn().mockResolvedValue(undefined),
    url: jest.fn().mockReturnValue('https://example.com')
  };

  const mockBrowser = {
    newPage: jest.fn().mockResolvedValue(mockPage),
    close: jest.fn().mockResolvedValue(undefined),
    version: jest.fn().mockResolvedValue('1.0.0')
  };

  return { mockPage, mockBrowser };
}

// Mock AI operations for testing
export function mockAIProvider() {
  return {
    generateContent: jest.fn().mockResolvedValue({
      response: {
        text: () => 'AI generated response'
      }
    }),
    chat: jest.fn().mockResolvedValue({
      response: {
        text: () => 'Chat response'
      }
    }),
    embed: jest.fn().mockResolvedValue({
      embedding: [0.1, 0.2, 0.3]
    })
  };
}

// Mock HTTP operations for testing
export function mockHTTP() {
  return {
    get: jest.fn().mockResolvedValue({
      data: { response: 'GET response' },
      status: 200
    }),
    post: jest.fn().mockResolvedValue({
      data: { response: 'POST response' },
      status: 201
    }),
    put: jest.fn().mockResolvedValue({
      data: { response: 'PUT response' },
      status: 200
    }),
    delete: jest.fn().mockResolvedValue({
      data: { response: 'DELETE response' },
      status: 204
    })
  };
}

// Generate test workflow definitions
export function generateTestWorkflows() {
  return {
    simpleWorkflow: {
      name: 'Simple Test Workflow',
      description: 'A simple workflow for testing',
      steps: [
        {
          name: 'step1',
          operation: 'test-operation',
          parameters: { input: 'test' }
        }
      ]
    },
    complexWorkflow: {
      name: 'Complex Test Workflow',
      description: 'A complex workflow with multiple steps',
      steps: [
        {
          name: 'screenshot',
          operation: 'screenshot',
          parameters: { type: 'png' }
        },
        {
          name: 'analyze',
          operation: 'content-analysis',
          parameters: {
            content: 'Test content',
            analysisTypes: ['sentiment']
          }
        },
        {
          name: 'save',
          operation: 'file-write',
          parameters: {
            filePath: '/tmp/test-output.json',
            content: '${analyze.data}'
          }
        }
      ]
    },
    conditionalWorkflow: {
      name: 'Conditional Test Workflow',
      description: 'A workflow with conditional steps',
      steps: [
        {
          name: 'initial-step',
          operation: 'test-operation',
          parameters: { success: true }
        },
        {
          name: 'conditional-step',
          operation: 'conditional-operation',
          parameters: { input: 'conditional' },
          condition: {
            type: 'success',
            step: 'initial-step'
          }
        }
      ]
    },
    parallelWorkflow: {
      name: 'Parallel Test Workflow',
      description: 'A workflow with parallel steps',
      steps: [
        {
          name: 'parallel-1',
          operation: 'test-operation',
          parameters: { task: 'parallel1' },
          parallel: true
        },
        {
          name: 'parallel-2',
          operation: 'test-operation',
          parameters: { task: 'parallel2' },
          parallel: true
        }
      ]
    }
  };
}

// Generate test task definitions
export function generateTestTasks() {
  return {
    simpleTask: {
      name: 'Simple Test Task',
      description: 'A simple task for testing',
      workflow: {
        name: 'simple-test-workflow',
        description: 'Simple test workflow',
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
    },
    scheduledTask: {
      name: 'Scheduled Test Task',
      description: 'A scheduled task for testing',
      workflow: {
        name: 'scheduled-test-workflow',
        description: 'Scheduled test workflow',
        steps: [
          {
            name: 'step1',
            operation: 'test-operation'
          }
        ]
      },
      schedule: {
        type: 'cron',
        expression: '0 */5 * * * *'
      }
    },
    dependentTask: {
      name: 'Dependent Test Task',
      description: 'A task with dependencies',
      workflow: {
        name: 'dependent-test-workflow',
        description: 'Dependent test workflow',
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
      dependencies: ['simple-task']
    }
  };
}

// Test utilities
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function generateRandomString(length: number = 10): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function createTempFile(content: string, extension: string = '.txt'): string {
  const fileName = `test-${generateRandomString()}${extension}`;
  const filePath = path.join(process.cwd(), 'test-temp', fileName);
  fs.writeFileSync(filePath, content);
  return filePath;
}

export function cleanupTempFile(filePath: string): void {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

// Global test setup
if (typeof global !== 'undefined') {
  global.setupTestEnvironment = setupTestEnvironment;
  global.cleanupTestEnvironment = cleanupTestEnvironment;
  global.createTestDataFiles = createTestDataFiles;
  global.mockFileSystem = mockFileSystem;
  global.mockBrowser = mockBrowser;
  global.mockAIProvider = mockAIProvider;
  global.mockHTTP = mockHTTP;
  global.generateTestWorkflows = generateTestWorkflows;
  global.generateTestTasks = generateTestTasks;
  global.sleep = sleep;
  global.generateRandomString = generateRandomString;
  global.createTempFile = createTempFile;
  global.cleanupTempFile = cleanupTempFile;
}