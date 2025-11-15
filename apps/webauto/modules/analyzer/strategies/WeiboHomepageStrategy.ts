import { ContainerDiscoveryManager } from '../core/ContainerDiscoveryManager';
import { HierarchyBuilder } from '../core/HierarchyBuilder';
import { CapabilityEvaluator } from '../core/CapabilityEvaluator';
import { 
  ContainerType, 
  DiscoveryStrategy, 
  SelectorConfig,
  ContainerHierarchy 
} from '../types';

/**
 * 微博主页发现策略
 * 实现微博主页的容器发现和层次结构构建
 */
export class WeiboHomepageStrategy implements DiscoveryStrategy {
  private discoveryManager: ContainerDiscoveryManager;
  private hierarchyBuilder: HierarchyBuilder;
  private capabilityEvaluator: CapabilityEvaluator;

  constructor() {
    this.discoveryManager = new ContainerDiscoveryManager();
    this.hierarchyBuilder = new HierarchyBuilder();
    this.capabilityEvaluator = new CapabilityEvaluator();
  }

  /**
   * 微博主页选择器配置
   */
  private getSelectors(): SelectorConfig {
    return {
      root: 'body',
      containers: [
        {
          type: ContainerType.PAGE,
          selector: 'body',
          name: 'weibo-homepage',
          required: true,
          children: [
            {
              type: ContainerType.NAVIGATION,
              selector: '.gn_header, .Header_header, header',
              name: 'navigation',
              required: false
            },
            {
              type: ContainerType.SIDEBAR,
              selector: '.gn_sidebar, .SideBar_sideBar',
              name: 'sidebar',
              required: false
            },
            {
              type: ContainerType.MAIN,
              selector: '.WB_main, .Main_main, main',
              name: 'main-content',
              required: true,
              children: [
                {
                  type: ContainerType.FEED,
                  selector: '[data-e2e="feed"], .WB_feed, .feed',
                  name: 'feed-container',
                  required: true,
                  children: [
                    {
                      type: ContainerType.CARD,
                      selector: '[data-e2e="feed-item"], .WB_feed_type, .feed_item',
                      name: 'weibo-card',
                      required: true,
                      multiple: true,
                      children: [
                        {
                          type: ContainerType.CONTENT,
                          selector: '.WB_text, .feed_content',
                          name: 'content',
                          required: false
                        },
                        {
                          type: ContainerType.USER_INFO,
                          selector: '.WB_info, .feed_author',
                          name: 'user',
                          required: false
                        }
                      ]
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    };
  }

  /**
   * 检测是否为微博主页
   */
  async detect(page: any): Promise<boolean> {
    try {
      const url = page.url?.() || page.toString();
      const isWeiboDomain = url.includes('weibo.com') || url.includes('weibo.cn');
      
      if (!isWeiboDomain) {
        return false;
      }

      const weiboIndicators = [
        '.gn_header',
        '.WB_feed',
        '[data-e2e="feed"]',
        '.WB_main'
      ];

      for (const indicator of weiboIndicators) {
        const element = await page.$(indicator);
        if (element) {
          return true;
        }
      }

      return false;
    } catch (error) {
      console.error('Error detecting weibo homepage:', error);
      return false;
    }
  }

  /**
   * 发现容器
   */
  async discover(page: any): Promise<ContainerHierarchy> {
    const selectors = this.getSelectors();
    const hierarchy = await this.discoveryManager.discover(page, selectors);
    
    for (const container of hierarchy.containers) {
      container.capabilities = await this.capabilityEvaluator.evaluate(page, container);
    }

    return hierarchy;
  }

  /**
   * 获取策略信息
   */
  getStrategyInfo() {
    return {
      name: 'WeiboHomepageStrategy',
      version: '1.0.0',
      description: '微博主页容器发现策略'
    };
  }
}