import { Page } from 'camoufox-js';
import { PostData, CommentData, ContentExtractionConfig, ContentExtractionResult, PageStructureAnalysis } from '../types/page-analysis';

export class ContentExtractor {
  private page: Page;
  private config: ContentExtractionConfig;

  constructor(page: Page, config: Partial<ContentExtractionConfig> = {}) {
    this.page = page;
    this.config = {
      includeImages: true,
      includeComments: false,
      includeInteractions: true,
      maxCommentsPerPost: 10,
      maxPosts: 50,
      contentLengthLimit: 1000,
      ...config
    };
  }

  /**
   * 提取页面内容
   */
  async extractContent(structure: PageStructureAnalysis): Promise<ContentExtractionResult> {
    const startTime = Date.now();
    
    try {
      // 获取页面基本信息
      const url = this.page.url();
      const title = await this.page.title();
      
      // 提取帖子数据
      const posts = await this.extractPosts(structure);
      
      // 限制提取的帖子数量
      const limitedPosts = posts.slice(0, this.config.maxPosts);
      
      // 提取评论（如果启用）
      if (this.config.includeComments) {
        await this.extractCommentsForPosts(limitedPosts);
      }
      
      const result: ContentExtractionResult = {
        posts: limitedPosts,
        pageInfo: {
          url,
          title,
          layoutType: structure.layoutType,
          paginationType: structure.paginationType,
          totalPosts: posts.length,
          extractedPosts: limitedPosts.length
        },
        metadata: {
          extractionTime: Date.now() - startTime,
          usedAI: false, // 暂时未使用AI
          confidence: structure.confidence,
          warnings: this.generateWarnings(limitedPosts, structure)
        }
      };
      
      console.log(`内容提取完成，提取了 ${limitedPosts.length} 个帖子，耗时: ${result.metadata.extractionTime}ms`);
      return result;
      
    } catch (error) {
      console.error('内容提取失败:', error);
      throw error;
    }
  }

  /**
   * 提取帖子数据
   */
  private async extractPosts(structure: PageStructureAnalysis): Promise<PostData[]> {
    const postItemSelector = structure.postItemSelector || await this.findBestPostSelector(structure);
    
    if (!postItemSelector) {
      console.warn('未找到帖子选择器');
      return [];
    }

    const postElements = await this.page.$$(postItemSelector);
    console.log(`找到 ${postElements.length} 个帖子元素`);
    
    const posts: PostData[] = [];
    
    for (let i = 0; i < postElements.length; i++) {
      try {
        const postElement = postElements[i];
        const postData = await this.extractPostData(postElement, i);
        
        if (this.isValidPost(postData)) {
          posts.push(postData);
        }
      } catch (error) {
        console.warn(`提取第 ${i + 1} 个帖子时出错:`, error);
      }
    }
    
    return posts;
  }

