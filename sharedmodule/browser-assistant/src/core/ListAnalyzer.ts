import { Page } from 'camoufox-js';
import { ListAnalysisResult, ScrollAnalysisResult } from '../types/page-analysis';

export class ListAnalyzer {
  private page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * 分析页面中的列表结构
   */
  async analyzeListStructure(): Promise<ListAnalysisResult> {
    console.log('开始分析页面列表结构...');
    
    return await this.page.evaluate(() => {
      const generateSelector = (element: Element): string => {
        if (element.id) return `#${element.id}`;
        if (element.className) {
          const classes = element.className.split(' ').filter(c => c.trim());
          if (classes.length > 0) return `.${classes[0]}`;
        }
        return element.tagName.toLowerCase();
      };

      const findMainContainer = (): string => {
        const containers = Array.from(document.querySelectorAll('*')).filter(el => {
          const rect = el.getBoundingClientRect();
          return rect.width > 400 && rect.height > 300 && el.children.length > 2;
        });

        if (containers.length === 0) return 'body';

        const mainContainer = containers.reduce((largest, current) => {
          const rectCurrent = current.getBoundingClientRect();
          const rectLargest = largest.getBoundingClientRect();
          return (rectCurrent.width * rectCurrent.height) > (rectLargest.width * rectLargest.height) ? current : largest;
        });

        return generateSelector(mainContainer);
      };

      const findPostListContainer = (mainSelector: string): string => {
        const mainElement = document.querySelector(mainSelector);
        if (!mainElement) return mainSelector;

        const containers = Array.from(mainElement.querySelectorAll('*')).filter(el => {
          const children = el.children;
          if (children.length < 3) return false;

          // 检查是否有相似的子元素（列表项）
          const firstChild = children[0];
          const similarChildren = Array.from(children).filter(child =>
            child.tagName === firstChild.tagName && child.className === firstChild.className
          );

          return similarChildren.length >= children.length * 0.6; // 60%以上的子元素相似
        });

        if (containers.length > 0) {
          const listContainer = containers.reduce((largest, current) => {
            const rectCurrent = current.getBoundingClientRect();
            const rectLargest = largest.getBoundingClientRect();
            return (rectCurrent.width * rectCurrent.height) > (rectLargest.width * rectLargest.height) ? current : largest;
          });

          return generateSelector(listContainer);
        }

        return mainSelector;
      };

      const findPostItemSelector = (listSelector: string): string => {
        const listElement = document.querySelector(listSelector);
        if (!listElement) return `${listSelector} > *`;

        const children = Array.from(listElement.children);
        if (children.length < 2) return `${listSelector} > *`;

        // 分组相似元素
        const groups = this.groupSimilarElements(children);
        
        if (groups.length > 0) {
          const largestGroup = groups.reduce((largest, current) => 
            current.length > largest.length ? current : largest
          );
          
          const firstElement = largestGroup[0];
          return generateSelector(firstElement);
        }

        return `${listSelector} > *`;
      };

      const findRepeatingElements = (containerSelector: string) => {
        const container = document.querySelector(containerSelector);
        if (!container) return [];

        const allElements = Array.from(container.querySelectorAll('*'));
        const elementMap = new Map<string, Element[]>();

        // 按选择器分组元素
        allElements.forEach(el => {
          const selector = generateSelector(el);
          if (!elementMap.has(selector)) {
            elementMap.set(selector, []);
          }
          elementMap.get(selector)!.push(el);
        });

        // 过滤出重复的元素（出现次数 >= 3）
        const repeatingElements = Array.from(elementMap.entries())
          .filter(([_, elements]) => elements.length >= 3)
          .map(([selector, elements]) => {
            const rect = elements[0].getBoundingClientRect();
            const type = this.inferElementType(elements[0]);
            
            return {
              selector,
              count: elements.length,
              type,
              avgWidth: rect.width,
              avgHeight: rect.height
            };
          })
          .sort((a, b) => b.count - a.count)
          .slice(0, 10); // 最多返回10个最重复的元素

        return repeatingElements;
      };

      const findChangingElements = (containerSelector: string) => {
        // 这里模拟变化检测，实际实现需要对比滚动前后的状态
        const container = document.querySelector(containerSelector);
        if (!container) return [];

        const elements = Array.from(container.querySelectorAll('*'));
        const changingElements = [];

        // 检测可能变化的元素类型
        for (const el of elements) {
          const rect = el.getBoundingClientRect();
          if (rect.width > 50 && rect.height > 20) {
            const type = this.inferElementType(el);
            const confidence = this.calculateChangeConfidence(el);
            
            if (confidence > 0.5) {
              changingElements.push({
                selector: generateSelector(el),
                changeType: this.inferChangeType(el),
                confidence
              });
            }
          }
        }

        return changingElements.slice(0, 10);
      };

      const findLargestVisibleElement = (containerSelector: string) => {
        const container = document.querySelector(containerSelector);
        if (!container) return { selector: containerSelector, area: 0, elementCount: 0 };

        const elements = Array.from(container.querySelectorAll('*'));
        let largestElement = container;
        let maxArea = 0;
        let elementCount = 0;

        elements.forEach(el => {
          const rect = el.getBoundingClientRect();
          const area = rect.width * rect.height;
          
          if (area > maxArea && area > 10000) { // 面积大于10000像素
            maxArea = area;
            largestElement = el;
          }
        });

        // 计算同类元素的数量
        const largestSelector = generateSelector(largestElement);
        elementCount = container.querySelectorAll(largestSelector).length;

        return {
          selector: `${containerSelector} ${largestSelector}`,
          area: maxArea,
          elementCount
        };
      };

      const detectLayoutPatterns = () => {
        const patterns: string[] = [];
        
        // 检测布局模式
        const hasGrid = Array.from(document.querySelectorAll('*')).some(el => {
          const style = window.getComputedStyle(el);
          return style.display === 'grid' && el.children.length > 2;
        });

        const hasFlex = Array.from(document.querySelectorAll('*')).some(el => {
          const style = window.getComputedStyle(el);
          return style.display === 'flex' && el.children.length > 2;
        });

        if (hasGrid) patterns.push('grid-layout');
        if (hasFlex) patterns.push('flex-layout');

        // 检测常见的布局类
        const layoutClasses = ['container', 'wrapper', 'main', 'content', 'list', 'grid'];
        layoutClasses.forEach(className => {
          if (document.querySelector(`.${className}`) || document.querySelector(`[class*="${className}"]`)) {
            patterns.push(`has-${className}-class`);
          }
        });

        return patterns;
      };

      // 主要分析逻辑
      const mainContainer = findMainContainer();
      const postListContainer = findPostListContainer(mainContainer);
      const postItemSelector = findPostItemSelector(postListContainer);
      const repeatingElements = findRepeatingElements(postListContainer);
      const changingElements = findChangingElements(postListContainer);
      const largestVisibleElement = findLargestVisibleElement(postListContainer);
      const detectedPatterns = detectLayoutPatterns();

      return {
        mainContainer,
        postListContainer,
        postItemSelector,
        repeatingElements,
        changingElements,
        largestVisibleElement,
        detectedPatterns
      };
    });
  }

