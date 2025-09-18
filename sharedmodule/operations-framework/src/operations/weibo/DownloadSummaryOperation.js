/**
 * 下载内容总结操作子
 * 实现下载内容的智能总结功能
 */

import { BaseOperation } from '../core/BaseOperation.js';
import { readFile, writeFile, exists, readdir } from 'fs/promises';
import { join, dirname } from 'path';
import { homedir } from 'os';

export class DownloadSummaryOperation extends BaseOperation {
  constructor(config = {}) {
    super('download-summary', config);
    this.category = 'summary-analysis';
    this.supportedContainers = ['weibo-batch', 'weibo-single'];
    this.capabilities = ['content-summary', 'statistical-analysis', 'trend-analysis'];
  }

  async execute(context = {}) {
    this.logger.info('开始下载内容总结...');

    try {
      const {
        action = 'generate',
        folderName,
        baseDir,
        summaryType = 'current', // current, topic-all, topic-daily
        keyword = '',
        date = new Date().toISOString().split('T')[0]
      } = context;

      switch (action) {
        case 'generate':
          return await this.generateSummary(folderName, baseDir, summaryType, keyword, date);
        case 'analyze':
          return await this.analyzeDownloads(folderName, baseDir);
        case 'compare':
          return await this.compareSummaries(folderName, baseDir, context);
        default:
          throw new Error(`未知操作: ${action}`);
      }

    } catch (error) {
      this.logger.error('下载内容总结失败:', error);
      throw error;
    }
  }

  // 生成内容总结
  async generateSummary(folderName, baseDir, summaryType, keyword, date) {
    if (!folderName) {
      throw new Error('folderName不能为空');
    }

    const directory = baseDir || this.config.baseDir || join(homedir(), '.webauto/weibo-posts');
    const folderPath = join(directory, folderName);

    if (!await exists(folderPath)) {
      throw new Error(`文件夹不存在: ${folderPath}`);
    }

    this.logger.info(`生成总结类型: ${summaryType}, 关键字: ${keyword}, 日期: ${date}`);

    let summaryData = {};

    switch (summaryType) {
      case 'current':
        summaryData = await this.generateCurrentDownloadSummary(folderPath, folderName);
        break;
      case 'topic-all':
        summaryData = await this.generateTopicAllSummary(keyword, directory);
        break;
      case 'topic-daily':
        summaryData = await this.generateTopicDailySummary(keyword, date, directory);
        break;
      default:
        throw new Error(`未知的总结类型: ${summaryType}`);
    }

    // 保存总结文件
    const summaryFile = join(folderPath, `summary-${summaryType}-${Date.now()}.json`);
    await writeFile(summaryFile, JSON.stringify(summaryData, null, 2));

    // 生成Markdown格式总结
    const markdownSummary = this.generateMarkdownSummary(summaryData, summaryType);
    const markdownFile = join(folderPath, `summary-${summaryType}-${Date.now()}.md`);
    await writeFile(markdownFile, markdownSummary);

    this.logger.info(`总结生成完成: ${summaryFile}`);

    return {
      success: true,
      summaryType,
      folderName,
      summaryFile,
      markdownFile,
      summaryData,
      generatedAt: Date.now()
    };
  }

  // 生成当前下载总结
  async generateCurrentDownloadSummary(folderPath, folderName) {
    const historyFile = join(folderPath, 'download-history.json');
    let posts = [];

    // 读取历史记录
    if (await exists(historyFile)) {
      try {
        const content = await readFile(historyFile, 'utf8');
        const history = JSON.parse(content);
        posts = Object.values(history);
      } catch (error) {
        this.logger.warn('读取历史记录失败:', error.message);
      }
    }

    // 分析帖子数据
    const analysis = this.analyzePostsData(posts);

    return {
      summaryType: 'current',
      folderName,
      generatedAt: new Date().toISOString(),
      totalPosts: posts.length,
      analysis,
      topPosts: this.getTopPosts(posts),
      recommendations: this.generateRecommendations(analysis)
    };
  }

