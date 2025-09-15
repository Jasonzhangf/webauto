/**
 * 后处理操作子基类
 * 处理本地文件归纳、合并、下载和格式化等后处理任务
 */

import BaseOperation from "../BaseOperation.js";
import { EventEmitter } from 'events';

export class PostProcessingOperation extends BaseOperation {
  constructor(config = {}) {
    super(config);
    this.category = 'post-processing';
    this.eventEmitter = new EventEmitter();
    this.processingStats = {
      filesProcessed: 0,
      bytesProcessed: 0,
      processingTime: 0,
      errorsEncountered: 0
    };
    this.supportedFormats = [
      'text/plain',
      'text/html',
      'text/markdown',
      'application/json',
      'application/xml'
    ];
    this.maxFileSize = config.maxFileSize || 50 * 1024 * 1024; // 50MB
    this.batchSize = config.batchSize || 10;
    this.parallelProcessing = config.parallelProcessing ?? true;
  }

  /**
   * 执行后处理操作
   * @param {Object} context - 执行上下文
   * @param {Object} params - 操作参数
   * @returns {Promise<Object>} 执行结果
   */
  async execute(context, params = {}) {
    // 根据操作类型路由到具体的方法
    const { operationType, ...operationParams } = params;
    
    try {
      switch (operationType) {
        case 'organize':
          return await this.organizeFiles(operationParams);
        case 'merge':
          return await this.mergeFiles(operationParams);
        case 'format':
          return await this.formatHTML(operationParams);
        default:
          throw new Error(`Unknown operation type: ${operationType}`);
      }
    } catch (error) {
      this.logger.error('Post-processing operation failed', { 
        operationType, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * 初始化后处理器
   */
  async initialize() {
    this.logger.info('Initializing post-processing operation', { 
      category: this.category,
      supportedFormats: this.supportedFormats,
      maxFileSize: this.maxFileSize
    });
    
    // 验证必要的依赖
    await this.validateDependencies();
    
    this.emit('initialized', { 
      category: this.category,
      timestamp: Date.now()
    });
  }

  /**
   * 验证依赖
   */
  async validateDependencies() {
    const dependencies = ['fs', 'path', 'util'];
    const missingDeps = [];
    
    for (const dep of dependencies) {
      try {
        await import(dep);
      } catch (error) {
        missingDeps.push(dep);
      }
    }
    
    if (missingDeps.length > 0) {
      throw new Error(`Missing required dependencies: ${missingDeps.join(', ')}`);
    }
  }

  /**
   * 文件归纳操作
   */
  async organizeFiles(params = {}) {
    const {
      sourceDirectory,
      targetDirectory,
      organizationRules = [],
      fileFilter = () => true,
      dryRun = false
    } = params;

    const startTime = Date.now();
    
    try {
      this.logger.info('Starting file organization', {
        sourceDirectory,
        targetDirectory,
        rulesCount: organizationRules.length
      });

      const fs = await import('fs');
      const path = await import('path');

      // 确保目标目录存在
      if (!dryRun) {
        await this.ensureDirectory(targetDirectory);
      }

      // 扫描源目录
      const files = await this.scanDirectory(sourceDirectory, fileFilter);
      
      // 应用归纳规则
      const organizationPlan = await this.createOrganizationPlan(files, organizationRules);
      
      // 执行归纳
      const results = [];
      for (const item of organizationPlan) {
        if (!dryRun) {
          const result = await this.moveFile(item.source, item.target, item.reason);
          results.push(result);
        }
      }

      const processingTime = Date.now() - startTime;
      this.updateStats({
        filesProcessed: files.length,
        processingTime
      });

      this.emit('organization:completed', {
        filesProcessed: files.length,
        processingTime,
        results
      });

      return {
        success: true,
        filesProcessed: files.length,
        organizationPlan,
        processingTime,
        dryRun
      };

    } catch (error) {
      this.logger.error('File organization failed', { error: error.message });
      this.updateStats({ errorsEncountered: 1 });
      throw error;
    }
  }

  /**
   * 文件合并操作
   */
  async mergeFiles(params = {}) {
    const {
      sourceFiles,
      targetFile,
      mergeStrategy = 'concatenate', // 'concatenate', 'json-merge', 'csv-merge'
      outputFileFormat = 'text',
      includeMetadata = true
    } = params;

    const startTime = Date.now();

    try {
      this.logger.info('Starting file merge operation', {
        sourceFilesCount: sourceFiles.length,
        targetFile,
        mergeStrategy,
        outputFileFormat
      });

      // 验证源文件
      const validFiles = await this.validateFiles(sourceFiles);
      
      // 根据策略合并文件
      let mergedContent;
      switch (mergeStrategy) {
        case 'concatenate':
          mergedContent = await this.concatenateFiles(validFiles, includeMetadata);
          break;
        case 'json-merge':
          mergedContent = await this.mergeJsonFiles(validFiles);
          break;
        case 'csv-merge':
          mergedContent = await this.mergeCsvFiles(validFiles);
          break;
        default:
          throw new Error(`Unsupported merge strategy: ${mergeStrategy}`);
      }

      // 写入目标文件
      await this.writeMergedFile(targetFile, mergedContent, outputFileFormat);

      const processingTime = Date.now() - startTime;
      const totalSize = validFiles.reduce((sum, file) => sum + file.size, 0);

      this.updateStats({
        filesProcessed: validFiles.length,
        bytesProcessed: totalSize,
        processingTime
      });

      this.emit('merge:completed', {
        filesProcessed: validFiles.length,
        totalSize,
        processingTime,
        targetFile
      });

      return {
        success: true,
        filesProcessed: validFiles.length,
        totalSize,
        targetFile,
        mergeStrategy,
        processingTime
      };

    } catch (error) {
      this.logger.error('File merge failed', { error: error.message });
      this.updateStats({ errorsEncountered: 1 });
      throw error;
    }
  }

  /**
   * HTML格式化操作
   */
  async formatHTML(params = {}) {
    const {
      sourceFile,
      targetFile,
      formattingOptions = {
        removeComments: true,
        removeEmptyLines: true,
        minify: false,
        addStructure: true,
        extractMainContent: true,
        simplifyNavigation: true
      },
      customTransformers = []
    } = params;

    const startTime = Date.now();

    try {
      this.logger.info('Starting HTML formatting', {
        sourceFile,
        targetFile,
        options: formattingOptions
      });

      // 读取源文件
      const sourceContent = await this.readFileContent(sourceFile);
      
      // 格式化HTML
      const formattedHTML = await this.processHTMLContent(sourceContent, formattingOptions);
      
      // 应用自定义转换器
      let finalContent = formattedHTML;
      for (const transformer of customTransformers) {
        finalContent = await transformer(finalContent);
      }

      // 写入目标文件
      await this.writeFileContent(targetFile, finalContent);

      const processingTime = Date.now() - startTime;
      const tokenSavings = this.calculateTokenSavings(sourceContent, finalContent);

      this.updateStats({
        filesProcessed: 1,
        bytesProcessed: sourceContent.length,
        processingTime
      });

      this.emit('formatting:completed', {
        sourceFile,
        targetFile,
        tokenSavings,
        processingTime
      });

      return {
        success: true,
        sourceFile,
        targetFile,
        originalSize: sourceContent.length,
        finalSize: finalContent.length,
        tokenSavings,
        processingTime
      };

    } catch (error) {
      this.logger.error('HTML formatting failed', { error: error.message });
      this.updateStats({ errorsEncountered: 1 });
      throw error;
    }
  }

  /**
   * 扫描目录
   */
  async scanDirectory(directory, fileFilter) {
    const fs = await import('fs');
    const path = await import('path');
    
    const files = [];
    const entries = await fs.promises.readdir(directory, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isFile()) {
        const filePath = path.join(directory, entry.name);
        if (fileFilter(filePath, entry)) {
          const stats = await fs.promises.stat(filePath);
          files.push({
            path: filePath,
            name: entry.name,
            size: stats.size,
            mtime: stats.mtime,
            extension: path.extname(entry.name).toLowerCase()
          });
        }
      }
    }
    
    return files;
  }

  /**
   * 创建归纳计划
   */
  async createOrganizationPlan(files, rules) {
    const plan = [];
    
    for (const file of files) {
      let targetPath = null;
      let reason = null;
      
      for (const rule of rules) {
        if (await this.matchesRule(file, rule)) {
          targetPath = rule.targetPattern.replace('${filename}', file.name);
          reason = rule.description;
          break;
        }
      }
      
      if (targetPath) {
        plan.push({
          source: file.path,
          target: targetPath,
          reason: reason
        });
      }
    }
    
    return plan;
  }

  /**
   * 检查文件是否匹配规则
   */
  async matchesRule(file, rule) {
    switch (rule.type) {
      case 'extension':
        return rule.extensions.includes(file.extension);
      case 'size':
        return file.size >= rule.minSize && file.size <= rule.maxSize;
      case 'name':
        return new RegExp(rule.pattern).test(file.name);
      case 'date':
        const fileDate = new Date(file.mtime);
        return fileDate >= new Date(rule.since) && fileDate <= new Date(rule.until);
      default:
        return false;
    }
  }

  /**
   * 连接文件内容
   */
  async concatenateFiles(files, includeMetadata) {
    let result = '';
    
    for (const file of files) {
      const content = await this.readFileContent(file.path);
      
      if (includeMetadata) {
        result += `=== File: ${file.name} ===\n`;
        result += `Size: ${file.size} bytes\n`;
        result += `Modified: ${file.mtime.toISOString()}\n\n`;
      }
      
      result += content + '\n\n';
    }
    
    return result;
  }

  /**
   * 合并JSON文件
   */
  async mergeJsonFiles(files) {
    const result = {};
    
    for (const file of files) {
      const content = await this.readFileContent(file.path);
      const data = JSON.parse(content);
      Object.assign(result, data);
    }
    
    return JSON.stringify(result, null, 2);
  }

  /**
   * 处理HTML内容
   */
  async processHTMLContent(html, options) {
    let processed = html;
    
    if (options.removeComments) {
      processed = processed.replace(/<!--[\s\S]*?-->/g, '');
    }
    
    if (options.removeEmptyLines) {
      processed = processed.replace(/\n\s*\n/g, '\n');
    }
    
    if (options.extractMainContent) {
      processed = this.extractMainContent(processed);
    }
    
    if (options.simplifyNavigation) {
      processed = this.simplifyNavigation(processed);
    }
    
    if (options.minify) {
      processed = processed.replace(/\s+/g, ' ').trim();
    }
    
    return processed;
  }

  /**
   * 提取主要内容
   */
  extractMainContent(html) {
    // 简单的主要内容提取逻辑
    const mainContentPatterns = [
      /<main[^>]*>([\s\S]*?)<\/main>/i,
      /<article[^>]*>([\s\S]*?)<\/article>/i,
      /<div[^>]*class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i
    ];
    
    for (const pattern of mainContentPatterns) {
      const match = html.match(pattern);
      if (match) {
        return match[1];
      }
    }
    
    return html;
  }

  /**
   * 简化导航
   */
  simplifyNavigation(html) {
    // 移除导航元素
    return html.replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
               .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
               .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '');
  }

  /**
   * 计算Token节省
   */
  calculateTokenSavings(original, processed) {
    const originalTokens = Math.ceil(original.length / 4); // 简单估算
    const processedTokens = Math.ceil(processed.length / 4);
    return originalTokens - processedTokens;
  }

  /**
   * 更新统计信息
   */
  updateStats(stats) {
    Object.assign(this.processingStats, stats);
  }

  /**
   * 获取处理统计
   */
  getProcessingStats() {
    return {
      ...this.processingStats,
      category: this.category,
      supportedFormats: this.supportedFormats,
      maxFileSize: this.maxFileSize
    };
  }

  /**
   * 事件发射
   */
  on(event, callback) {
    this.eventEmitter.on(event, callback);
  }

  emit(event, data) {
    this.eventEmitter.emit(event, data);
  }

  /**
   * 清理资源
   */
  async cleanup() {
    this.eventEmitter.removeAllListeners();
    this.logger.info('Post-processing operation cleaned up');
  }

  /**
   * 移动文件
   */
  async moveFile(sourcePath, targetPath, reason = 'File organization') {
    const fs = await import('fs');
    const path = await import('path');
    
    try {
      // 确保目标目录存在
      const targetDir = path.dirname(targetPath);
      await this.ensureDirectory(targetDir);
      
      // 移动文件
      await fs.promises.rename(sourcePath, targetPath);
      
      this.logger.debug('File moved', { 
        sourcePath, 
        targetPath, 
        reason 
      });
      
      return {
        sourcePath,
        targetPath,
        reason,
        success: true
      };
    } catch (error) {
      this.logger.error('Failed to move file', { 
        sourcePath, 
        targetPath, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * 读取文件内容
   */
  async readFileContent(filePath) {
    const fs = await import('fs');
    
    try {
      const content = await fs.promises.readFile(filePath, 'utf8');
      return content;
    } catch (error) {
      this.logger.error('Failed to read file', { 
        filePath, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * 写入文件内容
   */
  async writeFileContent(filePath, content) {
    const fs = await import('fs');
    const path = await import('path');
    
    try {
      // 确保目标目录存在
      const targetDir = path.dirname(filePath);
      await this.ensureDirectory(targetDir);
      
      // 写入文件
      await fs.promises.writeFile(filePath, content, 'utf8');
      
      this.logger.debug('File written', { 
        filePath, 
        size: content.length 
      });
      
      return {
        filePath,
        size: content.length,
        success: true
      };
    } catch (error) {
      this.logger.error('Failed to write file', { 
        filePath, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * 确保目录存在
   */
  async ensureDirectory(dirPath) {
    const fs = await import('fs');
    
    try {
      await fs.promises.mkdir(dirPath, { recursive: true });
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
    }
  }

  /**
   * 验证文件
   */
  async validateFiles(files) {
    const fs = await import('fs');
    const path = await import('path');
    const validFiles = [];
    
    for (const file of files) {
      try {
        const filePath = file.path || file;
        const stats = await fs.promises.stat(filePath);
        validFiles.push({
          path: filePath,
          name: file.name || path.basename(filePath),
          size: stats.size,
          mtime: stats.mtime
        });
      } catch (error) {
        this.logger.warn('Invalid file skipped', { 
          file: file.path || file, 
          error: error.message 
        });
      }
    }
    
    return validFiles;
  }

  /**
   * 写入合并文件
   */
  async writeMergedFile(targetFile, content, format = 'text') {
    let finalContent = content;
    
    // 根据格式处理内容
    switch (format) {
      case 'json':
        if (typeof content === 'object') {
          finalContent = JSON.stringify(content, null, 2);
        } else if (typeof content === 'string') {
          try {
            JSON.parse(content); // 验证JSON格式
          } catch {
            throw new Error('Content is not valid JSON');
          }
        }
        break;
      case 'csv':
        if (Array.isArray(content)) {
          finalContent = this.convertToCSV(content);
        }
        break;
    }
    
    return await this.writeFileContent(targetFile, finalContent);
  }

  /**
   * 转换为CSV格式
   */
  convertToCSV(data) {
    if (!Array.isArray(data) || data.length === 0) {
      return '';
    }
    
    const headers = Object.keys(data[0]);
    const csvRows = [
      headers.join(','),
      ...data.map(row => 
        headers.map(header => {
          const value = row[header];
          // 处理包含逗号或引号的值
          if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value;
        }).join(',')
      )
    ];
    
    return csvRows.join('\n');
  }

  /**
   * 合并CSV文件
   */
  async mergeCsvFiles(files) {
    const allData = [];
    let headers = [];
    
    for (const file of files) {
      const content = await this.readFileContent(file.path);
      const lines = content.split('\n').filter(line => line.trim());
      
      if (lines.length === 0) continue;
      
      const fileHeaders = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
      
      if (headers.length === 0) {
        headers = fileHeaders;
      }
      
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
        const row = {};
        
        for (let j = 0; j < Math.min(headers.length, values.length); j++) {
          row[headers[j]] = values[j];
        }
        
        allData.push(row);
      }
    }
    
    return allData;
  }
}

export default PostProcessingOperation;