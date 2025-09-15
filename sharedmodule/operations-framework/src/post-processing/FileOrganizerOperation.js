/**
 * 文件归纳和合并操作子
 * 专门处理本地文件的归纳、整理和合并任务
 */

import PostProcessingOperation from './PostProcessingOperation.js';
import fs from 'fs';
import path from 'path';
import glob from 'glob';

export class FileOrganizerOperation extends PostProcessingOperation {
  constructor(config = {}) {
    super(config);
    this.name = 'FileOrganizerOperation';
    this.description = '文件归纳和合并操作子，支持智能文件整理和批量合并';
    this.version = '1.0.0';
    
    // 预定义的归纳规则
    this.predefinedRules = {
      byExtension: [
        {
          type: 'extension',
          extensions: ['.txt', '.md', '.log'],
          targetPattern: './organized/text/${filename}',
          description: '文本文件归类'
        },
        {
          type: 'extension',
          extensions: ['.html', '.htm', '.xml'],
          targetPattern: './organized/web/${filename}',
          description: '网页文件归类'
        },
        {
          type: 'extension',
          extensions: ['.json', '.csv', '.xlsx'],
          targetPattern: './organized/data/${filename}',
          description: '数据文件归类'
        },
        {
          type: 'extension',
          extensions: ['.jpg', '.png', '.gif', '.svg'],
          targetPattern: './organized/images/${filename}',
          description: '图片文件归类'
        }
      ],
      byDate: [
        {
          type: 'date',
          since: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 最近7天
          until: new Date(),
          targetPattern: './organized/recent/${filename}',
          description: '最近文件归类'
        },
        {
          type: 'date',
          since: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 最近30天
          until: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          targetPattern: './organized/this-month/${filename}',
          description: '本月文件归类'
        }
      ],
      bySize: [
        {
          type: 'size',
          minSize: 0,
          maxSize: 1024 * 1024, // 1MB
          targetPattern: './organized/small/${filename}',
          description: '小文件归类'
        },
        {
          type: 'size',
          minSize: 1024 * 1024, // 1MB
          maxSize: 10 * 1024 * 1024, // 10MB
          targetPattern: './organized/medium/${filename}',
          description: '中等文件归类'
        },
        {
          type: 'size',
          minSize: 10 * 1024 * 1024, // 10MB
          maxSize: Infinity,
          targetPattern: './organized/large/${filename}',
          description: '大文件归类'
        }
      ]
    };
  }