  // 生成话题所有内容总结
  async generateTopicAllSummary(keyword, baseDir) {
    const allPosts = [];
    const folders = await readdir(baseDir);

    // 搜索包含关键词的文件夹
    for (const folder of folders) {
      if (folder.includes(keyword) || folder === '微博主页') {
        const folderPath = join(baseDir, folder);
        const historyFile = join(folderPath, 'download-history.json');

        if (await exists(historyFile)) {
          try {
            const content = await readFile(historyFile, 'utf8');
            const history = JSON.parse(content);
            const posts = Object.values(history).map(post => ({
              ...post,
              folderName: folder
            }));
            allPosts.push(...posts);
          } catch (error) {
            this.logger.warn(`读取文件夹 ${folder} 历史记录失败:`, error.message);
          }
        }
      }
    }

    const analysis = this.analyzePostsData(allPosts);

    return {
      summaryType: 'topic-all',
      keyword,
      generatedAt: new Date().toISOString(),
      totalPosts: allPosts.length,
      folders: [...new Set(allPosts.map(post => post.folderName))],
      analysis,
      topPosts: this.getTopPosts(allPosts),
      recommendations: this.generateRecommendations(analysis)
    };
  }

  // 生成话题当日总结
  async generateTopicDailySummary(keyword, date, baseDir) {
    const allPosts = [];
    const folders = await readdir(baseDir);
    const targetDate = new Date(date);
    const nextDate = new Date(targetDate);
    nextDate.setDate(targetDate.getDate() + 1);

    // 搜索包含关键词的文件夹
    for (const folder of folders) {
      if (folder.includes(keyword) || folder === '微博主页') {
        const folderPath = join(baseDir, folder);
        const historyFile = join(folderPath, 'download-history.json');

        if (await exists(historyFile)) {
          try {
            const content = await readFile(historyFile, 'utf8');
            const history = JSON.parse(content);
            const posts = Object.values(history)
              .filter(post => {
                const postDate = new Date(post.downloadedAt);
                return postDate >= targetDate && postDate < nextDate;
              })
              .map(post => ({
                ...post,
                folderName: folder
              }));
            allPosts.push(...posts);
          } catch (error) {
            this.logger.warn(`读取文件夹 ${folder} 历史记录失败:`, error.message);
          }
        }
      }
    }

    const analysis = this.analyzePostsData(allPosts);

    return {
      summaryType: 'topic-daily',
      keyword,
      date,
      generatedAt: new Date().toISOString(),
      totalPosts: allPosts.length,
      folders: [...new Set(allPosts.map(post => post.folderName))],
      analysis,
      topPosts: this.getTopPosts(allPosts),
      recommendations: this.generateRecommendations(analysis)
    };
  }

  // 分析帖子数据
  analyzePostsData(posts) {
    if (posts.length === 0) {
      return {
        totalImages: 0,
        totalComments: 0,
        totalContentLength: 0,
        avgImagesPerPost: 0,
        avgCommentsPerPost: 0,
        avgContentLength: 0,
        topAuthors: [],
        contentPatterns: [],
        timeDistribution: {}
      };
    }

    const totalImages = posts.reduce((sum, post) => sum + (post.stats?.images || 0), 0);
    const totalComments = posts.reduce((sum, post) => sum + (post.stats?.comments || 0), 0);
    const totalContentLength = posts.reduce((sum, post) => sum + (post.stats?.contentLength || 0), 0);

    // 作者统计
    const authorStats = {};
    posts.forEach(post => {
      const author = post.username || `用户_${post.postId?.substring(0, 6)}`;
      authorStats[author] = (authorStats[author] || 0) + 1;
    });

    const topAuthors = Object.entries(authorStats)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([author, count]) => ({ author, count }));

    // 时间分布统计
    const timeDistribution = {};
    posts.forEach(post => {
      if (post.downloadedAt) {
        const hour = new Date(post.downloadedAt).getHours();
        timeDistribution[hour] = (timeDistribution[hour] || 0) + 1;
      }
    });

