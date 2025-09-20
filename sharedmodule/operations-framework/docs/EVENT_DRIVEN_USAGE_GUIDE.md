# 事件驱动容器系统使用指南

## 📋 快速开始

### 1. 系统初始化

```typescript
import {
  EventBus,
  WorkflowEngine,
  EventDrivenPageContainer,
  EventDrivenLinkContainer,
  EventDrivenScrollContainer,
  EventDrivenPaginationContainer
} from '../src/event-driven';

// 创建事件总线
const eventBus = new EventBus({
  enableHistory: true,
  maxHistorySize: 1000
});

// 创建工作流引擎
const workflowEngine = new WorkflowEngine(eventBus);

// 创建共享空间
const sharedSpace: ContainerSharedSpace = {
  eventBus,
  page: browserPage,
  dataStore: new Map(),
  fileHandler: fileHandler,
  config: {},
  monitoring: {}
};
```

### 2. 创建微博链接获取容器

```typescript
async function createWeiboLinkExtractionSystem(): Promise<EventDrivenPageContainer> {
  // 创建页面容器
  const pageContainer = new EventDrivenPageContainer({
    id: 'weibo_page',
    name: 'Weibo Link Extraction System',
    selector: '.feed-container',
    pageType: 'homepage',
    enableAutoNavigation: true,
    enableErrorRecovery: true,
    containerConfigs: {
      linkContainer: {
        id: 'weibo_links',
        name: 'Weibo Link Container',
        selector: '.feed-container',
        maxLinks: 200,
        linkPatterns: [
          '.*weibo\\.com.*',
          '.*m\\.weibo\\.cn.*'
        ],
        excludePatterns: [
          '.*javascript.*',
          '.*#.*'
        ],
        enableAutoScroll: true,
        deduplicationStrategy: 'both',
        validationEnabled: true
      },
      scrollContainer: {
        id: 'weibo_scroll',
        name: 'Weibo Scroll Container',
        selector: '.feed-container',
        scrollStrategy: 'smart',
        maxScrollAttempts: 50,
        scrollStep: 2,
        scrollDelay: 2000,
        stopConditions: {
          maxScrollHeight: 100000,
          maxScrollTime: 600000,
          noNewContentCount: 5,
          reachBottom: true
        }
      },
      paginationContainer: {
        id: 'weibo_pagination',
        name: 'Weibo Pagination Container',
        selector: '.pagination-container',
        paginationMode: 'button',
        maxPages: 20,
        pageDelay: 3000,
        pageSelectors: {
          nextButton: '.next, .page-next, [class*="next"]',
          currentPageIndicator: '.current, .active, [class*="current"]'
        },
        stopConditions: {
          noNewContentPages: 3,
          reachLastPage: true,
          maxPageNumber: 20
        }
      }
    }
  });

  return pageContainer;
}
```

### 3. 配置工作流规则

```typescript
function setupWeiboWorkflowRules(workflowEngine: WorkflowEngine): void {
  // 规则1: 页面初始化后开始滚动
  workflowEngine.addRule({
    id: 'auto_start_scroll',
    name: '自动开始滚动',
    description: '页面初始化完成后自动开始滚动',
    trigger: {
      event: 'container:initialized',
      conditions: [
        {
          type: 'container_id',
          operator: 'equals',
          value: 'weibo_page'
        }
      ]
    },
    actions: [
      {
        type: 'start',
        target: 'weibo_scroll',
        delay: 2000
      }
    ],
    priority: 1,
    enabled: true
  });

  // 规则2: 滚动到底部后提取链接
  workflowEngine.addRule({
    id: 'scroll_bottom_extract_links',
    name: '滚动到底部提取链接',
    description: '滚动到底部后触发链接提取',
    trigger: {
      event: 'scroll:bottom_reached',
      conditions: [
        {
          type: 'container_id',
          operator: 'equals',
          value: 'weibo_scroll'
        }
      ]
    },
    actions: [
      {
        type: 'emit',
        event: 'links:extract',
        data: { force: true }
      }
    ],
    priority: 2,
    enabled: true
  });

  // 规则3: 内容变化时自动提取链接
  workflowEngine.addRule({
    id: 'content_change_extract_links',
    name: '内容变化提取链接',
    description: '检测到新内容时自动提取链接',
    trigger: {
      event: 'content:mutation_detected',
      conditions: [
        {
          type: 'container_id',
          operator: 'equals',
          value: 'weibo_page'
        }
      ]
    },
    actions: [
      {
        type: 'emit',
        event: 'links:extract'
      }
    ],
    priority: 3,
    enabled: true
  });

  // 规则4: 达到目标链接数后停止
  workflowEngine.addRule({
    id: 'target_links_reached',
    name: '达到目标链接数',
    description: '获取到足够链接后停止处理',
    trigger: {
      event: 'links:target_reached',
      conditions: [
        {
          type: 'actual_count',
          operator: 'gte',
          value: 150
        }
      ]
    },
    actions: [
      {
        type: 'stop',
        target: 'weibo_scroll'
      },
      {
        type: 'stop',
        target: 'weibo_pagination'
      },
      {
        type: 'emit',
        event: 'workflow:completed',
        data: { reason: 'target_links_reached' }
      }
    ],
    priority: 4,
    enabled: true
  });

  // 规则5: 无新内容时尝试分页
  workflowEngine.addRule({
    id: 'no_new_content_pagination',
    name: '无新内容时分页',
    description: '连续无新内容时尝试分页',
    trigger: {
      event: 'scroll:no_new_content',
      conditions: [
        {
          type: 'consecutive_count',
          operator: 'gte',
          value: 3
        }
      ]
    },
    actions: [
      {
        type: 'start',
        target: 'weibo_pagination',
        delay: 2000
      }
    ],
    priority: 5,
    enabled: true
  });
}
```

