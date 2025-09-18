/**
 * 单个帖子下载操作子
 * 实现单个微博帖子的完整下载功能
 */

import { BaseOperation } from '../core/BaseOperation.js';
import { mkdir, writeFile, readFile, exists, access, rm } from 'fs/promises';
import { join, dirname, basename } from 'path';
import { homedir } from 'os';

export class SinglePostDownloadOperation extends BaseOperation {
  constructor(config = {}) {
    super('single-post-download', config);
    this.category = 'weibo-download';
    this.supportedContainers = ['weibo-batch', 'weibo-single'];
    this.capabilities = ['post-download', 'content-extraction', 'file-management'];
  }

  async execute(context = {}) {
    this.logger.info('开始单个帖子下载...');

    try {
      const { url, downloadType = 'unknown', keyword = '', username = '' } = context;

      if (!url) {
        throw new Error('帖子URL不能为空');
      }

      // 1. 提取帖子ID
      const postId = this.extractPostId(url);
      this.logger.info(`处理帖子: ${postId}`);

      // 2. 确定目录命名
      const folderName = this.determineFolderName(downloadType, keyword, username, postId);
      this.logger.info(`目录名: ${folderName}`);

      // 3. 创建帖子专属目录
      const postDir = await this.createPostDirectory(folderName, postId);

      // 4. 检查是否已下载
      if (await this.checkAlreadyDownloaded(postId, postDir)) {
        this.logger.info(`帖子 ${postId} 已下载，跳过`);
        return {
          success: true,
          skipped: true,
          postId,
          url,
          folderName,
          postDir,
          message: '帖子已下载，跳过'
        };
      }

      // 5. 下载帖子内容
      const postContent = await this.downloadPostContent(url, postId);

      // 6. 下载图片
      const downloadedImages = await this.downloadPostImages(postContent.images, postDir, postId);

      // 7. 提取评论
      const comments = await this.extractPostComments(url, postId);

      // 8. 保存帖子数据
      await this.savePostData(postId, postContent, comments, postDir);

      // 9. 记录下载历史
      await this.recordDownloadHistory({
        postId,
        url,
        folderName,
        postDir,
        downloadType,
        keyword,
        username,
        downloadedAt: Date.now(),
        content: postContent,
        images: downloadedImages,
        comments: comments.length
      });

      this.logger.info(`帖子 ${postId} 下载完成`);

      return {
        success: true,
        postId,
        url,
        folderName,
        postDir,
        content: postContent,
        downloadedImages,
        commentsCount: comments.length,
        downloadedAt: Date.now()
      };

    } catch (error) {
      this.logger.error('单个帖子下载失败:', error);
      throw error;
    }
  }

  extractPostId(url) {
    const patterns = [
      /weibo\.com\/[^\/]+\/([A-Za-z0-9]+)$/,
      /weibo\.com\/status\/(\d+)$/,
      /weibo\.com\/(\d+)\/([A-Za-z0-9]+)$/,
      /\/([A-Za-z0-9]+)$/
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return match[match.length - 1];
      }
    }

