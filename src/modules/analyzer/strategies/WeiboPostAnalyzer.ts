import { EventEmitter } from 'events';
import { WeiboInfiniteScrollDetector } from './WeiboInfiniteScrollDetector';
import { WeiboAntiBotProtection } from './WeiboAntiBotProtection';

/**
 * 微博帖子分析器
 * 负责分析微博帖子详情，提取完整内容、媒体、评论等
 */

export interface WeiboPost {
  id: string;
  url: string;
  author: {
    id: string;
    name: string;
    avatar: string;
    verified: boolean;
    verificationType: string;
  };
  content: {
    text: string;
    hashtags: string[];
    mentions: string[];
    links: string[];
  };
  media: {
    images: Array<{
      url: string;
      thumbnail: string;
      width: number;
      height: number;
      size?: number;
    }>;
    videos: Array<{
      url: string;
      thumbnail: string;
      duration: number;
      size?: number;
    }>;
    articles: Array<{
      title: string;
      url: string;
      summary: string;
    }>;
  };
  engagement: {
    reposts: number;
    comments: number;
    likes: number;
    views?: number;
  };
  metadata: {
    publishTime: Date;
    source: string;
    location?: string;
    client: string;
    isAd: boolean;
    isSensitive: boolean;
  };
  comments: WeiboComment[];
}

export interface WeiboComment {
  id: string;
  author: {
    id: string;
    name: string;
    avatar: string;
  };
  content: string;
  publishTime: Date;
  likes: number;
  replies: WeiboComment[];
  depth: number;
}

export interface AnalysisOptions {
  includeMedia: boolean;
  includeComments: boolean;
  maxCommentDepth: number;
  maxComments: number;
  downloadMedia: boolean;
  outputDir: string;
}

export class WeiboPostAnalyzer extends EventEmitter {
  private scrollDetector: WeiboInfiniteScrollDetector;
  private antiBotProtection: WeiboAntiBotProtection;
  private selectors: any;

  constructor(options?: Partial<AnalysisOptions>) {
    super();
    
    this.scrollDetector = new WeiboInfiniteScrollDetector({
      scrollInterval: [1000, 3000],
      maxScrolls: 20
    });
    
    this.antiBotProtection = new WeiboAntiBotProtection();
    
    this.selectors = {
      root: '[data-e2e="content"], .WB_text, .feed_content',
      author: {
        avatar: '[data-e2e="avatar"], .WB_face',
        name: '[data-e2e="author-name"], .W_f14',
        verified: '[data-e2e="verified"], .approve'
      },
      content: {
        text: '[data-e2e="text"], .WB_text',
        images: '[data-e2e="image-grid"] img, .WB_pic img',
        video: '[data-e2e="video-player"], .WB_video',
        article: '[data-e2e="article-card"], .WB_article'
      },
      engagement: {
        repost: '[data-e2e="repost-btn"], .WB_func_a .pos',
        comment: '[data-e2e="comment-btn"], .WB_func_a .comt',
        like: '[data-e2e="like-btn"], .WB_func_a .like'
      },
      comments: {
        container: '[data-e2e="comment-list"], .comment_list',
        item: '[data-e2e="comment-item"], .comment_item',
        content: '[data-e2e="comment-text"], .comment_txt',
        author: '[data-e2e="comment-author"], .comment_name',
        time: '[data-e2e="comment-time"], .comment_time',
        likes: '[data-e2e="comment-likes"], .comment_like',
        replies: '[data-e2e="comment-replies"], .reply_box',
        loadMore: '[data-e2e="comment-more"], .more_comment'
      },
      metadata: {
        time: '[data-e2e="time"], .WB_from a',
        source: '.WB_from S_txt',
        location: '[data-e2e="location"], .WB_geo',
        client: '.WB_from S_txt2'
      }
    };
  }

