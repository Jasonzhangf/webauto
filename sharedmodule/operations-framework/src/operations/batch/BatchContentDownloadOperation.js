/**
 * 批量内容下载操作子
 * 负责并发批量下载微博帖子内容
 */

import { BaseOperation } from '../core/BaseOperation.js';

export class BatchContentDownloadOperation extends BaseOperation {
  constructor(config = {}) {
    super('batch-content-download', config);
    this.category = 'batch-download';
    this.supportedContainers = ['weibo-batch-download'];
    this.capabilities = ['batch-download', 'content-extraction', 'parallel-processing'];
  }

  async execute(context = {}) {
    this.logger.info('开始批量内容下载...');

    try {
      const batchGroups = this.config.batchGroups || [];
      const maxConcurrent = this.config.maxConcurrent || 3;

      this.logger.info(`处理 ${batchGroups.length} 个批次，最大并发: ${maxConcurrent}`);

      const results = {
        downloadResults: [],
        batchStats: {
          totalPosts: 0,
          successfulPosts: 0,
          failedPosts: 0,
          skippedPosts: 0,
          totalBatches: batchGroups.length,
          completedBatches: 0
        },
        errors: []
      };

      // 并发处理批次
      const activeBatches = new Set();
      const batchPromises = [];

      for (let i = 0; i < batchGroups.length; i++) {
        const batch = batchGroups[i];

        // 控制并发数
        while (activeBatches.size >= maxConcurrent) {
          await Promise.race(activeBatches);
        }

        const batchPromise = this.processBatch(batch, i + 1, results);
        batchPromises.push(batchPromise);
        activeBatches.add(batchPromise);

        batchPromise.finally(() => {
          activeBatches.delete(batchPromise);
        });
      }

      // 等待所有批次完成
      await Promise.all(batchPromises);

      // 计算最终统计
      results.batchStats = this.calculateFinalStats(results);

      this.logger.info('批量内容下载完成', results.batchStats);
      return results;

    } catch (error) {
      this.logger.error('批量内容下载失败:', error);
      throw error;
    }
  }

