/**
 * File System Operations - Micro-operations for file system functionality
 */

import BaseOperation from '../core/BaseOperation';
import {
  OperationConfig,
  OperationResult,
  OperationContext
} from '../types';
import * as fs from 'fs/promises';
import * as path from 'path';
import { promises as fsPromises } from 'fs';

/**
 * File Read Operation - Read files with various formats
 */
export class FileReadOperation extends BaseOperation {
  constructor(config: OperationConfig = {}) {
    super(config);
    this.name = 'FileReadOperation';
    this.description = 'Read files with various formats and encoding support';
    this.version = '1.0.0';
    this.author = 'WebAuto Team';

    this.abstractCategories = ['read-file', 'file-system'];
    this.supportedContainers = ['file-system', 'storage', 'any'];
    this.capabilities = ['file-reading', 'content-extraction', 'format-support'];

    this.performance = {
      speed: 'fast',
      accuracy: 'high',
      successRate: 0.98,
      memoryUsage: 'low'
    };

    this.requiredParameters = ['filePath'];
    this.optionalParameters = {
      encoding: 'utf8',
      format: 'auto',
      maxFileSize: 10485760, // 10MB
      chunkSize: 65536, // 64KB
      asBuffer: false,
      stream: false,
      metadata: true,
      retryCount: 3,
      retryDelay: 1000
    };
  }

  async execute(context: OperationContext, params: OperationConfig = {}): Promise<OperationResult> {
    const startTime = Date.now();
    const validation = this.validateParameters(params);

    if (!validation.isValid) {
      this.log('error', 'Parameter validation failed', { errors: validation.errors });
      throw new Error(`Parameter validation failed: ${validation.errors.join(', ')}`);
    }

    const finalParams = validation.finalParams;
    this.log('info', 'Starting file read operation', { filePath: finalParams.filePath, params: finalParams });

    try {
      // Check file exists and get metadata
      const stats = await fs.stat(finalParams.filePath);

      // Check file size
      if (stats.size > finalParams.maxFileSize) {
        throw new Error(`File too large: ${stats.size} bytes > ${finalParams.maxFileSize} bytes`);
      }

      // Detect format if auto
      const format = finalParams.format === 'auto' ? this.detectFormat(finalParams.filePath) : finalParams.format;

      // Read file content
      let content: any;
      let metadata: any = {
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime,
        accessed: stats.atime,
        format,
        encoding: finalParams.encoding
      };

      if (finalParams.stream) {
        // Stream reading
        content = await this.readFileStream(finalParams.filePath, finalParams);
      } else {
        // Regular reading
        if (format === 'json') {
          const fileContent = await fs.readFile(finalParams.filePath, finalParams.encoding as BufferEncoding);
          content = JSON.parse(fileContent);
        } else if (format === 'binary' || finalParams.asBuffer) {
          content = await fs.readFile(finalParams.filePath);
          metadata.encoding = 'binary';
        } else {
          content = await fs.readFile(finalParams.filePath, finalParams.encoding as BufferEncoding);
        }
      }

      const executionTime = Date.now() - startTime;
      this.updateStats(true, executionTime);

      this.log('info', 'File read operation completed', {
        filePath: finalParams.filePath,
        size: stats.size,
        format,
        executionTime
      });

      return {
        success: true,
        result: {
          content,
          metadata: finalParams.metadata ? metadata : undefined
        },
        metadata: {
          filePath: finalParams.filePath,
          size: stats.size,
          format,
          encoding: finalParams.encoding,
          executionTime
        }
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.updateStats(false, executionTime);

      this.log('error', 'File read operation failed', {
        filePath: finalParams.filePath,
        error: (error as Error).message,
        executionTime
      });

      return {
        success: false,
        error: (error as Error).message,
        metadata: {
          filePath: finalParams.filePath,
          executionTime
        }
      };
    }
  }

  private detectFormat(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();

    const formatMap: Record<string, string> = {
      '.json': 'json',
      '.txt': 'text',
      '.csv': 'csv',
      '.xml': 'xml',
      '.html': 'html',
      '.htm': 'html',
      '.md': 'markdown',
      '.log': 'text',
      '.js': 'javascript',
      '.ts': 'typescript',
      '.py': 'python',
      '.sh': 'shell',
      '.bat': 'batch',
      '.ps1': 'powershell',
      '.yml': 'yaml',
      '.yaml': 'yaml',
      '.ini': 'ini',
      '.conf': 'config',
      '.config': 'config',
      '.properties': 'properties'
    };

    return formatMap[ext] || 'text';
  }

  private async readFileStream(filePath: string, params: OperationConfig): Promise<any> {
    const { createReadStream } = await import('fs');
    const { pipeline } = await import('stream/promises');

    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const stream = createReadStream(filePath, {
        encoding: params.encoding as BufferEncoding,
        highWaterMark: params.chunkSize
      });

      stream.on('data', (chunk) => {
        chunks.push(chunk);
      });

      stream.on('end', () => {
        const content = Buffer.concat(chunks);
        if (params.asBuffer) {
          resolve(content);
        } else {
          resolve(content.toString(params.encoding as BufferEncoding));
        }
      });

      stream.on('error', reject);
    });
  }
}