    // 如果无法提取ID，使用URL的hash
    return url.replace(/[^a-zA-Z0-9]/g, '_');
  }

  determineFolderName(downloadType, keyword, username, postId) {
    switch (downloadType) {
      case 'search':
        return keyword || `search_${postId.substring(0, 8)}`;
      case 'profile':
        return username || `user_${postId.substring(0, 8)}`;
      case 'homepage':
        return '微博主页';
      default:
        return `post_${postId.substring(0, 8)}`;
    }
  }

  async createPostDirectory(folderName, postId) {
    const baseDir = this.config.outputDir || join(homedir(), '.webauto/weibo-posts');
    const postDir = join(baseDir, folderName, postId);

    try {
      await mkdir(postDir, { recursive: true });
      this.logger.debug(`创建目录: ${postDir}`);
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
    }

    return postDir;
  }

  async checkAlreadyDownloaded(postId, postDir) {
    // 检查历史记录
    const historyFile = join(dirname(postDir), 'download-history.json');

    if (await exists(historyFile)) {
      try {
        const content = await readFile(historyFile, 'utf8');
        const history = JSON.parse(content);

        if (history[postId]) {
          // 检查文件是否还存在
          const postDataFile = join(postDir, 'post-data.json');
          if (await exists(postDataFile)) {
            return true;
          } else {
            // 文件不存在，从历史记录中删除
            delete history[postId];
            await writeFile(historyFile, JSON.stringify(history, null, 2));
            this.logger.info(`清理历史记录: ${postId} (文件不存在)`);
          }
        }
      } catch (error) {
        this.logger.warn('读取历史记录失败:', error.message);
      }
    }

    return false;
  }

  async downloadPostContent(url, postId) {
    // TODO: 集成现有的内容提取操作子
    this.logger.info(`下载帖子内容: ${postId}`);

    // 模拟内容提取
    await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000));

    return {
      id: postId,
      url,
      author: `用户_${postId.substring(0, 6)}`,
      content: `这是帖子 ${postId} 的示例内容。包含一些文字描述和相关媒体内容。${Math.random() > 0.5 ? ' #热门话题' : ''}`,
      postTime: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
      images: this.generateMockImages(postId),
      videos: [],
      stats: {
        likes: Math.floor(Math.random() * 10000),
        comments: Math.floor(Math.random() * 1000),
        reposts: Math.floor(Math.random() * 500)
      }
    };
  }

  generateMockImages(postId) {
    const imageCount = Math.floor(Math.random() * 6); // 0-5张图片
    const images = [];

    for (let i = 0; i < imageCount; i++) {
      const servers = ['wx1', 'wx2', 'wx3', 'wx4', 'tvax1', 'tvax2', 'tvax3', 'tvax4'];
      const server = servers[Math.floor(Math.random() * servers.length)];
      const size = ['large', 'mw690', 'mw1024', 'orj360'][Math.floor(Math.random() * 4)];

      images.push({
        url: `https://${server}.sinaimg.cn/${size}/${postId}_${i + 1}.jpg`,
        filename: `image_${i + 1}.jpg`,
        description: `图片${i + 1}`
      });
    }

    return images;
  }

  async downloadPostImages(images, postDir, postId) {
    if (!images || images.length === 0) {
      return 0;
    }

    this.logger.info(`下载 ${images.length} 张图片`);

    const imagesDir = join(postDir, 'images');
    try {
      await mkdir(imagesDir, { recursive: true });
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }

    let downloadedCount = 0;

    for (const image of images) {
      try {
        const imagePath = join(imagesDir, image.filename);

        // 模拟图片下载
        await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 300));

        // 实际实现中应该下载图片
        await writeFile(imagePath, `Mock image data for ${image.url}`);

        downloadedCount++;
        this.logger.debug(`下载图片: ${image.filename}`);

      } catch (error) {
        this.logger.warn(`图片下载失败: ${image.filename}`, error.message);
      }
    }

    return downloadedCount;
  }

  async extractPostComments(url, postId) {
    if (!this.config.enableComments) {
      return [];
    }

    this.logger.info(`提取评论: ${postId}`);

    // 模拟评论提取
    const commentCount = Math.min(
      Math.floor(Math.random() * 50),
      this.config.maxComments || 50
    );

    const comments = [];
    for (let i = 0; i < commentCount; i++) {
      comments.push({
        id: `comment_${postId}_${i}`,
        author: `评论用户${i}`,
        content: `这是第${i}条评论内容 ${Math.random() > 0.7 ? '#回复' : ''}`,
        time: new Date(Date.now() - i * 3600000).toISOString(),
        likes: Math.floor(Math.random() * 50),
        replies: []
      });
    }

    return comments;
  }

  async savePostData(postId, postContent, comments, postDir) {
    // 保存完整数据
    const postData = {
      ...postContent,
      comments,
      extractedAt: new Date().toISOString(),
      config: this.config
    };

    // 保存JSON格式
    await writeFile(
      join(postDir, 'post-data.json'),
      JSON.stringify(postData, null, 2)
    );

    // 保存Markdown格式
    const markdown = this.generateMarkdown(postData);
    await writeFile(
      join(postDir, 'post-content.md'),
      markdown
    );

    // 保存图片URL列表
    if (postContent.images.length > 0) {
      await writeFile(
        join(postDir, 'images-list.txt'),
        postContent.images.map(img => img.url).join('\n')
      );
    }

    // 保存评论数据
    if (comments.length > 0) {
      await writeFile(
        join(postDir, 'comments.json'),
        JSON.stringify(comments, null, 2)
      );
    }

    this.logger.info(`帖子数据已保存到: ${postDir}`);
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
${postData.images.map((img, i) => `![图片${i + 1}](${img.url})`).join('\n')}

## 评论 (${postData.comments.length}条)
${postData.comments.map(comment => `
### ${comment.author} - ${new Date(comment.time).toLocaleString()}
${comment.content}
- 点赞: ${comment.likes}
`).join('\n')}

---
**提取时间**: ${postData.extractedAt}
`;
  }

  async recordDownloadHistory(record) {
    const historyFile = join(dirname(record.postDir), 'download-history.json');
    let history = {};

    // 读取现有历史记录
    if (await exists(historyFile)) {
      try {
        const content = await readFile(historyFile, 'utf8');
        history = JSON.parse(content);
      } catch (error) {
        this.logger.warn('读取历史记录失败:', error.message);
      }
    }

    // 更新历史记录
    history[record.postId] = {
      postId: record.postId,
      url: record.url,
      folderName: record.folderName,
      postDir: record.postDir,
      downloadType: record.downloadType,
      keyword: record.keyword,
      username: record.username,
      downloadedAt: record.downloadedAt,
      files: ['post-data.json', 'post-content.md', 'images-list.txt', 'comments.json'],
      stats: {
        images: record.images,
        comments: record.commentsCount,
        contentLength: record.content.content.length
      }
    };

    // 保存历史记录
    await writeFile(historyFile, JSON.stringify(history, null, 2));
    this.logger.info(`记录下载历史: ${record.postId}`);
  }

  async validate() {
    const errors = [];

    if (!this.config.outputDir) {
      errors.push('缺少输出目录配置');
    }

    return errors;
  }

  async cleanup() {
    this.logger.info('清理单个帖子下载资源...');
  }

  // 删除帖子及相关历史记录
  async deletePostRecord(postId, folderName) {
    const baseDir = this.config.outputDir || join(homedir(), '.webauto/weibo-posts');
    const postDir = join(baseDir, folderName, postId);
    const historyFile = join(baseDir, folderName, 'download-history.json');

    try {
      // 删除帖子目录
      if (await exists(postDir)) {
        await rm(postDir, { recursive: true, force: true });
        this.logger.info(`删除帖子目录: ${postDir}`);
      }

      // 从历史记录中删除
      if (await exists(historyFile)) {
        const content = await readFile(historyFile, 'utf8');
        const history = JSON.parse(content);

        if (history[postId]) {
          delete history[postId];
          await writeFile(historyFile, JSON.stringify(history, null, 2));
          this.logger.info(`从历史记录中删除: ${postId}`);
        }
      }

      return { success: true, postId, message: '删除成功' };

    } catch (error) {
      this.logger.error(`删除帖子记录失败: ${postId}`, error);
      throw error;
    }
  }
}

export default SinglePostDownloadOperation;