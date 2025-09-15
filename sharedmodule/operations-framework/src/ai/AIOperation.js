/**
 * AI模型操作子基类
 * 处理AI模型相关的所有操作
 */

import BaseOperation from "./BaseOperation.js"';

export class AIOperation extends BaseOperation {
  constructor(config = {}) {
    super(config);
    this.category = 'ai';
    this.modelProvider = config.modelProvider || 'openai';
    this.modelName = config.modelName || 'gpt-3.5-turbo';
    this.apiKey = config.apiKey;
    this.apiEndpoint = config.apiEndpoint;
    this.maxTokens = config.maxTokens || 4000;
    this.temperature = config.temperature || 0.7;
    this.timeout = config.timeout || 30000;
    this.cache = new Map(); // 简单的内存缓存
    this.cacheEnabled = config.cacheEnabled ?? true;
    this.cacheTTL = config.cacheTTL || 300000; // 5分钟缓存
  }

  /**
   * 生成缓存键
   */
  generateCacheKey(operation, params) {
    const keyData = {
      operation,
      params,
      model: this.modelName,
      timestamp: Date.now()
    };
    return Buffer.from(JSON.stringify(keyData)).toString('base64');
  }

  /**
   * 设置缓存
   */
  setCache(key, value) {
    if (!this.cacheEnabled) return;
    
    const cacheItem = {
      value,
      timestamp: Date.now(),
      ttl: this.cacheTTL
    };
    
    this.cache.set(key, cacheItem);
    this.logger.debug('Cache set', { key, ttl: this.cacheTTL });
  }

  /**
   * 获取缓存
   */
  getCache(key) {
    if (!this.cacheEnabled) return null;
    
    const cacheItem = this.cache.get(key);
    if (!cacheItem) return null;
    
    if (Date.now() - cacheItem.timestamp > cacheItem.ttl) {
      this.cache.delete(key);
      this.logger.debug('Cache expired', { key });
      return null;
    }
    
    this.logger.debug('Cache hit', { key });
    return cacheItem.value;
  }

  /**
   * 清理过期缓存
   */
  cleanupCache() {
    const now = Date.now();
    let cleanedCount = 0;
    
    for (const [key, item] of this.cache.entries()) {
      if (now - item.timestamp > item.ttl) {
        this.cache.delete(key);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      this.logger.debug('Cache cleaned', { cleanedCount });
    }
  }

  /**
   * 发送API请求
   */
  async sendAPIRequest(messages, options = {}) {
    const requestConfig = {
      model: options.model || this.modelName,
      messages,
      max_tokens: options.maxTokens || this.maxTokens,
      temperature: options.temperature || this.temperature,
      stream: options.stream || false,
      ...options.additionalParams
    };

    try {
      // 这里使用模拟的API调用，实际使用时需要替换为真实的API调用
      const response = await this.mockAPICall(requestConfig);
      
      this.logger.info('AI API request completed', { 
        model: requestConfig.model,
        messageCount: messages.length,
        tokensUsed: response.usage?.total_tokens || 0
      });
      
      return response;
    } catch (error) {
      this.logger.error('AI API request failed', { 
        error: error.message,
        model: requestConfig.model 
      });
      throw error;
    }
  }

  /**
   * 模拟API调用（实际使用时需要替换为真实的API调用）
   */
  async mockAPICall(requestConfig) {
    // 模拟网络延迟
    await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));
    
