/**
 * 容器高亮服务
 * 负责网页容器高亮与图像识别系统的映射
 */

import { EventEmitter } from 'events';

export interface ContainerHighlight {
  containerId: string;
  type: string;
  bounds: BoundingBox;
  elements: UIElement[];
  highlightStyle: string;
  color?: string;
  opacity?: number;
}

export interface HighlightMapping {
  webpageContainer: ContainerHighlight;
  recognizedElements: UIElement[];
  mappingQuality: number;
  coverage: number;
}

export interface BoundingBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface UIElement {
  id: string;
  type: string;
  bbox: BoundingBox;
  confidence: number;
  text?: string;
  description?: string;
}

export class ContainerHighlightService extends EventEmitter {
  private activeHighlights: Map<string, ContainerHighlight> = new Map();
  private highlightStyles: Map<string, string> = new Map();
  private mappings: Map<string, HighlightMapping> = new Map();

  constructor() {
    super();
    this.initializeDefaultStyles();
  }

  /**
   * 初始化默认高亮样式
   */
  private initializeDefaultStyles() {
    this.highlightStyles.set('default', 'border: 2px solid #00ff00; background: rgba(0, 255, 0, 0.1);');
    this.highlightStyles.set('search', 'border: 2px solid #ff9800; background: rgba(255, 152, 0, 0.1);');
    this.highlightStyles.set('navigation', 'border: 2px solid #2196f3; background: rgba(33, 150, 243, 0.1);');
    this.highlightStyles.set('header', 'border: 2px solid #9c27b0; background: rgba(156, 39, 176, 0.1);');
    this.highlightStyles.set('main', 'border: 2px solid #4caf50; background: rgba(76, 175, 80, 0.1);');
    this.highlightStyles.set('form', 'border: 2px solid #f44336; background: rgba(244, 67, 54, 0.1);');
  }

  /**
   * 创建容器高亮
   */
  async createHighlight(
    containerId: string,
    type: string,
    bounds: BoundingBox,
    elements: UIElement[] = [],
    options: {
      color?: string;
      opacity?: number;
      style?: string;
    } = {}
  ): Promise<ContainerHighlight> {
    const highlight: ContainerHighlight = {
      containerId,
      type,
      bounds,
      elements,
      highlightStyle: options.style || this.getHighlightStyle(type),
      color: options.color || this.getDefaultColor(type),
      opacity: options.opacity || 0.1
    };

    this.activeHighlights.set(containerId, highlight);

    this.emit('highlightCreated', highlight);

    return highlight;
  }

  /**
   * 批量创建容器高亮
   */
  async createBatchHighlights(
    containers: Array<{
      id: string;
      type: string;
      bounds: BoundingBox;
      elements?: UIElement[];
    }>
  ): Promise<ContainerHighlight[]> {
    const highlights: ContainerHighlight[] = [];

    for (const container of containers) {
      const highlight = await this.createHighlight(
        container.id,
        container.type,
        container.bounds,
        container.elements || []
      );
      highlights.push(highlight);
    }

    this.emit('batchHighlightsCreated', highlights);

    return highlights;
  }

  /**
   * 映射网页容器到识别元素
   */
  async mapWebpageToRecognition(
    webpageContainers: ContainerHighlight[],
    recognizedElements: UIElement[]
  ): Promise<HighlightMapping[]> {
    const mappings: HighlightMapping[] = [];

    for (const container of webpageContainers) {
      const mapping = await this.createMapping(container, recognizedElements);
      mappings.push(mapping);
      this.mappings.set(container.containerId, mapping);
    }

    this.emit('mappingCompleted', mappings);

    return mappings;
  }

  /**
   * 创建单个映射关系
   */
  private async createMapping(
    container: ContainerHighlight,
    recognizedElements: UIElement[]
  ): Promise<HighlightMapping> {
    // 找到容器内的识别元素
    const containerElements = recognizedElements.filter(element =>
      this.isElementInContainer(element, container.bounds)
    );

    // 计算映射质量
    const mappingQuality = this.calculateMappingQuality(container, containerElements);
    const coverage = this.calculateCoverage(container.bounds, containerElements);

    const mapping: HighlightMapping = {
      webpageContainer: container,
      recognizedElements: containerElements,
      mappingQuality,
      coverage
    };

    return mapping;
  }

  /**
   * 检查元素是否在容器内
   */
  private isElementInContainer(element: UIElement, containerBounds: BoundingBox): boolean {
    return element.bbox.x1 >= containerBounds.x1 &&
           element.bbox.y1 >= containerBounds.y1 &&
           element.bbox.x2 <= containerBounds.x2 &&
           element.bbox.y2 <= containerBounds.y2;
  }

  /**
   * 计算映射质量
   */
  private calculateMappingQuality(
    container: ContainerHighlight,
    recognizedElements: UIElement[]
  ): number {
    if (recognizedElements.length === 0) return 0;

    // 基于元素置信度和位置准确性计算质量
    const avgConfidence = recognizedElements.reduce((sum, el) => sum + el.confidence, 0) / recognizedElements.length;

    // 位置准确性（元素中心点与容器中心点的距离）
    const containerCenter = {
      x: (container.bounds.x1 + container.bounds.x2) / 2,
      y: (container.bounds.y1 + container.bounds.y2) / 2
    };

    const avgPositionAccuracy = recognizedElements.reduce((sum, el) => {
      const elementCenter = {
        x: (el.bbox.x1 + el.bbox.x2) / 2,
        y: (el.bbox.y1 + el.bbox.y2) / 2
      };

      const distance = Math.sqrt(
        Math.pow(elementCenter.x - containerCenter.x, 2) +
        Math.pow(elementCenter.y - containerCenter.y, 2)
      );

      const maxDistance = Math.sqrt(
        Math.pow(container.bounds.x2 - container.bounds.x1, 2) +
        Math.pow(container.bounds.y2 - container.bounds.y1, 2)
      ) / 2;

      const accuracy = Math.max(0, 1 - distance / maxDistance);
      return sum + accuracy;
    }, 0) / recognizedElements.length;

    return (avgConfidence * 0.7) + (avgPositionAccuracy * 0.3);
  }

