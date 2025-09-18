/**
 * Base Provider Class (TypeScript version)
 * Provider基类（包含标准OpenAI处理）
 */

import { PipelineBaseModule, PipelineModuleConfig } from '../modules/PipelineBaseModule';
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

  // Debug configuration
  enableTwoPhaseDebug?: boolean;
  debugBaseDirectory?: string;
  enableIOTracking?: boolean;
  maxConcurrentRequests?: number;
  requestTimeout?: number;
}

// Provider info interface
export interface ProviderInfo {
  name: string;
  endpoint: string | undefined;
  supportedModels: string[];
  defaultModel: string | undefined;
  capabilities: ProviderCapabilities;
  type: 'provider' | 'scheduler' | 'tracker' | 'pipeline';
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

export abstract class BaseProvider extends PipelineBaseModule {
  protected endpoint?: string;
  protected supportedModels: string[];
  protected defaultModel?: string;

  constructor(config: ProviderConfig) {
    const pipelineConfig: PipelineModuleConfig = {
      id: `provider-${config.name}`,
      name: `${config.name} Provider`,
      version: '1.0.0',
      type: 'provider',
      description: `Provider for ${config.name}`,
      providerName: config.name,
      endpoint: config.endpoint,
      supportedModels: config.supportedModels || [],
      defaultModel: config.defaultModel,
      maxConcurrentRequests: config.maxConcurrentRequests || 5,
      requestTimeout: config.requestTimeout || 30000,
      enableTwoPhaseDebug: config.enableTwoPhaseDebug || false,
      debugBaseDirectory: config.debugBaseDirectory || '~/.rcc/debug-logs',
      enableIOTracking: config.enableIOTracking || false
    };

    super(pipelineConfig);

    this.endpoint = config.endpoint;
    this.supportedModels = config.supportedModels || [];
    this.defaultModel = config.defaultModel;
  }
  
  // 标准 OpenAI 聊天接口 - 主要入口
  async chat(openaiRequest: any, compatibility?: CompatibilityModule): Promise<any> {
    return await this.trackPipelineOperation(
      `chat-${Date.now()}`,
      async () => {
        this.logInfo(`Processing chat request for provider: ${this.getProviderInfo().name}`, undefined, 'chat');

        // 验证请求
        const request = new OpenAIChatRequest(openaiRequest);
        request.validate();

        // 如果有 compatibility，进行请求映射
        const providerRequest = compatibility
          ? compatibility.mapRequest(request)
          : request;

        // 记录验证阶段
        this.recordPipelineStage('validation', { request: providerRequest }, 'completed');

        // 调用具体的 Provider 实现
        const providerResponse = await this.executeChat(providerRequest);

        // 记录提供者执行阶段
        this.recordPipelineStage('provider-execution', { provider: this.getProviderInfo().name }, 'completed');

        // 如果有 compatibility，进行响应映射
        const finalResponse = compatibility
          ? compatibility.mapResponse(providerResponse)
          : this.standardizeResponse(providerResponse);

        // 转换为标准 OpenAI 响应格式
        const response = new OpenAIChatResponse(finalResponse);

        // 记录响应标准化阶段
        this.recordPipelineStage('response-standardization', { response }, 'completed');

        this.logInfo(`Chat request completed successfully for provider: ${this.getProviderInfo().name}`, undefined, 'chat');
        return response.toStandardFormat();
      },
      { request: openaiRequest, compatibility: !!compatibility },
      'chat'
    );
  }
  
  // 标准 OpenAI 流式聊天接口
  async *streamChat(openaiRequest: any, compatibility?: CompatibilityModule): AsyncGenerator<any, void, unknown> {
    const operationId = `stream-chat-${Date.now()}`;

    try {
      this.logInfo(`Processing stream chat request for provider: ${this.getProviderInfo().name}`, undefined, 'streamChat');

      // 开始I/O跟踪
      if (this.twoPhaseDebugSystem) {
        this.twoPhaseDebugSystem.startOperation(this.info.id, operationId, { request: openaiRequest, compatibility: !!compatibility }, 'streamChat');
      }

      // 验证请求
      const request = new OpenAIChatRequest(openaiRequest);
      request.validate();

      // 如果有 compatibility，进行请求映射
      const providerRequest = compatibility
        ? compatibility.mapRequest(request)
        : request;

      // 记录验证阶段
      this.recordPipelineStage('validation', { request: providerRequest }, 'completed');

      // 调用具体的流式实现
      const stream = this.executeStreamChat(providerRequest);

      // 记录提供者执行阶段
      this.recordPipelineStage('provider-execution', { provider: this.getProviderInfo().name, streaming: true }, 'started');

      // 处理流式响应
      let chunkCount = 0;
      for await (const chunk of stream) {
        const processedChunk = compatibility
          ? compatibility.mapResponse(chunk)
          : this.standardizeResponse(chunk);

        const response = new OpenAIChatResponse(processedChunk);
        yield response.toStandardFormat();
        chunkCount++;
      }

      // 结束I/O跟踪
      if (this.twoPhaseDebugSystem) {
        this.twoPhaseDebugSystem.endOperation(this.info.id, operationId, { chunksProcessed: chunkCount }, true, undefined);
      }

      // 记录流式处理完成
      this.recordPipelineStage('provider-execution', { provider: this.getProviderInfo().name, streaming: true, chunksProcessed: chunkCount }, 'completed');

      this.logInfo(`Stream chat request completed for provider: ${this.getProviderInfo().name}`, { chunksProcessed: chunkCount }, 'streamChat');

    } catch (error: any) {
      // 结束I/O跟踪并记录错误
      if (this.twoPhaseDebugSystem) {
        this.twoPhaseDebugSystem.endOperation(this.info.id, operationId, undefined, false, error);
      }

      // 记录错误阶段
      this.recordPipelineStage('error', { error }, 'failed');

      this.handlePipelineError(error, {
        operation: 'streamChat',
        stage: 'stream-processing',
        additionalData: { request: openaiRequest }
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
  public getInfo(): any {
    return this.config;
  }

  public getConfig(): any {
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
      capabilities: this.getCapabilities(),
      type: 'provider'
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
    return await this.trackPipelineOperation(
      `health-check-${Date.now()}`,
      async () => {
        this.logInfo('Performing health check', { provider: this.getProviderInfo().name }, 'healthCheck');

        // 默认健康检查实现
        const result = {
          status: 'healthy' as const,
          provider: this.getProviderInfo().name,
          timestamp: new Date().toISOString()
        };

        this.logInfo('Health check completed', { provider: this.getProviderInfo().name, status: result.status }, 'healthCheck');
        return result;
      },
      { provider: this.getProviderInfo().name },
      'healthCheck'
    );
  }
}

export default BaseProvider;