### 4. 完整的使用示例

```typescript
import { chromium } from 'playwright';

async function main() {
  // 启动浏览器
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  // 设置用户代理
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('https://weibo.com');

  // 创建系统
  const eventBus = new EventBus();
  const workflowEngine = new WorkflowEngine(eventBus);

  const pageContainer = await createWeiboLinkExtractionSystem();
  setupWeiboWorkflowRules(workflowEngine);

  // 初始化
  await pageContainer.initialize({
    eventBus,
    page,
    dataStore: new Map(),
    fileHandler: null,
    config: {},
    monitoring: {}
  });

  // 设置事件监听器
  setupEventListeners(pageContainer);

  // 启动系统
  await pageContainer.start();

  // 等待完成
  await new Promise((resolve) => {
    pageContainer.once('workflow:completed', (data) => {
      console.log('工作流完成:', data.reason);
      resolve(data);
    });
  });

  // 获取结果
  const result = pageContainer.getExecutionResult();
  console.log('提取到的链接总数:', result.childContainers.links.totalCount);

  // 清理
  await pageContainer.destroy();
  await browser.close();
}

function setupEventListeners(container: EventDrivenPageContainer): void {
  // 监听链接发现
  container.on('links:batch_discovered', (data) => {
    console.log(`发现 ${data.newLinks} 个新链接，总计 ${data.totalCount} 个`);
  });

  // 监听滚动进度
  container.on('scroll:progress', (data) => {
    console.log(`滚动进度: ${data.scrollCount} 次，高度: ${data.scrollHeight}px`);
  });

  // 监听错误
  container.on('container:state:error', (data) => {
    console.error(`容器错误: ${data.error}`);
  });

  // 监听工作流事件
  container.on('workflow:condition_met', (data) => {
    console.log(`工作流条件满足: ${data.ruleName}`);
  });
}

// 执行
main().catch(console.error);
```

## 🔧 高级配置

### 1. 自定义中间件

```typescript
// 创建日志中间件
const loggingMiddleware: EventMiddleware = {
  name: 'logging',
  async handle(event: string, data: any, next: NextFunction) {
    console.log(`[Event] ${event}:`, data);
    await next();
  }
};

// 创建性能监控中间件
const performanceMiddleware: EventMiddleware = {
  name: 'performance',
  async handle(event: string, data: any, next: NextFunction) {
    const start = Date.now();
    await next();
    const duration = Date.now() - start;
    if (duration > 100) {
      console.warn(`[Slow Event] ${event} took ${duration}ms`);
    }
  }
};

// 创建重试中间件
const retryMiddleware: EventMiddleware = {
  name: 'retry',
  async handle(event: string, data: any, next: NextFunction) {
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      try {
        await next();
        return;
      } catch (error) {
        attempts++;
        if (attempts === maxAttempts) {
          throw error;
        }
        await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
      }
    }
  }
};

// 添加中间件
eventBus.addMiddleware(loggingMiddleware);
eventBus.addMiddleware(performanceMiddleware);
eventBus.addMiddleware(retryMiddleware);
```

### 2. 自定义事件处理器

