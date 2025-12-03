/**
 * 上下文管理相关类型定义
 */

export interface ConversationContext {
  sessionId: string;
  userId?: string;
  history: ContextEntry[];
  currentImage?: string;
  previousResults?: RecognitionResult[];
  metadata: ContextMetadata;
}

export interface ContextEntry {
  id: string;
  timestamp: number;
  type: 'user_query' | 'recognition_result' | 'action_performed' | 'system_response';
  content: any;
  relatedElements?: string[]; // 关联的UI元素ID
  contextSummary?: string;   // 上下文摘要
}

export interface RecognitionResult {
  elements: UIElement[];
  containers: Container[];
  relationships: ElementRelationship[];
  confidence: number;
  processingTime: number;
  timestamp: number;
}

export interface ContextMetadata {
  sessionStartTime: number;
  lastActivityTime: number;
  totalQueries: number;
  averageConfidence: number;
  contextWindowSize: number; // 上下文窗口大小
  contextCompressionThreshold: number; // 上下文压缩阈值
}

export interface ContextualPrompt {
  systemPrompt: string;
  contextualInstructions: string[];
  previousInstructions: string[];
  contextSummary: string;
  currentTask: string;
}

export interface ContextManagerConfig {
  maxHistoryLength: number;
  contextCompressionEnabled: boolean;
  summaryGenerationInterval: number;
  contextWindowSize: number;
  relevanceThreshold: number;
}