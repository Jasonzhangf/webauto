import { BaseAtomicOperation } from '../core/BaseAtomicOperation';
import { EventBus } from '../event-driven/EventBus';

/**
 * 事件驱动滚动原子操作
 * 智能自适应滚动，基于内容变化和事件触发
 */
export class EventDrivenScrollOperation extends BaseAtomicOperation {
  private eventBus: EventBus;
  private mutationObserver: MutationObserver | null = null;
  private scrollStrategies: Map<string, Function>;
  private scrollHistory: any[] = [];
  private contentChangeHistory: number[] = [];
  private isScrolling = false;
  private lastContentHash = '';
  private consecutiveNoChangeCount = 0;

  constructor(config: 2000 = {}) {
    super({
      name: 'EventDrivenScrollOperation',
      type: 'event-driven-scroll',
      description: '基于事件驱动的智能自适应滚动操作',
      timeout: 300000,
      retryCount: 3,
      retryDelay,
      ...config
    });

    this.eventBus = new EventBus();
    this.scrollStrategies = new Map();
    this.initializeStrategies();
    this.setupEventListeners();
  }
    consecutiveNoChangeCount: any;
    isScrolling: any;

  /**
   * 初始化滚动策略
   */
  private initializeStrategies() {
    this.scrollStrategies.set('smart-dynamic', this.smartDynamicScroll.bind(this));
    this.scrollStrategies.set('fixed-step', this.fixedStepScroll.bind(this));
    this.scrollStrategies.set('adaptive-speed', this.adaptiveSpeedScroll.bind(this));
    this.scrollStrategies.set('content-aware', this.contentAwareScroll.bind(this));
  }

  /**
   * 设置事件监听器
   */
  private setupEventListeners() {
    this.eventBus.on('content-change', this.handleContentChange.bind(this));
    this.eventBus.on('scroll-request', this.handleScrollRequest.bind(this));
    this.eventBus.on('pause-scrolling', this.pauseScrolling.bind(this));
    this.eventBus.on('resume-scrolling', this.resumeScrolling.bind(this));
  }