```typescript
// 创建自定义事件处理器
function createAdvancedLinkProcessor() {
  const linkStats = {
    totalLinks: 0,
    uniqueDomains: new Set<string>(),
    qualityScore: 0
  };

  return {
    // 处理链接发现事件
    async handleLinksDiscovered(data: any) {
      linkStats.totalLinks += data.links.length;

      // 统计域名
      data.links.forEach((link: any) => {
        try {
          const domain = new URL(link.href).hostname;
          linkStats.uniqueDomains.add(domain);
        } catch (error) {
          // 忽略无效URL
        }
      });

      // 计算质量分数
      const avgQuality = data.links.reduce((sum: number, link: any) =>
        sum + (link.quality || 0), 0) / data.links.length;
      linkStats.qualityScore = avgQuality;

      console.log(`链接统计: 总数=${linkStats.totalLinks}, 域名数=${linkStats.uniqueDomains.size}, 质量=${linkStats.qualityScore.toFixed(2)}`);
    },

    // 处理滚动完成事件
    async handleScrollCompleted(data: any) {
      console.log(`滚动完成: 总高度=${data.totalScrollHeight}px, 用时=${data.executionTime}ms`);

      // 生成报告
      const report = {
        timestamp: new Date().toISOString(),
        linkStats: { ...linkStats, uniqueDomains: Array.from(linkStats.uniqueDomains) },
        scrollMetrics: data
      };

      // 保存报告
      await saveReport(report);
    }
  };
}

async function saveReport(report: any) {
  // 实现报告保存逻辑
  const fs = require('fs');
  const path = `./reports/report-${Date.now()}.json`;
  fs.writeFileSync(path, JSON.stringify(report, null, 2));
  console.log(`报告已保存: ${path}`);
}
```

### 3. 动态规则管理

```typescript
// 动态添加规则
async function addDynamicRules(workflowEngine: WorkflowEngine, conditions: any) {
  // 根据条件动态创建规则
  if (conditions.enableAdaptiveScrolling) {
    workflowEngine.addRule({
      id: 'adaptive_scrolling',
      name: '自适应滚动',
      description: '根据内容加载情况调整滚动速度',
      trigger: {
        event: 'scroll:progress'
      },
      actions: [
        {
          type: 'adjust',
          target: 'scroll_speed',
          value: (data: any) => data.newContentFound ? 1000 : 3000
        }
      ],
      priority: 10,
      enabled: true
    });
  }

  if (conditions.enableSmartFiltering) {
    workflowEngine.addRule({
      id: 'smart_link_filtering',
      name: '智能链接过滤',
      description: '基于历史数据智能过滤链接',
      trigger: {
        event: 'links:discovered'
      },
      actions: [
        {
          type: 'filter',
          target: 'links',
          condition: (links: any[]) => {
            return links.filter(link => {
              // 实现智能过滤逻辑
              return link.quality > 0.5 &&
                     !link.href.includes('ad') &&
                     !link.href.includes('spam');
            });
          }
        }
      ],
      priority: 11,
      enabled: true
    });
  }
}

// 动态禁用/启用规则
function toggleRule(workflowEngine: WorkflowEngine, ruleId: string, enabled: boolean) {
  const rule = workflowEngine.getRule(ruleId);
  if (rule) {
    rule.enabled = enabled;
    console.log(`规则 ${ruleId} 已${enabled ? '启用' : '禁用'}`);
  }
}

// 动态修改规则优先级
function updateRulePriority(workflowEngine: WorkflowEngine, ruleId: string, priority: number) {
  const rule = workflowEngine.getRule(ruleId);
  if (rule) {
    rule.priority = priority;
    console.log(`规则 ${ruleId} 优先级已更新为 ${priority}`);
  }
}
```

### 4. 监控和调试

```typescript
// 创建监控器
class SystemMonitor {
  private metrics = {
    eventsProcessed: 0,
    errorsCount: 0,
    averageProcessingTime: 0,
    containerStates: new Map<string, string>()
  };

  constructor(private eventBus: EventBus) {
    this.setupMonitoring();
  }

  private setupMonitoring(): void {
    // 监听所有事件
    this.eventBus.on('*', (event, data, source) => {
      this.metrics.eventsProcessed++;
      this.updateProcessingTime();
    });

    // 监听错误事件
    this.eventBus.on('container:state:error', (data) => {
      this.metrics.errorsCount++;
      this.logError(data);
    });

    // 监听容器状态变化
    this.eventBus.on('container:state:changed', (data) => {
      this.metrics.containerStates.set(data.containerId, data.toState);
    });
  }

  private updateProcessingTime(): void {
    // 实现处理时间统计
  }

  private logError(data: any): void {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      containerId: data.containerId,
      error: data.error,
      stack: data.stack
    };

    console.error(`[ERROR] ${timestamp}:`, logEntry);
  }

  getMetrics() {
    return {
      ...this.metrics,
      containerStates: Object.fromEntries(this.metrics.containerStates)
    };
  }

  generateReport() {
    const metrics = this.getMetrics();
    return {
      timestamp: new Date().toISOString(),
      summary: {
        totalEvents: metrics.eventsProcessed,
        totalErrors: metrics.errorsCount,
        errorRate: metrics.errorsCount / Math.max(1, metrics.eventsProcessed),
        activeContainers: Object.keys(metrics.containerStates).length
      },
      details: metrics
    };
  }
}

// 使用监控器
const monitor = new SystemMonitor(eventBus);

// 定期生成报告
setInterval(() => {
  const report = monitor.generateReport();
  console.log('系统报告:', JSON.stringify(report.summary, null, 2));
}, 30000);
```

