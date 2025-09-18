import {
  FileReadOperation,
  FileWriteOperation,
  DirectoryOperation,
  FileSearchOperation
} from '../../src/micro-operations/FileSystemOperations';
import { OperationContext, OperationConfig } from '../../src/types/operationTypes';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';

// Mock fs module
jest.mock('fs');
const mockFs = fs as jest.Mocked<typeof fs>;

describe('FileSystemOperations', () => {
  let mockContext: OperationContext;
  let tempDir: string;

  beforeEach(() => {
    tempDir = '/tmp/test-filesystem-ops';
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

    // Reset all mocks
    jest.clearAllMocks();
  });

  describe('FileReadOperation', () => {
    let operation: FileReadOperation;

    beforeEach(() => {
      operation = new FileReadOperation();
    });

    it('should read a text file successfully', async () => {
      const testContent = 'This is test file content';
      mockFs.readFileSync.mockReturnValue(testContent);
      mockFs.existsSync.mockReturnValue(true);

      const params = {
        filePath: '/tmp/test.txt',
        encoding: 'utf8'
      };

      const result = await operation.execute(mockContext, params);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        content: testContent,
        fileName: 'test.txt',
        filePath: '/tmp/test.txt',
        size: testContent.length,
        encoding: 'utf8'
      });
      expect(mockFs.readFileSync).toHaveBeenCalledWith('/tmp/test.txt', 'utf8');
    });

    it('should read a JSON file', async () => {
      const jsonData = { name: 'test', value: 123 };
      mockFs.readFileSync.mockReturnValue(JSON.stringify(jsonData));
      mockFs.existsSync.mockReturnValue(true);

      const params = {
        filePath: '/tmp/test.json',
        format: 'json'
      };

      const result = await operation.execute(mockContext, params);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        content: jsonData,
        fileName: 'test.json',
        filePath: '/tmp/test.json',
        size: JSON.stringify(jsonData).length,
        format: 'json'
      });
    });

    it('should handle file not found', async () => {
      mockFs.existsSync.mockReturnValue(false);

      const params = {
        filePath: '/tmp/nonexistent.txt'
      };

      const result = await operation.execute(mockContext, params);

      expect(result.success).toBe(false);
      expect(result.error).toBe('File not found: /tmp/nonexistent.txt');
    });

    it('should handle read errors', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const params = {
        filePath: '/tmp/protected.txt'
      };

      const result = await operation.execute(mockContext, params);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Permission denied');
    });

    it('should validate file read parameters', () => {
      const validParams = {
        filePath: '/tmp/test.txt',
        encoding: 'utf8'
      };

      const validation = operation.validateParameters(validParams);
      expect(validation.isValid).toBe(true);

      const invalidParams = {};
      const invalidValidation = operation.validateParameters(invalidParams);
      expect(invalidValidation.isValid).toBe(false);
      expect(invalidValidation.errors).toContain('filePath is required');
    });
  });

  describe('FileWriteOperation', () => {
    let operation: FileWriteOperation;

    beforeEach(() => {
      operation = new FileWriteOperation();
      mockFs.writeFileSync.mockReturnValue(undefined);
      mockFs.existsSync.mockReturnValue(false);
      mockFs.mkdirSync.mockReturnValue(undefined);
    });

    it('should write a text file successfully', async () => {
      const params = {
        filePath: '/tmp/output.txt',
        content: 'Hello, World!',
        encoding: 'utf8'
      };

      const result = await operation.execute(mockContext, params);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        fileName: 'output.txt',
        filePath: '/tmp/output.txt',
        size: 13,
        encoding: 'utf8',
        message: 'File written successfully'
      });
      expect(mockFs.writeFileSync).toHaveBeenCalledWith('/tmp/output.txt', 'Hello, World!', 'utf8');
    });

    it('should write a JSON file', async () => {
      const jsonData = { name: 'test', value: 123 };
      const params = {
        filePath: '/tmp/output.json',
        content: jsonData,
        format: 'json'
      };

      const result = await operation.execute(mockContext, params);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        fileName: 'output.json',
        filePath: '/tmp/output.json',
        size: expect.any(Number),
        format: 'json',
        message: 'File written successfully'
      });
      expect(mockFs.writeFileSync).toHaveBeenCalledWith('/tmp/output.json', JSON.stringify(jsonData, null, 2), 'utf8');
    });

    it('should create directory if it does not exist', async () => {
      mockFs.existsSync.mockReturnValue(false);

      const params = {
        filePath: '/tmp/newdir/output.txt',
        content: 'Test content',
        createDirectory: true
      };

      const result = await operation.execute(mockContext, params);

      expect(result.success).toBe(true);
      expect(mockFs.mkdirSync).toHaveBeenCalledWith('/tmp/newdir', { recursive: true });
    });

    it('should handle write errors', async () => {
      mockFs.writeFileSync.mockImplementation(() => {
        throw new Error('Disk full');
      });

      const params = {
        filePath: '/tmp/output.txt',
        content: 'Large content'
      };

      const result = await operation.execute(mockContext, params);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Disk full');
    });

    it('should validate file write parameters', () => {
      const validParams = {
        filePath: '/tmp/output.txt',
        content: 'Test content'
      };

      const validation = operation.validateParameters(validParams);
      expect(validation.isValid).toBe(true);

      const invalidParams = {
        filePath: '/tmp/output.txt'
        // Missing content
      };
      const invalidValidation = operation.validateParameters(invalidParams);
      expect(invalidValidation.isValid).toBe(false);
      expect(invalidValidation.errors).toContain('content is required');
    });
  });

  describe('DirectoryOperation', () => {
    let operation: DirectoryOperation;

    beforeEach(() => {
      operation = new DirectoryOperation();
    });

    it('should create a directory successfully', async () => {
      mockFs.mkdirSync.mockReturnValue(undefined);

      const params = {
        action: 'create',
        path: '/tmp/newdir',
        recursive: true
      };

      const result = await operation.execute(mockContext, params);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        path: '/tmp/newdir',
        action: 'create',
        message: 'Directory created successfully'
      });
      expect(mockFs.mkdirSync).toHaveBeenCalledWith('/tmp/newdir', { recursive: true });
    });

    it('should list directory contents', async () => {
      mockFs.readdirSync.mockReturnValue(['file1.txt', 'file2.json', 'subdir']);
      mockFs.statSync.mockImplementation((filePath) => {
        if (filePath === '/tmp/testdir/file1.txt' || filePath === '/tmp/testdir/file2.json') {
          return { isFile: () => true, size: 1024 } as any;
        } else {
          return { isFile: () => false, size: 4096 } as any;
        }
      });

      const params = {
        action: 'list',
        path: '/tmp/testdir'
      };

      const result = await operation.execute(mockContext, params);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        path: '/tmp/testdir',
        contents: [
          { name: 'file1.txt', type: 'file', size: 1024 },
          { name: 'file2.json', type: 'file', size: 1024 },
          { name: 'subdir', type: 'directory', size: 4096 }
        ]
      });
    });

    it('should remove a directory', async () => {
      mockFs.rmSync.mockReturnValue(undefined);

      const params = {
        action: 'remove',
        path: '/tmp/olddir',
        recursive: true
      };

      const result = await operation.execute(mockContext, params);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        path: '/tmp/olddir',
        action: 'remove',
        message: 'Directory removed successfully'
      });
      expect(mockFs.rmSync).toHaveBeenCalledWith('/tmp/olddir', { recursive: true, force: true });
    });

    it('should handle directory operation errors', async () => {
      mockFs.mkdirSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const params = {
        action: 'create',
        path: '/tmp/protected'
      };

      const result = await operation.execute(mockContext, params);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Permission denied');
    });

    it('should validate directory operation parameters', () => {
      const validParams = {
        action: 'create',
        path: '/tmp/newdir'
      };

      const validation = operation.validateParameters(validParams);
      expect(validation.isValid).toBe(true);

      const invalidParams = {
        action: 'invalid-action',
        path: '/tmp/test'
      };
      const invalidValidation = operation.validateParameters(invalidParams);
      expect(invalidValidation.isValid).toBe(false);
      expect(invalidValidation.errors).toContain('action must be one of: create, list, remove');
    });
  });

  describe('FileSearchOperation', () => {
    let operation: FileSearchOperation;

    beforeEach(() => {
      operation = new FileSearchOperation();
    });

    it('should search for files by pattern', async () => {
      const mockFiles = [
        '/tmp/project/src/index.js',
        '/tmp/project/src/utils.js',
        '/tmp/project/package.json'
      ];
      mockFs.readdirSync.mockReturnValue(mockFiles);
      mockFs.statSync.mockReturnValue({ isFile: () => true } as any);

      const params = {
        searchPath: '/tmp/project',
        pattern: '*.js',
        recursive: true
      };

      const result = await operation.execute(mockContext, params);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        searchPath: '/tmp/project',
        pattern: '*.js',
        matches: expect.arrayContaining([
          '/tmp/project/src/index.js',
          '/tmp/project/src/utils.js'
        ]),
        totalMatches: 2
      });
    });

    it('should search for files by content', async () => {
      mockFs.readdirSync.mockReturnValue(['test1.txt', 'test2.txt']);
      mockFs.statSync.mockReturnValue({ isFile: () => true } as any);
      mockFs.readFileSync.mockImplementation((filePath) => {
        if (filePath.toString().includes('test1.txt')) {
          return 'This file contains the search keyword';
        } else {
          return 'This file does not match';
        }
      });

      const params = {
        searchPath: '/tmp',
        content: 'search keyword',
        filePattern: '*.txt'
      };

      const result = await operation.execute(mockContext, params);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        searchPath: '/tmp',
        content: 'search keyword',
        matches: ['/tmp/test1.txt'],
        totalMatches: 1
      });
    });

    it('should handle search errors', async () => {
      mockFs.readdirSync.mockImplementation(() => {
        throw new Error('Directory not found');
      });

      const params = {
        searchPath: '/tmp/nonexistent',
        pattern: '*.txt'
      };

      const result = await operation.execute(mockContext, params);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Directory not found');
    });

    it('should validate search parameters', () => {
      const validParams = {
        searchPath: '/tmp',
        pattern: '*.txt'
      };

      const validation = operation.validateParameters(validParams);
      expect(validation.isValid).toBe(true);

      const invalidParams = {
        pattern: '*.txt'
        // Missing searchPath
      };
      const invalidValidation = operation.validateParameters(invalidParams);
      expect(invalidValidation.isValid).toBe(false);
      expect(invalidValidation.errors).toContain('searchPath is required');
    });
  });

  describe('FileSystem Operations Integration', () => {
    it('should work together for file management', async () => {
      const dirOp = new DirectoryOperation();
      const writeOp = new FileWriteOperation();
      const readOp = new FileReadOperation();
      const searchOp = new FileSearchOperation();

      // Create directory
      mockFs.mkdirSync.mockReturnValue(undefined);
      mockFs.existsSync.mockReturnValue(false);
      const dirResult = await dirOp.execute(mockContext, {
        action: 'create',
        path: '/tmp/test-integration'
      });
      expect(dirResult.success).toBe(true);

      // Write file
      mockFs.writeFileSync.mockReturnValue(undefined);
      mockFs.existsSync.mockReturnValue(true);
      const writeResult = await writeOp.execute(mockContext, {
        filePath: '/tmp/test-integration/test.txt',
        content: 'Integration test content'
      });
      expect(writeResult.success).toBe(true);

      // Read file
      mockFs.readFileSync.mockReturnValue('Integration test content');
      mockFs.existsSync.mockReturnValue(true);
      const readResult = await readOp.execute(mockContext, {
        filePath: '/tmp/test-integration/test.txt'
      });
      expect(readResult.success).toBe(true);
      expect(readResult.data.content).toBe('Integration test content');

      // Search for file
      mockFs.readdirSync.mockReturnValue(['test.txt']);
      mockFs.statSync.mockReturnValue({ isFile: () => true } as any);
      const searchResult = await searchOp.execute(mockContext, {
        searchPath: '/tmp/test-integration',
        pattern: '*.txt'
      });
      expect(searchResult.success).toBe(true);
      expect(searchResult.data.matches).toHaveLength(1);
    });
  });
});