  /**
   * 执行文件归纳操作
   */
  async execute(context, params = {}) {
    const { operation = 'intelligentOrganize', ...operationParams } = params;
    
    try {
      switch (operation) {
        case 'intelligentOrganize':
          return await this.intelligentOrganize(operationParams);
        case 'batchMerge':
          return await this.batchMerge(operationParams);
        case 'organizeRecursively':
          return await this.organizeRecursively(operationParams);
        case 'smartGroupFiles':
          return await this.smartGroupFiles(operationParams);
        default:
          throw new Error(`Unknown file organizer operation: ${operation}`);
      }
    } catch (error) {
      this.logger.error('File organizer operation failed', { 
        operation, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * 智能文件归纳
   */
  async intelligentOrganize(params = {}) {
    const {
      sourceDirectory,
      targetDirectory,
      strategy = 'extension', // 'extension', 'date', 'size', 'custom'
      customRules = [],
      createSummary = true,
      backup = false
    } = params;

    try {
      this.logger.info('Starting intelligent file organization', {
        sourceDirectory,
        targetDirectory,
        strategy
      });

      // 选择规则集
      let rules = customRules;
      if (!rules.length) {
        rules = this.predefinedRules[`${strategy}Rules`] || this.predefinedRules.byExtension;
      }

      // 备份原目录
      if (backup) {
        await this.backupDirectory(sourceDirectory);
      }

      // 执行归纳 - 修改规则以使用绝对路径
      const absoluteRules = rules.map(rule => ({
        ...rule,
        targetPattern: rule.targetPattern.replace(/^\.\//, targetDirectory + '/')
      }));

      const result = await this.organizeFiles({
        sourceDirectory,
        targetDirectory,
        organizationRules: absoluteRules
      });

      // 创建归纳报告
      if (createSummary) {
        const summary = await this.createOrganizationSummary(result, targetDirectory);
        result.summary = summary;
      }

      return result;

    } catch (error) {
      this.logger.error('Intelligent organization failed', { error: error.message });
      throw error;
    }
  }

  /**
   * 批量文件合并
   */
  async batchMerge(params = {}) {
    const {
      sourcePatterns, // 支持glob模式
      targetFile,
      mergeOptions = {
        strategy: 'concatenate',
        format: 'text',
        includeHeaders: true,
        addSeparators: true,
        deduplicate: false
      },
      filter = (file) => true
    } = params;

    try {
      this.logger.info('Starting batch file merge', {
        sourcePatterns,
        targetFile,
        mergeOptions
      });

      // 解析文件模式
      const sourceFiles = await this.resolveFilePatterns(sourcePatterns, filter);
      
      if (sourceFiles.length === 0) {
        throw new Error('No files found matching the patterns');
      }

      // 去重处理
      let filesToMerge = sourceFiles;
      if (mergeOptions.deduplicate) {
        filesToMerge = await this.deduplicateFiles(sourceFiles);
      }

      // 排序文件
      filesToMerge = this.sortFiles(filesToMerge, mergeOptions.sortBy || 'name');

      // 执行合并
      const mergeResult = await this.mergeFiles({
        sourceFiles: filesToMerge,
        targetFile,
        mergeStrategy: mergeOptions.strategy,
        outputFileFormat: mergeOptions.format,
        includeMetadata: mergeOptions.includeHeaders
      });

      // 添加合并元数据
      if (mergeOptions.addSeparators) {
        await this.addMergeSeparators(targetFile, mergeOptions);
      }

      return {
        ...mergeResult,
        patterns: sourcePatterns,
        filesFound: sourceFiles.length,
        filesMerged: filesToMerge.length,
        deduplicated: mergeOptions.deduplicate ? sourceFiles.length - filesToMerge.length : 0
      };

    } catch (error) {
      this.logger.error('Batch merge failed', { error: error.message });
      throw error;
    }
  }

  /**
   * 递归目录整理
   */
  async organizeRecursively(params = {}) {
    const {
      rootDirectory,
      targetDirectory,
      maxDepth = 3,
      flattenStructure = false,
      preserveHierarchy = false,
      rules = []
    } = params;

    try {
      this.logger.info('Starting recursive directory organization', {
        rootDirectory,
        targetDirectory,
        maxDepth
      });

      const results = [];
      
      // 递归扫描目录
      const directoryStructure = await this.scanDirectoryRecursively(rootDirectory, maxDepth);
      
      // 处理每个子目录
      for (const { path: dirPath, depth, files } of directoryStructure) {
        if (files.length === 0) continue;

        const targetSubDir = preserveHierarchy 
          ? this.createTargetPath(dirPath, rootDirectory, targetDirectory)
          : targetDirectory;

        const result = await this.organizeFiles({
          sourceDirectory: dirPath,
          targetDirectory: targetSubDir,
          organizationRules: rules
        });

        results.push({
          sourcePath: dirPath,
          targetPath: targetSubDir,
          depth,
          ...result
        });
      }

      // 扁平化处理
      if (flattenStructure) {
        await this.flattenStructure(targetDirectory);
      }

      return {
        success: true,
        directoriesProcessed: results.length,
        totalFilesProcessed: results.reduce((sum, r) => sum + r.filesProcessed, 0),
        results
      };

    } catch (error) {
      this.logger.error('Recursive organization failed', { error: error.message });
      throw error;
    }
  }

  /**
   * 智能文件分组
   */
  async smartGroupFiles(params = {}) {
    const {
      sourceDirectory,
      groupingStrategy = 'content-similarity', // 'content-similarity', 'name-pattern', 'metadata'
      outputDirectory,
      similarityThreshold = 0.7,
      maxGroupSize = 50
    } = params;

    try {
      this.logger.info('Starting smart file grouping', {
        sourceDirectory,
        groupingStrategy
      });

      // 扫描所有文件
      const allFiles = await this.scanDirectory(sourceDirectory);
      
      // 根据策略分组
      const groups = await this.groupFilesByStrategy(allFiles, groupingStrategy, similarityThreshold);
      
      // 限制分组大小
      const limitedGroups = this.limitGroupSizes(groups, maxGroupSize);
      
      // 创建分组目录并移动文件
      const groupResults = [];
      for (const [groupId, files] of Object.entries(limitedGroups)) {
        const groupDir = `${outputDirectory}/group_${groupId}`;
        await this.ensureDirectory(groupDir);
        
        for (const file of files) {
          const targetPath = `${groupDir}/${file.name}`;
          await this.moveFile(file.path, targetPath, `Grouped by ${groupingStrategy}`);
        }
        
        groupResults.push({
          groupId,
          fileCount: files.length,
          directory: groupDir,
          strategy: groupingStrategy
        });
      }

      return {
        success: true,
        totalFiles: allFiles.length,
        groupsCreated: groupResults.length,
        groupResults,
        groupingStrategy
      };

    } catch (error) {
      this.logger.error('Smart grouping failed', { error: error.message });
      throw error;
    }
  }

  /**
   * 解析文件模式
   */
  async resolveFilePatterns(patterns, filter) {
    const allFiles = new Set();
    
    for (const pattern of patterns) {
      const files = glob.sync(pattern);
      for (const file of files) {
        if (filter(file)) {
          allFiles.add(file);
        }
      }
    }
    
    return Array.from(allFiles).map(file => ({
      path: file,
      name: path.basename(file),
      size: fs.statSync(file).size,
      mtime: fs.statSync(file).mtime
    }));
  }

  /**
   * 文件去重
   */
  async deduplicateFiles(files) {
    const uniqueFiles = new Map();
    
    for (const file of files) {
      const hash = await this.calculateFileHash(file.path);
      if (!uniqueFiles.has(hash)) {
        uniqueFiles.set(hash, file);
      }
    }
    
    return Array.from(uniqueFiles.values());
  }

  /**
   * 递归扫描目录
   */
  async scanDirectoryRecursively(rootDir, maxDepth, currentDepth = 0) {
    if (currentDepth > maxDepth) return [];
    
    const results = [];
    const entries = await fs.promises.readdir(rootDir, { withFileTypes: true });
    
    const files = [];
    const directories = [];
    
    for (const entry of entries) {
      const fullPath = path.join(rootDir, entry.name);
      if (entry.isFile()) {
        const stats = await fs.promises.stat(fullPath);
        files.push({
          path: fullPath,
          name: entry.name,
          size: stats.size,
          mtime: stats.mtime
        });
      } else if (entry.isDirectory()) {
        directories.push(fullPath);
      }
    }
    
    if (files.length > 0) {
      results.push({
        path: rootDir,
        depth: currentDepth,
        files
      });
    }
    
    // 递归处理子目录
    for (const dir of directories) {
      const subResults = await this.scanDirectoryRecursively(dir, maxDepth, currentDepth + 1);
      results.push(...subResults);
    }
    
    return results;
  }

  /**
   * 根据策略分组文件
   */
  async groupFilesByStrategy(files, strategy, threshold) {
    switch (strategy) {
      case 'content-similarity':
        return await this.groupByContentSimilarity(files, threshold);
      case 'name-pattern':
        return this.groupByNamePattern(files);
      case 'metadata':
        return this.groupByMetadata(files);
      default:
        throw new Error(`Unknown grouping strategy: ${strategy}`);
    }
  }

  /**
   * 按内容相似性分组
   */
  async groupByContentSimilarity(files, threshold) {
    const groups = new Map();
    const processed = new Set();
    
    for (let i = 0; i < files.length; i++) {
      if (processed.has(i)) continue;
      
      const file1 = files[i];
      const content1 = await this.readFileContent(file1.path);
      const group = [file1];
      processed.add(i);
      
      for (let j = i + 1; j < files.length; j++) {
        if (processed.has(j)) continue;
        
        const file2 = files[j];
        const content2 = await this.readFileContent(file2.path);
        const similarity = this.calculateSimilarity(content1, content2);
        
        if (similarity >= threshold) {
          group.push(file2);
          processed.add(j);
        }
      }
      
      groups.set(`group_${groups.size}`, group);
    }
    
    return groups;
  }

  /**
   * 计算文本相似性
   */
  calculateSimilarity(text1, text2) {
    // 简单的相似性计算，实际可以使用更复杂的算法
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));
    
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
  }

  /**
   * 限制分组大小
   */
  limitGroupSizes(groups, maxSize) {
    const limitedGroups = {};
    
    for (const [groupId, files] of Object.entries(groups)) {
      if (files.length <= maxSize) {
        limitedGroups[groupId] = files;
      } else {
        // 拆分大分组
        const chunks = this.chunkArray(files, maxSize);
        for (let i = 0; i < chunks.length; i++) {
          limitedGroups[`${groupId}_${i}`] = chunks[i];
        }
      }
    }
    
    return limitedGroups;
  }

  /**
   * 数组分块
   */
  chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * 添加合并分隔符
   */
  async addMergeSeparators(targetFile, options) {
    const separator = '\n' + '='.repeat(50) + '\n';
    
    const content = await fs.promises.readFile(targetFile, 'utf8');
    const separatedContent = content.replace(/\n\n/g, separator);
    
    await fs.promises.writeFile(targetFile, separatedContent);
  }

  /**
   * 扁平化目录结构
   */
  async flattenStructure(directory) {
    // 将所有子目录的文件移动到根目录
    const moveFilesToRoot = async (dir) => {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isFile()) {
          const sourcePath = path.join(dir, entry.name);
          const targetPath = path.join(directory, entry.name);
          await fs.promises.rename(sourcePath, targetPath);
        } else if (entry.isDirectory()) {
          await moveFilesToRoot(path.join(dir, entry.name));
        }
      }
    };
    
    await moveFilesToRoot(directory);
  }

  /**
   * 创建归纳总结
   */
  async createOrganizationSummary(result, targetDirectory) {
    const summary = {
      timestamp: new Date().toISOString(),
      totalFiles: result.filesProcessed,
      organizationPlan: result.organizationPlan.length,
      targetDirectory,
      rulesApplied: [...new Set(result.organizationPlan.map(item => item.reason))]
    };
    
    const summaryPath = `${targetDirectory}/organization_summary.json`;
    await this.writeFileContent(summaryPath, JSON.stringify(summary, null, 2));
    
    return summary;
  }

  /**
   * 计算文件哈希
   */
  async calculateFileHash(filePath) {
    const crypto = await import('crypto');
    
    const hash = crypto.createHash('md5');
    const stream = fs.createReadStream(filePath);
    
    return new Promise((resolve, reject) => {
      stream.on('data', (data) => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  /**
   * 确保目录存在
   */
  async ensureDirectory(dirPath) {
    try {
      await fs.promises.mkdir(dirPath, { recursive: true });
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
    }
  }

  /**
   * 备份目录
   */
  async backupDirectory(sourceDir) {
    const backupPath = `${sourceDir}_backup_${Date.now()}`;
    await this.copyDirectory(sourceDir, backupPath);
    
    this.logger.info('Directory backup created', { sourceDir, backupPath });
    return backupPath;
  }

  /**
   * 复制目录
   */
  async copyDirectory(source, target) {
    await fs.promises.mkdir(target, { recursive: true });
    const entries = await fs.promises.readdir(source, { withFileTypes: true });
    
    for (const entry of entries) {
      const srcPath = path.join(source, entry.name);
      const destPath = path.join(target, entry.name);
      
      if (entry.isDirectory()) {
        await this.copyDirectory(srcPath, destPath);
      } else {
        await fs.promises.copyFile(srcPath, destPath);
      }
    }
  }

  /**
   * 获取操作子状态
   */
  getStatus() {
    return {
      ...this.getProcessingStats(),
      name: this.name,
      description: this.description,
      predefinedRules: Object.keys(this.predefinedRules),
      version: this.version
    };
  }
}

export default FileOrganizerOperation;