  /**
   * 提取单个帖子数据
   */
  private async extractPostData(postElement: any, index: number): Promise<PostData> {
    return await postElement.evaluate((el: Element, config: any) => {
      const generateId = () => `post_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // 提取标题
      const titleSelectors = [
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        '.title', '[class*="title"]', '.headline',
        '[class*="headline"]', '.post-title'
      ];
      
      let title = '';
      for (const selector of titleSelectors) {
        const titleEl = el.querySelector(selector);
        if (titleEl && titleEl.textContent?.trim()) {
          title = titleEl.textContent.trim();
          break;
        }
      }
      
      // 提取内容
      const contentSelectors = [
        '.content', '[class*="content"]', '.body',
        '[class*="body"]', '.text', '[class*="text"]',
        '.description', '[class*="description"]', '.summary'
      ];
      
      let content = '';
      for (const selector of contentSelectors) {
        const contentEl = el.querySelector(selector);
        if (contentEl && contentEl.textContent?.trim()) {
          content = contentEl.textContent.trim();
          if (content.length > config.contentLengthLimit) {
            content = content.substring(0, config.contentLengthLimit) + '...';
          }
          break;
        }
      }
      
      // 如果没有找到内容选择器，使用元素的文本内容
      if (!content) {
        content = el.textContent?.trim() || '';
        if (content.length > config.contentLengthLimit) {
          content = content.substring(0, config.contentLengthLimit) + '...';
        }
      }
      
      // 提取作者信息
      const authorSelectors = [
        '.author', '[class*="author"]', '.byline',
        '[class*="byline"]', '.user', '[class*="user"]',
        '.username', '[class*="username"]'
      ];
      
      let author = undefined;
      for (const selector of authorSelectors) {
        const authorEl = el.querySelector(selector);
        if (authorEl) {
          const authorName = authorEl.textContent?.trim() || 'Unknown';
          const authorLink = (authorEl as HTMLAnchorElement).href;
          const avatarEl = authorEl.querySelector('img');
          const avatar = avatarEl?.src || undefined;
          
          author = {
            name: authorName,
            link: authorLink,
            avatar
          };
          break;
        }
      }
      
      // 提取链接
      const linkSelectors = [
        'a', '.link', '[class*="link"]',
        '[href*="post"]', '[href*="article"]'
      ];
      
      let link = undefined;
      for (const selector of linkSelectors) {
        const linkEl = el.querySelector(selector);
        if (linkEl && linkEl instanceof HTMLAnchorElement && linkEl.href) {
          link = linkEl.href;
          break;
        }
      }
      
      // 提取图片
      const images: string[] = [];
      if (config.includeImages) {
        const imgElements = el.querySelectorAll('img');
        imgElements.forEach((img: HTMLImageElement) => {
          if (img.src && img.src.startsWith('http')) {
            images.push(img.src);
          }
        });
      }
      
      // 提取日期
      const dateSelectors = [
        '.date', '[class*="date"]', '.time',
        '[class*="time"]', '.published', '[class*="published"]'
      ];
      
      let date = undefined;
      for (const selector of dateSelectors) {
        const dateEl = el.querySelector(selector);
        if (dateEl && dateEl.textContent?.trim()) {
          date = dateEl.textContent.trim();
          break;
        }
      }
      
      // 提取交互数据
      let interactions = undefined;
      if (config.includeInteractions) {
        interactions = this.extractInteractions(el);
      }
      
      // 获取元素位置信息
      const rect = el.getBoundingClientRect();
      
      return {
        id: generateId(),
        selector: `#${el.id || generateId()}`,
        title: title || undefined,
        content: content || undefined,
        author,
        link,
        images: images.length > 0 ? images : undefined,
        date,
        interactions,
        metadata: {
          position: index,
          visibleArea: rect.width * rect.height,
          hasFullContent: content.length > 100
        }
      };
    }, this.config);
  }

  /**
   * 提取交互数据（点赞、评论、分享等）
   */
  private extractInteractions(element: Element): any {
    const interactionSelectors = {
      likes: ['.like', '[class*="like"]', '.heart', '[class*="heart"]'],
      comments: ['.comment', '[class*="comment"]', '.reply', '[class*="reply"]'],
      shares: ['.share', '[class*="share"]', '.forward', '[class*="forward"]']
    };

    const interactions: any = {};

    for (const [type, selectors] of Object.entries(interactionSelectors)) {
      for (const selector of selectors) {
        const elements = element.querySelectorAll(selector);
        if (elements.length > 0) {
          // 尝试从文本中提取数字
          elements.forEach(el => {
            const text = el.textContent?.trim() || '';
            const numberMatch = text.match(/\d+/);
            if (numberMatch) {
              interactions[type] = parseInt(numberMatch[0]);
            }
          });
          
          // 如果没有找到数字，至少记录存在
          if (!interactions[type]) {
            interactions[type] = elements.length;
          }
          break;
        }
      }
    }

    return Object.keys(interactions).length > 0 ? interactions : undefined;
  }

  /**
   * 提取帖子的评论
   */
  private async extractCommentsForPosts(posts: PostData[]): Promise<void> {
    for (const post of posts) {
      try {
        const comments = await this.extractPostComments(post.selector);
        post.comments = comments.slice(0, this.config.maxCommentsPerPost);
      } catch (error) {
        console.warn(`提取帖子 ${post.id} 的评论时出错:`, error);
      }
    }
  }

  /**
   * 提取单个帖子的评论
   */
  private async extractPostComments(postSelector: string): Promise<CommentData[]> {
    return await this.page.evaluate((selector: string, maxComments: number) => {
      const postElement = document.querySelector(selector);
      if (!postElement) return [];

      const commentSelectors = [
        '.comment', '[class*="comment"]', '.reply',
        '[class*="reply"]', '.message', '[class*="message"]'
      ];

      const comments: CommentData[] = [];

      for (const commentSelector of commentSelectors) {
        const commentElements = postElement.querySelectorAll(commentSelector);
        
        for (let i = 0; i < Math.min(commentElements.length, maxComments); i++) {
          const commentEl = commentElements[i];
          
          try {
            const generateId = () => `comment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            
            // 提取评论作者
            const authorSelectors = [
              '.author', '[class*="author"]', '.user',
              '[class*="user"]', '.username', '[class*="username"]'
            ];
            
            let authorName = 'Unknown';
            let authorLink = undefined;
            let authorAvatar = undefined;
            
            for (const authorSelector of authorSelectors) {
              const authorEl = commentEl.querySelector(authorSelector);
              if (authorEl) {
                authorName = authorEl.textContent?.trim() || 'Unknown';
                if (authorEl instanceof HTMLAnchorElement) {
                  authorLink = authorEl.href;
                }
                const avatarEl = authorEl.querySelector('img');
                if (avatarEl) {
                  authorAvatar = avatarEl.src;
                }
                break;
              }
            }
            
            // 提取评论内容
            const contentSelectors = [
              '.content', '[class*="content"]', '.text',
              '[class*="text"]', '.body', '[class*="body"]'
            ];
            
            let commentContent = '';
            for (const contentSelector of contentSelectors) {
              const contentEl = commentEl.querySelector(contentSelector);
              if (contentEl && contentEl.textContent?.trim()) {
                commentContent = contentEl.textContent.trim();
                break;
              }
            }
            
            if (!commentContent) {
              commentContent = commentEl.textContent?.trim() || '';
            }
            
            // 提取评论日期
            const dateSelectors = [
              '.date', '[class*="date"]', '.time',
              '[class*="time"]'
            ];
            
            let commentDate = undefined;
            for (const dateSelector of dateSelectors) {
              const dateEl = commentEl.querySelector(dateSelector);
              if (dateEl && dateEl.textContent?.trim()) {
                commentDate = dateEl.textContent.trim();
                break;
              }
            }
            
            comments.push({
              id: generateId(),
              author: {
                name: authorName,
                link: authorLink,
                avatar: authorAvatar
              },
              content: commentContent,
              date: commentDate,
              replies: [], // 简化版本，不处理嵌套回复
              metadata: {
                position: i,
                isReply: false,
                depth: 0
              }
            });
            
          } catch (error) {
            console.warn(`提取评论时出错:`, error);
          }
        }
        
        if (comments.length > 0) break;
      }

      return comments;
    }, postSelector, this.config.maxCommentsPerPost);
  }

  /**
   * 寻找最佳帖子选择器
   */
  private async findBestPostSelector(structure: PageStructureAnalysis): Promise<string | undefined> {
    if (structure.postItemSelector) {
      return structure.postItemSelector;
    }

    // 常见的帖子选择器模式
    const commonSelectors = [
      '.post', '[class*="post"]',
      '.article', '[class*="article"]',
      '.item', '[class*="item"]',
      '.story', '[class*="story"]',
      '.card', '[class*="card"]',
      '.feed-item', '[class*="feed-item"]',
      'article', '[role="article"]'
    ];

    for (const selector of commonSelectors) {
      const elements = await this.page.$$(selector);
      if (elements.length >= 3) { // 至少找到3个才认为是帖子列表
        return selector;
      }
    }

    return undefined;
  }

  /**
   * 验证帖子数据是否有效
   */
  private isValidPost(post: PostData): boolean {
    // 必须有内容或标题
    if (!post.content && !post.title) {
      return false;
    }

    // 内容或标题不能太短
    const contentLength = (post.content?.length || 0) + (post.title?.length || 0);
    if (contentLength < 10) {
      return false;
    }

    // 过滤掉导航元素等
    if (post.title && ['menu', 'navigation', 'nav', 'sidebar'].some(word => 
      post.title!.toLowerCase().includes(word)
    )) {
      return false;
    }

    return true;
  }

  /**
   * 生成警告信息
   */
  private generateWarnings(posts: PostData[], structure: PageStructureAnalysis): string[] {
    const warnings: string[] = [];

    if (posts.length === 0) {
      warnings.push('未提取到任何帖子内容');
    }

    if (structure.confidence < 0.7) {
      warnings.push('页面结构分析置信度较低');
    }

    if (!structure.postItemSelector) {
      warnings.push('未识别到明确的帖子选择器');
    }

    const postsWithoutContent = posts.filter(post => !post.content).length;
    if (postsWithoutContent > posts.length * 0.5) {
      warnings.push('超过50%的帖子缺少内容');
    }

    const postsWithoutAuthor = posts.filter(post => !post.author).length;
    if (postsWithoutAuthor > posts.length * 0.8) {
      warnings.push('超过80%的帖子缺少作者信息');
    }

    return warnings;
  }
}