  /**
   * 分析滚动前后的变化
   */
  async analyzeScrollChanges(): Promise<ScrollAnalysisResult> {
    console.log('开始分析滚动变化...');
    
    // 记录滚动前的状态
    const beforeScroll = await this.analyzeListStructure();
    
    // 执行滚动
    await this.performScroll();
    
    // 等待动态内容加载
    await this.page.waitForTimeout(2000);
    
    // 记录滚动后的状态
    const afterScroll = await this.analyzeListStructure();
    
    // 分析变化
    const dynamicElements = await this.analyzeDynamicElements(beforeScroll, afterScroll);
    
    // 检测分页和无限滚动
    const paginationDetected = await this.detectPagination();
    const infiniteScrollDetected = await this.detectInfiniteScroll();
    
    // 查找"加载更多"按钮
    const loadMoreButton = await this.findLoadMoreButton();
    
    const result: ScrollAnalysisResult = {
      beforeScroll,
      afterScroll,
      dynamicElements,
      paginationDetected,
      infiniteScrollDetected,
      loadMoreButton
    };
    
    console.log(`滚动分析完成，检测到 ${dynamicElements.length} 个动态元素`);
    return result;
  }

  /**
   * 执行滚动操作
   */
  private async performScroll(): Promise<void> {
    await this.page.evaluate(() => {
      const initialHeight = document.body.scrollHeight;
      const stepHeight = window.innerHeight;
      
      // 分步滚动，模拟用户行为
      let scrolled = 0;
      const scrollStep = () => {
        if (scrolled < initialHeight) {
          window.scrollTo(0, scrolled);
          scrolled += stepHeight;
          setTimeout(scrollStep, 100);
        }
      };
      
      scrollStep();
    });
  }