  /**
   * 计算覆盖率
   */
  private calculateCoverage(containerBounds: BoundingBox, elements: UIElement[]): number {
    if (elements.length === 0) return 0;

    const containerArea = (containerBounds.x2 - containerBounds.x1) * (containerBounds.y2 - containerBounds.y1);

    // 计算所有元素覆盖的面积（简化计算，可能有重叠）
    const elementsArea = elements.reduce((sum, el) => {
      const elementArea = (el.bbox.x2 - el.bbox.x1) * (el.bbox.y2 - el.bbox.y1);
      return sum + elementArea;
    }, 0);

    return Math.min(1, elementsArea / containerArea);
  }

  /**
   * 获取高亮样式
   */
  private getHighlightStyle(type: string): string {
    return this.highlightStyles.get(type) || this.highlightStyles.get('default')!;
  }

  /**
   * 获取默认颜色
   */
  private getDefaultColor(type: string): string {
    const colors: Record<string, string> = {
      'search': '#ff9800',
      'navigation': '#2196f3',
      'header': '#9c27b0',
      'main': '#4caf50',
      'form': '#f44336',
      'default': '#00ff00'
    };

    return colors[type] || colors.default;
  }

  /**
   * 清除高亮
   */
  clearHighlight(containerId: string): void {
    const removed = this.activeHighlights.delete(containerId);
    if (removed) {
      this.emit('highlightCleared', containerId);
    }
  }

  /**
   * 清除所有高亮
   */
  clearAllHighlights(): void {
    const count = this.activeHighlights.size;
    this.activeHighlights.clear();
    this.mappings.clear();
    this.emit('allHighlightsCleared', count);
  }

  /**
   * 获取活动高亮
   */
  getActiveHighlights(): ContainerHighlight[] {
    return Array.from(this.activeHighlights.values());
  }

  /**
   * 获取映射关系
   */
  getMapping(containerId: string): HighlightMapping | undefined {
    return this.mappings.get(containerId);
  }

  /**
   * 获取所有映射关系
   */
  getAllMappings(): HighlightMapping[] {
    return Array.from(this.mappings.values());
  }

  /**
   * 生成高亮CSS
   */
  generateHighlightCSS(highlight: ContainerHighlight): string {
    const { bounds, highlightStyle } = highlight;

    return `
      position: absolute;
      left: ${bounds.x1}px;
      top: ${bounds.y1}px;
      width: ${bounds.x2 - bounds.x1}px;
      height: ${bounds.y2 - bounds.y1}px;
      ${highlightStyle}
      pointer-events: none;
      z-index: 10000;
      box-sizing: border-box;
    `;
  }

  /**
   * 生成HTML高亮元素
   */
  generateHighlightElement(highlight: ContainerHighlight): string {
    const css = this.generateHighlightCSS(highlight);
    const label = highlight.type || 'container';

    return `
      <div
        class="ui-highlight"
        data-container-id="${highlight.containerId}"
        data-container-type="${highlight.type}"
        style="${css}"
      >
        <div class="ui-highlight-label" style="
          position: absolute;
          top: -20px;
          left: 0;
          background: rgba(0, 0, 0, 0.8);
          color: white;
          padding: 2px 6px;
          font-size: 12px;
          border-radius: 2px;
          white-space: nowrap;
        ">
          ${label}
        </div>
      </div>
    `;
  }

  /**
   * 生成完整的高亮层HTML
   */
  generateHighlightOverlay(): string {
    const highlights = this.getActiveHighlights();

    return `
      <div id="ui-highlight-overlay" style="
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        pointer-events: none;
        z-index: 9999;
      ">
        ${highlights.map(h => this.generateHighlightElement(h)).join('')}
      </div>
    `;
  }

  /**
   * 导出映射数据
   */
  exportMappings(): string {
    const data = {
      timestamp: new Date().toISOString(),
      highlights: this.getActiveHighlights(),
      mappings: this.getAllMappings(),
      statistics: {
        totalHighlights: this.activeHighlights.size,
        totalMappings: this.mappings.size,
        avgMappingQuality: this.calculateAverageMappingQuality(),
        avgCoverage: this.calculateAverageCoverage()
      }
    };

    return JSON.stringify(data, null, 2);
  }

  /**
   * 计算平均映射质量
   */
  private calculateAverageMappingQuality(): number {
    const mappings = this.getAllMappings();
    if (mappings.length === 0) return 0;

    const total = mappings.reduce((sum, mapping) => sum + mapping.mappingQuality, 0);
    return total / mappings.length;
  }

  /**
   * 计算平均覆盖率
   */
  private calculateAverageCoverage(): number {
    const mappings = this.getAllMappings();
    if (mappings.length === 0) return 0;

    const total = mappings.reduce((sum, mapping) => sum + mapping.coverage, 0);
    return total / mappings.length;
  }
}