/**
 * File Write Operation - Write files with various formats
 */
export class FileWriteOperation extends BaseOperation {
  constructor(config: OperationConfig = {}) {
    super(config);
    this.name = 'FileWriteOperation';
    this.description = 'Write files with various formats and encoding support';
    this.version = '1.0.0';
    this.author = 'WebAuto Team';

    this.abstractCategories = ['write-file', 'file-system'];
    this.supportedContainers = ['file-system', 'storage', 'any'];
    this.capabilities = ['file-writing', 'content-creation', 'format-support'];

    this.performance = {
      speed: 'fast',
      accuracy: 'high',
      successRate: 0.98,
      memoryUsage: 'low'
    };

    this.requiredParameters = ['filePath', 'content'];
    this.optionalParameters = {
      encoding: 'utf8',
      format: 'auto',
      createDirectory: true,
      backup: false,
      backupPath: null,
      append: false,
      overwrite: true,
      atomic: true,
      permissions: null,
      retryCount: 3,
      retryDelay: 1000
    };
  }

  async execute(context: OperationContext, params: OperationConfig = {}): Promise<OperationResult> {
    const startTime = Date.now();
    const validation = this.validateParameters(params);

    if (!validation.isValid) {
      this.log('error', 'Parameter validation failed', { errors: validation.errors });
      throw new Error(`Parameter validation failed: ${validation.errors.join(', ')}`);
    }

    const finalParams = validation.finalParams;
    this.log('info', 'Starting file write operation', { filePath: finalParams.filePath, params: finalParams });

    try {
      // Create directory if needed
      if (finalParams.createDirectory) {
        const dir = path.dirname(finalParams.filePath);
        await fs.mkdir(dir, { recursive: true });
      }

      // Check if file exists
      let existingStats: any = null;
      try {
        existingStats = await fs.stat(finalParams.filePath);
        if (!finalParams.overwrite && !finalParams.append) {
          throw new Error('File exists and overwrite is disabled');
        }
      } catch (error) {
        // File doesn't exist, which is fine
      }

      // Create backup if needed
      if (finalParams.backup && existingStats) {
        const backupPath = finalParams.backupPath || `${finalParams.filePath}.backup.${Date.now()}`;
        await fs.copyFile(finalParams.filePath, backupPath);
        this.log('info', 'Created backup file', { original: finalParams.filePath, backup: backupPath });
      }

      // Prepare content
      let contentToWrite: any = finalParams.content;
      const format = finalParams.format === 'auto' ? this.detectFormat(finalParams.filePath) : finalParams.format;

      if (format === 'json' && typeof contentToWrite === 'object') {
        contentToWrite = JSON.stringify(contentToWrite, null, 2);
      }

      // Write file
      if (finalParams.append) {
        await fs.appendFile(finalParams.filePath, contentToWrite, {
          encoding: finalParams.encoding as BufferEncoding
        });
      } else {
        await fs.writeFile(finalParams.filePath, contentToWrite, {
          encoding: finalParams.encoding as BufferEncoding,
          flag: finalParams.overwrite ? 'w' : 'wx'
        });
      }

      // Set permissions if specified
      if (finalParams.permissions) {
        await fs.chmod(finalParams.filePath, finalParams.permissions);
      }

      // Get file metadata
      const stats = await fs.stat(finalParams.filePath);

      const executionTime = Date.now() - startTime;
      this.updateStats(true, executionTime);

      this.log('info', 'File write operation completed', {
        filePath: finalParams.filePath,
        size: stats.size,
        format,
        executionTime
      });

      return {
        success: true,
        result: {
          filePath: finalParams.filePath,
          size: stats.size,
          format,
          created: !existingStats,
          backup: finalParams.backup
        },
        metadata: {
          filePath: finalParams.filePath,
          size: stats.size,
          format,
          executionTime,
          created: !existingStats
        }
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.updateStats(false, executionTime);

      this.log('error', 'File write operation failed', {
        filePath: finalParams.filePath,
        error: (error as Error).message,
        executionTime
      });

      return {
        success: false,
        error: (error as Error).message,
        metadata: {
          filePath: finalParams.filePath,
          executionTime
        }
      };
    }
  }

  private detectFormat(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const formatMap: Record<string, string> = {
      '.json': 'json',
      '.txt': 'text',
      '.csv': 'csv',
      '.xml': 'xml',
      '.html': 'html',
      '.htm': 'html',
      '.md': 'markdown',
      '.log': 'text'
    };
    return formatMap[ext] || 'text';
  }
}

/**
 * Directory Operations - Create, list, and manage directories
 */
export class DirectoryOperation extends BaseOperation {
  constructor(config: OperationConfig = {}) {
    super(config);
    this.name = 'DirectoryOperation';
    this.description = 'Create, list, and manage directories';
    this.version = '1.0.0';
    this.author = 'WebAuto Team';

    this.abstractCategories = ['directory-operation', 'file-system'];
    this.supportedContainers = ['file-system', 'storage', 'any'];
    this.capabilities = ['directory-management', 'file-system-operations'];

    this.performance = {
      speed: 'fast',
      accuracy: 'high',
      successRate: 0.99,
      memoryUsage: 'low'
    };

    this.requiredParameters = ['path', 'action'];
    this.optionalParameters = {
      recursive: true,
      includeHidden: false,
      includeFiles: true,
      includeDirectories: true,
      maxDepth: 10,
      pattern: null,
      stats: false,
      deleteContents: false,
      permissions: null
    };
  }

