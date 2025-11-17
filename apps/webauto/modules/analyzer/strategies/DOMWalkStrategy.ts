/**
 * DOM遍历发现策略
 * 通过遍历DOM树发现潜在的容器元素
 */

type Page = {
  url(): string;
};
import { DiscoveryStrategy, DiscoveredContainer, ContainerType } from '../types/index.js';

export class DOMWalkStrategy implements DiscoveryStrategy {
  name = 'dom-walk';
  priority = 1;

  private readonly CONTAINER_SELECTORS = {
    page: ['body', '#app', '[id*="app"]', '[id*="root"]', '[id*="container"]'],
    scroll: ['[class*="scroll"]', '[class*="scroller"]', '.vue-recycle-scroller', '#scroller'],
    content: ['[class*="feed"]', '[class*="content"]', '[class*="list"]', '[class*="grid"]'],
    navigation: ['[class*="nav"]', '[class*="menu"]', '[class*="header"]', '[class*="toolbar"]'],
    interaction: ['[class*="button"]', '[class*="click"]', 'button', '[role="button"]'],
    pagination: ['[class*="page"]', '[class*="pagination"]', '[class*="next"]', '[class*="more"]'],
    filter: ['[class*="filter"]', '[class*="search"]', '[class*="sort"]'],
    media: ['[class*="image"]', '[class*="video"]', '[class*="media"]', 'img', 'video'],
    comment: ['[class*="comment"]', '[class*="reply"]', '[class*="discussion"]'],
    user: ['[class*="user"]', '[class*="profile"]', '[class*="avatar"]', '[class*="author"]']
  };

  async discover(page: Page): Promise<DiscoveredContainer[]> {
    console.log('🔍 开始DOM遍历容器发现...');
    const startTime = Date.now();

    try {
      const containers = await page.evaluate((config) => {
        const results: any[] = [];
        const visited = new Set<string>();

        // 计算选择器特异性
        function calculateSpecificity(selector: string): number {
          const ids = (selector.match(/#[a-zA-Z][\w-]*/g) || []).length;
          const classes = (selector.match(/\.[a-zA-Z][\w-]*/g) || []).length;
          const attributes = (selector.match(/\[[^\]]+\]/g) || []).length;
          const elements = (selector.match(/^[a-zA-Z]+/g) || []).length;
          
          return ids * 100 + classes * 10 + attributes * 5 + elements;
        }

        // 生成容器ID
        function generateContainerId(selector: string, type: string): string {
          const hash = selector.split('').reduce((acc, char) => {
            return ((acc << 5) - acc) + char.charCodeAt(0);
          }, 0);
          return `${type}_${Math.abs(hash).toString(16).substring(0, 8)}`;
        }

        // 检查元素是否可见
        function isElementVisible(element: Element): boolean {
          const style = window.getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          
          return style.display !== 'none' && 
                 style.visibility !== 'hidden' && 
                 style.opacity !== '0' &&
                 rect.width > 0 && 
                 rect.height > 0;
        }

        // 分析元素特征
        function analyzeElementFeatures(element: Element): any {
          const rect = element.getBoundingClientRect();
          const computedStyle = window.getComputedStyle(element);
          
          return {
            tag: element.tagName.toLowerCase(),
            classes: Array.from(element.classList),
            id: element.id,
            rect: {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height
            },
            zIndex: parseInt(computedStyle.zIndex) || 0,
            position: computedStyle.position,
            hasImages: element.querySelectorAll('img').length > 0,
            hasLinks: element.querySelectorAll('a').length > 0,
            hasVideos: element.querySelectorAll('video').length > 0,
            innerHTMLLength: element.innerHTML.length,
            childElementCount: element.children.length,
            isVisible: isElementVisible(element)
          };
        }

        // 遍历所有容器类型的选择器
        for (const [containerType, selectors] of Object.entries(config.CONTAINER_SELECTORS)) {
          for (const selector of selectors) {
            try {
              const elements = Array.from(document.querySelectorAll(selector));
              
              for (const element of elements) {
                const elementKey = `${element.tagName}_${element.className}_${element.id}`;
                
                if (visited.has(elementKey)) continue;
                visited.add(elementKey);

                const features = analyzeElementFeatures(element);
                
                // 只处理有一定内容或可见性的元素
                if (features.childElementCount >= 1 || 
                    features.isVisible || 
                    features.innerHTMLLength > 100) {
                  
                  const containerId = generateContainerId(selector, containerType);
                  const specificity = calculateSpecificity(selector);

                  // 推断容器能力
                  const capabilities = [];
                  if (features.hasImages) capabilities.push({ name: 'image-extraction', enabled: true, config: {}, operations: [] });
                  if (features.hasLinks) capabilities.push({ name: 'link-extraction', enabled: true, config: {}, operations: [] });
                  if (features.hasVideos) capabilities.push({ name: 'video-extraction', enabled: true, config: {}, operations: [] });

                  // 推断可能的事件
                  const events = [];
                  if (containerType === 'scroll') events.push('scroll', 'scroll:bottom_reached');
                  if (containerType === 'content') events.push('content:updated', 'content:mutation_detected');
                  if (containerType === 'interaction') events.push('click', 'hover');

                  results.push({
                    id: containerId,
                    selector,
                    name: `${containerType}_${containerId.split('_')[1]}`,
                    type: containerType,
                    priority: specificity,
                    specificity,
                    rect: features.rect,
                    elementCount: features.childElementCount,
                    capabilities,
                    events,
                    metadata: {
                      discoveredAt: Date.now(),
                      discoveryStrategy: 'dom-walk',
                      elementTag: features.tag,
                      elementClasses: features.classes,
                      innerHTMLLength: features.innerHTMLLength,
                      hasImages: features.hasImages,
                      hasLinks: features.hasLinks,
                      hasVideos: features.hasVideos,
                      isVisible: features.isVisible,
                      zIndex: features.zIndex,
                      position: features.position
                    }
                  });
                }
              }
            } catch (e) {
              // 选择器无效，跳过
            }
          }
        }

        return results;
      }, {
        CONTAINER_SELECTORS: this.CONTAINER_SELECTORS
      });

      console.log(`✅ DOM遍历发现完成: ${containers.length} 个容器，耗时 ${Date.now() - startTime}ms`);
      return containers;

    } catch (error) {
      console.error('❌ DOM遍历发现失败:', error.message);
      return [];
    }
  }

  /**
   * 检查策略是否适用于当前URL
   */
  isApplicable(url: string): boolean {
    // DOM遍历策略适用于所有页面
    return true;
  }

  /**
   * 获取策略优先级
   */
  getPriority(): number {
    return this.priority;
  }
}
