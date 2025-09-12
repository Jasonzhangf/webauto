/**
 * Base Provider Class
 * Provider基类（包含标准OpenAI处理）
 */

const { BaseModule } = require('rcc-basemodule');
const { ErrorHandlingCenter } = require('rcc-errorhandling');
const { 
  OpenAIChatRequest, 
  OpenAIChatResponse, 
  ChatMessage, 
  ChatChoice, 
  ToolCall, 
  FunctionCall, 
  ChatTool, 
  UsageStats 
} = require('./OpenAIInterface');

class BaseProvider extends BaseModule {
  constructor(config = {}) {
    super({
      id: `provider-${config.name}`,
      name: `${config.name} Provider`,
      version: '1.0.0',
      type: 'provider',
      ...config
    });
    
    this.name = config.name;
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
  async chat(openaiRequest, compatibility = null) {
    try {
      this.debug(`[${this.name}] Processing chat request`);
      
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
      
      this.debug(`[${this.name}] Chat request completed successfully`);
      return response.toStandardFormat();
      
    } catch (error) {
      this.errorHandler.handleError({
        error: error,
        source: `BaseProvider.chat.${this.name}`,
        severity: 'error'
      });
      throw error;
    }
  }
  
  // 标准 OpenAI 流式聊天接口
  async *streamChat(openaiRequest, compatibility = null) {
    try {
      this.debug(`[${this.name}] Processing stream chat request`);
      
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
      
      this.debug(`[${this.name}] Stream chat request completed`);
      
    } catch (error) {
      this.errorHandler.handleError({
        error: error,
        source: `BaseProvider.streamChat.${this.name}`,
        severity: 'error'
      });
      throw error;
    }
  }
  
  // 抽象方法 - 由具体 Provider 实现
  async executeChat(providerRequest) {
    throw new Error('executeChat method must be implemented by provider');
  }
  
  async *executeStreamChat(providerRequest) {
    throw new Error('executeStreamChat method must be implemented by provider');
  }
  
  // 标准化响应 - 将 Provider 响应转换为标准格式
  standardizeResponse(providerResponse) {
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
  
  // 获取 Provider 信息
  getInfo() {
    return {
      name: this.name,
      endpoint: this.endpoint,
      supportedModels: this.supportedModels,
      defaultModel: this.defaultModel,
      capabilities: this.getCapabilities()
    };
  }
  
  // 获取能力 - 子类可重写
  getCapabilities() {
    return {
      streaming: false,
      tools: false,
      vision: false,
      jsonMode: false
    };
  }
  
  // 健康检查
  async healthCheck() {
    try {
      this.debug(`[${this.name}] Performing health check`);
      // 默认健康检查实现
      return {
        status: 'healthy',
        provider: this.name,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      this.errorHandler.handleError({
        error: error,
        source: `BaseProvider.healthCheck.${this.name}`,
        severity: 'warning'
      });
      return {
        status: 'unhealthy',
        provider: this.name,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}

module.exports = BaseProvider;