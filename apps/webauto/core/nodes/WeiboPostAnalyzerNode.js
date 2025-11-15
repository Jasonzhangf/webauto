/**
 * 微博帖子分析节点
 * 分析微博帖子页面结构，提取基础信息、媒体文件和评论区域信息
 */

const { BaseNode } = require('./base-node');
const fs = require('fs');
const path = require('path');

class WeiboPostAnalyzerNode extends BaseNode {
  constructor(config = {}) {
    super('WEIBO_POST_ANALYZER', config);

    this.defaultConfig = {
      extractImages: true,
      extractVideos: true,
      analyzeStructure: true,
      maxMediaCount: 50,
      timeout: 30000,
      selectors: {
        // 帖子基础信息选择器
        postContainer: '.Feed_body_3R0rO',
        postTitle: '.Feed_body_3R0rO h2, .Feed_body_3R0rO .Feed_body_title',
        postContent: '.Feed_body_3R0rO .Feed_body_body, .Feed_body_3R0rO .Feed_body_content',
        postTime: '.Feed_body_3R0rO .Feed_body_date, .Feed_body_3R0rO .Feed_body_time',
        postStats: '.Feed_body_3R0rO .Feed_body_stats',

        // 用户信息选择器
        authorInfo: '.Feed_body_3R0rO .Feed_body_author',
        authorName: '.Feed_body_3R0rO .Feed_body_author_name',
        authorId: '.Feed_body_3R0rO .Feed_body_author_id',
        authorVerified: '.Feed_body_3R0rO .Feed_body_author_verified',

        // 媒体文件选择器
        mediaContainer: '.Feed_body_3R0rO .Feed_body_media',
        imageElements: '.Feed_body_3R0rO img[src*="jpg"], .Feed_body_3R0rO img[src*="png"], .Feed_body_3R0rO img[src*="gif"]',
        videoElements: '.Feed_body_3R0rO video, .Feed_body_3R0rO [data-video-src]',

        // 评论区域选择器
        commentContainer: '.Feed_body_3R0rO .Feed_body_comments, .Feed_body_3R0rO .Comment_container',
        commentList: '.Feed_body_3R0rO .Comment_list, .Feed_body_3R0rO .Comment_container_list',
        commentItem: '.Feed_body_3R0rO .Comment_item, .Feed_body_3R0rO .Comment_container_item',

        // 标签选择器
        tags: '.Feed_body_3R0rO .Feed_body_tags a, .Feed_body_3R0rO .Feed_body_tag'
      },
      ...config
    };

    this.config = { ...this.defaultConfig, ...config };
    this.analysisStats = {
      startTime: null,
      endTime: null,
      elementsFound: 0,
      mediaCount: 0,
      commentContainersFound: 0,
      errors: []
    };
  }

  async validateInput(input) {
    if (!input.page) {
      throw new Error('Missing required input: page');
    }

    if (!input.postUrl && !input.url) {
      throw new Error('Missing required input: postUrl or url');
    }

    return true;
  }

  async preprocess(input) {
    this.analysisStats.startTime = Date.now();

    // 确保页面已加载
    try {
      await input.page.waitForLoadState('networkidle', { timeout: 10000 });
    } catch (error) {
      console.warn('Network idle timeout, continuing with analysis');
    }

    return input;
  }

  async execute(input) {
    const { page, postUrl, url } = input;
    const targetUrl = postUrl || url;

    console.log(`🔍 开始分析微博帖子: ${targetUrl}`);

    try {
      // 提取帖子基础信息
      const postData = await this.extractPostData(page, targetUrl);

      // 提取媒体文件信息
      let mediaInfo = { images: [], videos: [] };
      if (this.config.extractImages || this.config.extractVideos) {
        mediaInfo = await this.extractMediaInfo(page);
      }

      // 分析评论区域
      let commentInfo = { hasComments: false, commentCount: 0, selectors: {} };
      if (this.config.analyzeStructure) {
        commentInfo = await this.analyzeCommentArea(page);
      }

      // 生成分析统计
      this.analysisStats.endTime = Date.now();
      this.analysisStats.executionTime = this.analysisStats.endTime - this.analysisStats.startTime;

      const result = {
        success: true,
        postData,
        mediaInfo,
        commentInfo,
        analysisStats: { ...this.analysisStats },
        targetUrl
      };

      console.log(`✅ 帖子分析完成 - 找到 ${mediaInfo.images.length} 张图片, ${mediaInfo.videos.length} 个视频`);
      console.log(`📊 分析统计: ${this.analysisStats.elementsFound} 个元素, 执行时间 ${this.analysisStats.executionTime}ms`);

      return result;

    } catch (error) {
      this.analysisStats.errors.push({
        timestamp: Date.now(),
        error: error.message,
        stack: error.stack
      });

      throw new Error(`帖子分析失败: ${error.message}`);
    }
  }

