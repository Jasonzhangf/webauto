/**
 * Virtual Model Configuration Types
 * 虚拟模型配置类型
 */

export interface VirtualModelTarget {
  providerId: string;
  modelId: string;
  weight?: number;
  enabled?: boolean;
  keyIndex?: number;
}

export interface VirtualModelConfig {
  id: string;
  name: string;
  description?: string;
  modelId: string;
  provider: string;
  endpoint?: string;
  apiKey?: string;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  enabled: boolean;
  targets?: VirtualModelTarget[];
  capabilities?: string[];
  metadata?: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
}

export interface VirtualModelRule {
  id: string;
  virtualModelId: string;
  pattern: string;
  priority: number;
  condition: {
    field: string;
    operator: 'equals' | 'contains' | 'startsWith' | 'endsWith' | 'regex';
    value: string;
  };
  action: {
    type: 'route' | 'modify' | 'block';
    target?: string;
    modifications?: Record<string, any>;
  };
  enabled: boolean;
  description?: string;
}

export interface VirtualModelRouter {
  id: string;
  name: string;
  description?: string;
  defaultModelId: string;
  rules: VirtualModelRule[];
  fallbackStrategy: 'first-available' | 'round-robin' | 'weighted';
  enabled: boolean;
  metadata?: Record<string, any>;
}