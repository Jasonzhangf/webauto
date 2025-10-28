/**
 * 页面类型识别器
 * 基于URL模式、页面内容和结构特征识别页面类型
 */

import { Page } from 'playwright';
import { PageType, PageTypeConfig } from '../types/index.js';

export class PageTypeIdentifier {
  private pageTypeConfigs: Map<string, PageTypeConfig> = new Map();

  constructor() {
    this.initializeBuiltinPageTypes();
  }

  /**
   * 初始化内置页面类型配置
   */
  private initializeBuiltinPageTypes(): void {
    // 微博主页
    this.pageTypeConfigs.set('weibo-homepage', {
      name: '微博主页',
      description: '微博首页，包含热门内容和推荐信息流',
      urlPattern: /^https?:\/\/weibo\.com(\/|\/home)?$/,
      expectedContainers: ['page', 'scroll', 'content', 'navigation'],
      workflowTemplate: 'weibo-homepage-link-extraction',
      characteristics: {
        scrollType: 'infinite',
        contentLoadType: 'dynamic',
        interactionType: 'scroll-based',
        hasLogin: true,
        hasPagination: false,
        hasInfiniteScroll: true
      },
      priority: 1
    });

    // 微博搜索结果页
    this.pageTypeConfigs.set('weibo-search', {
      name: '微博搜索结果',
      description: '微博搜索结果页面，分页显示搜索内容',
      urlPattern: /^https?:\/\/weibo\.com\/search/,
      expectedContainers: ['page', 'content', 'pagination', 'filter'],
      workflowTemplate: 'weibo-search-results',
      characteristics: {
        scrollType: 'pagination',
        contentLoadType: 'dynamic',
        interactionType: 'hybrid',
        hasLogin: true,
        hasPagination: true,
        hasInfiniteScroll: false
      },
      priority: 2
    });

    // 微博个人主页
    this.pageTypeConfigs.set('weibo-profile', {
      name: '微博个人主页',
      description: '用户个人主页，显示用户发布的内容',
      urlPattern: /^https?:\/\/weibo\.com\/u\//,
      expectedContainers: ['page', 'scroll', 'content', 'user', 'navigation'],
      workflowTemplate: 'weibo-profile-content',
      characteristics: {
        scrollType: 'infinite',
        contentLoadType: 'dynamic',
        interactionType: 'scroll-based',
        hasLogin: true,
        hasPagination: false,
        hasInfiniteScroll: true
      },
      priority: 3
    });

    // 微博帖子详情页
    this.pageTypeConfigs.set('weibo-post', {
      name: '微博帖子详情',
      description: '单个微博帖子的详细页面，包含评论',
      urlPattern: /^https?:\/\/weibo\.com\/\d+\/[A-Za-z0-9_\-]+/,
      expectedContainers: ['page', 'content', 'comment', 'media'],
      workflowTemplate: 'weibo-post-detail',
      characteristics: {
        scrollType: 'static',
        contentLoadType: 'lazy',
        interactionType: 'click-based',
        hasLogin: true,
        hasPagination: false,
        hasInfiniteScroll: false
      },
      priority: 4
    });
  }

  /**
   * 识别页面类型
   */
  async identifyPageType(url: string, page: Page): Promise<PageType> {
    console.log(`🔍 识别页面类型: ${url}`);

    // 1. 基于URL模式识别
    const urlBasedType = this.identifyByUrlPattern(url);
    if (urlBasedType) {
      console.log(`✅ 通过URL模式识别: ${urlBasedType.type}`);
      return urlBasedType;
    }

    // 2. 基于页面内容识别
    console.log(`⚠️ URL模式未匹配，尝试内容分析...`);
    const contentBasedType = await this.identifyByContent(page, url);
    if (contentBasedType) {
      console.log(`✅ 通过内容分析识别: ${contentBasedType.type}`);
      return contentBasedType;
    }

    // 3. 默认返回通用页面类型
    console.log(`⚠️ 无法精确识别，使用默认页面类型`);
    return this.getDefaultPageType(url);
  }

  /**
   * 基于URL模式识别页面类型
   */
  private identifyByUrlPattern(url: string): PageType | null {
    for (const [type, config] of this.pageTypeConfigs) {
      if (config.urlPattern.test(url)) {
        return {
          type,
          name: config.name,
          description: config.description,
          expectedContainers: config.expectedContainers,
          workflowTemplate: config.workflowTemplate,
          characteristics: config.characteristics
        };
      }
    }
    return null;
  }

