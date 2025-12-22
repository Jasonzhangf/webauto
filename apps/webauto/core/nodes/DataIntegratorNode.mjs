/**
 * 数据整合节点
 * 整合帖子分析、评论提取和媒体捕获的数据，形成结构化输出
 */

import { BaseNode } from './base-node';
import fs from 'fs';
import path from 'path';

class DataIntegratorNode extends BaseNode {
  constructor(config = {}) {
    super('DATA_INTEGRATOR', config);

    this.defaultConfig = {
      generateRelations: true,
      validateData: true,
      enrichMetadata: true,
      deduplicateMedia: true,
      generateStats: true,
      generateSummary: true,
      includeRawData: false,
      timestampFormat: 'iso',
      dataVersion: '1.0',
      ...config
    };

    this.config = { ...this.defaultConfig, ...config };
    this.integrationStats = {
      startTime: null,
      endTime: null,
      totalProcessed: 0,
      relationsGenerated: 0,
      validationErrors: [],
      enrichmentsApplied: 0,
      duplicatesRemoved: 0
    };
  }

  async validateInput(input) {
    if (!input.postData) {
      throw new Error('Missing required input: postData');
    }

    if (!input.comments && !input.mediaFiles) {
      console.log('没有评论或媒体数据，仅整合帖子数据');
      return true; // 允许仅处理帖子数据
    }

    return true;
  }

  async preprocess(input) {
    this.integrationStats.startTime = Date.now();

    // 深拷贝输入数据以避免修改原始数据
    const processedInput = {
      postData: JSON.parse(JSON.stringify(input.postData)),
      comments: input.comments ? JSON.parse(JSON.stringify(input.comments)) : [],
      mediaFiles: input.mediaFiles ? JSON.parse(JSON.stringify(input.mediaFiles)) : [],
      metadata: input.metadata || {},
      ...input
    };

    return processedInput;
  }

  async execute(input) {
    const { postData, comments, mediaFiles, metadata } = input;

    console.log('🔗 开始数据整合...');

    try {
      // 数据验证
      let validatedData = { postData, comments, mediaFiles };
      if (this.config.validateData) {
        validatedData = await this.validateAllData(postData, comments, mediaFiles);
      }

      // 数据增强
      let enrichedData = validatedData;
      if (this.config.enrichMetadata) {
        enrichedData = await this.enrichAllData(validatedData);
      }

      // 媒体文件去重
      let uniqueMediaFiles = enrichedData.mediaFiles;
      if (this.config.deduplicateMedia) {
        uniqueMediaFiles = await this.deduplicateMediaFiles(enrichedData.mediaFiles);
      }

      // 生成关系映射
      let relations = {};
      if (this.config.generateRelations) {
        relations = await this.generateDataRelations(enrichedData.postData, enrichedData.comments, uniqueMediaFiles);
      }

      // 构建结构化数据
      const structuredData = await this.buildStructuredData(
        enrichedData.postData,
        enrichedData.comments,
        uniqueMediaFiles,
        relations,
        metadata
      );

      // 生成统计信息
      let stats = {};
      if (this.config.generateStats) {
        stats = await this.generateIntegrationStats(
          enrichedData.postData,
          enrichedData.comments,
          uniqueMediaFiles
        );
      }

      // 生成摘要
      let summary = {};
      if (this.config.generateSummary) {
        summary = await this.generateDataSummary(structuredData);
      }

      // 计算整合统计
      this.integrationStats.endTime = Date.now();
      this.integrationStats.executionTime = this.integrationStats.endTime - this.integrationStats.startTime;
      this.integrationStats.totalProcessed = 1 + (comments?.length || 0) + (uniqueMediaFiles?.length || 0);
      this.integrationStats.relationsGenerated = Object.keys(relations).reduce((sum, key) => sum + relations[key].length, 0);
      this.integrationStats.duplicatesRemoved = (mediaFiles?.length || 0) - (uniqueMediaFiles?.length || 0);

      const result = {
        success: true,
        structuredData,
        metadata: {
          ...metadata,
          ...stats,
          summary,
          integrationStats: { ...this.integrationStats }
        },
        exportPaths: this.generateExportPaths(structuredData),
        validationInfo: {
          hasErrors: this.integrationStats.validationErrors.length > 0,
          errorCount: this.integrationStats.validationErrors.length,
          errors: this.integrationStats.validationErrors
        }
      };

      console.log(`✅ 数据整合完成 - 处理了 ${this.integrationStats.totalProcessed} 项数据`);
      console.log(`📊 整合统计: 执行时间 ${this.integrationStats.executionTime}ms, 生成 ${this.integrationStats.relationsGenerated} 个关系映射`);

      if (this.integrationStats.duplicatesRemoved > 0) {
        console.log(`🗑️ 移除了 ${this.integrationStats.duplicatesRemoved} 个重复的媒体文件`);
      }

      return result;

    } catch (error) {
      this.integrationStats.validationErrors.push({
        timestamp: Date.now(),
        error: error.message,
        stack: error.stack
      });

      throw new Error(`数据整合失败: ${error.message}`);
    }
  }

