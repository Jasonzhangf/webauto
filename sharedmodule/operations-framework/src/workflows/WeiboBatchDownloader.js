/**
 * 微博完整批量下载器 - 基于操作子架构
 * 实现完整的目录结构、去重、历史管理、评论爬取功能
 */

import { EventEmitter } from 'events';
import { mkdir, writeFile, readFile, exists, access } from 'fs/promises';
import { join, dirname, basename, extname } from 'path';
import { homedir } from 'os';

export class WeiboBatchDownloader extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      cookieFile: config.cookieFile || './cookies/weibo.com.json',
      outputDir: config.outputDir || join(homedir(), '.webauto/batch-download'),
      directoryStructure: config.directoryStructure || {
        text: 'text-content',
        images: 'images',
        videos: 'videos',
        comments: 'comments',
        reports: 'reports',
        metadata: 'metadata'
      },
      deduplication: {
        enabled: true,
        strategy: 'content-based',
        fields: ['id', 'content', 'author'],
        historyFile: 'download-history.json',
        ...config.deduplication
      },
      history: {
        enabled: true,
        maxHistoryDays: 30,
        saveDownloadLog: true,
        incrementalMode: true,
        ...config.history
      },
      comments: {
        enabled: true,
        maxComments: 100,
        maxReplies: 20,
        includeReplies: true,
        downloadNested: true,
        ...config.comments
      },
      images: {
        enabled: true,
        quality: 'original',
        skipExisting: true,
        maxConcurrent: 3,
        timeout: 30000,
        filterRules: {
          minSize: 1024,
          allowedFormats: ['jpg', 'jpeg', 'png', 'webp'],
          blockedPatterns: ['avatar', 'thumb', 'emoji', 'icon'],
          ...config.images?.filterRules
        },
        ...config.images
      },
      batch: {
        maxConcurrent: 2,
        retryAttempts: 3,
        retryDelay: 5000,
        progressInterval: 1000,
        ...config.batch
      },
      output: {
        formats: ['json', 'markdown', 'csv'],
        includeMetadata: true,
        includeStatistics: true,
        createIndex: true,
        generateReport: true,
        ...config.output
      },
      ...config
    };

    this.state = {
      initialized: false,
      browser: null,
      page: null,
      downloadHistory: new Map(),
      sessionStats: {
        startTime: null,
        totalPosts: 0,
        successfulPosts: 0,
        failedPosts: 0,
        totalComments: 0,
        totalImages: 0,
        downloadedImages: 0,
        deduplicatedCount: 0
      }
    };

    this.setupEventListeners();
  }

  setupEventListeners() {
    this.on('download:start', (data) => {
      console.log(`📥 开始下载: ${data.url}`);
    });

    this.on('download:success', (data) => {
      console.log(`✅ 下载成功: ${data.postId} (${data.images}张图片, ${data.comments}条评论)`);
    });

    this.on('download:failed', (data) => {
      console.log(`❌ 下载失败: ${data.url} - ${data.error}`);
    });

    this.on('download:skipped', (data) => {
      console.log(`⏭️  跳过重复: ${data.postId}`);
    });

    this.on('progress:update', (stats) => {
      process.stdout.write(`\r📊 进度: ${stats.completed}/${stats.total} (${stats.percentage}%) | 成功: ${stats.successful} | 失败: ${stats.failed} | 评论: ${stats.comments} | 图片: ${stats.images}`);
    });

    this.on('batch:complete', (result) => {
      console.log('\n🎉 批量下载完成！');
    });
  }

  async initialize() {
    if (this.state.initialized) return;

    console.log('🔧 初始化微博批量下载器...');

    try {
      // 创建输出目录结构
      await this.createDirectoryStructure();

      // 加载下载历史
      await this.loadDownloadHistory();

      // 初始化浏览器
      await this.initializeBrowser();

      this.state.initialized = true;
      this.state.sessionStats.startTime = Date.now();

      console.log('✅ 批量下载器初始化完成');

    } catch (error) {
      console.error('❌ 初始化失败:', error.message);
      throw error;
    }
  }

  async createDirectoryStructure() {
    const baseDir = this.config.outputDir.replace('~', homedir());
    const dirs = Object.values(this.config.directoryStructure);

    for (const dir of dirs) {
      const fullPath = join(baseDir, dir);
      try {
        await mkdir(fullPath, { recursive: true });
        console.log(`📁 创建目录: ${fullPath}`);
      } catch (error) {
        if (error.code !== 'EEXIST') {
          throw error;
        }
      }
    }
  }

  async loadDownloadHistory() {
    if (!this.config.deduplication.enabled) return;

    try {
      const historyFile = join(
        this.config.outputDir.replace('~', homedir()),
        this.config.directoryStructure.metadata,
        this.config.deduplication.historyFile
      );

      if (await exists(historyFile)) {
        const content = await readFile(historyFile, 'utf8');
        const history = JSON.parse(content);

        // 清理过期历史记录
        const cutoffTime = Date.now() - (this.config.history.maxHistoryDays * 24 * 60 * 60 * 1000);
        this.state.downloadHistory = new Map(
          Object.entries(history)
            .filter(([_, record]) => record.timestamp > cutoffTime)
        );

        console.log(`📚 加载下载历史: ${this.state.downloadHistory.size} 条记录`);
      }
    } catch (error) {
      console.log('📝 未找到历史记录，将创建新的');
      this.state.downloadHistory = new Map();
    }
  }

  async initializeBrowser() {
    // 这里应该集成现有的浏览器初始化操作子
    // 简化实现，实际使用时需要替换为真实的浏览器操作子
    console.log('🌐 初始化浏览器环境...');

    // TODO: 集成 BrowserInitializationOperation
    // this.state.browser = await BrowserInitializationOperation.execute();
    // this.state.page = await this.state.browser.newPage();
  }

  async downloadBatch(urls) {
    if (!this.state.initialized) {
      await this.initialize();
    }

    this.state.sessionStats.totalPosts = urls.length;

    console.log(`\n🚀 开始批量下载 ${urls.length} 个帖子...`);

    const results = [];
    const concurrency = this.config.batch.maxConcurrent;

    // 分批处理
    for (let i = 0; i < urls.length; i += concurrency) {
      const batch = urls.slice(i, i + concurrency);
      const batchPromises = batch.map((url, index) =>
        this.downloadSingle(url, i + index + 1)
      );

      const batchResults = await Promise.allSettled(batchPromises);
      results.push(...batchResults);

      // 更新进度
      const completed = Math.min(i + concurrency, urls.length);
      this.emit('progress:update', {
        completed,
        total: urls.length,
        percentage: ((completed / urls.length) * 100).toFixed(1),
        successful: this.state.sessionStats.successfulPosts,
        failed: this.state.sessionStats.failedPosts,
        comments: this.state.sessionStats.totalComments,
        images: this.state.sessionStats.downloadedImages
      });
    }

    const finalResult = this.compileResults(results, urls);
    this.emit('batch:complete', finalResult);

    // 保存最终报告
    await this.saveBatchReport(finalResult);

    return finalResult;
  }

  async downloadSingle(url, index) {
    const postId = this.extractPostId(url);

    // 检查重复
    if (this.isDuplicate(postId)) {
      this.state.sessionStats.deduplicatedCount++;
      this.emit('download:skipped', { postId, url });
      return { success: false, skipped: true, postId, url };
    }

    this.emit('download:start', { url, postId, index });

    try {
      const result = await this.downloadPostWithComments(url, postId);

      // 更新统计
      this.state.sessionStats.successfulPosts++;
      this.state.sessionStats.totalComments += result.comments;
      this.state.sessionStats.totalImages += result.images;
      this.state.sessionStats.downloadedImages += result.downloadedImages;

      // 保存到历史记录
      this.saveToHistory(postId, result);

      this.emit('download:success', {
        postId,
        url,
        images: result.downloadedImages,
        comments: result.comments
      });

      return { success: true, ...result };

    } catch (error) {
      this.state.sessionStats.failedPosts++;

      this.emit('download:failed', {
        postId,
        url,
        error: error.message
      });

      return { success: false, error: error.message, postId, url };
    }
  }

  async downloadPostWithComments(url, postId) {
    // 这里应该集成现有的内容提取操作子
    // 简化实现，展示完整的处理流程

    console.log(`🔍 正在处理帖子: ${postId}`);

    // 1. 提取帖子内容
    const postContent = await this.extractPostContent(url);

    // 2. 提取评论（如果启用）
    let comments = [];
    if (this.config.comments.enabled) {
      comments = await this.extractComments(url, postId);
    }

    // 3. 下载图片（如果启用）
    let downloadedImages = 0;
    if (this.config.images.enabled && postContent.images.length > 0) {
      downloadedImages = await this.downloadImages(postContent.images, postId);
    }

    // 4. 保存结构化数据
    await this.savePostData(postId, postContent, comments);

    return {
      postId,
      url,
      content: postContent,
      comments: comments.length,
      images: postContent.images.length,
      downloadedImages,
      timestamp: Date.now()
    };
  }

  async extractPostContent(url) {
    // TODO: 集成 ContentExtractionOperation
    // 这里是简化实现，实际应该使用操作子进行内容提取

    console.log(`📄 提取帖子内容: ${url}`);

    // 模拟内容提取
    return {
      id: this.extractPostId(url),
      url,
      author: "示例用户",
      content: "这是一个示例帖子内容",
      postTime: new Date().toISOString(),
      images: [
        `https://wx1.sinaimg.cn/large/example1.jpg`,
        `https://wx2.sinaimg.cn/large/example2.jpg`
      ],
      stats: {
        likes: Math.floor(Math.random() * 1000),
        comments: Math.floor(Math.random() * 100),
        reposts: Math.floor(Math.random() * 50)
      }
    };
  }

  async extractComments(url, postId) {
    // TODO: 集成 CommentExtractionOperation
    console.log(`💬 提取评论: ${postId}`);

    // 模拟评论提取
    const comments = [];
    const commentCount = Math.min(
      Math.floor(Math.random() * this.config.comments.maxComments),
      this.config.comments.maxComments
    );

    for (let i = 0; i < commentCount; i++) {
      comments.push({
        id: `comment_${postId}_${i}`,
        author: `评论用户${i}`,
        content: `这是第${i}条评论内容`,
        time: new Date(Date.now() - i * 3600000).toISOString(),
        likes: Math.floor(Math.random() * 50),
        replies: []
      });
    }

    return comments;
  }

  async downloadImages(imageUrls, postId) {
    if (!this.config.images.enabled) return 0;

    console.log(`🖼️ 下载图片: ${imageUrls.length} 张`);

    let downloadedCount = 0;
    const imageDir = join(
      this.config.outputDir.replace('~', homedir()),
      this.config.directoryStructure.images,
      postId
    );

    try {
      await mkdir(imageDir, { recursive: true });
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }

    // 限制并发下载数
    const concurrency = Math.min(
      this.config.images.maxConcurrent,
      imageUrls.length
    );

    for (let i = 0; i < imageUrls.length; i += concurrency) {
      const batch = imageUrls.slice(i, i + concurrency);
      const promises = batch.map((imageUrl, index) =>
        this.downloadSingleImage(imageUrl, imageDir, `${postId}_${i + index}`)
      );

      const results = await Promise.allSettled(promises);
      downloadedCount += results.filter(r => r.status === 'fulfilled').length;
    }

    return downloadedCount;
  }

  async downloadSingleImage(imageUrl, directory, filename) {
    // TODO: 集成 MediaDownloadOperation
    // 简化实现，检查是否应该跳过
    const filePath = join(directory, `${filename}${extname(imageUrl).split('?')[0]}`);

    if (this.config.images.skipExisting && await exists(filePath)) {
      return { success: true, skipped: true, path: filePath };
    }

    // 模拟下载
    await new Promise(resolve => setTimeout(resolve, 100));

    // 实际实现中应该：
    // 1. 下载图片
    // 2. 应用过滤规则
    // 3. 保存到指定路径

    return { success: true, path: filePath };
  }

  async savePostData(postId, content, comments) {
    const textDir = join(
      this.config.outputDir.replace('~', homedir()),
      this.config.directoryStructure.text
    );

    const postData = {
      ...content,
      comments,
      extractedAt: new Date().toISOString(),
      downloadSession: this.state.sessionStats.startTime
    };

    // 保存JSON格式
    if (this.config.output.formats.includes('json')) {
      await writeFile(
        join(textDir, `${postId}.json`),
        JSON.stringify(postData, null, 2)
      );
    }

    // 保存Markdown格式
    if (this.config.output.formats.includes('markdown')) {
      const markdown = this.generateMarkdown(postData);
      await writeFile(
        join(textDir, `${postId}.md`),
        markdown
      );
    }
  }

  generateMarkdown(postData) {
    return `# 微博帖子 - ${postData.id}

## 基本信息
- **作者**: ${postData.author}
- **发布时间**: ${postData.postTime}
- **原文链接**: ${postData.url}

## 统计数据
- 点赞: ${postData.stats.likes}
- 评论: ${postData.stats.comments}
- 转发: ${postData.stats.reposts}

## 内容
${postData.content}

## 图片 (${postData.images.length}张)
${postData.images.map((img, i) => `![图片${i + 1}](${img})`).join('\n')}

## 评论 (${postData.comments.length}条)
${postData.comments.map(comment => `
### ${comment.author} - ${comment.time}
${comment.content}
- 点赞: ${comment.likes}
`).join('\n')}

---
**提取时间**: ${postData.extractedAt}
`;
  }

  isDuplicate(postId) {
    if (!this.config.deduplication.enabled) return false;
    return this.state.downloadHistory.has(postId);
  }

  saveToHistory(postId, result) {
    if (!this.config.deduplication.enabled) return;

    this.state.downloadHistory.set(postId, {
      postId,
      timestamp: Date.now(),
      result: {
        content: result.content.content,
        author: result.content.author,
        images: result.images,
        comments: result.comments
      }
    });
  }

  extractPostId(url) {
    const match = url.match(/\/([A-Za-z0-9]+)$/);
    return match ? match[1] : url;
  }

  compileResults(results, urls) {
    const successful = results.filter(r => r.status === 'fulfilled' && r.value.success);
    const failed = results.filter(r => r.status === 'rejected' || !r.value.success);
    const skipped = results.filter(r => r.value?.skipped);

    return {
      totalPosts: urls.length,
      successfulPosts: successful.length,
      failedPosts: failed.length,
      skippedPosts: skipped.length,
      totalComments: this.state.sessionStats.totalComments,
      totalImages: this.state.sessionStats.totalImages,
      downloadedImages: this.state.sessionStats.downloadedImages,
      deduplicatedCount: this.state.sessionStats.deduplicatedCount,
      successRate: ((successful.length / urls.length) * 100).toFixed(1),
      outputDirectory: this.config.outputDir,
      executionTime: Date.now() - this.state.sessionStats.startTime,
      timestamp: new Date().toISOString()
    };
  }

  async saveBatchReport(result) {
    const reportDir = join(
      this.config.outputDir.replace('~', homedir()),
      this.config.directoryStructure.reports
    );

    const report = {
      ...result,
      sessionStats: this.state.sessionStats,
      config: {
        directoryStructure: this.config.directoryStructure,
        deduplication: this.config.deduplication.enabled,
        comments: this.config.comments.enabled,
        images: this.config.images.enabled
      }
    };

    await writeFile(
      join(reportDir, `batch-report-${Date.now()}.json`),
      JSON.stringify(report, null, 2)
    );

    // 保存历史记录
    if (this.config.deduplication.enabled) {
      const historyFile = join(
        this.config.outputDir.replace('~', homedir()),
        this.config.directoryStructure.metadata,
        this.config.deduplication.historyFile
      );

      const historyObject = Object.fromEntries(this.state.downloadHistory);
      await writeFile(
        historyFile,
        JSON.stringify(historyObject, null, 2)
      );
    }

    // 生成索引页面
    if (this.config.output.createIndex) {
      await this.generateIndexPage(result);
    }
  }

  async generateIndexPage(result) {
    const indexContent = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>微博批量下载报告</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 40px; }
        .header { background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 30px; }
        .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .stat-card { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .stat-number { font-size: 2em; font-weight: bold; color: #007bff; }
        .stat-label { color: #6c757d; margin-top: 5px; }
        .progress { background: #e9ecef; height: 20px; border-radius: 10px; overflow: hidden; margin: 10px 0; }
        .progress-bar { background: #28a745; height: 100%; transition: width 0.3s; }
    </style>
</head>
<body>
    <div class="header">
        <h1>📊 微博批量下载报告</h1>
        <p>生成时间: ${new Date(result.timestamp).toLocaleString()}</p>
        <p>执行时间: ${(result.executionTime / 1000).toFixed(1)} 秒</p>
    </div>

    <div class="stats">
        <div class="stat-card">
            <div class="stat-number">${result.successfulPosts}</div>
            <div class="stat-label">成功下载</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${result.failedPosts}</div>
            <div class="stat-label">下载失败</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${result.totalComments}</div>
            <div class="stat-label">总评论数</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${result.downloadedImages}</div>
            <div class="stat-label">下载图片</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${result.deduplicatedCount}</div>
            <div class="stat-label">去重跳过</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${result.successRate}%</div>
            <div class="stat-label">成功率</div>
        </div>
    </div>

    <div class="progress">
        <div class="progress-bar" style="width: ${result.successRate}%"></div>
    </div>

    <h2>📁 输出目录结构</h2>
    <pre>${result.outputDirectory}/
├── text-content/          (${result.successfulPosts} 个帖子文件)
├── images/               (${result.downloadedImages} 张图片)
├── comments/             (${result.totalComments} 条评论)
├── reports/              (统计报告)
├── metadata/             (元数据)
├── batch-report.json     (批量下载报告)
├── download-history.json (下载历史)
└── index.html            (索引页面)</pre>
</body>
</html>`;

    await writeFile(
      join(this.config.outputDir.replace('~', homedir()), 'index.html'),
      indexContent
    );
  }

  async cleanup() {
    // 清理资源
    if (this.state.browser) {
      await this.state.browser.close();
    }

    // 保存最终统计
    console.log('🧹 清理完成');
  }
}

export default WeiboBatchDownloader;