  async execute(context: OperationContext, params: OperationConfig = {}): Promise<OperationResult> {
    const startTime = Date.now();
    const validation = this.validateParameters(params);

    if (!validation.isValid) {
      this.log('error', 'Parameter validation failed', { errors: validation.errors });
      throw new Error(`Parameter validation failed: ${validation.errors.join(', ')}`);
    }

    const finalParams = validation.finalParams;
    this.log('info', 'Starting directory operation', { path: finalParams.path, action: finalParams.action });

    try {
      let result: any;

      switch (finalParams.action) {
        case 'create':
          result = await this.createDirectory(finalParams);
          break;
        case 'list':
          result = await this.listDirectory(finalParams);
          break;
        case 'delete':
          result = await this.deleteDirectory(finalParams);
          break;
        case 'exists':
          result = await this.directoryExists(finalParams);
          break;
        case 'clean':
          result = await this.cleanDirectory(finalParams);
          break;
        default:
          throw new Error(`Unknown directory action: ${finalParams.action}`);
      }

      const executionTime = Date.now() - startTime;
      this.updateStats(true, executionTime);

      this.log('info', 'Directory operation completed', {
        path: finalParams.path,
        action: finalParams.action,
        executionTime
      });

      return {
        success: true,
        result,
        metadata: {
          path: finalParams.path,
          action: finalParams.action,
          executionTime
        }
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.updateStats(false, executionTime);

      this.log('error', 'Directory operation failed', {
        path: finalParams.path,
        action: finalParams.action,
        error: (error as Error).message,
        executionTime
      });

      return {
        success: false,
        error: (error as Error).message,
        metadata: {
          path: finalParams.path,
          action: finalParams.action,
          executionTime
        }
      };
    }
  }

  private async createDirectory(params: OperationConfig): Promise<any> {
    await fs.mkdir(params.path, { recursive: params.recursive });

    if (params.permissions) {
      await fs.chmod(params.path, params.permissions);
    }

    const stats = await fs.stat(params.path);
    return {
      action: 'created',
      path: params.path,
      created: stats.birthtime,
      permissions: stats.mode
    };
  }

  private async listDirectory(params: OperationConfig): Promise<any> {
    const entries = await fs.readdir(params.path, { withFileTypes: true });

    const files: any[] = [];
    const directories: any[] = [];

    for (const entry of entries) {
      if (!params.includeHidden && entry.name.startsWith('.')) {
        continue;
      }

      if (params.pattern && !this.matchesPattern(entry.name, params.pattern)) {
        continue;
      }

      const fullPath = path.join(params.path, entry.name);
      const stats = await fs.stat(fullPath);

      const entryInfo: any = {
        name: entry.name,
        path: fullPath,
        isDirectory: entry.isDirectory(),
        isFile: entry.isFile(),
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime,
        permissions: stats.mode
      };

      if (entry.isDirectory() && params.includeDirectories) {
        directories.push(entryInfo);
      } else if (entry.isFile() && params.includeFiles) {
        files.push(entryInfo);
      }
    }

    return {
      action: 'listed',
      path: params.path,
      files,
      directories,
      totalFiles: files.length,
      totalDirectories: directories.length
    };
  }

  private async deleteDirectory(params: OperationConfig): Promise<any> {
    const stats = await fs.stat(params.path);
    const size = stats.size;
    const created = stats.birthtime;

    await fs.rm(params.path, {
      recursive: params.recursive,
      force: params.deleteContents
    });

    return {
      action: 'deleted',
      path: params.path,
      size,
      created
    };
  }

  private async directoryExists(params: OperationConfig): Promise<any> {
    try {
      const stats = await fs.stat(params.path);
      return {
        action: 'exists',
        path: params.path,
        exists: true,
        isDirectory: stats.isDirectory(),
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime
      };
    } catch (error) {
      return {
        action: 'exists',
        path: params.path,
        exists: false
      };
    }
  }

  private async cleanDirectory(params: OperationConfig): Promise<any> {
    const entries = await fs.readdir(params.path);
    const removed: any[] = [];

    for (const entry of entries) {
      const fullPath = path.join(params.path, entry);
      const stats = await fs.stat(fullPath);

      removed.push({
        name: entry,
        path: fullPath,
        size: stats.size,
        isDirectory: stats.isDirectory()
      });

      await fs.rm(fullPath, { recursive: true, force: true });
    }

    return {
      action: 'cleaned',
      path: params.path,
      removed,
      totalRemoved: removed.length
    };
  }

  private matchesPattern(name: string, pattern: string): boolean {
    const regex = new RegExp(pattern.replace(/\*/g, '.*').replace(/\?/g, '.'));
    return regex.test(name);
  }
}

/**
 * File Search Operation - Search for files and content
 */
export class FileSearchOperation extends BaseOperation {
  constructor(config: OperationConfig = {}) {
    super(config);
    this.name = 'FileSearchOperation';
    this.description = 'Search for files and content within directories';
    this.version = '1.0.0';
    this.author = 'WebAuto Team';

    this.abstractCategories = ['search-files', 'file-system'];
    this.supportedContainers = ['file-system', 'storage', 'any'];
    this.capabilities = ['file-search', 'content-search', 'pattern-matching'];

    this.performance = {
      speed: 'medium',
      accuracy: 'high',
      successRate: 0.95,
      memoryUsage: 'medium'
    };

    this.requiredParameters = ['searchPath', 'query'];
    this.optionalParameters = {
      searchType: 'filename', // 'filename', 'content', 'both'
      pattern: false,
      recursive: true,
      maxDepth: 10,
      maxResults: 1000,
      includeHidden: false,
      fileExtensions: [],
      excludePatterns: [],
      caseSensitive: false,
      contentEncoding: 'utf8',
      maxFileSize: 10485760, // 10MB
      followSymlinks: false,
      returnMatches: true,
      contextLines: 0
    };
  }

