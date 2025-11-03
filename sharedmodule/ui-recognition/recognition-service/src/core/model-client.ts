/**
 * 底层识别服务 - AI模型客户端
 * 纯粹的模型调用，无业务逻辑
 */

import axios, { AxiosInstance } from 'axios';
import { RecognitionRequest, RecognitionResponse, SearchRequest, SearchResponse } from '../types/element';

export class ModelClient {
  private client: AxiosInstance;
  private modelUrl: string;

  constructor(modelUrl: string = 'http://localhost:8898') {
    this.modelUrl = modelUrl;
    this.client = axios.create({
      baseURL: modelUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * 执行UI识别
   */
  async recognize(request: RecognitionRequest): Promise<RecognitionResponse> {
    try {
      const response = await this.client.post('/recognize', {
        request_id: Date.now(),
        image: request.image,
        query: request.query || '识别页面中的所有UI元素',
        scope: request.scope || 'full',
        region: request.region,
        parameters: {
          temperature: request.parameters?.temperature || 0.1,
          max_tokens: request.parameters?.max_tokens || 8192,
          top_p: request.parameters?.top_p || 0.9
        }
      });

      // 转换Python服务的响应格式为标准格式
      const data = response.data;
      return {
        success: data.success,
        elements: data.elements?.map((elem: any) => ({
          id: elem.id || `elem-${Date.now()}-${Math.random()}`,
          type: elem.type || 'unknown',
          bbox: elem.bbox,
          confidence: elem.confidence || 0.0,
          text: elem.text,
          description: elem.description || '',
          raw_properties: elem.properties || {}
        })) || [],
        processing_time: data.processing_time || 0,
        model_info: {
          model_name: 'ui-ins-7b',
          tokens_used: data.tokens_used || 0
        },
        error: data.error
      };
    } catch (error) {
      console.error('Model recognition failed:', error);
      return {
        success: false,
        elements: [],
        processing_time: 0,
        model_info: {
          model_name: 'ui-ins-7b',
          tokens_used: 0
        },
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * 搜索UI元素
   */
  async search(request: SearchRequest): Promise<SearchResponse> {
    try {
      const response = await this.client.post('/recognize', {
        request_id: Date.now(),
        image: request.image,
        query: request.search_query,
        scope: 'full',
        parameters: {
          temperature: 0.1,
          max_tokens: 8192
        }
      });

      const data = response.data;
      const matches = data.elements || [];

      // 应用过滤条件
      let filteredMatches = matches;
      if (request.filters) {
        filteredMatches = this.applyFilters(matches, request.filters);
      }

      return {
        success: data.success,
        matches: filteredMatches.map((elem: any) => ({
          id: elem.id || `elem-${Date.now()}-${Math.random()}`,
          type: elem.type || 'unknown',
          bbox: elem.bbox,
          confidence: elem.confidence || 0.0,
          text: elem.text,
          description: elem.description || '',
          raw_properties: elem.properties || {}
        })),
        match_scores: filteredMatches.map((elem: any) => elem.confidence || 0.0),
        search_time: data.processing_time || 0
      };
    } catch (error) {
      console.error('Model search failed:', error);
      return {
        success: false,
        matches: [],
        match_scores: [],
        search_time: 0
      };
    }
  }

  /**
   * 检查模型健康状态
   */
  async healthCheck(): Promise<{ status: string; model_loaded: boolean }> {
    try {
      const response = await this.client.get('/health');
      return {
        status: response.data.status || 'unknown',
        model_loaded: response.data.model_loaded || false
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        model_loaded: false
      };
    }
  }

  /**
   * 应用搜索过滤条件
   */
  private applyFilters(elements: any[], filters: any): any[] {
    return elements.filter(elem => {
      // 元素类型过滤
      if (filters.element_types && filters.element_types.length > 0) {
        if (!filters.element_types.includes(elem.type)) {
          return false;
        }
      }

      // 置信度过滤
      if (filters.confidence) {
        if (filters.confidence.min && elem.confidence < filters.confidence.min) {
          return false;
        }
        if (filters.confidence.max && elem.confidence > filters.confidence.max) {
          return false;
        }
      }

      // 区域过滤
      if (filters.area && elem.bbox) {
        const [x1, y1, x2, y2] = elem.bbox;
        const [fx1, fy1, fx2, fy2] = [filters.area.x1, filters.area.y1, filters.area.x2, filters.area.y2];

        // 检查元素是否在指定区域内
        if (x1 < fx1 || y1 < fy1 || x2 > fx2 || y2 > fy2) {
          return false;
        }
      }

      return true;
    });
  }
}