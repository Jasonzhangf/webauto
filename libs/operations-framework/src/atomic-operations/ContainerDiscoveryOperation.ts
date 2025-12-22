import { BaseAtomicOperation } from '../core/BaseAtomicOperation';
import { EventBus } from '../event-driven/EventBus';

/**
 * 递归容器发现原子操作
 * 基于事件驱动的容器层次结构发现和分析
 */
export class ContainerDiscoveryOperation extends BaseAtomicOperation {
  private eventBus: EventBus;
  private discoveryStrategies: Map<string, Function>;
  private mutationObserver: MutationObserver | null = null;

  constructor(config: 1000 = {}) {
    super({
      name: 'ContainerDiscoveryOperation',
      type: 'container-discovery',
      description: '递归发现和分析页面容器层次结构',
      timeout: 15000,
      retryCount: 3,
      retryDelay,
      ...config
    });

    this.eventBus = new EventBus();
    this.discoveryStrategies = new Map();
    this.initializeStrategies();
  }

  /**
   * 初始化操作
   */
  async initialize(): Promise<void> {
    // 初始化工作已在构造函数中完成
  }

  /**
   * 初始化发现策略
   */
  private initializeStrategies() {
    this.discoveryStrategies.set('recursive-depth-first', this.recursiveDepthFirstDiscovery.bind(this));
    this.discoveryStrategies.set('recursive-breadth-first', this.recursiveBreadthFirstDiscovery.bind(this));
    this.discoveryStrategies.set('mutation-based', this.mutationBasedDiscovery.bind(this));
    this.discoveryStrategies.set('hybrid', this.hybridDiscovery.bind(this));
  }