  async extractPostData(page, url) {
    try {
      // 从URL提取帖子ID
      const postId = this.extractPostIdFromUrl(url);

      // 等待帖子容器加载
      try {
        await page.waitForSelector(this.config.selectors.postContainer, { timeout: 5000 });
      } catch (error) {
        console.warn('帖子容器选择器未找到，尝试通用选择器');
        // 使用更通用的选择器
        await page.waitForSelector('[class*="Feed"], [class*="feed"], [class*="Post"], [class*="post"]', { timeout: 3000 });
      }

      // 提取帖子标题
      let title = '';
      try {
        title = await page.$eval(this.config.selectors.postTitle, el => el.textContent?.trim() || '');
      } catch (error) {
        console.log('未找到帖子标题');
      }

      // 提取帖子内容
      let content = '';
      try {
        content = await page.$eval(this.config.selectors.postContent, el => el.textContent?.trim() || '');
      } catch (error) {
        console.log('未找到帖子内容');
      }

      // 提取发布时间
      let timestamp = '';
      try {
        timestamp = await page.$eval(this.config.selectors.postTime, el => {
          const timeText = el.textContent?.trim() || '';
          // 尝试解析时间文本
          return timeText;
        });
      } catch (error) {
        console.log('未找到发布时间');
      }

      // 提取用户信息
      let authorInfo = {};
      try {
        authorInfo = await page.evaluate((selectors) => {
          const authorName = document.querySelector(selectors.authorName)?.textContent?.trim() || '';
          const authorId = document.querySelector(selectors.authorId)?.textContent?.trim() || '';
          const verified = document.querySelector(selectors.authorVerified) !== null;

          return {
            name: authorName,
            id: authorId,
            verified: verified
          };
        }, this.config.selectors);
      } catch (error) {
        console.log('未找到用户信息');
      }

      // 提取统计数据
      let statistics = {};
      try {
        statistics = await page.evaluate((selectors) => {
          const statsText = document.querySelector(selectors.postStats)?.textContent || '';
          // 解析统计数据文本
          const likes = statsText.match(/(\d+)\s*赞/)?.[1] || '0';
          const comments = statsText.match(/(\d+)\s*评论/)?.[1] || '0';
          const reposts = statsText.match(/(\d+)\s*转发/)?.[1] || '0';

          return {
            likes: parseInt(likes) || 0,
            comments: parseInt(comments) || 0,
            reposts: parseInt(reposts) || 0
          };
        }, this.config.selectors);
      } catch (error) {
        console.log('未找到统计数据');
      }

      // 提取标签
      let tags = [];
      try {
        tags = await page.$$eval(this.config.selectors.tags, elements =>
          elements.map(el => el.textContent?.trim()).filter(tag => tag)
        );
      } catch (error) {
        console.log('未找到标签');
      }

      const postData = {
        postId,
        url,
        title: title || content.substring(0, 100) + '...', // 使用内容作为标题的备选
        content,
        timestamp,
        author: authorInfo,
        statistics,
        tags,
        extractedAt: new Date().toISOString()
      };

      this.analysisStats.elementsFound++;

      return postData;

    } catch (error) {
      console.error('提取帖子数据失败:', error);
      throw error;
    }
  }

  async extractMediaInfo(page) {
    const mediaInfo = { images: [], videos: [] };

    try {
      // 提取图片信息
      if (this.config.extractImages) {
        const images = await page.$$eval(this.config.selectors.imageElements, (elements, maxCount) => {
          return elements.slice(0, maxCount).map((img, index) => {
            const src = img.src || img.dataset.src;
            const alt = img.alt || '';
            const width = img.naturalWidth || img.width;
            const height = img.naturalHeight || img.height;

            return {
              id: `image_${index}`,
              type: 'image',
              url: src,
              alt,
              width,
              height,
              format: src.match(/\.(jpg|jpeg|png|gif|webp)/i)?.[1] || 'unknown'
            };
          }).filter(img => img.url && !img.url.includes('avatar'));
        }, this.config.maxMediaCount);

        mediaInfo.images = images;
        this.analysisStats.mediaCount += images.length;
      }

      // 提取视频信息
      if (this.config.extractVideos) {
        const videos = await page.$$eval(this.config.selectors.videoElements, (elements, maxCount) => {
          return elements.slice(0, maxCount).map((video, index) => {
            const src = video.src || video.dataset.src || video.dataset.videoSrc;
            const poster = video.poster || '';

            return {
              id: `video_${index}`,
              type: 'video',
              url: src,
              poster,
              format: src.match(/\.(mp4|webm|mov|avi)/i)?.[1] || 'unknown'
            };
          }).filter(video => video.url);
        }, this.config.maxMediaCount);

        mediaInfo.videos = videos;
        this.analysisStats.mediaCount += videos.length;
      }

      console.log(`📸 发现 ${mediaInfo.images.length} 张图片, 🎥 ${mediaInfo.videos.length} 个视频`);

    } catch (error) {
      console.error('提取媒体信息失败:', error);
      this.analysisStats.errors.push({
        timestamp: Date.now(),
        error: `媒体信息提取失败: ${error.message}`
      });
    }

    return mediaInfo;
  }

