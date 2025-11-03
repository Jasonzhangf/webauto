/**
 * 底层识别服务 - UI元素类型定义
 * 纯粹的识别结果，无业务逻辑
 */

export interface UIElement {
  id: string;
  type: ElementType;
  bbox: BoundingBox;
  confidence: number;
  text?: string;
  description: string;
  raw_properties?: Record<string, any>;
}

export type ElementType =
  | 'button' | 'input' | 'textarea' | 'select' | 'checkbox' | 'radio'
  | 'link' | 'image' | 'video' | 'audio' | 'canvas'
  | 'menu' | 'navigation' | 'header' | 'footer' | 'sidebar'
  | 'table' | 'list' | 'form' | 'div' | 'span'
  | 'unknown';

export interface BoundingBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface RecognitionRequest {
  image: string;           // base64图片数据
  query?: string;          // 可选的查询文本
  scope?: 'full' | 'region';
  region?: BoundingBox;
  parameters?: RecognitionParameters;
}

export interface RecognitionParameters {
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  include_coordinates?: boolean;
  confidence_threshold?: number;
}

export interface RecognitionResponse {
  success: boolean;
  elements: UIElement[];
  processing_time: number;
  model_info: {
    model_name: string;
    tokens_used: number;
  };
  error?: string;
}

export interface SearchRequest {
  image: string;
  search_query: string;
  search_type: 'text' | 'similarity' | 'fuzzy';
  filters?: {
    element_types?: ElementType[];
    confidence?: { min?: number; max?: number };
    area?: BoundingBox;
  };
}

export interface SearchResponse {
  success: boolean;
  matches: UIElement[];
  match_scores: number[];
  search_time: number;
}