    // 模拟响应
    const response = {
      id: `chatcmpl-${Math.random().toString(36).substr(2, 9)}`,
      object: 'chat.completion',
      created: Date.now(),
      model: requestConfig.model,
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: this.generateMockResponse(requestConfig.messages)
        },
        finish_reason: 'stop'
      }],
      usage: {
        prompt_tokens: this.estimateTokenCount(requestConfig.messages),
        completion_tokens: Math.floor(Math.random() * 200) + 50,
        total_tokens: 0
      }
    };
    
    response.usage.total_tokens = response.usage.prompt_tokens + response.usage.completion_tokens;
    
    return response;
  }

  /**
   * 生成模拟响应
   */
  generateMockResponse(messages) {
    const lastMessage = messages[messages.length - 1];
    const userContent = lastMessage.content.toLowerCase();
    
    if (userContent.includes('分析') || userContent.includes('analyze')) {
      return '这是一个模拟的分析结果。在实际使用中，这里会返回真实的AI模型分析结果。';
    } else if (userContent.includes('总结') || userContent.includes('summary')) {
      return '基于提供的内容，我为您生成以下总结：这是一个模拟的总结内容。';
    } else if (userContent.includes('翻译') || userContent.includes('translate')) {
      return 'This is a mock translation. In real usage, this would return actual AI model translation results.';
    } else {
      return '这是一个模拟的AI响应。在实际使用中，这里会返回真实的AI模型生成结果。';
    }
  }

  /**
   * 估算token数量
   */
  estimateTokenCount(messages) {
    let totalTokens = 0;
    
    for (const message of messages) {
      if (message.content) {
        // 简单的token估算：每4个字符约等于1个token
        totalTokens += Math.ceil(message.content.length / 4);
      }
    }
    
    return totalTokens;
  }

  /**
   * 文本推理
   */
  async textInference(prompt, options = {}) {
    const cacheKey = this.generateCacheKey('textInference', { prompt, options });
    const cachedResult = this.getCache(cacheKey);
    
    if (cachedResult) {
      return cachedResult;
    }

    const messages = [
      {
        role: 'user',
        content: prompt
      }
    ];

    try {
      const response = await this.sendAPIRequest(messages, options);
      const result = {
        content: response.choices[0].message.content,
        usage: response.usage,
        model: response.model,
        id: response.id
      };

      this.setCache(cacheKey, result);
      return result;
    } catch (error) {
      throw new Error(`Text inference failed: ${error.message}`);
    }
  }

  /**
   * 批量文本推理
   */
  async batchTextInference(prompts, options = {}) {
    const results = [];
    const batchSize = options.batchSize || 5;
    
    for (let i = 0; i < prompts.length; i += batchSize) {
      const batch = prompts.slice(i, i + batchSize);
      const batchPromises = batch.map(prompt => 
        this.textInference(prompt, options).catch(error => ({
          error: error.message,
          prompt
        }))
      );
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      
      // 批次间延迟，避免速率限制
      if (i + batchSize < prompts.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    return results;
  }

  /**
   * 内容分析
   */
  async analyzeContent(content, analysisType = 'general', options = {}) {
    const analysisPrompts = {
      general: `请分析以下内容，提供详细的分析结果：\n\n${content}`,
      sentiment: `请分析以下内容的情感倾向（积极/消极/中性），并说明理由：\n\n${content}`,
      entities: `请从以下内容中提取关键实体（人名、地名、组织名等）：\n\n${content}`,
      keywords: `请从以下内容中提取关键词和主题：\n\n${content}`,
      summary: `请为以下内容生成简洁的总结：\n\n${content}`
    };

    const prompt = analysisPrompts[analysisType] || analysisPrompts.general;
    
    try {
      const result = await this.textInference(prompt, options);
      return {
        ...result,
        analysisType,
        originalContent: content.substring(0, 100) + (content.length > 100 ? '...' : '')
      };
    } catch (error) {
      throw new Error(`Content analysis failed: ${error.message}`);
    }
  }

  /**
   * 模型健康检查
   */
  async healthCheck() {
    try {
      const testPrompt = '请回复"健康检查通过"';
      const result = await this.textInference(testPrompt, { 
        maxTokens: 50,
        temperature: 0.1 
      });
      
      const isHealthy = result.content.includes('健康检查通过');
      
      return {
        healthy: isHealthy,
        responseTime: Date.now(),
        model: this.modelName,
        provider: this.modelProvider,
        testResponse: result.content
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message,
        model: this.modelName,
        provider: this.modelProvider
      };
    }
  }

  /**
   * 获取模型信息
   */
  getModelInfo() {
    return {
      provider: this.modelProvider,
      name: this.modelName,
      maxTokens: this.maxTokens,
      temperature: this.temperature,
      apiEndpoint: this.apiEndpoint,
      timeout: this.timeout,
      cacheEnabled: this.cacheEnabled,
      cacheSize: this.cache.size
    };
  }

  /**
   * 更新配置
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    
    if (newConfig.modelName) this.modelName = newConfig.modelName;
    if (newConfig.apiKey) this.apiKey = newConfig.apiKey;
    if (newConfig.apiEndpoint) this.apiEndpoint = newConfig.apiEndpoint;
    if (newConfig.maxTokens) this.maxTokens = newConfig.maxTokens;
    if (newConfig.temperature) this.temperature = newConfig.temperature;
    if (newConfig.timeout) this.timeout = newConfig.timeout;
    if (newConfig.cacheEnabled !== undefined) this.cacheEnabled = newConfig.cacheEnabled;
    if (newConfig.cacheTTL) this.cacheTTL = newConfig.cacheTTL;
    
    this.logger.info('AI operation config updated', newConfig);
  }

  /**
   * 清理资源
   */
  async cleanup() {
    this.cache.clear();
    this.logger.info('AI operation resources cleaned up');
  }

  /**
   * 获取操作子状态
   */
  getStatus() {
    return {
      ...this.getModelInfo(),
      category: this.category,
      cacheStats: {
        size: this.cache.size,
        enabled: this.cacheEnabled,
        ttl: this.cacheTTL
      }
    };
  }
}

export default AIOperation;