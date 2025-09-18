/**
 * 批量URL处理操作子
 * 负责URL去重检查、分组和预处理
 */

import { BaseOperation } from '../core/BaseOperation.js';

export class BatchUrlProcessingOperation extends BaseOperation {
  constructor(config = {}) {
    super('batch-url-processing', config);
    this.category = 'batch-processing';
    this.supportedContainers = ['weibo-batch-download'];
    this.capabilities = ['url-deduplication', 'url-grouping', 'batch-processing'];
  }

  async execute(context = {}) {
    this.logger.info('开始批量URL处理...');

    try {
      const urls = this.config.urls || [];
      const downloadHistory = this.config.downloadHistory || new Map();

      this.logger.info(`输入URL数量: ${urls.length}`);

      // 1. 提取帖子ID并去重
      const processedUrls = this.extractPostIds(urls);

      // 2. 检查重复
      const { uniqueUrls, duplicateUrls } = this.checkDuplicates(
        processedUrls,
        downloadHistory,
        this.config.deduplicationFields
      );

      // 3. 分组处理
      const batchGroups = this.createBatchGroups(
        uniqueUrls,
        this.config.batchSize || 5
      );

      const result = {
        processedUrls,
        uniqueUrls,
        duplicateUrls,
        batchGroups,
        stats: {
          totalUrls: urls.length,
          uniqueCount: uniqueUrls.length,
          duplicateCount: duplicateUrls.length,
          batchCount: batchGroups.length
        }
      };

      this.logger.info('批量URL处理完成', result.stats);
      return result;

    } catch (error) {
      this.logger.error('批量URL处理失败:', error);
      throw error;
    }
  }

  extractPostIds(urls) {
    return urls.map(url => {
      const postId = this.extractPostId(url);
      return {
        originalUrl: url,
        postId,
        normalizedUrl: this.normalizeUrl(url),
        timestamp: Date.now()
      };
    });
  }

  extractPostId(url) {
    // 微博帖子ID提取逻辑
    const patterns = [
      /weibo\.com\/[^\/]+\/([A-Za-z0-9]+)$/,
      /weibo\.com\/status\/(\d+)$/,
      /weibo\.com\/(\d+)\/([A-Za-z0-9]+)$/,
      /\/([A-Za-z0-9]+)$/
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return match[match.length - 1]; // 返回最后一个匹配组
      }
    }

    return url; // 如果无法提取，返回完整URL
  }

  normalizeUrl(url) {
    // 标准化URL，移除查询参数和片段
    try {
      const urlObj = new URL(url);
      urlObj.search = '';
      urlObj.hash = '';
      return urlObj.toString();
    } catch {
      return url;
    }
  }

  checkDuplicates(processedUrls, downloadHistory, deduplicationFields) {
    const uniqueUrls = [];
    const duplicateUrls = [];

    for (const urlInfo of processedUrls) {
      const isDuplicate = this.isDuplicate(urlInfo, downloadHistory, deduplicationFields);

      if (isDuplicate) {
        duplicateUrls.push({
          ...urlInfo,
          duplicateReason: this.getDuplicateReason(urlInfo, downloadHistory, deduplicationFields)
        });
      } else {
        uniqueUrls.push(urlInfo);
      }
    }

    return { uniqueUrls, duplicateUrls };
  }

  isDuplicate(urlInfo, downloadHistory, deduplicationFields) {
    if (!this.config.deduplicationEnabled) return false;

    // 检查历史记录中是否存在
    if (downloadHistory.has(urlInfo.postId)) {
      return true;
    }

    // 基于字段去重检查
    for (const field of deduplicationFields) {
      // 这里需要实现基于具体字段的去重逻辑
      // 由于我们没有实际内容，暂时基于帖子ID去重
      if (field === 'id' && downloadHistory.has(urlInfo.postId)) {
        return true;
      }
    }

    return false;
  }

  getDuplicateReason(urlInfo, downloadHistory, deduplicationFields) {
    if (downloadHistory.has(urlInfo.postId)) {
      return '帖子ID已存在于历史记录中';
    }

    for (const field of deduplicationFields) {
      if (field === 'id' && downloadHistory.has(urlInfo.postId)) {
        return `字段 '${field}' 匹配到历史记录`;
      }
    }

    return '未知重复原因';
  }

  createBatchGroups(uniqueUrls, batchSize) {
    const groups = [];

    for (let i = 0; i < uniqueUrls.length; i += batchSize) {
      const group = uniqueUrls.slice(i, i + batchSize);
      groups.push({
        groupId: `batch_${Math.floor(i / batchSize) + 1}`,
        urls: group,
        size: group.length,
        startIndex: i,
        endIndex: Math.min(i + batchSize, uniqueUrls.length)
      });
    }

    return groups;
  }

  async validate() {
    const errors = [];

    if (!this.config.urls || !Array.isArray(this.config.urls)) {
      errors.push('URL列表必须是非空数组');
    }

    if (this.config.urls.length === 0) {
      errors.push('URL列表不能为空');
    }

    if (this.config.maxConcurrent && this.config.maxConcurrent < 1) {
      errors.push('最大并发数必须大于0');
    }

    if (this.config.batchSize && this.config.batchSize < 1) {
      errors.push('批处理大小必须大于0');
    }

    return errors;
  }

  async cleanup() {
    this.logger.info('清理批量URL处理资源...');
  }
}

export default BatchUrlProcessingOperation;