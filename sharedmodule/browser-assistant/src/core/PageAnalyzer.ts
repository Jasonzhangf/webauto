import { Page } from 'camoufox-js';
import { PageStructureAnalysis, PostData, CommentData, ListAnalysisResult, ScrollAnalysisResult, ContentExtractionConfig, ContentExtractionResult, PageLayoutType, PaginationType } from '../types/page-analysis';
import { ObservedElement, ObserveResult } from '../types';

export class PageAnalyzer {
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
   * 分析页面类型和结构
   */
  async analyzePageStructure(): Promise<PageStructureAnalysis> {
    const startTime = Date.now();
    
    // 获取页面基本信息
    const url = this.page.url();
    const title = await this.page.title();
    
    // 分析页面布局类型
    const layoutType = await this.detectLayoutType();
    
    // 分析分页类型
    const paginationType = await this.detectPaginationType();
    
    // 识别主要内容区域
    const mainContentSelector = await this.findMainContentSelector();
    
    // 识别帖子列表容器
    const postListSelector = await this.findPostListSelector();
    
    // 识别单个帖子选择器
    const postItemSelector = await this.findPostItemSelector();
    
    // 识别分页元素
    const paginationSelector = await this.findPaginationSelector();
    
    // 识别"加载更多"按钮
    const loadMoreSelector = await this.findLoadMoreSelector();
    
    // 分析页面元数据
    const metadata = await this.analyzePageMetadata();
    
    // 计算置信度
    const confidence = this.calculateConfidence(layoutType, paginationType, metadata);
    
    const result: PageStructureAnalysis = {
      layoutType,
      paginationType,
      mainContentSelector,
      postListSelector,
      postItemSelector,
      paginationSelector,
      loadMoreSelector,
      confidence,
      metadata
    };
    
    console.log(`页面结构分析完成，耗时: ${Date.now() - startTime}ms`);
    return result;
  }

  /**
   * 检测页面布局类型
   */
  private async detectLayoutType(): Promise<PageLayoutType> {
    // 获取页面所有可见元素
    const elements = await this.page.evaluate(() => {
      const allElements = Array.from(document.querySelectorAll('*'));
      return allElements
        .filter(el => {
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && window.getComputedStyle(el).display !== 'none';
        })
        .map(el => ({
          tagName: el.tagName,
          className: el.className,
          id: el.id,
          rect: el.getBoundingClientRect(),
          children: el.children.length,
          textContent: el.textContent?.trim().slice(0, 100) || ''
        }));
    });

    // 分析布局模式
    const containerElements = elements.filter(el => 
      el.children > 3 && 
      el.rect.width > 300 && 
      el.rect.height > 400
    );

    if (containerElements.length === 0) {
      return PageLayoutType.UNKNOWN;
    }

    // 检查是否为网格布局
    const hasGridLayout = await this.page.evaluate(() => {
      const containers = Array.from(document.querySelectorAll('*')).filter(el => {
        const style = window.getComputedStyle(el);
        return (style.display === 'grid' || style.display === 'flex') && 
               el.children.length > 2;
      });
      
      if (containers.length === 0) return false;
      
      // 检查子元素是否呈网格排列
      return containers.some(container => {
        const children = Array.from(container.children);
        if (children.length < 3) return false;
        
        const firstChildRect = children[0].getBoundingClientRect();
        const secondChildRect = children[1].getBoundingClientRect();
        
        // 如果第二个元素在第一个元素的右侧，可能是网格布局
        return secondChildRect.left > firstChildRect.right;
      });
    });

    if (hasGridLayout) {
      // 进一步检测是无限滚动还是分页
      const hasPagination = await this.hasPaginationElements();
      return hasPagination ? PageLayoutType.GRID_PAGINATED : PageLayoutType.GRID_INFINITE;
    }

    // 单列布局检测
    const hasPagination = await this.hasPaginationElements();
    return hasPagination ? PageLayoutType.SINGLE_COLUMN_PAGINATED : PageLayoutType.SINGLE_COLUMN_INFINITE;
  }