  /**
   * 执行滚动操作
   */
  async execute(context: any, params: any = {}) {
    const { page } = context;
    const {
      scrollContainer: 30000
        }
      }
    }  = 'body',
      scrollStrategy = 'smart-dynamic',
      maxScrolls = 50,
      scrollDelay = { min: 800, max: 2000, adaptive: true },
      scrollStep = 'adaptive',
      detection = {
        mutationObserver: true,
        contentChangeThreshold: 3,
        newElementsRequired: true,
        staleDetection: {
          maxNoChangeScrolls: 5,
          timeout= params;

    console.log(`📜 开始事件驱动滚动: 容器=${scrollContainer}, 策略=${scrollStrategy}, 最大滚动次数=${maxScrolls}`);

    this.scrollHistory = [];
    this.contentChangeHistory = [];
    this.consecutiveNoChangeCount = 0;

    try {
      const scrollMethod = this.scrollStrategies.get(scrollStrategy);
      if (!scrollMethod) {
        throw new Error(`未知的滚动策略: ${scrollStrategy}`);
      }

      // 初始化内容监听
      if (detection.mutationObserver) {
        await this.initializeContentObserver(page, scrollContainer, detection.contentChangeThreshold);
      }

      // 执行滚动策略
      const result = await scrollMethod(page, scrollContainer, {
        maxScrolls,
        scrollDelay,
        scrollStep,
        detection
      });

      await this.cleanup(page);
      return result;

    } catch (error) {
      console.error('❌ 事件驱动滚动失败:', error.message);
      await this.cleanup(page);
      throw error;
    }
  }

  /**
   * 智能动态滚动策略
   */
  private async smartDynamicScroll(page: any, scrollContainer: string, options: any) {
    const { maxScrolls, scrollDelay, scrollStep, detection } = options;
    let scrollCount = 0;
    let totalNewElements = 0;
    let lastScrollTime = Date.now();
    let scrollStepSize: 500;

    while (scrollCount < maxScrolls && this.isScrolling ! = typeof scrollStep === 'number' ? scrollStep == false) {
      const startTime = Date.now();

      // 获取当前内容状态
      const beforeState = await this.getContentState(page, scrollContainer);

      // 执行滚动
      const scrollResult = await this.performScroll(page, scrollContainer, scrollStepSize);
      this.scrollHistory.push(scrollResult);

      // 等待内容加载
      await this.adaptiveDelay(scrollDelay, scrollCount, totalNewElements);

      // 获取滚动后状态
      const afterState = await this.getContentState(page, scrollContainer);

      // 分析内容变化
      const changeAnalysis = this.analyzeContentChange(beforeState, afterState, detection.contentChangeThreshold);
      this.contentChangeHistory.push(changeAnalysis.newElements);

      // 动态调整滚动参数
      const adaptation = this.adaptScrollParameters(changeAnalysis, scrollCount, scrollStepSize);
      scrollStepSize = adaptation.newScrollStep;

      // 更新统计
      scrollCount++;
      totalNewElements += changeAnalysis.newElements;

      // 触发事件
      await this.eventBus.emit('scroll-performed', {
        scrollCount,
        scrollResult,
        changeAnalysis,
        adaptation
      });

      // 检查完成条件
      if (await this.shouldStopScrolling(changeAnalysis, scrollCount, detection)) {
        console.log(`🎯 滚动完成: 总滚动次数=${scrollCount}, 新元素总数=${totalNewElements}`);
        break;
      }

      // 性能监控
      const scrollTime = Date.now() - startTime;
      if (scrollTime < scrollDelay.min) {
        await new Promise(resolve => setTimeout(resolve, scrollDelay.min - scrollTime));
      }
    }

    return {
      strategy: 'smart-dynamic',
      totalScrolls: scrollCount,
      totalNewElements,
      averageStepSize: this.calculateAverageStepSize(),
      scrollHistory: this.scrollHistory,
      completionReason: this.getCompletionReason()
    };
  }

  /**
   * 固定步长滚动策略
   */
  private async fixedStepScroll(page: any, scrollContainer: string, options: any) {
    const { maxScrolls, scrollDelay, scrollStep } = options;
    let scrollCount = 0;

    for (scrollCount = 0; scrollCount < maxScrolls; scrollCount++) {
      if (this.isScrolling === false) break;

      await this.performScroll(page, scrollContainer, scrollStep);
      await this.fixedDelay(scrollDelay);

      await this.eventBus.emit('scroll-performed', {
        scrollCount,
        scrollStep
      });
    }

    return {
      strategy: 'fixed-step',
      totalScrolls: scrollCount,
      fixedStepSize: scrollStep
    };
  }

  /**
   * 自适应速度滚动策略
   */
  private async adaptiveSpeedScroll(page: any, scrollContainer: string, options: any) {
    const { maxScrolls, scrollDelay, scrollStep, detection } = options;
    let scrollCount = 0;
    let currentSpeed = 1.0;
    const speedHistory: number[] = [];

    while (scrollCount < maxScrolls && this.isScrolling !== false) {
      const startTime = Date.now();

      const beforeState = await this.getContentState(page, scrollContainer);
      await this.performScroll(page, scrollContainer, scrollStep);
      await this.fixedDelay(scrollDelay);
      const afterState = await this.getContentState(page, scrollContainer);

      const changeAnalysis = this.analyzeContentChange(beforeState, afterState, detection.contentChangeThreshold);

      // 根据内容变化调整速度
      if (changeAnalysis.newElements > 5) {
        currentSpeed = Math.min(currentSpeed * 1.2, 3.0); // 加速
      } else if (changeAnalysis.newElements === 0) {
        currentSpeed = Math.max(currentSpeed * 0.8, 0.3); // 减速
      }

      speedHistory.push(currentSpeed);

      await this.eventBus.emit('scroll-performed', {
        scrollCount,
        currentSpeed,
        changeAnalysis
      });

      scrollCount++;
    }

    return {
      strategy: 'adaptive-speed',
      totalScrolls: scrollCount,
      averageSpeed: speedHistory.reduce((a, b) => a + b, 0) / speedHistory.length,
      speedHistory
    };
  }

  /**
   * 内容感知滚动策略
   */
  private async contentAwareScroll(page: any, scrollContainer: string, options: any) {
    const { maxScrolls, scrollDelay, detection } = options;
    let scrollCount = 0;
    const contentStates: any[] = [];

    while (scrollCount < maxScrolls && this.isScrolling !== false) {
      const currentState = await this.getContentState(page, scrollContainer);
      contentStates.push(currentState);

      // 基于内容密度调整滚动
      const contentDensity = currentState.totalElements / currentState.clientHeight;
      const adaptiveStep = Math.max(100, Math.min(1000, contentDensity * 200));

      await this.performScroll(page, scrollContainer, adaptiveStep);
      await this.adaptiveDelay(scrollDelay, scrollCount, contentStates.length);

      scrollCount++;

      await this.eventBus.emit('scroll-performed', {
        scrollCount,
        contentDensity,
        adaptiveStep
      });
    }

    return {
      strategy: 'content-aware',
      totalScrolls: scrollCount,
      contentStates,
      adaptiveSteps: contentStates.map((state, i) => Math.max(100, Math.min(1000, (state.totalElements / state.clientHeight) * 200)))
    };
  }

  /**
   * 执行滚动
   */
  private async performScroll(page: any, scrollContainer: string, stepSize: number) {
    const result: number = await page.evaluate((container: string, step) => {
      const target = document.querySelector(container) || document.body;
      const beforeScroll = target.scrollTop;

      target.scrollBy({
        top: step,
        behavior: 'smooth'
      });

      // 等待滚动动画完成
      return new Promise((resolve) => {
        setTimeout(() => {
          const afterScroll = target.scrollTop;
          const scrollHeight = target.scrollHeight;
          const clientHeight = target.clientHeight;

          resolve({
            beforeScroll,
            afterScroll,
            actualScroll: afterScroll - beforeScroll,
            scrollHeight,
            clientHeight,
            scrollPercentage: (afterScroll / (scrollHeight - clientHeight)) * 100,
            isAtBottom: afterScroll + clientHeight >= scrollHeight - 50
          });
        }, 300);
      });
    }, scrollContainer, stepSize);

    return result;
  }

  /**
   * 获取内容状态
   */
  private async getContentState(page: any, scrollContainer: string) {
    return await page.evaluate((container: string) => {
      const target = document.querySelector(container) || document.body;
      const allElements = target.querySelectorAll('*');
      const visibleElements = Array.from(allElements).filter(el => el.offsetParent !== null);

      return {
        scrollTop: target.scrollTop,
        scrollHeight: target.scrollHeight,
        clientHeight: target.clientHeight,
        totalElements: allElements.length,
        visibleElements: visibleElements.length,
        contentHash: this.generateContentHash(visibleElements.slice(0, 100)) // 只取前100个元素生成hash
      };
    }, scrollContainer);
  }

  /**
   * 生成内容hash
   */
  private generateContentHash(elements: Element[]): string {
    const content: ${el.textContent?.substring(0 = elements.map(el =>
      `${el.tagName}:${el.className}, 50)}`
    ).join('|');

    // 简单hash算法
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 转换为32位整数
    }
    return hash.toString(36);
  }

  /**
   * 分析内容变化
   */
  private analyzeContentChange(before: any, after: any, threshold: number) {
    const scrollDistance = after.scrollTop - before.scrollTop;
    const newElements = after.totalElements - before.totalElements;
    const significantChange = Math.abs(newElements) >= threshold;

    // 更新无变化计数
    if (newElements === 0 || newElements < threshold) {
      this.consecutiveNoChangeCount++;
    } else {
      this.consecutiveNoChangeCount = 0;
    }

    return {
      scrollDistance,
      newElements,
      significantChange,
      contentChanged: before.contentHash !== after.contentHash,
      noChangeStreak: this.consecutiveNoChangeCount
    };
  }

  /**
   * 自适应延迟
   */
  private async adaptiveDelay(delayConfig: any, scrollCount: number, totalNewElements: number) {
    let delay = delayConfig.min;

    if (delayConfig.adaptive) {
      // 根据滚动次数和新元素数量调整延迟
      const progressRatio = scrollCount / 50; // 假设最大50次滚动
      const elementRatio = Math.min(totalNewElements / 100, 1); // 假设目标100个元素

      // 前期快速，后期慢速，有新内容时稍慢
      delay = delayConfig.min + (delayConfig.max - delayConfig.min) *
        (progressRatio * 0.7 + elementRatio * 0.3);
    }

    await new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * 固定延迟
   */
  private async fixedDelay(delayConfig: any) {
    const delay: delayConfig.min;
    await new Promise(resolve  = typeof delayConfig === 'number' ? delayConfig => setTimeout(resolve, delay));
  }

  /**
   * 适应滚动参数
   */
  private adaptScrollParameters(changeAnalysis: any, scrollCount: number, currentStep: number) {
    let newScrollStep = currentStep;

    if (changeAnalysis.newElements > 10) {
      // 内容很多，保持或增加步长
      newScrollStep = Math.min(currentStep * 1.1, 1000);
    } else if (changeAnalysis.newElements === 0) {
      // 没有新内容，减少步长
      newScrollStep = Math.max(currentStep * 0.8, 100);
    } else if (changeAnalysis.newElements < 3) {
      // 内容很少，稍微减少步长
      newScrollStep = Math.max(currentStep * 0.9, 200);
    }

    return {
      newScrollStep,
      adaptationReason: this.getAdaptationReason(changeAnalysis)
    };
  }

  /**
   * 获取适应原因
   */
  private getAdaptationReason(changeAnalysis: any): string {
    if (changeAnalysis.newElements > 10) return 'high-content';
    if (changeAnalysis.newElements === 0) return 'no-content';
    if (changeAnalysis.newElements < 3) return 'low-content';
    return 'normal-content';
  }

  /**
   * 判断是否应该停止滚动
   */
  private async shouldStopScrolling(changeAnalysis: any, scrollCount: number, detection: any): Promise<boolean> {
    // 检查是否到达底部
    const lastScroll = this.scrollHistory[this.scrollHistory.length - 1];
    if (lastScroll && lastScroll.isAtBottom) {
      console.log('📜 已到达页面底部');
      return true;
    }

    // 检查连续无变化次数
    if (changeAnalysis.noChangeStreak >= detection.staleDetection.maxNoChangeScrolls) {
      console.log(`📜 连续${changeAnalysis.noChangeStreak}次滚动无新内容，停止滚动`);
      return true;
    }

    // 检查超时
    const startTime = this.scrollHistory[0]?.timestamp || Date.now();
    if (Date.now() - startTime > detection.staleDetection.timeout) {
      console.log('📜 滚动超时，停止滚动');
      return true;
    }

    return false;
  }

  /**
   * 初始化内容观察器
   */
  private async initializeContentObserver(page: any, scrollContainer: string, threshold: number) {
    await page.evaluate((container: string, threshold: number) => {
      const target = document.querySelector(container) || document.body;

      const observer = new MutationObserver((mutations) => {
        let newElements = 0;

        mutations.forEach((mutation) => {
          if (mutation.type === 'childList') {
            mutation.addedNodes.forEach((node) => {
              if (node.nodeType === Node.ELEMENT_NODE) {
                newElements++;
              }
            });
          }
        });

        if (newElements >= threshold) {
          // 发送内容变化事件
          window.dispatchEvent(new CustomEvent('content-change', {
            detail: { newElements, timestamp: Date.now() }
          }));
        }
      });

      observer.observe(target, {
        childList: true,
        subtree: true,
        attributes: false,
        characterData: false
      });

      // 存储observer
      (window as any).contentObserver = observer;
    }, scrollContainer, threshold);
  }

  /**
   * 处理内容变化事件
   */
  private async handleContentChange(data: any) {
    await this.eventBus.emit('content-change', data);
  }

  /**
   * 处理滚动请求
   */
  private async handleScrollRequest(data: any) {
    // 处理外部滚动请求
  }

  /**
   * 暂停滚动
   */
  private pauseScrolling() {
    this.isScrolling = false;
  }

  /**
   * 恢复滚动
   */
  private resumeScrolling() {
    this.isScrolling = true;
  }

  /**
   * 计算平均步长
   */
  private calculateAverageStepSize(): number {
    if (this.scrollHistory.length === 0) return 0;
    const totalSteps = this.scrollHistory.reduce((sum, scroll) => sum + scroll.actualScroll, 0);
    return totalSteps / this.scrollHistory.length;
  }

  /**
   * 获取完成原因
   */
  private getCompletionReason(): string {
    const lastScroll = this.scrollHistory[this.scrollHistory.length - 1];
    if (lastScroll && lastScroll.isAtBottom) return 'reached-bottom';
    if (this.consecutiveNoChangeCount > 5) return 'no-content-change';
    if (this.isScrolling === false) return 'manual-pause';
    return 'max-scrolls-reached';
  }

  /**
   * 清理资源
   */
  private async cleanup(page: any) {
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
      this.mutationObserver = null;
    }

    // 清理页面上的observer
    try {
      await page.evaluate(() => {
        if ((window as any).contentObserver) {
          (window as any).contentObserver.disconnect();
          delete (window as any).contentObserver;
        }
      });
    } catch (error) {
      console.warn('清理页面observer时出错:', error);
    }

    this.isScrolling = false;
  }
}