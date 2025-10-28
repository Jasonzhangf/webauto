import { EventEmitter } from 'events';

/**
 * 微博链接提取器
 * 负责从微博主页批量提取帖子、用户、话题等链接
 */
export class WeiboLinkExtractor extends EventEmitter {
  private extractedLinks: Set<string> = new Set();
  private linkPatterns: Map<string, RegExp>;

  constructor() {
    super();
    this.initializeLinkPatterns();
  }

  /**
   * 初始化链接匹配模式
   */
  private initializeLinkPatterns() {
    this.linkPatterns = new Map([
      ['post', /weibo\.com\/\d+\/(\w+)/],           // 帖子链接
      ['user', /weibo\.com\/(u\/\d+|[^\/\s]+)/],     // 用户链接
      ['hashtag', /weibo\.com\/hashtag\/([^\s\?]+)/], // 话题链接
      ['video', /weibo\.com\/tv\/show\/([^\s\?]+)/], // 视频链接
      ['article', /weibo\.com\/article\/([^\s\?]+)/]  // 文章链接
    ]);
  }

  /**
   * 从页面提取所有链接
   */
  async extractLinks(page: any, options: {
    maxLinks?: number;
    includeTypes?: string[];
    excludeTypes?: string[];
  } = {}): Promise<{
    posts: Array<{id: string, url: string, type: string}>;
    users: Array<{id: string, url: string, name: string}>;
    hashtags: Array<{name: string, url: string}>;
    other: Array<{url: string, type: string}>;
  }> {
    const { maxLinks = 1000, includeTypes = [], excludeTypes = [] } = options;
    
    try {
      // 获取页面中的所有链接
      const links = await page.evaluate(() => {
        const linkElements = document.querySelectorAll('a[href]');
        return Array.from(linkElements).map(el => ({
          href: el.getAttribute('href'),
          text: el.textContent?.trim() || '',
          title: el.getAttribute('title') || ''
        }));
      });

      const result = {
        posts: [] as any[],
        users: [] as any[],
        hashtags: [] as any[],
        other: [] as any[]
      };

      let processedCount = 0;

      for (const link of links) {
        if (processedCount >= maxLinks) break;
        if (!link.href || this.extractedLinks.has(link.href)) continue;

        const normalizedUrl = this.normalizeUrl(link.href);
        const linkType = this.detectLinkType(normalizedUrl);

        // 过滤类型
        if (includeTypes.length > 0 && !includeTypes.includes(linkType)) continue;
        if (excludeTypes.length > 0 && excludeTypes.includes(linkType)) continue;

        this.extractedLinks.add(normalizedUrl);

        switch (linkType) {
          case 'post':
            const postId = this.extractPostId(normalizedUrl);
            if (postId) {
              result.posts.push({
                id: postId,
                url: normalizedUrl,
                type: 'post'
              });
            }
            break;
            
          case 'user':
            const userId = this.extractUserId(normalizedUrl);
            const userName = link.text || link.title || userId;
            if (userId) {
              result.users.push({
                id: userId,
                url: normalizedUrl,
                name: userName
              });
            }
            break;
            
          case 'hashtag':
            const hashtagName = this.extractHashtagName(normalizedUrl);
            if (hashtagName) {
              result.hashtags.push({
                name: hashtagName,
                url: normalizedUrl
              });
            }
            break;
            
          default:
            result.other.push({
              url: normalizedUrl,
              type: linkType
            });
        }

        processedCount++;
      }

      this.emit('linksExtracted', result);
      return result;

    } catch (error) {
      console.error('Error extracting links:', error);
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * 从微博卡片中提取链接
   */
  async extractFromCards(page: any, cardSelector: string = '[data-e2e="feed-item"]') {
    try {
      const cards = await page.$$(cardSelector);
      const cardLinks: any[] = [];

      for (let i = 0; i < cards.length; i++) {
        const card = cards[i];
        
        const cardData = await card.evaluate((el: any) => {
          const links = el.querySelectorAll('a[href]');
          const textContent = el.textContent || '';
          
          return {
            links: Array.from(links).map((link: any) => ({
              href: link.getAttribute('href'),
              text: link.textContent?.trim(),
              isMain: link.classList.contains('from') || link.closest('.from')
            })),
            text: textContent.substring(0, 200), // 前200字符用于识别
            hasImages: el.querySelectorAll('img').length > 0,
            hasVideo: el.querySelectorAll('video, .video').length > 0
          };
        });

        // 提取主要帖子链接
        const mainLink = cardData.links.find(link => link.isMain);
        if (mainLink && mainLink.href) {
          const normalizedUrl = this.normalizeUrl(mainLink.href);
          const postId = this.extractPostId(normalizedUrl);
          
          if (postId) {
            cardLinks.push({
              index: i,
              postId,
              url: normalizedUrl,
              text: cardData.text,
              hasImages: cardData.hasImages,
              hasVideo: cardData.hasVideo,
              allLinks: cardData.links.map(l => l.href).filter(Boolean)
            });
          }
        }
      }

      this.emit('cardLinksExtracted', cardLinks);
      return cardLinks;

    } catch (error) {
      console.error('Error extracting from cards:', error);
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * 标准化URL
   */
  private normalizeUrl(url: string): string {
    if (!url) return '';
    
    // 处理相对URL
    if (url.startsWith('/')) {
      url = 'https://weibo.com' + url;
    }
    
    // 移除查询参数和片段
    const urlObj = new URL(url, 'https://weibo.com');
    return urlObj.origin + urlObj.pathname;
  }

  /**
   * 检测链接类型
   */
  private detectLinkType(url: string): string {
    for (const [type, pattern] of this.linkPatterns) {
      if (pattern.test(url)) {
        return type;
      }
    }
    return 'other';
  }

  /**
   * 提取帖子ID
   */
  private extractPostId(url: string): string | null {
    const match = url.match(/weibo\.com\/\d+\/(\w+)/);
    return match ? match[1] : null;
  }

  /**
   * 提取用户ID
   */
  private extractUserId(url: string): string | null {
    const match = url.match(/weibo\.com\/(u\/\d+|[^\/\s]+)/);
    return match ? match[1] : null;
  }

  /**
   * 提取话题名称
   */
  private extractHashtagName(url: string): string | null {
    const match = url.match(/weibo\.com\/hashtag\/([^\s\?]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      totalExtracted: this.extractedLinks.size,
      extractedLinks: Array.from(this.extractedLinks)
    };
  }

  /**
   * 清空提取记录
   */
  reset() {
    this.extractedLinks.clear();
  }
}