  /**
   * 检测分页类型
   */
  private async detectPaginationType(): Promise<PaginationType> {
    // 检查是否有分页元素
    const paginationElements = await this.page.evaluate(() => {
      const selectors = [
        '.pagination', '.pager', '.page-numbers', '.page-links',
        '[class*="pagination"]', '[class*="paging"]', '[class*="page-num"]',
        'nav[aria-label*="pagination"]', 'div[role="navigation"]'
      ];
      
      return selectors.map(selector => {
        const elements = document.querySelectorAll(selector);
        return Array.from(elements).map(el => ({
          selector,
          textContent: el.textContent?.trim(),
          childCount: el.children.length
        }));
      }).flat();
    });

    if (paginationElements.length === 0) {
      // 检查是否有"加载更多"按钮
      const loadMoreButton = await this.page.evaluate(() => {
        const selectors = [
          '.load-more', '.more-button', '[class*="load-more"]',
          'button[class*="more"]', 'a[class*="more"]',
          '[aria-label*="more"]', '[title*="more"]'
        ];
        
        return selectors.some(selector => {
          const elements = document.querySelectorAll(selector);
          return Array.from(elements).some(el => {
            const text = el.textContent?.toLowerCase() || '';
            return text.includes('more') || text.includes('加载') || text.includes('next');
          });
        });
      });

      if (loadMoreButton) {
        return PaginationType.LOAD_MORE;
      }

      // 检查是否支持无限滚动
      const supportsInfiniteScroll = await this.checkInfiniteScrollSupport();
      return supportsInfiniteScroll ? PaginationType.INFINITE_SCROLL : PaginationType.NONE;
    }

    // 分析分页元素类型
    const hasNumberedPages = paginationElements.some(el => 
      el.childCount > 2 && /\d+/.test(el.textContent || '')
    );

    if (hasNumberedPages) {
      return PaginationType.NUMBERED_PAGES;
    }

    return PaginationType.NEXT_PREVIOUS;
  }

  /**
   * 查找主要内容区域选择器
   */
  private async findMainContentSelector(): Promise<string> {
    const selectors = [
      'main', 'article', '[role="main"]', 
      '.main', '.content', '.container',
      '#main', '#content', '#container',
      '[class*="main"]', '[class*="content"]', '[class*="container"]'
    ];

    for (const selector of selectors) {
      const element = await this.page.$(selector);
      if (element) {
        const rect = await element.boundingBox();
        if (rect && rect.width > 400 && rect.height > 300) {
          return selector;
        }
      }
    }

    // 如果没有找到标准选择器，寻找最大的容器
    return await this.page.evaluate(() => {
      const allElements = Array.from(document.querySelectorAll('*'));
      const visibleElements = allElements.filter(el => {
        const rect = el.getBoundingClientRect();
        return rect.width > 300 && rect.height > 200 && 
               window.getComputedStyle(el).display !== 'none';
      });

      if (visibleElements.length === 0) return 'body';

      // 按面积排序，返回最大的元素
      visibleElements.sort((a, b) => {
        const rectA = a.getBoundingClientRect();
        const rectB = b.getBoundingClientRect();
        return (rectB.width * rectB.height) - (rectA.width * rectA.height);
      });

      const largestElement = visibleElements[0];
      
      // 生成选择器
      if (largestElement.id) return `#${largestElement.id}`;
      if (largestElement.className) {
        const classes = largestElement.className.split(' ').filter(c => c.trim());
        if (classes.length > 0) return `.${classes[0]}`;
      }
      
      return largestElement.tagName.toLowerCase();
    });
  }

  /**
   * 查找帖子列表容器
   */
  private async findPostListSelector(): Promise<string> {
    const mainContent = await this.findMainContentSelector();
    
    return await this.page.evaluate((mainSelector) => {
      const mainElement = document.querySelector(mainSelector);
      if (!mainElement) return mainSelector;

      // 寻找包含多个相似子元素的容器
      const containers = Array.from(mainElement.querySelectorAll('*')).filter(el => {
        const children = el.children;
        if (children.length < 3) return false;
        
        // 检查子元素是否相似
        const firstChild = children[0];
        return Array.from(children).every(child => 
          child.tagName === firstChild.tagName &&
          child.className === firstChild.className
        );
      });

      if (containers.length > 0) {
        const largestContainer = containers.reduce((largest, current) => {
          const rectCurrent = current.getBoundingClientRect();
          const rectLargest = largest.getBoundingClientRect();
          return (rectCurrent.width * rectCurrent.height) > (rectLargest.width * rectLargest.height) ? current : largest;
        });

        if (largestContainer.id) return `${mainSelector} #${largestContainer.id}`;
        if (largestContainer.className) {
          const classes = largestContainer.className.split(' ').filter(c => c.trim());
          if (classes.length > 0) return `${mainSelector} .${classes[0]}`;
        }
        return `${mainSelector} ${largestContainer.tagName.toLowerCase()}`;
      }

      return mainSelector;
    }, mainContent);
  }

