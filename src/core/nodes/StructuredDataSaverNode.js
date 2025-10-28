/**
 * 结构化数据保存节点
 * 将微博帖子的结构化数据保存到多种格式（JSON、CSV、数据库等）
 */

const { BaseNode } = require('./base-node');
const fs = require('fs');
const path = require('path');

class StructuredDataSaverNode extends BaseNode {
  constructor(config = {}) {
    super('STRUCTURED_DATA_SAVER', config);

    this.defaultConfig = {
      formats: ['json'],
      savePath: './output/${postId}',
      filenamePrefix: 'weibo_post',
      includeMetadata: true,
      includeMedia: true,
      compress: false,
      createSubdirs: true,
      overwrite: false,
      generateReport: true,
      databaseConfig: null, // 可选的数据库配置
      csvOptions: {
        delimiter: ',',
        includeHeaders: true,
        encoding: 'utf8'
      },
      jsonOptions: {
        indent: 2,
        sortKeys: false
      },
      ...config
    };

    this.config = { ...this.defaultConfig, ...config };
    this.saveStats = {
      startTime: null,
      endTime: null,
      filesSaved: 0,
      totalSize: 0,
      formats: [],
      errors: [],
      savedFiles: []
    };
  }

  async validateInput(input) {
    if (!input.structuredData) {
      throw new Error('Missing required input: structuredData');
    }

    if (!this.config.formats || this.config.formats.length === 0) {
      throw new Error('No output formats specified');
    }

    return true;
  }

  async preprocess(input) {
    this.saveStats.startTime = Date.now();

    // 确保保存目录存在
    await this.ensureSaveDirectory(input.structuredData?.post?.postId);

    return input;
  }

  async execute(input) {
    const { structuredData, metadata } = input;

    console.log('💾 开始保存结构化数据...');

    try {
      const savedFiles = [];
      const savePromises = [];

      // 根据配置的格式分别保存
      for (const format of this.config.formats) {
        console.log(`📄 保存 ${format.toUpperCase()} 格式...`);
        savePromises.push(this.saveAsFormat(structuredData, format, metadata));
      }

      // 执行所有保存操作
      const saveResults = await Promise.allSettled(savePromises);

      // 处理保存结果
      for (let i = 0; i < saveResults.length; i++) {
        const result = saveResults[i];
        const format = this.config.formats[i];

        if (result.status === 'fulfilled') {
          savedFiles.push(...result.value);
          this.saveStats.formats.push(format);
        } else {
          console.error(`保存 ${format.toUpperCase()} 格式失败:`, result.reason.message);
          this.saveStats.errors.push({
            timestamp: Date.now(),
            format,
            error: result.reason.message
          });
        }
      }

      // 生成保存报告
      if (this.config.generateReport) {
        await this.generateSaveReport(structuredData, savedFiles);
      }

      // 计算统计信息
      this.saveStats.filesSaved = savedFiles.length;
      this.saveStats.totalSize = savedFiles.reduce((total, file) => total + (file.size || 0), 0);
      this.saveStats.endTime = Date.now();
      this.saveStats.executionTime = this.saveStats.endTime - this.saveStats.startTime;

      const result = {
        success: true,
        savedFiles,
        exportPaths: this.generateExportPaths(savedFiles),
        saveStats: { ...this.saveStats }
      };

      console.log(`✅ 数据保存完成 - ${savedFiles.length} 个文件 (${this.formatFileSize(this.saveStats.totalSize)})`);
      console.log(`📊 保存统计: 执行时间 ${this.saveStats.executionTime}ms, 格式: ${this.saveStats.formats.join(', ')}`);

      return result;

    } catch (error) {
      this.saveStats.errors.push({
        timestamp: Date.now(),
        error: error.message,
        stack: error.stack
      });

      throw new Error(`数据保存失败: ${error.message}`);
    }
  }