## 🚀 实际应用场景

### 1. 微博数据采集

```typescript
async function scrapeWeiboData() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  // 创建专门针对微博的系统
  const system = new EventDrivenPageContainer({
    id: 'weibo_scraper',
    name: 'Weibo Data Scraper',
    selector: '.feed-container',
    containerConfigs: {
      linkContainer: {
        id: 'weibo_post_links',
        name: 'Weibo Post Links',
        selector: '.Feed_body',
        linkPatterns: ['.*weibo\\.com\\/\\d+.*'],
        maxLinks: 500,
        metadataExtraction: true
      },
      scrollContainer: {
        id: 'weibo_infinite_scroll',
        name: 'Weibo Infinite Scroll',
        selector: '.feed-container',
        scrollStrategy: 'smart',
        scrollStep: 3,
        scrollDelay: 1500
      }
    }
  });

  // 设置微博专用规则
  setupWeiboSpecificRules(workflowEngine);

  await system.initialize({ eventBus, page, dataStore: new Map() });
  await system.start();

  // 监听进度
  system.on('links:target_reached', (data) => {
    console.log(`已获取 ${data.actualCount} 条微博链接`);
  });

  // 等待完成
  await new Promise(resolve => {
    system.once('workflow:completed', resolve);
  });

  const result = system.getExecutionResult();
  console.log('采集完成:', result.childContainers.links.totalCount);

  await browser.close();
}
```

### 2. 电商产品监控

```typescript
async function monitorEcommerceProducts() {
  const system = new EventDrivenPageContainer({
    id: 'ecommerce_monitor',
    name: 'E-commerce Product Monitor',
    selector: '.product-list',
    containerConfigs: {
      linkContainer: {
        id: 'product_links',
        name: 'Product Links',
        selector: '.product-item',
        linkPatterns: ['.*product.*', '.*item.*'],
        maxLinks: 1000,
        validationEnabled: true
      },
      paginationContainer: {
        id: 'product_pagination',
        name: 'Product Pagination',
        selector: '.pagination',
        paginationMode: 'button',
        maxPages: 100
      }
    }
  });

  // 设置价格监控规则
  setupPriceMonitoringRules(workflowEngine);

  await system.initialize({ eventBus, page, dataStore: new Map() });
  await system.start();

  return system;
}
```

## 🛠️ 故障排除

### 1. 常见问题

**问题1: 容器不启动**
```typescript
// 检查容器状态
const state = container.getState();
console.log('容器状态:', state.status);

// 检查错误计数
if (state.errorCount > 0) {
  console.error('容器有错误:', state.errorCount);
}
```

**问题2: 事件丢失**
```typescript
// 检查事件总线状态
const history = eventBus.getEventHistory();
console.log('事件历史:', history.length);

// 检查事件处理器
const handlers = eventBus.getHandlers('links:discovered');
console.log('链接发现处理器数量:', handlers.length);
```

**问题3: 规则不触发**
```typescript
// 检查规则状态
const rules = workflowEngine.getAllRules();
rules.forEach(rule => {
  console.log(`规则 ${rule.id}: 启用=${rule.enabled}, 优先级=${rule.priority}`);
});

// 检查条件匹配
const matchingRules = workflowEngine.findMatchingRules('scroll:bottom_reached');
console.log('匹配的规则:', matchingRules.length);
```

### 2. 调试技巧

```typescript
// 启用详细日志
eventBus.setLogLevel('debug');

// 添加调试中间件
eventBus.addMiddleware({
  name: 'debug',
  async handle(event, data, next) {
    console.log(`[DEBUG] Event: ${event}, Data:`, data);
    await next();
  }
});

// 监听所有事件
eventBus.on('*', (event, data, source) => {
  console.log(`[${source}] ${event}:`, data);
});
```

---

*这个使用指南提供了事件驱动容器系统的完整使用方法，从基础配置到高级应用，帮助你快速上手并充分利用系统的强大功能。*