  /**
   * 查找单个帖子选择器
   */
  private async findPostItemSelector(): Promise<string> {
    const postListSelector = await this.findPostListSelector();
    
    return await this.page.evaluate((listSelector) => {
      const listElement = document.querySelector(listSelector);
      if (!listElement) return `${listSelector} > *`;

      const children = Array.from(listElement.children);
      if (children.length < 2) return `${listSelector} > *`;

      // 寻找最相似的一级子元素
      const groups = this.groupSimilarElements(children);
      
      if (groups.length > 0) {
        const largestGroup = groups.reduce((largest, current) => 
          current.length > largest.length ? current : largest
        );
        
        const firstElement = largestGroup[0];
        if (firstElement.id) return `${listSelector} > #${firstElement.id}`;
        if (firstElement.className) {
          const classes = firstElement.className.split(' ').filter(c => c.trim());
          if (classes.length > 0) return `${listSelector} > .${classes[0]}`;
        }
        return `${listSelector} > ${firstElement.tagName.toLowerCase()}`;
      }

      return `${listSelector} > *`;
    }, postListSelector);
  }

  /**
   * 查找分页选择器
   */
  private async findPaginationSelector(): Promise<string | undefined> {
    const selectors = [
      '.pagination', '.pager', '.page-numbers',
      '[class*="pagination"]', '[class*="paging"]',
      'nav[aria-label*="pagination"]'
    ];

    for (const selector of selectors) {
      const elements = await this.page.$$(selector);
      if (elements.length > 0) {
        return selector;
      }
    }

    return undefined;
  }

  /**
   * 查找"加载更多"按钮选择器
   */
  private async findLoadMoreSelector(): Promise<string | undefined> {
    const selectors = [
      '.load-more', '.more-button', '[class*="load-more"]',
      'button[class*="more"]', 'a[class*="more"]',
      '[aria-label*="more"]', '[title*="more"]'
    ];

    for (const selector of selectors) {
      const elements = await this.page.$$(selector);
      if (elements.length > 0) {
        const hasLoadMoreText = await Promise.any(
          elements.map(async el => {
            const text = await el.textContent();
            return text?.toLowerCase().includes('more') || 
                   text?.toLowerCase().includes('加载') ||
                   text?.toLowerCase().includes('next');
          })
        );
        if (hasLoadMoreText) {
          return selector;
        }
      }
    }

    return undefined;
  }