  async execute(context: OperationContext, params: OperationConfig = {}): Promise<OperationResult> {
    const startTime = Date.now();
    const validation = this.validateParameters(params);

    if (!validation.isValid) {
      this.log('error', 'Parameter validation failed', { errors: validation.errors });
      throw new Error(`Parameter validation failed: ${validation.errors.join(', ')}`);
    }

    const finalParams = validation.finalParams;
    this.log('info', 'Starting file search operation', {
      searchPath: finalParams.searchPath,
      query: finalParams.query,
      searchType: finalParams.searchType
    });

    try {
      const results = await this.performSearch(finalParams);

      const executionTime = Date.now() - startTime;
      this.updateStats(true, executionTime);

      this.log('info', 'File search operation completed', {
        searchPath: finalParams.searchPath,
        query: finalParams.query,
        resultsFound: results.length,
        executionTime
      });

      return {
        success: true,
        result: {
          results,
          totalCount: results.length,
          searchInfo: {
            path: finalParams.searchPath,
            query: finalParams.query,
            type: finalParams.searchType,
            pattern: finalParams.pattern,
            caseSensitive: finalParams.caseSensitive
          }
        },
        metadata: {
          searchPath: finalParams.searchPath,
          query: finalParams.query,
          resultsCount: results.length,
          executionTime
        }
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.updateStats(false, executionTime);

      this.log('error', 'File search operation failed', {
        searchPath: finalParams.searchPath,
        query: finalParams.query,
        error: (error as Error).message,
        executionTime
      });

      return {
        success: false,
        error: (error as Error).message,
        metadata: {
          searchPath: finalParams.searchPath,
          query: finalParams.query,
          executionTime
        }
      };
    }
  }

  private async performSearch(params: OperationConfig): Promise<any[]> {
    const results: any[] = [];
    const processed = new Set<string>();

    await this.searchRecursive(params.searchPath, params, results, processed, 0);

    return results.slice(0, params.maxResults);
  }

  private async searchRecursive(currentPath: string, params: OperationConfig, results: any[], processed: Set<string>, depth: number): Promise<void> {
    if (depth > params.maxDepth) {
      return;
    }

    if (processed.has(currentPath)) {
      return;
    }
    processed.add(currentPath);

    try {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);

        if (!params.includeHidden && entry.name.startsWith('.')) {
          continue;
        }

        if (this.shouldExclude(entry.name, params.excludePatterns)) {
          continue;
        }

        if (entry.isDirectory()) {
          if (params.recursive) {
            await this.searchRecursive(fullPath, params, results, processed, depth + 1);
          }
        } else if (entry.isFile()) {
          await this.searchFile(fullPath, params, results);
        }
      }
    } catch (error) {
      // Skip directories we can't access
      this.log('warn', `Cannot access directory: ${currentPath}`, { error: (error as Error).message });
    }
  }

