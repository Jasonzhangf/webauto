/**
 * 高层UI容器系统 - 识别服务客户端
 * 连接底层识别服务的客户端
 */

import axios, { AxiosInstance } from 'axios';
import { UIElement } from '../../recognition-service/src/types/element';

export interface RecognitionClientConfig {
  baseUrl: string;
  timeout: number;
  retries: number;
  retryDelay: number;
}

export class RecognitionServiceClient {
  private client: AxiosInstance;
  private config: RecognitionClientConfig;

  constructor(config: Partial<RecognitionClientConfig> = {}) {
    this.config = {
      baseUrl: config.baseUrl || 'http://localhost:8898',
      timeout: config.timeout || 30000,
      retries: config.retries || 3,
      retryDelay: config.retryDelay || 1000
    };

    this.client = axios.create({
      baseURL: this.config.baseUrl,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * 执行UI识别
   */
  async recognizeElements(image: string, query?: string): Promise<UIElement[]> {
    const payload = {
      image,
      query: query || '识别页面中的所有UI元素',
      parameters: {
        temperature: 0.1,
        max_tokens: 8192,
        top_p: 0.9,
        include_coordinates: true,
        confidence_threshold: 0.3
      }
    };

    return this.withRetry(async () => {
      const response = await this.client.post('/recognize', payload);

      if (response.data.success) {
        return response.data.elements || [];
      } else {
        throw new Error(response.data.error || 'Recognition failed');
      }
    });
  }

  /**
   * 搜索特定UI元素
   */
  async searchElements(
    image: string,
    searchQuery: string,
    searchType: 'text' | 'similarity' | 'fuzzy' = 'text',
    filters?: any
  ): Promise<UIElement[]> {
    const payload = {
      image,
      search_query: searchQuery,
      search_type: searchType,
      filters
    };

    return this.withRetry(async () => {
      const response = await this.client.post('/search', payload);

      if (response.data.success) {
        return response.data.matches || [];
      } else {
        throw new Error(response.data.error || 'Search failed');
      }
    });
  }

  /**
   * 批量识别多个区域
   */
  async recognizeMultipleRegions(
    image: string,
    regions: Array<{ query: string; bbox?: any }>
  ): Promise<Array<{ region: any; elements: UIElement[] }>> {
    const promises = regions.map(async (region) => {
      const elements = await this.recognizeElements(image, region.query);
      return {
        region: region,
        elements: elements
      };
    });

    return Promise.all(promises);
  }

  /**
   * 检查服务健康状态
   */
  async healthCheck(): Promise<{
    status: string;
    model_loaded: boolean;
    service_available: boolean;
  }> {
    try {
      const response = await this.client.get('/health');
      return {
        status: response.data.status || 'unknown',
        model_loaded: response.data.model_loaded || false,
        service_available: true
      };
    } catch (error) {
      return {
        status: 'unavailable',
        model_loaded: false,
        service_available: false
      };
    }
  }

  /**
   * 获取服务信息
   */
  async getServiceInfo(): Promise<{
    name: string;
    version: string;
    model_info: any;
    capabilities: string[];
  }> {
    try {
      const response = await this.client.get('/info');
      return response.data;
    } catch (error) {
      // 如果没有info端点，返回默认信息
      return {
        name: 'Recognition Service',
        version: '1.0.0',
        model_info: {},
        capabilities: ['recognize', 'search']
      };
    }
  }

  /**
   * 预处理图片
   */
  async preprocessImage(imageData: string, options?: {
    resize?: { width: number; height: number };
    quality?: number;
    format?: 'png' | 'jpeg' | 'webp';
  }): Promise<string> {
    // 这里可以实现图片预处理逻辑
    // 目前直接返回原始图片数据
    return imageData;
  }

  /**
   * 验证识别结果
   */
  validateRecognitionResult(elements: UIElement[]): {
    valid: boolean;
    issues: string[];
    suggestions: string[];
  } {
    const issues: string[] = [];
    const suggestions: string[] = [];

    if (!elements || elements.length === 0) {
      issues.push('No elements detected');
      suggestions.push('Try using a different query or check image quality');
      return { valid: false, issues, suggestions };
    }

    // 检查元素质量
    const lowConfidenceElements = elements.filter(e => e.confidence < 0.5);
    if (lowConfidenceElements.length > 0) {
      issues.push(`${lowConfidenceElements.length} elements have low confidence`);
      suggestions.push('Consider improving image quality or using more specific queries');
    }

    // 检查边界框
    const invalidBoundingBoxes = elements.filter(e => {
      const bbox = e.bbox;
      return !bbox || bbox.x1 >= bbox.x2 || bbox.y1 >= bbox.y2;
    });

    if (invalidBoundingBoxes.length > 0) {
      issues.push(`${invalidBoundingBoxes.length} elements have invalid bounding boxes`);
    }

    // 检查重复元素
    const elementTypes = elements.map(e => e.type);
    const typeCounts = elementTypes.reduce((acc, type) => {
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const duplicatedTypes = Object.entries(typeCounts)
      .filter(([, count]) => count > 5)
      .map(([type]) => type);

    if (duplicatedTypes.length > 0) {
      suggestions.push(`Consider more specific queries for ${duplicatedTypes.join(', ')} elements`);
    }

    return {
      valid: issues.length === 0,
      issues,
      suggestions
    };
  }

  /**
   * 增强识别结果
   */
  enhanceRecognitionResult(elements: UIElement[]): UIElement[] {
    return elements.map(element => {
      // 标准化元素类型
      const standardizedType = this.standardizeElementType(element.type);

      // 增强元素描述
      const enhancedDescription = this.enhanceElementDescription(element);

      // 计算额外的属性
      const enhancedProperties = {
        ...element.raw_properties,
        area: (element.bbox.x2 - element.bbox.x1) * (element.bbox.y2 - element.bbox.y1),
        center: {
          x: (element.bbox.x1 + element.bbox.x2) / 2,
          y: (element.bbox.y1 + element.bbox.y2) / 2
        },
        aspect_ratio: (element.bbox.x2 - element.bbox.x1) / (element.bbox.y2 - element.bbox.y1)
      };

      return {
        ...element,
        type: standardizedType,
        description: enhancedDescription,
        raw_properties: enhancedProperties
      };
    });
  }

  /**
   * 重试机制
   */
  private async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: any;

    for (let attempt = 0; attempt <= this.config.retries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;

        if (attempt < this.config.retries) {
          console.warn(`Recognition service attempt ${attempt + 1} failed, retrying...`, error);
          await this.delay(this.config.retryDelay * Math.pow(2, attempt));
        }
      }
    }

    throw lastError;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 标准化元素类型
   */
  private standardizeElementType(type: string): string {
    const typeMap: Record<string, string> = {
      'textbox': 'input',
      'textfield': 'input',
      'textarea': 'input',
      'dropdown': 'select',
      'combobox': 'select',
      'listbox': 'select',
      'radiobutton': 'radio',
      'checkbox': 'checkbox',
      'linkbutton': 'link',
      'hyperlink': 'link',
      'imagebutton': 'button',
      'submit': 'submit-button',
      'reset': 'reset-button'
    };

    return typeMap[type.toLowerCase()] || type;
  }

  /**
   * 增强元素描述
   */
  private enhanceElementDescription(element: UIElement): string {
    let description = element.description;

    // 添加坐标信息
    const [x1, y1, x2, y2] = element.bbox;
    const width = x2 - x1;
    const height = y2 - y1;
    description += ` at position (${x1}, ${y1}) with size ${width}x${height}`;

    // 添加置信度信息
    if (element.confidence < 0.7) {
      description += ` (low confidence: ${(element.confidence * 100).toFixed(1)}%)`;
    }

    // 添加文本信息
    if (element.text && element.text.trim()) {
      description += ` containing text: "${element.text}"`;
    }

    return description;
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<RecognitionClientConfig>): void {
    this.config = { ...this.config, ...config };

    if (config.baseUrl) {
      this.client.defaults.baseURL = config.baseUrl;
    }

    if (config.timeout) {
      this.client.defaults.timeout = config.timeout;
    }
  }

  /**
   * 获取当前配置
   */
  getConfig(): RecognitionClientConfig {
    return { ...this.config };
  }
}