  /**
   * 分析页面元数据
   */
  private async analyzePageMetadata() {
    return await this.page.evaluate(() => {
      const allElements = Array.from(document.querySelectorAll('*'));
      const visibleElements = allElements.filter(el => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && 
               window.getComputedStyle(el).display !== 'none';
      });

      // 检测框架
      const frameworks = [];
      if (window.React) frameworks.push('React');
      if (window.Vue) frameworks.push('Vue');
      if (window.angular) frameworks.push('Angular');

      // 检测布局模式
      const hasGrid = visibleElements.some(el => {
        const style = window.getComputedStyle(el);
        return style.display === 'grid';
      });

      const hasFlex = visibleElements.some(el => {
        const style = window.getComputedStyle(el);
        return style.display === 'flex';
      });

      const hasImages = visibleElements.some(el => el.tagName === 'IMG');
      const hasAvatars = visibleElements.some(el => 
        el.tagName === 'IMG' && 
        (el.className.toLowerCase().includes('avatar') || 
         el.className.toLowerCase().includes('profile'))
      );
      const hasTitles = visibleElements.some(el => 
        ['H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(el.tagName)
      );
      const hasDescriptions = visibleElements.some(el => {
        const text = el.textContent?.trim() || '';
        return text.length > 50 && text.length < 500;
      });
      const hasDates = visibleElements.some(el => {
        const text = el.textContent?.trim() || '';
        return /\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4}/.test(text);
      });
      const hasInteractionButtons = visibleElements.some(el => {
        const text = el.textContent?.toLowerCase() || '';
        return text.includes('like') || text.includes('comment') || 
               text.includes('share') || text.includes('点赞') ||
               text.includes('评论') || text.includes('分享');
      });

      // 计算列数
      let columnCount = 1;
      if (hasGrid || hasFlex) {
        // 简单的列数估算
        const mainContent = document.querySelector('main, .main, [role="main"]');
        if (mainContent) {
          const children = Array.from(mainContent.children);
          if (children.length > 1) {
            const firstRect = children[0].getBoundingClientRect();
            const secondRect = children[1].getBoundingClientRect();
            if (secondRect.left > firstRect.right) {
              columnCount = Math.floor(mainContent.getBoundingClientRect().width / firstRect.width);
            }
          }
        }
      }

      const layoutPatterns = [];
      if (hasGrid) layoutPatterns.push('grid');
      if (hasFlex) layoutPatterns.push('flex');
      if (columnCount > 1) layoutPatterns.push(`multi-column-${columnCount}`);

      return {
        columnCount,
        hasImages,
        hasAvatars,
        hasTitles,
        hasDescriptions,
        hasDates,
        hasInteractionButtons,
        detectedFrameworks: frameworks,
        layoutPatterns
      };
    });
  }

  /**
   * 计算分析置信度
   */
  private calculateConfidence(layoutType: PageLayoutType, paginationType: PaginationType, metadata: any): number {
    let confidence = 0.5; // 基础置信度

    // 根据检测到的特征增加置信度
    if (layoutType !== PageLayoutType.UNKNOWN) confidence += 0.2;
    if (paginationType !== PaginationType.NONE) confidence += 0.1;
    
    if (metadata.hasTitles && metadata.hasDescriptions) confidence += 0.1;
    if (metadata.detectedFrameworks.length > 0) confidence += 0.05;
    if (metadata.layoutPatterns.length > 0) confidence += 0.05;

    return Math.min(confidence, 1.0);
  }

  /**
   * 检查是否有分页元素
   */
  private async hasPaginationElements(): Promise<boolean> {
    return await this.page.evaluate(() => {
      const selectors = [
        '.pagination', '.pager', '.page-numbers',
        '[class*="pagination"]', '[class*="paging"]',
        'nav[aria-label*="pagination"]'
      ];
      
      return selectors.some(selector => document.querySelectorAll(selector).length > 0);
    });
  }

  /**
   * 检查是否支持无限滚动
   */
  private async checkInfiniteScrollSupport(): Promise<boolean> {
    try {
      // 检查页面高度是否可以变化
      const initialHeight = await this.page.evaluate(() => document.body.scrollHeight);
      
      // 尝试滚动到底部
      await this.page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      
      await this.page.waitForTimeout(1000);
      
      const newHeight = await this.page.evaluate(() => document.body.scrollHeight);
      
      // 恢复滚动位置
      await this.page.evaluate(() => {
        window.scrollTo(0, 0);
      });
      
      return newHeight > initialHeight;
    } catch {
      return false;
    }
  }

  /**
   * 分组相似元素
   */
  private groupSimilarElements(elements: Element[]): Element[][] {
    const groups: Element[][] = [];
    
    for (const element of elements) {
      let foundGroup = false;
      
      for (const group of groups) {
        const firstInGroup = group[0];
        if (this.elementsAreSimilar(element, firstInGroup)) {
          group.push(element);
          foundGroup = true;
          break;
        }
      }
      
      if (!foundGroup) {
        groups.push([element]);
      }
    }
    
    return groups;
  }

  /**
   * 判断两个元素是否相似
   */
  private elementsAreSimilar(el1: Element, el2: Element): boolean {
    return el1.tagName === el2.tagName && el1.className === el2.className;
  }
}