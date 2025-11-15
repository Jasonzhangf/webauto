import { EventEmitter } from 'events';

/**
 * 无限滚动检测器
 * 检测和处理微博页面的无限滚动加载
 */
export interface ScrollConfig {
  scrollInterval: [number, number];  // 滚动间隔范围 [min, max] 毫秒
  scrollThreshold: number;           // 滚动阈值 (0-1)
  maxAttempts: number;               // 最大尝试次数
  waitTimeout: number;               // 等待超时时间
  maxScrolls: number;                // 最大滚动次数
}

export interface ScrollResult {
  success: boolean;
  scrollCount: number;
  itemsFound: number;
  error?: string;
  stoppedReason?: 'timeout' | 'maxAttempts' | 'noNewContent' | 'maxScrolls';
}

export class WeiboInfiniteScrollDetector extends EventEmitter {
  private config: ScrollConfig;
  private isScrolling: boolean = false;
  private scrollCount: number = 0;
  private lastItemCount: number = 0;
  private noContentCount: number = 0;

  constructor(config?: Partial<ScrollConfig>) {
    super();
    this.config = {
      scrollInterval: [2000, 5000],  // 2-5秒
      scrollThreshold: 0.8,          // 滚动到80%位置
      maxAttempts: 10,               // 最大10次尝试
      waitTimeout: 30000,            // 30秒超时
      maxScrolls: 50,                // 最大50次滚动
      ...config
    };
  }

  /**
   * 检测页面是否支持无限滚动
   */
  async detectInfiniteScroll(page: any): Promise<boolean> {
    try {
      // 检测滚动容器
      const scrollContainer = await this.findScrollContainer(page);
      if (!scrollContainer) {
        return false;
      }

      // 检测加载指示器
      const hasLoadingIndicator = await page.evaluate(() => {
        const indicators = [
          '.more_loading',
          '.load_more',
          '[data-e2e="load-more"]',
          '.WB_load_more',
          '.feed_loading'
        ];
        
        return indicators.some(selector => document.querySelector(selector));
      });

      // 检测动态内容
      const initialHeight = await page.evaluate(() => document.documentElement.scrollHeight);
      
      // 尝试滚动一次看看是否有新内容
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await this.delay(2000);
      
      const newHeight = await page.evaluate(() => document.documentElement.scrollHeight);
      
      // 恢复滚动位置
      await page.evaluate(() => window.scrollTo(0, 0));
      
      return newHeight > initialHeight || hasLoadingIndicator;

    } catch (error) {
      console.error('Error detecting infinite scroll:', error);
      return false;
    }
  }

  /**
   * 执行无限滚动
   */
  async performInfiniteScroll(page: any, options: {
    containerSelector?: string;
    itemSelector?: string;
    targetCount?: number;
    onStop?: () => void;
  } = {}): Promise<ScrollResult> {
    const {
      containerSelector = 'body',
      itemSelector = '[data-e2e="feed-item"], .WB_feed_type, .feed_item',
      targetCount,
      onStop
    } = options;

    if (this.isScrolling) {
      return { success: false, scrollCount: 0, itemsFound: 0, error: 'Already scrolling' };
    }

    this.isScrolling = true;
    this.scrollCount = 0;
    this.noContentCount = 0;
    
    try {
      const startTime = Date.now();
      let currentItemCount = await this.getItemCount(page, itemSelector);
      this.lastItemCount = currentItemCount;

      this.emit('scrollStart', { initialCount: currentItemCount });

      while (this.scrollCount < this.config.maxScrolls && this.isScrolling) {
        // 检查超时
        if (Date.now() - startTime > this.config.waitTimeout) {
          return { 
            success: false, 
            scrollCount: this.scrollCount, 
            itemsFound: currentItemCount,
            stoppedReason: 'timeout'
          };
        }

        // 检查是否达到目标数量
        if (targetCount && currentItemCount >= targetCount) {
          this.emit('targetReached', { count: currentItemCount, targetCount });
          break;
        }

        // 执行滚动
        const scrollResult = await this.scrollOnce(page, containerSelector);
        
        if (!scrollResult.success) {
          return { 
            success: false, 
            scrollCount: this.scrollCount, 
            itemsFound: currentItemCount,
            error: scrollResult.error
          };
        }

        this.scrollCount++;
        this.emit('scrollPerformed', { 
          scrollCount: this.scrollCount, 
          scrollHeight: scrollResult.scrollHeight 
        });

        // 等待新内容加载
        await this.delay(this.getRandomDelay());

        // 检查新内容
        const newItemCount = await this.getItemCount(page, itemSelector);
        const newItems = newItemCount - currentItemCount;
        
        if (newItems > 0) {
          currentItemCount = newItemCount;
          this.lastItemCount = currentItemCount;
          this.noContentCount = 0;
          this.emit('newContent', { newItems, totalCount: currentItemCount });
        } else {
          this.noContentCount++;
          
          // 连续多次没有新内容，尝试点击加载更多按钮
          if (this.noContentCount >= 3) {
            const clicked = await this.clickLoadMore(page);
            if (!clicked) {
              // 无法加载更多内容，停止滚动
              break;
            }
            await this.delay(3000); // 等待按钮点击后加载
          }
        }

        // 如果连续多次没有新内容，停止滚动
        if (this.noContentCount >= this.config.maxAttempts) {
          break;
        }
      }

      this.isScrolling = false;
      
      const finalItemCount = await this.getItemCount(page, itemSelector);
      const result: ScrollResult = {
        success: true,
        scrollCount: this.scrollCount,
        itemsFound: finalItemCount
      };

      if (this.noContentCount >= this.config.maxAttempts) {
        result.stoppedReason = 'noNewContent';
      } else if (this.scrollCount >= this.config.maxScrolls) {
        result.stoppedReason = 'maxScrolls';
      }

      this.emit('scrollComplete', result);
      
      if (onStop) onStop();
      
      return result;

    } catch (error) {
      this.isScrolling = false;
      const result: ScrollResult = {
        success: false,
        scrollCount: this.scrollCount,
        itemsFound: this.lastItemCount,
        error: error.message
      };
      this.emit('scrollError', error);
      return result;
    }
  }