  /**
   * 基于页面内容识别页面类型
   */
  private async identifyByContent(page: Page, url: string): Promise<PageType | null> {
    try {
      const contentAnalysis = await page.evaluate(() => {
        // 基本内容分析函数
        function analyzeContentType(): string {
          if (window.location.hostname.includes('weibo.com')) return 'social';
          if (document.querySelector('article, .post, .article')) return 'content';
          if (document.querySelector('form, input[type="search"]')) return 'search';
          return 'other';
        }

        function detectDynamicContent(): boolean {
          return document.querySelectorAll('[data-], .vue-, .react-').length > 0 ||
                 document.querySelector('script[src*="react"]') !== null;
        }

        function detectInfiniteScroll(): boolean {
          return document.querySelector('[class*="scroll"], [class*="virtual"]') !== null;
        }

        function detectPagination(): boolean {
          return document.querySelector('[class*="page"], [class*="pagination"], .next, .prev') !== null;
        }

        function detectLoginForm(): boolean {
          return document.querySelector('input[type="password"], .login, .signin') !== null;
        }

        function extractKeywords(): string[] {
          const text = document.body.textContent || '';
          const words = text.toLowerCase().match(/[a-z]{3,}/g) || [];
          return [...new Set(words)].slice(0, 10);
        }

        function calculateElementDensity(): number {
          return document.querySelectorAll('*').length / Math.max(1, document.body.innerHTML.length);
        }

        function findInteractionElements(): any[] {
          const elements: any[] = [];
          document.querySelectorAll('button, a, input').forEach(el => {
            elements.push({
              type: el.tagName.toLowerCase(),
              selector: el.tagName.toLowerCase() + (el.className ? '.' + el.className.split(' ')[0] : ''),
              text: el.textContent?.substring(0, 50) || '',
              isVisible: el.getBoundingClientRect().width > 0
            });
          });
          return elements;
        }

        // 执行分析
        const primaryLanguage = document.documentElement.lang || 'unknown';
        const contentType = analyzeContentType();
        const hasDynamicContent = detectDynamicContent();
        const hasInfiniteScroll = detectInfiniteScroll();
        const hasPagination = detectPagination();
        const hasLoginForm = detectLoginForm();
        const keywords = extractKeywords();
        const elementDensity = calculateElementDensity();
        const interactionElements = findInteractionElements();

        return {
          contentType,
          hasDynamicContent,
          hasInfiniteScroll,
          hasPagination,
          hasLoginForm,
          primaryLanguage,
          keywords,
          elementDensity,
          interactionElements
        };
      });
      
      // 基于内容特征匹配页面类型
      return this.matchPageTypeByContent(contentAnalysis, url);
    } catch (error) {
      console.error('内容分析失败:', error.message);
      return null;
    }
  }

  /**
   * 基于内容特征匹配页面类型
   */
  private matchPageTypeByContent(analysis: any, url: string): PageType | null {
    // 检查是否为微博网站
    if (!url.includes('weibo.com')) {
      return this.createGenericPageType('unknown', '未知网站', analysis);
    }

    // 基于内容特征推断页面类型
    if (analysis.hasInfiniteScroll && analysis.contentType === 'social') {
      return this.createGenericPageType('weibo-social-feed', '微博社交信息流', analysis);
    }

    if (analysis.hasPagination && analysis.contentType === 'social') {
      return this.createGenericPageType('weibo-paginated', '微博分页内容', analysis);
    }

    if (analysis.hasLoginForm) {
      return this.createGenericPageType('weibo-auth', '微博认证页面', analysis);
    }

    return this.createGenericPageType('weibo-generic', '微博通用页面', analysis);
  }

  /**
   * 创建通用页面类型
   */
  private createGenericPageType(type: string, name: string, analysis: any): PageType {
    return {
      type,
      name,
      description: `基于内容分析识别的${name}`,
      expectedContainers: this.inferExpectedContainers(analysis),
      workflowTemplate: 'generic-content-extraction',
      characteristics: {
        scrollType: analysis.hasInfiniteScroll ? 'infinite' : 
                   analysis.hasPagination ? 'pagination' : 'static',
        contentLoadType: analysis.hasDynamicContent ? 'dynamic' : 'static',
        interactionType: this.inferInteractionType(analysis),
        hasLogin: analysis.hasLoginForm,
        hasPagination: analysis.hasPagination,
        hasInfiniteScroll: analysis.hasInfiniteScroll
      }
    };
  }

  /**
   * 推断期望的容器类型
   */
  private inferExpectedContainers(analysis: any): string[] {
    const containers = ['page']; // 基础页面容器

    if (analysis.hasInfiniteScroll) {
      containers.push('scroll');
    }

    if (analysis.hasPagination) {
      containers.push('pagination');
    }

    containers.push('content'); // 内容容器

    if (analysis.contentType === 'social') {
      containers.push('comment', 'user');
    }

    return containers;
  }

  /**
   * 推断交互类型
   */
  private inferInteractionType(analysis: any): 'click-based' | 'scroll-based' | 'hybrid' {
    const clickElements = analysis.interactionElements?.filter((e: any) => e.type === 'button' || e.type === 'link').length || 0;
    const scrollElements = analysis.interactionElements?.filter((e: any) => e.type === 'scroll').length || 0;

    if (clickElements > scrollElements) {
      return 'click-based';
    } else if (scrollElements > clickElements) {
      return 'scroll-based';
    } else {
      return 'hybrid';
    }
  }

  /**
   * 获取默认页面类型
   */
  private getDefaultPageType(url: string): PageType {
    return {
      type: 'unknown',
      name: '未知页面类型',
      description: '无法识别的页面类型，使用通用处理方式',
      expectedContainers: ['page', 'content'],
      workflowTemplate: 'generic-content-extraction',
      characteristics: {
        scrollType: 'static',
        contentLoadType: 'static',
        interactionType: 'hybrid',
        hasLogin: false,
        hasPagination: false,
        hasInfiniteScroll: false
      }
    };
  }
}