  async validateAllData(postData, comments, mediaFiles) {
    console.log('🔍 开始数据验证...');

    const validatedData = { postData, comments, mediaFiles };

    // 验证帖子数据
    const postValidation = this.validatePostData(postData);
    if (!postValidation.valid) {
      this.integrationStats.validationErrors.push({
        timestamp: Date.now(),
        type: 'post_validation',
        errors: postValidation.errors
      });
    }

    // 验证评论数据
    if (comments && comments.length > 0) {
      const commentValidation = this.validateCommentsData(comments);
      if (!commentValidation.valid) {
        this.integrationStats.validationErrors.push({
          timestamp: Date.now(),
          type: 'comment_validation',
          errors: commentValidation.errors
        });
      }
    }

    // 验证媒体文件数据
    if (mediaFiles && mediaFiles.length > 0) {
      const mediaValidation = this.validateMediaFilesData(mediaFiles);
      if (!mediaValidation.valid) {
        this.integrationStats.validationErrors.push({
          timestamp: Date.now(),
          type: 'media_validation',
          errors: mediaValidation.errors
        });
      }
    }

    return validatedData;
  }

  validatePostData(postData) {
    const errors = [];

    if (!postData.postId) {
      errors.push('帖子ID缺失');
    }

    if (!postData.url) {
      errors.push('帖子URL缺失');
    }

    if (!postData.content && !postData.title) {
      errors.push('帖子内容和标题都缺失');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  validateCommentsData(comments) {
    const errors = [];

    if (!Array.isArray(comments)) {
      errors.push('评论数据不是数组');
      return { valid: false, errors };
    }

    comments.forEach((comment, index) => {
      if (!comment.id) {
        errors.push(`评论 ${index} 缺少ID`);
      }

      if (!comment.content) {
        errors.push(`评论 ${index} 缺少内容`);
      }

      if (!comment.author || !comment.author.name) {
        errors.push(`评论 ${index} 缺少作者信息`);
      }
    });

    return {
      valid: errors.length === 0,
      errors
    };
  }

  validateMediaFilesData(mediaFiles) {
    const errors = [];

    if (!Array.isArray(mediaFiles)) {
      errors.push('媒体文件数据不是数组');
      return { valid: false, errors };
    }

    mediaFiles.forEach((media, index) => {
      if (!media.id) {
        errors.push(`媒体文件 ${index} 缺少ID`);
      }

      if (!media.url) {
        errors.push(`媒体文件 ${index} 缺少URL`);
      }

      if (!media.type) {
        errors.push(`媒体文件 ${index} 缺少类型`);
      }
    });

    return {
      valid: errors.length === 0,
      errors
    };
  }

  async enrichAllData(data) {
    console.log('✨ 开始数据增强...');

    const enriched = { ...data };

    // 增强帖子数据
    enriched.postData = this.enrichPostData(data.postData);

    // 增强评论数据
    if (data.comments && data.comments.length > 0) {
      enriched.comments = this.enrichCommentsData(data.comments);
    }

    // 增强媒体文件数据
    if (data.mediaFiles && data.mediaFiles.length > 0) {
      enriched.mediaFiles = this.enrichMediaFilesData(data.mediaFiles);
    }

    this.integrationStats.enrichmentsApplied =
      this.countEnrichments(enriched.postData) +
      (enriched.comments?.reduce((sum, comment) => sum + this.countEnrichments(comment), 0) || 0) +
      (enriched.mediaFiles?.reduce((sum, media) => sum + this.countEnrichments(media), 0) || 0);

    return enriched;
  }

  enrichPostData(postData) {
    const enriched = { ...postData };

    // 添加提取时间
    if (!enriched.extractedAt) {
      enriched.extractedAt = new Date().toISOString();
    }

    // 添加内容统计
    if (enriched.content) {
      enriched.contentStats = {
        length: enriched.content.length,
        wordCount: enriched.content.split(/\s+/).length,
        charCount: enriched.content.length
      };
    }

    // 添加标准化URL
    if (enriched.url && !enriched.normalizedUrl) {
      enriched.normalizedUrl = this.normalizeUrl(enriched.url);
    }

    return enriched;
  }

  enrichCommentsData(comments) {
    return comments.map(comment => {
      const enriched = { ...comment };

      // 添加内容统计
      if (comment.content) {
        enriched.contentStats = {
          length: comment.content.length,
          wordCount: comment.content.split(/\s+/).length
        };
      }

      // 标准化时间戳
      if (comment.timestamp) {
        enriched.normalizedTimestamp = this.normalizeTimestamp(comment.timestamp);
      }

      return enriched;
    });
  }

  enrichMediaFilesData(mediaFiles) {
    return mediaFiles.map(media => {
      const enriched = { ...media };

      // 添加文件扩展名
      if (media.url && !media.extension) {
        enriched.extension = this.extractFileExtension(media.url);
      }

      // 标准化URL
      if (media.url && !enriched.normalizedUrl) {
        enriched.normalizedUrl = this.normalizeUrl(media.url);
      }

      // 添加下载时间
      if (!enriched.processedAt) {
        enriched.processedAt = new Date().toISOString();
      }

      return enriched;
    });
  }

  countEnrichments(obj) {
    let count = 0;
    const enrichmentFields = ['contentStats', 'normalizedTimestamp', 'normalizedUrl', 'extension', 'processedAt'];

    enrichmentFields.forEach(field => {
      if (obj[field] !== undefined) {
        count++;
      }
    });

    return count;
  }

  async deduplicateMediaFiles(mediaFiles) {
    if (!mediaFiles || mediaFiles.length === 0) {
      return [];
    }

    console.log('🔄 开始媒体文件去重...');

    const uniqueFiles = [];
    const seenUrls = new Set();
    const seenIds = new Set();

    for (const media of mediaFiles) {
      // 基于URL去重
      if (media.url && seenUrls.has(media.url)) {
        continue;
      }

      // 基于ID去重
      if (media.id && seenIds.has(media.id)) {
        continue;
      }

      uniqueFiles.push(media);
      seenUrls.add(media.url);
      seenIds.add(media.id);
    }

    const removedCount = mediaFiles.length - uniqueFiles.length;
    if (removedCount > 0) {
      console.log(`🗑️ 移除了 ${removedCount} 个重复的媒体文件`);
    }

    return uniqueFiles;
  }

  async generateDataRelations(postData, comments, mediaFiles) {
    console.log('🔗 生成数据关系映射...');

    const relations = {
      postComments: [],
      postMedia: [],
      commentMedia: []
    };

    // 帖子-评论关系
    if (comments && comments.length > 0) {
      relations.postComments = comments.map(comment => ({
        postId: postData.postId,
        commentId: comment.id,
        relationType: 'contains'
      }));
    }

    // 帖子-媒体关系
    if (mediaFiles && mediaFiles.length > 0) {
      relations.postMedia = mediaFiles.map(media => ({
        postId: postData.postId,
        mediaId: media.id,
        relationType: 'contains'
      }));
    }

    // 评论-媒体关系（如果评论包含媒体）
    if (comments && mediaFiles) {
      relations.commentMedia = this.extractCommentMediaRelations(comments, mediaFiles);
    }

    return relations;
  }

  extractCommentMediaRelations(comments, mediaFiles) {
    const relations = [];

    // 这里应该根据实际数据结构提取评论与媒体的关系
    // 目前返回空数组作为占位符
    return relations;
  }

  async buildStructuredData(postData, comments, mediaFiles, relations, metadata) {
    console.log('🏗️ 构建结构化数据...');

    const structuredData = {
      version: this.config.dataVersion,
      generatedAt: new Date().toISOString(),
      generator: 'Weibo Post Capture System',
      metadata: {
        ...metadata,
        dataVersion: this.config.dataVersion,
        extractionConfig: this.config
      },
      post: postData,
      comments: comments || [],
      media: mediaFiles || [],
      relations,
      summary: {
        postCount: 1,
        commentCount: comments?.length || 0,
        mediaCount: mediaFiles?.length || 0,
        relationCount: Object.keys(relations).reduce((sum, key) => sum + relations[key].length, 0)
      }
    };

    return structuredData;
  }

  async generateIntegrationStats(postData, comments, mediaFiles) {
    const stats = {
      extractionTime: new Date().toISOString(),
      dataSource: {
        post: !!postData,
        comments: !!(comments && comments.length > 0),
        media: !!(mediaFiles && mediaFiles.length > 0)
      },
      dataVolume: {
        postContentSize: postData?.content?.length || 0,
        totalComments: comments?.length || 0,
        totalMediaFiles: mediaFiles?.length || 0,
        totalMediaSize: mediaFiles?.reduce((sum, media) => sum + (media.size || 0), 0) || 0
      },
      quality: {
        hasValidationErrors: this.integrationStats.validationErrors.length > 0,
        validationErrorCount: this.integrationStats.validationErrors.length,
        dataCompleteness: this.calculateDataCompleteness(postData, comments, mediaFiles)
      }
    };

    return stats;
  }

  calculateDataCompleteness(postData, comments, mediaFiles) {
    let completeness = 0;
    let maxScore = 0;

    // 帖子数据完整性 (40%)
    maxScore += 40;
    if (postData.postId) completeness += 10;
    if (postData.content) completeness += 15;
    if (postData.author) completeness += 10;
    if (postData.timestamp) completeness += 5;

    // 评论数据完整性 (30%)
    maxScore += 30;
    if (comments && comments.length > 0) {
      completeness += 10;
      const hasValidComments = comments.some(comment => comment.content && comment.author);
      if (hasValidComments) completeness += 20;
    }

    // 媒体数据完整性 (30%)
    maxScore += 30;
    if (mediaFiles && mediaFiles.length > 0) {
      completeness += 15;
      const hasValidMedia = mediaFiles.some(media => media.url && media.type);
      if (hasValidMedia) completeness += 15;
    }

    return Math.round((completeness / maxScore) * 100);
  }

  async generateDataSummary(structuredData) {
    const summary = {
      title: '微博帖子捕获摘要',
      postId: structuredData.post.postId,
      extractionTime: structuredData.generatedAt,
      overview: {
        totalComments: structuredData.comments.length,
        totalMedia: structuredData.media.length,
        hasImages: structuredData.media.some(m => m.type === 'image'),
        hasVideos: structuredData.media.some(m => m.type === 'video')
      },
      contentHighlights: {
        postContentLength: structuredData.post.content?.length || 0,
        topComments: this.getTopComments(structuredData.comments, 3),
        mediaBreakdown: this.getMediaBreakdown(structuredData.media)
      }
    };

    return summary;
  }

  getTopComments(comments, limit = 3) {
    if (!comments || comments.length === 0) {
      return [];
    }

    return comments
      .sort((a, b) => (b.statistics?.likes || 0) - (a.statistics?.likes || 0))
      .slice(0, limit)
      .map(comment => ({
        id: comment.id,
        author: comment.author?.name,
        content: comment.content?.substring(0, 100) + (comment.content?.length > 100 ? '...' : ''),
        likes: comment.statistics?.likes || 0
      }));
  }

  getMediaBreakdown(media) {
    if (!media || media.length === 0) {
      return { images: 0, videos: 0, totalSize: 0 };
    }

    const breakdown = {
      images: media.filter(m => m.type === 'image').length,
      videos: media.filter(m => m.type === 'video').length,
      totalSize: media.reduce((sum, m) => sum + (m.size || 0), 0)
    };

    return breakdown;
  }

  normalizeUrl(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.toString();
    } catch {
      return url;
    }
  }

  normalizeTimestamp(timestamp) {
    try {
      // 尝试解析各种时间格式
      const date = new Date(timestamp);
      if (!isNaN(date.getTime())) {
        return date.toISOString();
      }
      return timestamp;
    } catch {
      return timestamp;
    }
  }

  extractFileExtension(url) {
    const match = url.match(/\.([a-zA-Z0-9]+)(?:\?|#|$)/);
    return match ? match[1].toLowerCase() : 'unknown';
  }

  generateExportPaths(structuredData) {
    const postId = structuredData.post.postId || 'unknown';
    const timestamp = new Date().toISOString().split('T')[0];

    return {
      base: `./output/${postId}`,
      json: `./output/${postId}/${postId}_data.json`,
      csv: `./output/${postId}/${postId}_data.csv`,
      report: `./output/${postId}/capture_report_${timestamp}.json`
    };
  }

  async postprocess(output) {
    // 保存整合结果到临时文件用于调试
    if (process.env.NODE_ENV === 'development') {
      const debugPath = path.join(process.cwd(), 'debug', 'data-integration.json');
      const debugDir = path.dirname(debugPath);

      if (!fs.existsSync(debugDir)) {
        fs.mkdirSync(debugDir, { recursive: true });
      }

      fs.writeFileSync(debugPath, JSON.stringify({
        timestamp: new Date().toISOString(),
        output,
        stats: this.integrationStats
      }, null, 2));

      console.log(`📝 调试信息已保存到: ${debugPath}`);
    }

    return output;
  }

  async handleError(error) {
    console.error('数据整合节点错误:', error);

    this.integrationStats.validationErrors.push({
      timestamp: Date.now(),
      error: error.message,
      stack: error.stack
    });

    // 返回部分结果，而不是完全失败
    return {
      success: false,
      error: error.message,
      structuredData: null,
      metadata: {},
      exportPaths: {},
      validationInfo: {
        hasErrors: true,
        errorCount: 1,
        errors: [{ timestamp: Date.now(), error: error.message }]
      }
    };
  }
}

export default DataIntegratorNode;