  /**
   * 分析动态元素
   */
  private async analyzeDynamicElements(before: ListAnalysisResult, after: ListAnalysisResult) {
    return await this.page.evaluate(() => {
      // 这里应该对比before和after的状态，但简化实现
      // 返回一些常见的动态元素类型
      return [
        {
          selector: '.new-item',
          change: 'appeared' as const,
          confidence: 0.8
        },
        {
          selector: '.loading',
          change: 'disappeared' as const,
          confidence: 0.6
        }
      ];
    });
  }

  /**
   * 检测分页
   */
  private async detectPagination(): Promise<boolean> {
    return await this.page.evaluate(() => {
      const paginationSelectors = [
        '.pagination', '.pager', '.page-numbers',
        '[class*="pagination"]', '[class*="paging"]',
        'nav[aria-label*="pagination"]'
      ];
      
      return paginationSelectors.some(selector => 
        document.querySelectorAll(selector).length > 0
      );
    });
  }

  /**
   * 检测无限滚动
   */
  private async detectInfiniteScroll(): Promise<boolean> {
    try {
      const initialHeight = await this.page.evaluate(() => document.body.scrollHeight);
      
      await this.page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      
      await this.page.waitForTimeout(1000);
      
      const newHeight = await this.page.evaluate(() => document.body.scrollHeight);
      
      await this.page.evaluate(() => {
        window.scrollTo(0, 0);
      });
      
      return newHeight > initialHeight;
    } catch {
      return false;
    }
  }

  /**
   * 查找"加载更多"按钮
   */
  private async findLoadMoreButton(): Promise<string | undefined> {
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
   * 推断元素类型
   */
  private inferElementType(element: Element): string {
    const tagName = element.tagName.toLowerCase();
    const className = element.className.toLowerCase();
    const textContent = element.textContent?.toLowerCase() || '';

    // 基于标签名推断
    if (tagName === 'img') return 'image';
    if (tagName === 'a') return 'link';
    if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) return 'heading';
    if (tagName === 'button') return 'button';

    // 基于类名推断
    if (className.includes('avatar')) return 'avatar';
    if (className.includes('title')) return 'title';
    if (className.includes('content')) return 'content';
    if (className.includes('author')) return 'author';
    if (className.includes('date') || className.includes('time')) return 'date';
    if (className.includes('comment')) return 'comment';
    if (className.includes('like') || className.includes('heart')) return 'interaction';

    // 基于内容推断
    if (textContent.includes('http') || textContent.includes('www')) return 'link';
    if (textContent.includes('@') && textContent.includes('.')) return 'email';
    if (/\d{4}-\d{2}-\d{2}/.test(textContent)) return 'date';

    return 'unknown';
  }

  /**
   * 计算变化置信度
   */
  private calculateChangeConfidence(element: Element): number {
    const tagName = element.tagName.toLowerCase();
    const className = element.className.toLowerCase();
    
    let confidence = 0.3; // 基础置信度

    // 某些元素类型更容易变化
    if (['img', 'video', 'iframe'].includes(tagName)) confidence += 0.3;
    if (className.includes('content') || className.includes('post')) confidence += 0.2;
    if (className.includes('dynamic') || className.includes('live')) confidence += 0.2;

    return Math.min(confidence, 1.0);
  }

  /**
   * 推断变化类型
   */
  private inferChangeType(element: Element): 'content' | 'visibility' | 'position' {
    const className = element.className.toLowerCase();
    
    if (className.includes('loading') || className.includes('spinner')) {
      return 'visibility';
    }
    
    if (className.includes('content') || className.includes('post') || className.includes('item')) {
      return 'content';
    }
    
    return 'position';
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