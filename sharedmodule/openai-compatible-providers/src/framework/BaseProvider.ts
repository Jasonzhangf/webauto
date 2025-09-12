/**
 * Base Provider Class (TypeScript version)
 * Provider基类（包含标准OpenAI处理）
 */

import { BaseModule } from 'rcc-basemodule';
import { ErrorHandlingCenter } from 'rcc-errorhandling';
import { 
  OpenAIChatRequest, 
  OpenAIChatResponse 
} from './OpenAIInterface';

// Provider capabilities interface
export interface ProviderCapabilities {
  streaming: boolean;
  tools: boolean;
  vision: boolean;
  jsonMode: boolean;
}

// Provider configuration interface
export interface ProviderConfig {
  name: string;
  endpoint?: string;
  supportedModels?: string[];
  defaultModel?: string;
  metadata?: Record<string, any>;
}

// Provider info interface
export interface ProviderInfo {
  name: string;
  endpoint?: string;
  supportedModels: string[];
  defaultModel?: string;
  capabilities: ProviderCapabilities;
}

// Health check result interface
export interface HealthCheckResult {
  status: 'healthy' | 'unhealthy';
  provider: string;
  error?: string;
  timestamp: string;
}

// Compatibility interface for request/response mapping
export interface CompatibilityModule {
  mapRequest: (request: OpenAIChatRequest) => any;
  mapResponse: (response: any) => any;
}

export abstract class BaseProvider {
  protected endpoint?: string;
  protected supportedModels: string[];
  protected defaultModel?: string;
  protected errorHandler: ErrorHandlingCenter;
  protected config: any;

  constructor(config: ProviderConfig) {
    this.config = {
      id: `provider-${config.name}`,
      name: `${config.name} Provider`,
      version: '1.0.0',
      type: 'provider',
      ...config
    };
    
    this.endpoint = config.endpoint;
    this.supportedModels = config.supportedModels || [];
    this.defaultModel = config.defaultModel;
    
    // 错误处理
    this.errorHandler = new ErrorHandlingCenter({
      id: `provider-${config.name}`,
      name: `${config.name} Provider Error Handler`
    });
  }
  
  // 标准 OpenAI 聊天接口 - 主要入口
  async chat(openaiRequest: any, compatibility?: CompatibilityModule): Promise<any> {
    try {
      console.log(`[${this.getInfo().name}] Processing chat request`);
      
      // 验证请求
      const request = new OpenAIChatRequest(openaiRequest);
      request.validate();
      
      // 如果有 compatibility，进行请求映射
      const providerRequest = compatibility 
        ? compatibility.mapRequest(request)
        : request;
      
      // 调用具体的 Provider 实现
      const providerResponse = await this.executeChat(providerRequest);
      
      // 如果有 compatibility，进行响应映射
      const finalResponse = compatibility
        ? compatibility.mapResponse(providerResponse)
        : this.standardizeResponse(providerResponse);
      
      // 转换为标准 OpenAI 响应格式
      const response = new OpenAIChatResponse(finalResponse);
      
      console.log(`[${this.getInfo().name}] Chat request completed successfully`, undefined, 'chat');
      return response.toStandardFormat();
      
    } catch (error: any) {
      this.errorHandler.handleError({
        error: error,
        source: `BaseProvider.chat.${this.getInfo().name}`,
        severity: 'high',
        timestamp: Date.now()
      });
      throw error;
    }
  }
  
  // 标准 OpenAI 流式聊天接口
  async *streamChat(openaiRequest: any, compatibility?: CompatibilityModule): AsyncGenerator<any, void, unknown> {
    try {
      console.log(`[${this.getInfo().name}] Processing stream chat request`, undefined, 'streamChat');
      
      // 验证请求
      const request = new OpenAIChatRequest(openaiRequest);
      request.validate();
      
      // 如果有 compatibility，进行请求映射
      const providerRequest = compatibility 
        ? compatibility.mapRequest(request)
        : request;
      
      // 调用具体的流式实现
      const stream = this.executeStreamChat(providerRequest);
      
      // 处理流式响应
      for await (const chunk of stream) {
        const processedChunk = compatibility
          ? compatibility.mapResponse(chunk)
          : this.standardizeResponse(chunk);
        
        const response = new OpenAIChatResponse(processedChunk);
        yield response.toStandardFormat();
      }
      
      console.log(`[${this.getInfo().name}] Stream chat request completed`, undefined, 'streamChat');
      
    } catch (error: any) {
      this.errorHandler.handleError({
        error: error,
        source: `BaseProvider.streamChat.${this.getInfo().name}`,
        severity: 'high',
        timestamp: Date.now()
      });
      throw error;
    }
  }
  
  // 抽象方法 - 由具体 Provider 实现
  abstract executeChat(providerRequest: any): Promise<any>;
  abstract executeStreamChat(providerRequest: any): AsyncGenerator<any, void, unknown>;
  
  // 标准化响应 - 将 Provider 响应转换为标准格式
  protected standardizeResponse(providerResponse: any): any {
    // 默认实现，假设 Provider 已经返回标准格式
    // 具体 Provider 可以重写此方法
    return {
      id: providerResponse.id || `req_${Date.now()}`,
      object: 'chat.completion',
      created: providerResponse.created || Date.now(),
      model: providerResponse.model || this.defaultModel,
      choices: providerResponse.choices || [],
      usage: providerResponse.usage
    };
  }
  
  // 基本方法实现
  protected getInfo(): any {
    return this.config;
  }

  protected getConfig(): any {
    return this.config;
  }

  // 获取 Provider 信息
  getProviderInfo(): ProviderInfo {
    const info = this.getInfo();
    return {
      name: info.name.replace(' Provider', ''),
      endpoint: this.endpoint,
      supportedModels: this.supportedModels,
      defaultModel: this.defaultModel,
      capabilities: this.getCapabilities()
    };
  }
  
  // 获取能力 - 子类可重写
  protected getCapabilities(): ProviderCapabilities {
    return {
      streaming: false,
      tools: false,
      vision: false,
      jsonMode: false
    };
  }
  
  // 健康检查
  async healthCheck(): Promise<HealthCheckResult> {
    try {
      console.log('Performing health check', { provider: this.getInfo().name }, 'healthCheck');
      // 默认健康检查实现
      return {
        status: 'healthy',
        provider: this.getInfo().name,
        timestamp: new Date().toISOString()
      };
    } catch (error: any) {
      this.errorHandler.handleError({
        error: error,
        source: `BaseProvider.healthCheck.${this.getInfo().name}`,
        severity: 'medium',
        timestamp: Date.now()
      });
      return {
        status: 'unhealthy',
        provider: this.getInfo().name,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}

export default BaseProvider;