  async processBatch(batch, batchNumber, results) {
    this.logger.info(`开始处理批次 ${batchNumber} (${batch.urls.length} 个帖子)`);

    const batchResult = {
      batchId: batch.groupId,
      batchNumber,
      startTime: Date.now(),
      urls: batch.urls,
      results: [],
      stats: {
        totalUrls: batch.urls.length,
        successful: 0,
        failed: 0,
        skipped: 0
      }
    };

    try {
      // 处理批次中的每个URL
      const urlPromises = batch.urls.map((urlInfo, index) =>
        this.downloadSingleUrl(urlInfo, index + 1, batchResult)
      );

      const urlResults = await Promise.allSettled(urlPromises);

      // 处理结果
      urlResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          batchResult.results.push(result.value);
          if (result.value.success) {
            batchResult.stats.successful++;
            results.batchStats.successfulPosts++;
          } else if (result.value.skipped) {
            batchResult.stats.skipped++;
            results.batchStats.skippedPosts++;
          } else {
            batchResult.stats.failed++;
            results.batchStats.failedPosts++;
          }
        } else {
          batchResult.stats.failed++;
          results.batchStats.failedPosts++;
          results.errors.push({
            type: 'batch-url-error',
            batchId: batch.groupId,
            url: batch.urls[index].originalUrl,
            error: result.reason.message
          });
        }
      });

      batchResult.endTime = Date.now();
      batchResult.duration = batchResult.endTime - batchResult.startTime;

      results.downloadResults.push(batchResult);
      results.batchStats.completedBatches++;

      this.logger.info(
        `批次 ${batchNumber} 完成: ${batchResult.stats.successful} 成功, ` +
        `${batchResult.stats.failed} 失败, ${batchResult.stats.skipped} 跳过 ` +
        `(${batchResult.duration}ms)`
      );

      return batchResult;

    } catch (error) {
      this.logger.error(`批次 ${batchNumber} 处理失败:`, error);
      results.batchStats.failedPosts += batch.urls.length;
      results.batchStats.completedBatches++;

      results.errors.push({
        type: 'batch-error',
        batchId: batch.groupId,
        error: error.message
      });

      throw error;
    }
  }

  async downloadSingleUrl(urlInfo, index, batchResult) {
    const { originalUrl, postId, normalizedUrl } = urlInfo;

    this.logger.debug(`下载帖子 ${index}/${batchResult.urls.length}: ${postId}`);

    try {
      // 这里应该集成现有的内容提取操作子
      const content = await this.extractPostContent(originalUrl, postId);

      return {
        success: true,
        postId,
        originalUrl,
        normalizedUrl,
        content,
        extractedAt: Date.now(),
        index,
        stats: {
          images: content.images?.length || 0,
          videos: content.videos?.length || 0,
          contentLength: content.content?.length || 0
        }
      };

    } catch (error) {
      this.logger.warn(`帖子下载失败 ${postId}:`, error.message);

      return {
        success: false,
        postId,
        originalUrl,
        normalizedUrl,
        error: error.message,
        index,
        failedAt: Date.now()
      };
    }
  }

  async extractPostContent(url, postId) {
    // TODO: 集成现有的内容提取操作子
    // 这里是模拟实现，实际应该调用：
    // - ContentExtractionOperation
    // - PostDataExtractionOperation
    // - MediaDetectionOperation

    this.logger.debug(`提取帖子内容: ${postId}`);

    // 模拟网络延迟
    await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));

    // 模拟内容提取结果
    return {
      id: postId,
      url,
      author: `用户_${postId.substring(0, 6)}`,
      content: `这是帖子 ${postId} 的示例内容。包含一些文字描述和相关媒体内容。`,
      postTime: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
      images: this.generateMockImages(postId),
      videos: this.generateMockVideos(postId),
      stats: {
        likes: Math.floor(Math.random() * 10000),
        comments: Math.floor(Math.random() * 1000),
        reposts: Math.floor(Math.random() * 500)
      }
    };
  }

  generateMockImages(postId) {
    const imageCount = Math.floor(Math.random() * 9); // 0-8张图片
    const images = [];

    for (let i = 0; i < imageCount; i++) {
      const servers = ['wx1', 'wx2', 'wx3', 'wx4', 'tvax1', 'tvax2', 'tvax3', 'tvax4'];
      const server = servers[Math.floor(Math.random() * servers.length)];
      const size = ['large', 'mw690', 'mw1024', 'orj360'][Math.floor(Math.random() * 4)];

      images.push(`https://${server}.sinaimg.cn/${size}/${postId}_${i + 1}.jpg`);
    }

    return images;
  }

  generateMockVideos(postId) {
    // 大部分帖子没有视频
    if (Math.random() > 0.8) {
      return [];
    }

    const videoCount = Math.random() > 0.9 ? 2 : 1; // 10%概率2个视频
    const videos = [];

    for (let i = 0; i < videoCount; i++) {
      videos.push({
        url: `https://f.video.weibocdn.com/${postId}_${i + 1}.mp4`,
        thumbnail: `https://wx1.sinaimg.cn/large/${postId}_${i + 1}.jpg`,
        duration: Math.floor(Math.random() * 300) + 10, // 10-310秒
        size: Math.floor(Math.random() * 100) + 10 // MB
      });
    }

    return videos;
  }

  calculateFinalStats(results) {
    const totalPosts = results.downloadResults.reduce(
      (sum, batch) => sum + batch.stats.totalUrls, 0
    );

    return {
      totalPosts,
      successfulPosts: results.batchStats.successfulPosts,
      failedPosts: results.batchStats.failedPosts,
      skippedPosts: results.batchStats.skippedPosts,
      successRate: totalPosts > 0
        ? ((results.batchStats.successfulPosts / totalPosts) * 100).toFixed(1)
        : '0',
      totalBatches: results.batchStats.totalBatches,
      completedBatches: results.batchStats.completedBatches,
      errorCount: results.errors.length,
      totalImages: results.downloadResults.reduce(
        (sum, batch) => sum + batch.results.reduce(
          (batchSum, result) => batchSum + (result.stats?.images || 0), 0
        ), 0
      ),
      totalVideos: results.downloadResults.reduce(
        (sum, batch) => sum + batch.results.reduce(
          (batchSum, result) => batchSum + (result.stats?.videos || 0), 0
        ), 0
      )
    };
  }

  async validate() {
    const errors = [];

    if (!this.config.batchGroups || !Array.isArray(this.config.batchGroups)) {
      errors.push('批次组必须是非空数组');
    }

    if (this.config.batchGroups.length === 0) {
      errors.push('批次组不能为空');
    }

    if (this.config.maxConcurrent && this.config.maxConcurrent < 1) {
      errors.push('最大并发数必须大于0');
    }

    // 验证每个批次组
    this.config.batchGroups.forEach((batch, index) => {
      if (!batch.groupId) {
        errors.push(`批次组 ${index + 1} 缺少groupId`);
      }
      if (!batch.urls || !Array.isArray(batch.urls)) {
        errors.push(`批次组 ${index + 1} 缺少urls数组`);
      }
      if (batch.urls && batch.urls.length === 0) {
        errors.push(`批次组 ${index + 1} 的urls数组为空`);
      }
    });

    return errors;
  }

  async cleanup() {
    this.logger.info('清理批量内容下载资源...');
    // 清理临时文件、内存等
  }
}

export default BatchContentDownloadOperation;