  /**
   * 分析微博帖子
   */
  async analyzePost(page: any, postUrl: string, options: Partial<AnalysisOptions> = {}): Promise<WeiboPost> {
    const opts: AnalysisOptions = {
      includeMedia: true,
      includeComments: true,
      maxCommentDepth: 3,
      maxComments: 100,
      downloadMedia: false,
      outputDir: './downloads',
      ...options
    };

    try {
      this.emit('analysisStart', { url: postUrl });

      // 等待页面加载
      await this.antiBotProtection.executeDelay('pageLoad');
      
      // 检测反爬信号
      const antiBotResult = await this.antiBotProtection.detectAntiBotSignals(page);
      if (antiBotResult.detected) {
        throw new Error(`Anti-bot detected: ${antiBotResult.signals.join(', ')}`);
      }

      // 提取帖子ID
      const postId = this.extractPostId(postUrl);
      
      // 构建基础帖子信息
      const post: WeiboPost = {
        id: postId,
        url: postUrl,
        author: await this.extractAuthor(page),
        content: await this.extractContent(page),
        media: await this.extractMedia(page),
        engagement: await this.extractEngagement(page),
        metadata: await this.extractMetadata(page),
        comments: []
      };

      // 提取评论
      if (opts.includeComments) {
        post.comments = await this.extractComments(page, opts);
      }

      // 下载媒体文件
      if (opts.downloadMedia && opts.includeMedia) {
        await this.downloadMediaFiles(post.media, opts.outputDir);
      }

      this.emit('analysisComplete', { post });
      this.antiBotProtection.handleSuccess('post_analysis', Date.now());
      
      return post;

    } catch (error) {
      this.emit('analysisError', { error, url: postUrl });
      this.antiBotProtection.handleFailure(error, 'post_analysis');
      throw error;
    }
  }

  /**
   * 提取作者信息
   */
  private async extractAuthor(page: any): Promise<WeiboPost['author']> {
    try {
      const authorData = await page.evaluate((selectors) => {
        const avatarEl = document.querySelector(selectors.avatar);
        const nameEl = document.querySelector(selectors.name);
        const verifiedEl = document.querySelector(selectors.verified);
        
        return {
          avatar: avatarEl?.getAttribute('src') || '',
          name: nameEl?.textContent?.trim() || '',
          verified: !!verifiedEl,
          verificationType: verifiedEl?.getAttribute('title') || ''
        };
      }, this.selectors.author);

      return {
        id: authorData.name, // 使用用户名作为ID
        ...authorData
      };
    } catch (error) {
      console.error('Error extracting author:', error);
      return { id: '', name: '', avatar: '', verified: false, verificationType: '' };
    }
  }

  /**
   * 提取内容信息
   */
  private async extractContent(page: any): Promise<WeiboPost['content']> {
    try {
      const contentData = await page.evaluate((selectors) => {
        const textEl = document.querySelector(selectors.text);
        const text = textEl?.textContent || '';
        
        // 提取话题标签
        const hashtagRegex = /#([^#]+)#/g;
        const hashtags = [];
        let match;
        while ((match = hashtagRegex.exec(text)) !== null) {
          hashtags.push(match[1]);
        }
        
        // 提取提及用户
        const mentionRegex = /@([\w一-龥]+)/g;
        const mentions = [];
        while ((match = mentionRegex.exec(text)) !== null) {
          mentions.push(match[1]);
        }
        
        // 提取链接
        const linkElements = document.querySelectorAll('a[href]');
        const links = Array.from(linkElements)
          .map(el => el.getAttribute('href'))
          .filter(href => href && !href.includes('weibo.com'));
        
        return {
          text: text.trim(),
          hashtags,
          mentions,
          links
        };
      }, this.selectors.content);

      return contentData;
    } catch (error) {
      console.error('Error extracting content:', error);
      return { text: '', hashtags: [], mentions: [], links: [] };
    }
  }

