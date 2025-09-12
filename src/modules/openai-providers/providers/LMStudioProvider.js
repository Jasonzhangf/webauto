/**
 * LMStudio Provider
 * LMStudio Provider实现
 */

const { BaseProvider } = require('openai-compatible-providers-framework');

class LMStudioProvider extends BaseProvider {
  constructor(config) {
    super({
      name: 'lmstudio',
      endpoint: config.endpoint || 'http://localhost:1234/v1/chat/completions',
      supportedModels: config.supportedModels || [
        'qwen3-30b-a3b-instruct-2507-mlx',
        'qwen3-coder-480b-a35b-instruct-mlx',
        'glm-4.5v',
        'nextcoder-32b-mlx'
      ],
      defaultModel: config.defaultModel || 'gpt-oss-20b-mlx',
      ...config
    });
    
    this.apiKey = config.apiKey || 'test-key';
    this.timeout = config.timeout || 120000;
  }
  
  async executeChat(providerRequest) {
    this.debug('[LMStudio] Executing chat request');
    
    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(providerRequest)
      });
      
      if (!response.ok) {
        throw new Error(`LMStudio API error: ${response.status} ${response.statusText}`);
      }
      
      const providerResponse = await response.json();
      this.debug('[LMStudio] Chat request completed successfully');
      
      return providerResponse;
      
    } catch (error) {
      this.error(`[LMStudio] Chat request failed: ${error.message}`);
      throw error;
    }
  }
  
  async *executeStreamChat(providerRequest) {
    this.debug('[LMStudio] Executing stream chat request');
    
    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          ...providerRequest,
          stream: true
        })
      });
      
      if (!response.ok) {
        throw new Error(`LMStudio API error: ${response.status} ${response.statusText}`);
      }
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      try {
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) break;
          
          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') {
                return;
              }
              
              try {
                const parsed = JSON.parse(data);
                yield parsed;
              } catch (e) {
                // 忽略解析错误
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
      
      this.debug('[LMStudio] Stream chat request completed successfully');
      
    } catch (error) {
      this.error(`[LMStudio] Stream chat request failed: ${error.message}`);
      throw error;
    }
  }
  
  getCapabilities() {
    return {
      streaming: true,
      tools: true,  // LMStudio支持工具调用
      vision: false,
      jsonMode: true
    };
  }
  
  async healthCheck() {
    try {
      this.debug('[LMStudio] Performing health check');
      
      // 简单的健康检查 - 发送一个小的测试请求
      const testRequest = {
        model: this.defaultModel,
        messages: [{ role: 'user', content: 'test' }],
        max_tokens: 1
      };
      
      const response = await this.chat(testRequest);
      
      return {
        status: 'healthy',
        provider: this.name,
        endpoint: this.endpoint,
        model: this.defaultModel,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      this.error(`[LMStudio] Health check failed: ${error.message}`);
      return {
        status: 'unhealthy',
        provider: this.name,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}

module.exports = LMStudioProvider;