  private async searchFile(filePath: string, params: OperationConfig, results: any[]): Promise<void> {
    try {
      const stats = await fs.stat(filePath);

      // Check file size
      if (stats.size > params.maxFileSize) {
        return;
      }

      // Check file extension
      if (params.fileExtensions.length > 0) {
        const ext = path.extname(filePath).toLowerCase();
        if (!params.fileExtensions.includes(ext)) {
          return;
        }
      }

      let matches = false;
      let contentMatches: any[] = [];

      // Search by filename
      if (params.searchType === 'filename' || params.searchType === 'both') {
        matches = this.matchPattern(path.basename(filePath), params.query, params);
      }

      // Search by content
      if (!matches && (params.searchType === 'content' || params.searchType === 'both')) {
        const searchResult = await this.searchFileContent(filePath, params);
        matches = searchResult.matches;
        contentMatches = searchResult.contentMatches;
      }

      if (matches) {
        results.push({
          filePath,
          fileName: path.basename(filePath),
          size: stats.size,
          modified: stats.mtime,
          contentMatches: contentMatches.length > 0 ? contentMatches : undefined
        });
      }
    } catch (error) {
      // Skip files we can't access or read
      this.log('warn', `Cannot search file: ${filePath}`, { error: (error as Error).message });
    }
  }

  private async searchFileContent(filePath: string, params: OperationConfig): Promise<{ matches: boolean; contentMatches: any[] }> {
    try {
      const content = await fs.readFile(filePath, params.contentEncoding as BufferEncoding);
      const lines = content.split('\n');
      const contentMatches: any[] = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (this.matchPattern(line, params.query, params)) {
          const match = {
            lineNumber: i + 1,
            line: line.trim(),
            index: line.indexOf(params.query)
          };

          // Add context lines if requested
          if (params.contextLines > 0) {
            const start = Math.max(0, i - params.contextLines);
            const end = Math.min(lines.length, i + params.contextLines + 1);
            match.context = lines.slice(start, end).map((l, idx) => ({
              lineNumber: start + idx + 1,
              line: l.trim(),
              isMatch: idx === i - start
            }));
          }

          contentMatches.push(match);
        }
      }

      return {
        matches: contentMatches.length > 0,
        contentMatches
      };
    } catch (error) {
      return { matches: false, contentMatches: [] };
    }
  }

  private matchPattern(text: string, pattern: string, params: OperationConfig): boolean {
    if (params.pattern) {
      const regexFlags = params.caseSensitive ? 'g' : 'gi';
      const regex = new RegExp(pattern, regexFlags);
      return regex.test(text);
    } else {
      if (params.caseSensitive) {
        return text.includes(pattern);
      } else {
        return text.toLowerCase().includes(pattern.toLowerCase());
      }
    }
  }

  private shouldExclude(name: string, excludePatterns: string[]): boolean {
    return excludePatterns.some(pattern => {
      if (pattern.includes('*')) {
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        return regex.test(name);
      }
      return name === pattern;
    });
  }
}