  /**
   * 提取媒体信息
   */
  private async extractMedia(page: any): Promise<WeiboPost['media']> {
    const media: WeiboPost['media'] = {
      images: [],
      videos: [],
      articles: []
    };

    try {
      // 提取图片
      const images = await page.evaluate((selector) => {
        const imgElements = document.querySelectorAll(selector);
        return Array.from(imgElements).map(img => ({
          url: img.getAttribute('src') || img.getAttribute('data-src'),
          width: img.naturalWidth || 0,
          height: img.naturalHeight || 0
        }));
      }, this.selectors.content.images);

      media.images = images
        .filter(img => img.url && !img.url.includes('avatar'))
        .map(img => ({
          ...img,
          thumbnail: img.url,
          url: this.normalizeImageUrl(img.url)
        }));

      // 提取视频
      const videos = await page.evaluate((selector) => {
        const videoElements = document.querySelectorAll(selector);
        return Array.from(videoElements).map(video => ({
          url: video.getAttribute('src') || video.getAttribute('data-url'),
          thumbnail: video.getAttribute('poster') || ''
        }));
      }, this.selectors.content.video);

      media.videos = videos
        .filter(video => video.url)
        .map(video => ({
          ...video,
          duration: 0 // 需要进一步分析获取
        }));

    } catch (error) {
      console.error('Error extracting media:', error);
    }

    return media;
  }

  /**
   * 提取互动数据
   */
  private async extractEngagement(page: any): Promise<WeiboPost['engagement']> {
    try {
      const engagement = await page.evaluate((selectors) => {
        const getNumber = (text: string) => {
          if (!text) return 0;
          const num = text.replace(/[^0-9]/g, '');
          return parseInt(num) || 0;
        };

        const repostEl = document.querySelector(selectors.repost);
        const commentEl = document.querySelector(selectors.comment);
        const likeEl = document.querySelector(selectors.like);

        return {
          reposts: getNumber(repostEl?.textContent),
          comments: getNumber(commentEl?.textContent),
          likes: getNumber(likeEl?.textContent)
        };
      }, this.selectors.engagement);

      return engagement;
    } catch (error) {
      console.error('Error extracting engagement:', error);
      return { reposts: 0, comments: 0, likes: 0 };
    }
  }

  /**
   * 提取元数据
   */
  private async extractMetadata(page: any): Promise<WeiboPost['metadata']> {
    try {
      const metadata = await page.evaluate((selectors) => {
        const timeEl = document.querySelector(selectors.time);
        const sourceEl = document.querySelector(selectors.source);
        const locationEl = document.querySelector(selectors.location);
        const clientEl = document.querySelector(selectors.client);

        return {
          timeText: timeEl?.textContent || '',
          source: sourceEl?.textContent || '',
          location: locationEl?.textContent || '',
          client: clientEl?.textContent || ''
        };
      }, this.selectors.metadata);

      return {
        publishTime: this.parsePublishTime(metadata.timeText),
        source: metadata.source,
        location: metadata.location,
        client: metadata.client,
        isAd: false, // 需要进一步检测
        isSensitive: false // 需要进一步检测
      };
    } catch (error) {
      console.error('Error extracting metadata:', error);
      return {
        publishTime: new Date(),
        source: '',
        client: '',
        isAd: false,
        isSensitive: false
      };
    }
  }

  /**
   * 提取评论
   */
  private async extractComments(page: any, options: AnalysisOptions): Promise<WeiboComment[]> {
    const comments: WeiboComment[] = [];
    
    try {
      // 先尝试展开评论
      await this.expandComments(page);
      
      // 处理无限滚动加载评论
      if (options.maxComments > 20) {
        await this.scrollDetector.performInfiniteScroll(page, {
          containerSelector: this.selectors.comments.container,
          itemSelector: this.selectors.comments.item,
          targetCount: options.maxComments
        });
      }

      // 提取评论内容
      const commentElements = await page.$$(this.selectors.comments.item);
      
      for (let i = 0; i < Math.min(commentElements.length, options.maxComments); i++) {
        const comment = await this.extractSingleComment(commentElements[i], 0, options);
        if (comment) {
          comments.push(comment);
        }
        
        // 防反机器人延迟
        if (i % 5 === 0) {
          await this.antiBotProtection.executeDelay('dataExtraction');
        }
      }

    } catch (error) {
      console.error('Error extracting comments:', error);
    }

    return comments;
  }