  /**
   * 执行单次滚动
   */
  private async scrollOnce(page: any, containerSelector: string): Promise<{
    success: boolean;
    scrollHeight?: number;
    error?: string;
  }> {
    try {
      const result = await page.evaluate((selector, threshold) => {
        const container = document.querySelector(selector);
        if (!container) {
          return { success: false, error: 'Scroll container not found' };
        }

        const scrollHeight = container.scrollHeight;
        const scrollTop = container.scrollTop || window.pageYOffset;
        const clientHeight = container.clientHeight || window.innerHeight;
        
        // 计算滚动目标位置
        const targetScroll = scrollHeight * threshold;
        
        // 执行滚动
        if (container.scrollTo) {
          container.scrollTo({
            top: targetScroll,
            behavior: 'smooth'
          });
        } else {
          window.scrollTo({
            top: targetScroll,
            behavior: 'smooth'
          });
        }

        return { 
          success: true, 
          scrollHeight,
          currentScroll: scrollTop,
          targetScroll
        };
      }, containerSelector, this.config.scrollThreshold);

      return result;

    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 点击"加载更多"按钮
   */
  private async clickLoadMore(page: any): Promise<boolean> {
    const loadMoreSelectors = [
      '.more_loading',
      '.load_more',
      '[data-e2e="load-more"]',
      '.WB_load_more',
      '.feed_loading .more'
    ];

    for (const selector of loadMoreSelectors) {
      try {
        const button = await page.$(selector);
        if (button) {
          const isVisible = await page.evaluate((el) => {
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && 
                   getComputedStyle(el).display !== 'none' &&
                   getComputedStyle(el).visibility !== 'hidden';
          }, button);
          
          if (isVisible) {
            await button.click();
            this.emit('loadMoreClicked', { selector });
            return true;
          }
        }
      } catch (error) {
        // 继续尝试下一个选择器
      }
    }

    return false;
  }

  /**
   * 查找滚动容器
   */
  private async findScrollContainer(page: any): Promise<string | null> {
    const containers = [
      '.scroll_container',
      '.WB_scroll',
      'main',
      '.WB_main',
      'body'
    ];

    for (const selector of containers) {
      const exists = await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        return el && el.scrollHeight > el.clientHeight;
      }, selector);
      
      if (exists) {
        return selector;
      }
    }

    return null;
  }

  /**
   * 获取项目数量
   */
  private async getItemCount(page: any, itemSelector: string): Promise<number> {
    try {
      return await page.evaluate((selector) => {
        return document.querySelectorAll(selector).length;
      }, itemSelector);
    } catch (error) {
      return 0;
    }
  }

  /**
   * 获取随机延迟时间
   */
  private getRandomDelay(): number {
    const [min, max] = this.config.scrollInterval;
    return Math.random() * (max - min) + min;
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 停止滚动
   */
  stopScroll() {
    this.isScrolling = false;
    this.emit('scrollStopped');
  }

  /**
   * 获取滚动状态
   */
  getStatus() {
    return {
      isScrolling: this.isScrolling,
      scrollCount: this.scrollCount,
      config: this.config
    };
  }
}