  async ensureSaveDirectory(postId) {
    try {
      let basePath = this.config.savePath.replace('${postId}', postId || 'unknown');

      if (!fs.existsSync(basePath)) {
        fs.mkdirSync(basePath, { recursive: true });
        console.log(`📁 创建保存目录: ${basePath}`);
      }

      if (this.config.createSubdirs) {
        const subdirs = ['data', 'reports', 'exports'];
        for (const subdir of subdirs) {
          const dirPath = path.join(basePath, subdir);
          if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
          }
        }
      }

      this.basePath = basePath;

    } catch (error) {
      console.error('创建保存目录失败:', error);
      throw error;
    }
  }

  async saveAsFormat(structuredData, format, metadata) {
    const savedFiles = [];
    const postId = structuredData.post?.postId || 'unknown';

    try {
      switch (format.toLowerCase()) {
        case 'json':
          savedFiles.push(...await this.saveAsJson(structuredData, postId));
          break;
        case 'csv':
          savedFiles.push(...await this.saveAsCsv(structuredData, postId));
          break;
        case 'database':
          if (this.config.databaseConfig) {
            savedFiles.push(...await this.saveToDatabase(structuredData));
          } else {
            console.warn('数据库配置未提供，跳过数据库保存');
          }
          break;
        default:
          throw new Error(`不支持的保存格式: ${format}`);
      }

      return savedFiles;

    } catch (error) {
      console.error(`保存 ${format.toUpperCase()} 格式失败:`, error);
      throw error;
    }
  }

  async saveAsJson(structuredData, postId) {
    const savedFiles = [];

    try {
      // 主数据文件
      const mainData = this.prepareJsonData(structuredData);
      const mainFilename = `${this.config.filenamePrefix}_${postId}_data.json`;
      const mainFilepath = this.generateFilepath(mainFilename, 'data');

      await this.writeFile(mainFilepath, JSON.stringify(mainData, null, this.config.jsonOptions.indent));
      const mainStats = fs.statSync(mainFilepath);
      savedFiles.push({
        filename: mainFilename,
        filepath: mainFilepath,
        format: 'json',
        type: 'main',
        size: mainStats.size,
        records: 1
      });

      // 分离的评论数据文件
      if (structuredData.comments && structuredData.comments.length > 0) {
        const commentsFilename = `${this.config.filenamePrefix}_${postId}_comments.json`;
        const commentsFilepath = this.generateFilepath(commentsFilename, 'data');

        await this.writeFile(commentsFilepath, JSON.stringify(structuredData.comments, null, this.config.jsonOptions.indent));
        const commentsStats = fs.statSync(commentsFilepath);
        savedFiles.push({
          filename: commentsFilename,
          filepath: commentsFilepath,
          format: 'json',
          type: 'comments',
          size: commentsStats.size,
          records: structuredData.comments.length
        });
      }

      // 分离的媒体数据文件
      if (structuredData.media && structuredData.media.length > 0) {
        const mediaFilename = `${this.config.filenamePrefix}_${postId}_media.json`;
        const mediaFilepath = this.generateFilepath(mediaFilename, 'data');

        await this.writeFile(mediaFilepath, JSON.stringify(structuredData.media, null, this.config.jsonOptions.indent));
        const mediaStats = fs.statSync(mediaFilepath);
        savedFiles.push({
          filename: mediaFilename,
          filepath: mediaFilepath,
          format: 'json',
          type: 'media',
          size: mediaStats.size,
          records: structuredData.media.length
        });
      }

      console.log(`💾 JSON格式保存完成: ${savedFiles.length} 个文件`);
      return savedFiles;

    } catch (error) {
      throw new Error(`JSON保存失败: ${error.message}`);
    }
  }

  async saveAsCsv(structuredData, postId) {
    const savedFiles = [];

    try {
      // 帖子信息CSV
      const postCsvData = this.convertPostToCsv(structuredData.post);
      const postFilename = `${this.config.filenamePrefix}_${postId}_post.csv`;
      const postFilepath = this.generateFilepath(postFilename, 'data');

      await this.writeFile(postFilepath, postCsvData);
      const postStats = fs.statSync(postFilepath);
      savedFiles.push({
        filename: postFilename,
        filepath: postFilepath,
        format: 'csv',
        type: 'post',
        size: postStats.size,
        records: 1
      });

      // 评论信息CSV
      if (structuredData.comments && structuredData.comments.length > 0) {
        const commentsCsvData = this.convertCommentsToCsv(structuredData.comments);
        const commentsFilename = `${this.config.filenamePrefix}_${postId}_comments.csv`;
        const commentsFilepath = this.generateFilepath(commentsFilename, 'data');

        await this.writeFile(commentsFilepath, commentsCsvData);
        const commentsStats = fs.statSync(commentsFilepath);
        savedFiles.push({
          filename: commentsFilename,
          filepath: commentsFilepath,
          format: 'csv',
          type: 'comments',
          size: commentsStats.size,
          records: structuredData.comments.length
        });
      }

      // 媒体信息CSV
      if (structuredData.media && structuredData.media.length > 0) {
        const mediaCsvData = this.convertMediaToCsv(structuredData.media);
        const mediaFilename = `${this.config.filenamePrefix}_${postId}_media.csv`;
        const mediaFilepath = this.generateFilepath(mediaFilename, 'data');

        await this.writeFile(mediaFilepath, mediaCsvData);
        const mediaStats = fs.statSync(mediaFilepath);
        savedFiles.push({
          filename: mediaFilename,
          filepath: mediaFilepath,
          format: 'csv',
          type: 'media',
          size: mediaStats.size,
          records: structuredData.media.length
        });
      }

      console.log(`💾 CSV格式保存完成: ${savedFiles.length} 个文件`);
      return savedFiles;

    } catch (error) {
      throw new Error(`CSV保存失败: ${error.message}`);
    }
  }

  async saveToDatabase(structuredData) {
    // 数据库保存功能占位符
    console.log('🗃️ 数据库保存功能尚未实现');
    return [];
  }

  prepareJsonData(structuredData) {
    const data = {
      version: '1.0',
      generatedAt: new Date().toISOString(),
      generator: 'Weibo Post Capture System',
      ...structuredData
    };

    if (this.config.jsonOptions.sortKeys) {
      return this.sortJsonKeys(data);
    }

    return data;
  }

  convertPostToCsv(post) {
    if (!post) return '';

    const headers = [
      'postId', 'url', 'title', 'content', 'authorName', 'authorId',
      'timestamp', 'likes', 'comments', 'reposts', 'tags', 'extractedAt'
    ];

    const values = [
      this.escapeCsvValue(post.postId),
      this.escapeCsvValue(post.url),
      this.escapeCsvValue(post.title),
      this.escapeCsvValue(post.content),
      this.escapeCsvValue(post.author?.name),
      this.escapeCsvValue(post.author?.id),
      this.escapeCsvValue(post.timestamp),
      post.statistics?.likes || 0,
      post.statistics?.comments || 0,
      post.statistics?.reposts || 0,
      this.escapeCsvValue(post.tags?.join(';')),
      this.escapeCsvValue(post.extractedAt)
    ];

    const headersLine = headers.join(this.config.csvOptions.delimiter);
    const valuesLine = values.join(this.config.csvOptions.delimiter);

    return this.config.csvOptions.includeHeaders ?
      `${headersLine}\n${valuesLine}` : valuesLine;
  }

  convertCommentsToCsv(comments) {
    if (!comments || comments.length === 0) return '';

    const headers = [
      'commentId', 'postId', 'parentId', 'content', 'authorName', 'authorId',
      'timestamp', 'likes', 'replies', 'depth'
    ];

    const lines = [];
    if (this.config.csvOptions.includeHeaders) {
      lines.push(headers.join(this.config.csvOptions.delimiter));
    }

    comments.forEach(comment => {
      const values = [
        this.escapeCsvValue(comment.id),
        this.escapeCsvValue(comment.parentId),
        this.escapeCsvValue(comment.parentId),
        this.escapeCsvValue(comment.content),
        this.escapeCsvValue(comment.author?.name),
        this.escapeCsvValue(comment.author?.id),
        this.escapeCsvValue(comment.timestamp),
        comment.statistics?.likes || 0,
        comment.statistics?.replies || 0,
        comment.depth || 0
      ];

      lines.push(values.join(this.config.csvOptions.delimiter));
    });

    return lines.join('\n');
  }

  convertMediaToCsv(media) {
    if (!media || media.length === 0) return '';

    const headers = [
      'mediaId', 'postId', 'type', 'url', 'localPath', 'filename',
      'size', 'format', 'width', 'height', 'downloadedAt'
    ];

    const lines = [];
    if (this.config.csvOptions.includeHeaders) {
      lines.push(headers.join(this.config.csvOptions.delimiter));
    }

    media.forEach(item => {
      const values = [
        this.escapeCsvValue(item.id),
        this.escapeCsvValue(item.postId),
        this.escapeCsvValue(item.type),
        this.escapeCsvValue(item.url),
        this.escapeCsvValue(item.localPath),
        this.escapeCsvValue(item.filename),
        item.size || 0,
        this.escapeCsvValue(item.format),
        item.width || 0,
        item.height || 0,
        this.escapeCsvValue(item.downloadedAt)
      ];

      lines.push(values.join(this.config.csvOptions.delimiter));
    });

    return lines.join('\n');
  }

  escapeCsvValue(value) {
    if (value === null || value === undefined) {
      return '';
    }

    const stringValue = String(value);
    if (stringValue.includes(this.config.csvOptions.delimiter) || stringValue.includes('"') || stringValue.includes('\n')) {
      return `"${stringValue.replace(/"/g, '""')}"`;
    }

    return stringValue;
  }

  generateFilepath(filename, subdir = null) {
    if (subdir && this.config.createSubdirs) {
      return path.join(this.basePath, subdir, filename);
    } else {
      return path.join(this.basePath, filename);
    }
  }

  async writeFile(filepath, content) {
    try {
      if (!this.config.overwrite && fs.existsSync(filepath)) {
        const timestamp = Date.now();
        const ext = path.extname(filepath);
        const base = path.basename(filepath, ext);
        const dir = path.dirname(filepath);
        filepath = path.join(dir, `${base}_${timestamp}${ext}`);
      }

      fs.writeFileSync(filepath, content, { encoding: 'utf8' });
      console.log(`📄 文件已保存: ${path.basename(filepath)}`);

    } catch (error) {
      throw new Error(`写入文件失败: ${error.message}`);
    }
  }

  sortJsonKeys(obj) {
    if (Array.isArray(obj)) {
      return obj.map(item => this.sortJsonKeys(item));
    } else if (obj !== null && typeof obj === 'object') {
      const sorted = {};
      Object.keys(obj).sort().forEach(key => {
        sorted[key] = this.sortJsonKeys(obj[key]);
      });
      return sorted;
    }
    return obj;
  }

  async generateSaveReport(structuredData, savedFiles) {
    try {
      const report = {
        timestamp: new Date().toISOString(),
        postId: structuredData.post?.postId,
        summary: {
          totalFiles: savedFiles.length,
          totalSize: savedFiles.reduce((sum, file) => sum + (file.size || 0), 0),
          formats: [...new Set(savedFiles.map(file => file.format))],
          records: savedFiles.reduce((sum, file) => sum + (file.records || 0), 0)
        },
        files: savedFiles,
        data: {
          post: !!structuredData.post,
          comments: structuredData.comments?.length || 0,
          media: structuredData.media?.length || 0
        }
      };

      const reportFilename = `capture_report_${structuredData.post?.postId || 'unknown'}_${Date.now()}.json`;
      const reportPath = this.generateFilepath(reportFilename, 'reports');

      await this.writeFile(reportPath, JSON.stringify(report, null, 2));
      console.log(`📊 保存报告已生成: ${reportFilename}`);

    } catch (error) {
      console.warn('生成保存报告失败:', error.message);
    }
  }

  generateExportPaths(savedFiles) {
    const paths = {
      base: this.basePath,
      data: [],
      reports: [],
      exports: []
    };

    savedFiles.forEach(file => {
      const relativePath = path.relative(this.basePath, file.filepath);
      if (file.type === 'main' || file.format === 'json') {
        paths.data.push(relativePath);
      } else if (file.type === 'report') {
        paths.reports.push(relativePath);
      } else {
        paths.exports.push(relativePath);
      }
    });

    return paths;
  }

  formatFileSize(bytes) {
    if (!bytes) return '0 B';

    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  async postprocess(output) {
    // 保存保存结果到临时文件用于调试
    if (process.env.NODE_ENV === 'development') {
      const debugPath = path.join(process.cwd(), 'debug', 'data-saving.json');
      const debugDir = path.dirname(debugPath);

      if (!fs.existsSync(debugDir)) {
        fs.mkdirSync(debugDir, { recursive: true });
      }

      fs.writeFileSync(debugPath, JSON.stringify({
        timestamp: new Date().toISOString(),
        output,
        stats: this.saveStats
      }, null, 2));

      console.log(`📝 调试信息已保存到: ${debugPath}`);
    }

    return output;
  }

  async handleError(error) {
    console.error('结构化数据保存节点错误:', error);

    this.saveStats.errors.push({
      timestamp: Date.now(),
      error: error.message,
      stack: error.stack
    });

    // 返回部分结果，而不是完全失败
    return {
      success: false,
      error: error.message,
      savedFiles: [],
      exportPaths: { base: '', data: [], reports: [], exports: [] },
      saveStats: { ...this.saveStats }
    };
  }
}

module.exports = StructuredDataSaverNode;