  /**
   * 提取单条评论
   */
  private async extractSingleComment(
    commentElement: any, 
    depth: number, 
    options: AnalysisOptions
  ): Promise<WeiboComment | null> {
    try {
      const commentData = await commentElement.evaluate((el, selectors) => {
        const authorEl = el.querySelector(selectors.author);
        const contentEl = el.querySelector(selectors.content);
        const timeEl = el.querySelector(selectors.time);
        const likesEl = el.querySelector(selectors.likes);
        
        return {
          author: authorEl?.textContent?.trim() || '',
          content: contentEl?.textContent?.trim() || '',
          timeText: timeEl?.textContent || '',
          likes: parseInt(likesEl?.textContent?.replace(/[^0-9]/g, '') || '0')
        };
      }, this.selectors.comments);

      const comment: WeiboComment = {
        id: `${commentData.author}_${Date.now()}`,
        author: {
          id: commentData.author,
          name: commentData.author,
          avatar: ''
        },
        content: commentData.content,
        publishTime: this.parsePublishTime(commentData.timeText),
        likes: commentData.likes,
        replies: [],
        depth
      };

      // 提取回复（如果允许更深层次）
      if (depth < options.maxCommentDepth) {
        const replyElements = await commentElement.$$(this.selectors.comments.replies);
        for (const replyEl of replyElements) {
          const reply = await this.extractSingleComment(replyEl, depth + 1, options);
          if (reply) {
            comment.replies.push(reply);
          }
        }
      }

      return comment;
    } catch (error) {
      console.error('Error extracting single comment:', error);
      return null;
    }
  }

  /**
   * 展开评论
   */
  private async expandComments(page: any): Promise<void> {
    try {
      // 点击展开评论按钮
      const expandButtons = await page.$$('.comment_btn, [data-e2e="expand-comments"]');
      for (const button of expandButtons) {
        try {
          await button.click();
          await this.antiBotProtection.executeDelay('click', 500);
        } catch (error) {
          // 忽略点击错误
        }
      }
    } catch (error) {
      console.error('Error expanding comments:', error);
    }
  }

  /**
   * 下载媒体文件
   */
  private async downloadMediaFiles(media: WeiboPost['media'], outputDir: string): Promise<void> {
    // 在实际环境中实现文件下载逻辑
    console.log(`Downloading media files to: ${outputDir}`);
    console.log(`Images: ${media.images.length}, Videos: ${media.videos.length}`);
  }

  /**
   * 提取帖子ID
   */
  private extractPostId(url: string): string {
    const match = url.match(/weibo\.com\/\d+\/(\w+)/);
    return match ? match[1] : '';
  }

  /**
   * 标准化图片URL
   */
  private normalizeImageUrl(url: string): string {
    if (!url) return '';
    
    // 获取原图
    if (url.includes('thumb')) {
      return url.replace('/thumb/', '/large/').replace('/bmiddle/', '/large/');
    }
    
    return url;
  }

  /**
   * 解析发布时间
   */
  private parsePublishTime(timeText: string): Date {
    try {
      // 处理各种时间格式
      if (timeText.includes('分钟前')) {
        const minutes = parseInt(timeText) || 0;
        return new Date(Date.now() - minutes * 60 * 1000);
      } else if (timeText.includes('小时前')) {
        const hours = parseInt(timeText) || 0;
        return new Date(Date.now() - hours * 60 * 60 * 1000);
      } else if (timeText.includes('今天')) {
        const today = new Date();
        const timePart = timeText.replace('今天', '').trim();
        const [hours, minutes] = timePart.split(':').map(Number);
        today.setHours(hours, minutes, 0, 0);
        return today;
      } else {
        // 尝试解析完整日期
        return new Date(timeText);
      }
    } catch (error) {
      return new Date();
    }
  }
}