    return {
      totalImages,
      totalComments,
      totalContentLength,
      avgImagesPerPost: (totalImages / posts.length).toFixed(1),
      avgCommentsPerPost: (totalComments / posts.length).toFixed(1),
      avgContentLength: Math.round(totalContentLength / posts.length),
      topAuthors,
      contentPatterns: this.analyzeContentPatterns(posts),
      timeDistribution
    };
  }

  // 分析内容模式
  analyzeContentPatterns(posts) {
    const patterns = {
      withImages: 0,
      withComments: 0,
      withHashtags: 0,
      highEngagement: 0
    };

    posts.forEach(post => {
      if (post.stats?.images > 0) patterns.withImages++;
      if (post.stats?.comments > 0) patterns.withComments++;
      if (post.content?.includes('#')) patterns.withHashtags++;
      if (post.stats?.likes > 1000) patterns.highEngagement++;
    });

    return Object.entries(patterns).map(([pattern, count]) => ({
      pattern,
      count,
      percentage: ((count / posts.length) * 100).toFixed(1)
    }));
  }

  // 获取热门帖子
  getTopPosts(posts, limit = 10) {
    return posts
      .map(post => ({
        postId: post.postId,
        url: post.url,
        author: post.username || `用户_${post.postId?.substring(0, 6)}`,
        downloadedAt: post.downloadedAt,
        engagement: (post.stats?.likes || 0) + (post.stats?.comments || 0) + (post.stats?.reposts || 0),
        stats: post.stats
      }))
      .sort((a, b) => b.engagement - a.engagement)
      .slice(0, limit);
  }

  // 生成建议
  generateRecommendations(analysis) {
    const recommendations = [];

    if (analysis.avgCommentsPerPost < 10) {
      recommendations.push('评论互动较少，建议增加评论抓取深度');
    }

    if (analysis.avgImagesPerPost < 1) {
      recommendations.push('图片内容较少，可以关注更多图文并茂的帖子');
    }

    if (analysis.totalPosts > 100) {
      recommendations.push('帖子数量较多，建议进行分类整理');
    }

    if (analysis.topAuthors.length > 0) {
      recommendations.push(`重点关注作者: ${analysis.topAuthors.slice(0, 3).map(a => a.author).join(', ')}`);
    }

    return recommendations;
  }

  // 生成Markdown格式总结
  generateMarkdownSummary(summaryData, summaryType) {
    const { folderName, generatedAt, totalPosts, analysis, topPosts, recommendations } = summaryData;

    let title = '';
    switch (summaryType) {
      case 'current':
        title = `当前下载总结 - ${folderName}`;
        break;
      case 'topic-all':
        title = `话题完整总结 - ${summaryData.keyword}`;
        break;
      case 'topic-daily':
        title = `话题日总结 - ${summaryData.keyword} (${summaryData.date})`;
        break;
    }

    return `# ${title}

## 基本信息
- **生成时间**: ${new Date(generatedAt).toLocaleString()}
- **总结类型**: ${summaryType}
- **总帖子数**: ${totalPosts}

## 统计数据
- **总图片数**: ${analysis.totalImages}
- **总评论数**: ${analysis.totalComments}
- **总内容长度**: ${analysis.totalContentLength}
- **平均图片/帖**: ${analysis.avgImagesPerPost}
- **平均评论/帖**: ${analysis.avgCommentsPerPost}
- **平均内容长度**: ${analysis.avgContentLength}

## 热门作者
${analysis.topAuthors.map(author => `- ${author.author}: ${author.count} 帖`).join('\n')}

## 内容模式
${analysis.contentPatterns.map(pattern => `- ${pattern.pattern}: ${pattern.count} (${pattern.percentage}%)`).join('\n')}

## 热门帖子
${topPosts.slice(0, 5).map((post, index) => `
### ${index + 1}. ${post.author}
- **帖子ID**: ${post.postId}
- **互动数**: ${post.engagement}
- **统计**: 点赞 ${post.stats?.likes || 0} | 评论 ${post.stats?.comments || 0} | 转发 ${post.stats?.reposts || 0}
- **链接**: ${post.url}
`).join('\n')}

## 建议
${recommendations.map(rec => `- ${rec}`).join('\n')}

---

*此总结由系统自动生成*
`;
  }

  // 分析下载情况
  async analyzeDownloads(folderName, baseDir) {
    const directory = baseDir || this.config.baseDir || join(homedir(), '.webauto/weibo-posts');
    const folderPath = join(directory, folderName);

    if (!await exists(folderPath)) {
      throw new Error(`文件夹不存在: ${folderPath}`);
    }

    const analysis = {
      folderName,
      folderPath,
      totalSize: 0,
      fileCount: 0,
      posts: [],
      lastUpdate: null
    };

    // 读取历史记录
    const historyFile = join(folderPath, 'download-history.json');
    if (await exists(historyFile)) {
      try {
        const content = await readFile(historyFile, 'utf8');
        const history = JSON.parse(content);
        analysis.posts = Object.values(history);
        analysis.lastUpdate = Math.max(...analysis.posts.map(post => post.downloadedAt));
      } catch (error) {
        this.logger.warn('读取历史记录失败:', error.message);
      }
    }

    // 统计文件信息
    const posts = await readdir(folderPath);
    for (const post of posts) {
      const postPath = join(folderPath, post);
      try {
        const files = await this.getDirectorySize(postPath);
        analysis.totalSize += files.size;
        analysis.fileCount += files.count;
      } catch (error) {
        // 跳过非目录文件
      }
    }

    return analysis;
  }

  // 获取目录大小
  async getDirectorySize(directory) {
    let totalSize = 0;
    let fileCount = 0;

    try {
      const items = await readdir(directory, { withFileTypes: true });

      for (const item of items) {
        const itemPath = join(directory, item.name);
        if (item.isFile()) {
          // 简化计算，实际应该获取文件大小
          totalSize += 1024; // 假设平均1KB
          fileCount++;
        } else if (item.isDirectory()) {
          const subDir = await this.getDirectorySize(itemPath);
          totalSize += subDir.size;
          fileCount += subDir.count;
        }
      }
    } catch (error) {
      // 忽略权限错误等
    }

    return { size: totalSize, count: fileCount };
  }

  // 比较总结
  async compareSummaries(folderName, baseDir, context) {
    const { summaryFiles = [] } = context;

    if (summaryFiles.length < 2) {
      throw new Error('至少需要两个总结文件进行比较');
    }

    const summaries = [];
    for (const file of summaryFiles) {
      try {
        const content = await readFile(file, 'utf8');
        const summary = JSON.parse(content);
        summaries.push(summary);
      } catch (error) {
        this.logger.warn(`读取总结文件失败 ${file}:`, error.message);
      }
    }

    if (summaries.length < 2) {
      throw new Error('成功读取的总结文件不足');
    }

    // 生成比较报告
    const comparison = this.generateComparison(summaries);

    return {
      success: true,
      comparison,
      summaryFiles: summaryFiles.slice(0, summaries.length),
      comparedAt: Date.now()
    };
  }

  // 生成比较报告
  generateComparison(summaries) {
    const comparison = {
      summaries: summaries.map(s => ({
        type: s.summaryType,
        generatedAt: s.generatedAt,
        totalPosts: s.totalPosts
      })),
      changes: [],
      trends: {}
    };

    // 比较数据变化
    for (let i = 1; i < summaries.length; i++) {
      const prev = summaries[i - 1];
      const curr = summaries[i];

      comparison.changes.push({
        from: prev.generatedAt,
        to: curr.generatedAt,
        postChange: curr.totalPosts - prev.totalPosts,
        imageChange: (curr.analysis?.totalImages || 0) - (prev.analysis?.totalImages || 0),
        commentChange: (curr.analysis?.totalComments || 0) - (prev.analysis?.totalComments || 0)
      });
    }

    return comparison;
  }

  async validate() {
    const errors = [];

    if (!this.config.baseDir) {
      // 使用默认目录，不算错误
    }

    return errors;
  }

  async cleanup() {
    this.logger.info('清理下载内容总结资源...');
  }
}

export default DownloadSummaryOperation;