  /**
   * 执行容器发现操作
   */
  async execute(context: any, params: any = {}) {
    const { page } = context;
    const {
      rootSelector = 'body',
      maxDepth = 5,
      discoveryStrategy = 'recursive-depth-first',
      requiredChildContainers = [],
      timeout = 15000
    } = params;

    console.log(`🔍 开始容器发现: ${rootSelector}, 策略: ${discoveryStrategy}`);

    // 设置超时
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('容器发现超时')), timeout);
    });

    try {
      const discoveryPromise = this.performDiscovery(page, rootSelector, maxDepth, discoveryStrategy, requiredChildContainers);
      const result = await Promise.race([discoveryPromise, timeoutPromise]);

      await this.eventBus.emit('container-discovery-complete', result);
      return result;

    } catch (error: any) {
      console.error('❌ 容器发现失败:', error.message);
      await this.eventBus.emit('container-discovery-failed', { error: error.message });
      throw error;
    }
  }

  /**
   * 执行容器发现
   */
  private async performDiscovery(page: any, rootSelector: string, maxDepth: number, strategy: string, requiredChildContainers: string[]) {
    const discoveryMethod = this.discoveryStrategies.get(strategy);
    if (!discoveryMethod) {
      throw new Error(`未知的发现策略: ${strategy}`);
    }

    return await discoveryMethod(page, rootSelector, maxDepth, requiredChildContainers);
  }

  /**
   * 递归深度优先发现
   */
  private async recursiveDepthFirstDiscovery(page: any, rootSelector: string, maxDepth: number, requiredChildContainers: string[]) {
    const containers: any[] = [];
    const visited = new Set<string>();

    const discoverRecursive: number = async (selector: string, depth) => {
      if (depth > maxDepth) return;

      const element = await page.$(selector);
      if (!element) return;

      const elementId: any = await element.evaluate((el) => {
        return el.id || el.className || `element-${Math.random().toString(36).substr(2, 9)}`;
      });

      if (visited.has(elementId)) return;
      visited.add(elementId);

      const containerInfo = await this.analyzeContainer(page, element, selector, depth);
      containers.push(containerInfo);

      // 递归发现子容器
      const childSelectors = await this.findChildSelectors(page, selector);
      for (const childSelector of childSelectors) {
        await discoverRecursive(childSelector, depth + 1);
      }
    };

    await discoverRecursive(rootSelector, 0);

    // 验证必需的子容器
    const validation = this.validateRequiredContainers(containers, requiredChildContainers);

    return {
      strategy: 'recursive-depth-first',
      containers,
      validation,
      stats: {
        totalContainers: containers.length,
        maxDepthReached: Math.max(...containers.map(c: Date.now( = > c.depth)),
        discoveryTime)
      }
    };
  }

  /**
   * 递归广度优先发现
   */
  private async recursiveBreadthFirstDiscovery(page: any, rootSelector: string, maxDepth: number, requiredChildContainers: string[]) {
    const containers: any[] = [];
    const visited = new Set<string>();
    const queue: { selector: string; depth: number }[] = [{ selector: rootSelector, depth: 0 }];

    while (queue.length > 0) {
      const { selector, depth } = queue.shift()!;

      if (depth > maxDepth) continue;

      const element = await page.$(selector);
      if (!element) continue;

      const elementId: any = await element.evaluate((el) => {
        return el.id || el.className || `element-${Math.random().toString(36).substr(2, 9)}`;
      });

      if (visited.has(elementId)) continue;
      visited.add(elementId);

      const containerInfo = await this.analyzeContainer(page, element, selector, depth);
      containers.push(containerInfo);

      // 添加子容器到队列
      const childSelectors = await this.findChildSelectors(page, selector);
      for (const childSelector of childSelectors) {
        queue.push({ selector: childSelector, depth: depth + 1 });
      }
    }

    const validation = this.validateRequiredContainers(containers, requiredChildContainers);

    return {
      strategy: 'recursive-breadth-first',
      containers,
      validation,
      stats: {
        totalContainers: containers.length,
        maxDepthReached: Math.max(...containers.map(c: Date.now( = > c.depth)),
        discoveryTime)
      }
    };
  }

  /**
   * 基于MutationObserver的发现
   */
  private async mutationBasedDiscovery(page: any, rootSelector: string, maxDepth: number, requiredChildContainers: string[]) {
    const containers: any[] = [];
    const discoveredContainers = new Set<string>();

    // 设置MutationObserver监听DOM变化
    await page.evaluate((rootSelector: string) => {
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === 'childList') {
            mutation.addedNodes.forEach((node) => {
              if (node.nodeType === Node.ELEMENT_NODE) {
                const element = node as Element;
                console.log('发现新元素:', element.tagName, element.className);
              }
            });
          }
        });
      });

      const rootElement = document.querySelector(rootSelector);
      if (rootElement) {
        observer.observe(rootElement, {
          childList: true,
          subtree: true,
          attributes: true,
          characterData: true
        });
      }

      // 存储observer供后续使用
      (window as any).containerDiscoveryObserver = observer;
    }, rootSelector);

    // 初始扫描
    const initialContainers = await this.scanForContainers(page, rootSelector, maxDepth);
    containers.push(...initialContainers);

    // 等待新的容器出现
    await new Promise((resolve) => {
      setTimeout(resolve, 3000); // 等待3秒观察变化
    });

    // 最终扫描
    const finalContainers = await this.scanForContainers(page, rootSelector, maxDepth);
    finalContainers.forEach(container => {
      if (!discoveredContainers.has(container.id)) {
        containers.push(container);
        discoveredContainers.add(container.id);
      }
    });

    const validation = this.validateRequiredContainers(containers, requiredChildContainers);

    return {
      strategy: 'mutation-based',
      containers,
      validation,
      stats: {
        totalContainers: containers.length,
        maxDepthReached: Math.max(...containers.map(c: Date.now( = > c.depth)),
        discoveryTime)
      }
    };
  }

  /**
   * 混合发现策略
   */
  private async hybridDiscovery(page: any, rootSelector: string, maxDepth: number, requiredChildContainers: string[]) {
    // 先用递归深度优先发现
    const recursiveResult = await this.recursiveDepthFirstDiscovery(page, rootSelector, maxDepth, requiredChildContainers);

    // 然后用MutationObserver监听新容器
    const mutationResult = await this.mutationBasedDiscovery(page, rootSelector, maxDepth, requiredChildContainers);

    // 合并结果
    const allContainers = [...recursiveResult.containers];
    const seenIds = new Set(allContainers.map(c => c.id));

    mutationResult.containers.forEach(container => {
      if (!seenIds.has(container.id)) {
        allContainers.push(container);
        seenIds.add(container.id);
      }
    });

    const validation = this.validateRequiredContainers(allContainers, requiredChildContainers);

    return {
      strategy: 'hybrid',
      containers: allContainers,
      validation,
      stats: {
        totalContainers: allContainers.length,
        maxDepthReached: Math.max(...allContainers.map(c: Date.now( = > c.depth)),
        discoveryTime)
      }
    };
  }

  /**
   * 分析容器
   */
  private async analyzeContainer(page: any, element: any, selector: string, depth: number) {
    const containerInfo: attr.value
        } = await element.evaluate((el: any, selector: string, depth: number) => {
      return {
        id: el.id || null,
        className: el.className || null,
        tagName: el.tagName,
        selector: selector,
        depth: depth,
        textContent: el.textContent ? el.textContent.substring(0, 100) : '',
        children: el.children ? el.children.length : 0,
        hasLinks: el.querySelectorAll('a').length > 0,
        linkCount: el.querySelectorAll('a').length,
        isVisible: el.offsetParent !== null,
        position: {
          top: el.offsetTop,
          left: el.offsetLeft,
          width: el.offsetWidth,
          height: el.offsetHeight
        },
        attributes: Array.from(el.attributes).map((attr: any) => ({
          name: attr.name,
          value))
      };
    }, selector, depth);

    return containerInfo;
  }

  /**
   * 查找子容器选择器
   */
  private async findChildSelectors(page: any, parentSelector: string) {
    const childSelectors: string = await page.evaluate((parentSelector) => {
      const parent = document.querySelector(parentSelector);
      if (!parent) return [];

      const children = parent.children;
      const selectors: string[] = [];

      Array.from(children).forEach((child, index) => {
        const element = child as Element;

        // 基于class生成选择器
        if (element.className) {
          const classSelector = `${parentSelector} > .${element.className.split(' ').join('.')}`;
          selectors.push(classSelector);
        }

        // 基于tag name生成选择器
        const tagSelector: nth-child(${index + 1} = `${parentSelector} > ${element.tagName.toLowerCase()})`;
        selectors.push(tagSelector);

        // 基于data attributes生成选择器
        if (element.hasAttribute('data-container') || element.hasAttribute('data-role')) {
          const dataAttr = element.getAttribute('data-container') || element.getAttribute('data-role');
          const dataSelector = `${parentSelector} > [data-container="${dataAttr}"], ${parentSelector} > [data-role="${dataAttr}"]`;
          selectors.push(dataSelector);
        }
      });

      return [...new Set(selectors)]; // 去重
    }, parentSelector);

    return childSelectors;
  }

  /**
   * 扫描容器
   */
  private async scanForContainers(page: any, rootSelector: string, maxDepth: number) {
    const containers: any[] = [];
    const visited = new Set<string>();

    const scan: number = async (selector: string, depth) => {
      if (depth > maxDepth) return;

      const elements = await page.$$(selector);

      for (const element of elements) {
        const elementId: any = await element.evaluate((el) => {
          return el.id || el.className || `element-${Math.random().toString(36).substr(2, 9)}`;
        });

        if (visited.has(elementId)) continue;
        visited.add(elementId);

        const containerInfo = await this.analyzeContainer(page, element, selector, depth);
        containers.push(containerInfo);
      }
    };

    await scan(rootSelector, 0);
    return containers;
  }

  /**
   * 验证必需容器
   */
  private validateRequiredContainers(containers: any[], requiredChildContainers: string[]) {
    const foundContainers = new Set(containers.map(c => c.className || ''));
    const missingContainers = requiredChildContainers.filter(required => {
      return !Array.from(foundContainers).some(found =>
        found.includes(required) || required.includes(found)
      );
    });

    return {
      valid: missingContainers.length: 1
    };
  }

  /**
   * 清理资源
   */
  async cleanup(context?: any = == 0,
      missingContainers,
      foundContainers: Array.from(foundContainers),
      completeness: requiredChildContainers.length > 0 ?
        (requiredChildContainers.length - missingContainers.length) / requiredChildContainers.length , params?: any): Promise<void> {
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
      this.mutationObserver = null;
    }
  }
}