  async analyzeCommentArea(page) {
    const commentInfo = { hasComments: false, commentCount: 0, selectors: {} };

    try {
      // 检查是否存在评论容器
      const commentContainer = await page.$(this.config.selectors.commentContainer);
      if (!commentContainer) {
        console.log('未找到评论容器');
        return commentInfo;
      }

      commentInfo.hasComments = true;
      this.analysisStats.commentContainersFound++;

      // 检查评论列表
      const commentList = await page.$(this.config.selectors.commentList);
      if (commentList) {
        // 尝试获取评论数量
        try {
          const commentCount = await commentList.$$eval(this.config.selectors.commentItem, elements => elements.length);
          commentInfo.commentCount = commentCount;
          console.log(`📝 发现 ${commentCount} 个评论项`);
        } catch (error) {
          console.log('无法获取评论数量');
        }
      }

      // 分析评论区域结构
      commentInfo.selectors = {
        container: this.config.selectors.commentContainer,
        list: this.config.selectors.commentList,
        item: this.config.selectors.commentItem,
        // 生成更具体的选择器用于后续提取
        author: '.Comment_author, .Comment_item_author',
        content: '.Comment_content, .Comment_item_content',
        time: '.Comment_time, .Comment_item_time',
        likes: '.Comment_likes, .Comment_item_likes',
        replies: '.Comment_replies, .Comment_item_replies'
      };

      // 检查是否有点击加载更多评论的按钮
      const loadMoreButton = await page.$('.Comment_more, .Feed_body_comments_more, [class*="more"]');
      if (loadMoreButton) {
        commentInfo.hasMoreComments = true;
        console.log('发现加载更多评论按钮');
      }

    } catch (error) {
      console.error('分析评论区域失败:', error);
      this.analysisStats.errors.push({
        timestamp: Date.now(),
        error: `评论区域分析失败: ${error.message}`
      });
    }

    return commentInfo;
  }

  extractPostIdFromUrl(url) {
    // 尝试从URL中提取帖子ID
    const patterns = [
      /\/(\d+)$/, // 匹配 /123456789
      /\/p\/(\d+)/, // 匹配 /p/123456789
      /detail\/(\d+)/, // 匹配 detail/123456789
      /weibo\.com\/(\d+)/, // 匹配 weibo.com/123456789
      /status\/(\d+)/ // 匹配 status/123456789
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return match[1];
      }
    }

    // 如果无法提取，使用URL的hash部分
    return url.split('/').pop() || 'unknown';
  }

  async postprocess(output) {
    // 保存分析结果到临时文件用于调试
    if (process.env.NODE_ENV === 'development') {
      const debugPath = path.join(process.cwd(), 'debug', 'post-analysis.json');
      const debugDir = path.dirname(debugPath);

      if (!fs.existsSync(debugDir)) {
        fs.mkdirSync(debugDir, { recursive: true });
      }

      fs.writeFileSync(debugPath, JSON.stringify({
        timestamp: new Date().toISOString(),
        output,
        stats: this.analysisStats
      }, null, 2));

      console.log(`📝 调试信息已保存到: ${debugPath}`);
    }

    return output;
  }

  async handleError(error) {
    console.error('帖子分析节点错误:', error);

    this.analysisStats.errors.push({
      timestamp: Date.now(),
      error: error.message,
      stack: error.stack
    });

    // 返回部分结果，而不是完全失败
    return {
      success: false,
      error: error.message,
      postData: { url: this.input?.postUrl || this.input?.url, error: '提取失败' },
      mediaInfo: { images: [], videos: [] },
      commentInfo: { hasComments: false, commentCount: 0 },
      analysisStats: { ...this.analysisStats }
    };
  }
}

module.exports = WeiboPostAnalyzerNode;