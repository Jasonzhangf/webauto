/**
 * iFlow Provider
 * iFlow Provider实现
 */

const { BaseProvider } = require('openai-compatible-providers-framework');

class iFlowProvider extends BaseProvider {
  constructor(config) {
    super({
      name: 'iflow',
      endpoint: config.endpoint || 'https://platform.iflow.cn/api/v1/chat/completions',
      supportedModels: config.supportedModels || [
        'iflow-chat',
        'iflow-chat-pro',
        'iflow-chat-turbo'
      ],
      defaultModel: config.defaultModel || 'iflow-chat',
      ...config
    });
    
    this.apiKey = config.apiKey;
    this.timeout = config.timeout || 60000;
  }
  
  async executeChat(providerRequest) {
    console.log('[iFlow] Executing chat request to:', this.endpoint);
    console.log('[iFlow] Request payload:', JSON.stringify(providerRequest, null, 2));
    
    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'User-Agent': 'iFlow-Client/1.0'
        },
        body: JSON.stringify(providerRequest)
      });
      
      console.log('[iFlow] Response status:', response.status, response.statusText);
      console.log('[iFlow] Response headers:', Object.fromEntries(response.headers.entries()));
      
      if (!response.ok) {
        const errorText = await response.text();
        console.log('[iFlow] Error response:', errorText);
        throw new Error(`iFlow API error: ${response.status} ${response.statusText}: ${errorText}`);
      }
      
      const providerResponse = await response.json();
      console.log('[iFlow] Chat request completed successfully');
      console.log('[iFlow] Response data:', JSON.stringify(providerResponse, null, 2));
      
      return providerResponse;
      
    } catch (error) {
      console.error(`[iFlow] Chat request failed: ${error.message}`);
      throw error;
    }
  }
  
  async *executeStreamChat(providerRequest) {
    this.debug('[iFlow] Executing stream chat request');
    
    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'User-Agent': 'iFlow-Client/1.0'
        },
        body: JSON.stringify({
          ...providerRequest,
          stream: true
        })
      });
      
      if (!response.ok) {
        throw new Error(`iFlow API error: ${response.status} ${response.statusText}`);
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
      
      this.debug('[iFlow] Stream chat request completed successfully');
      
    } catch (error) {
      this.error(`[iFlow] Stream chat request failed: ${error.message}`);
      throw error;
    }
  }
  
  getCapabilities() {
    return {
      streaming: true,
      tools: true,  // iFlow支持工具调用
      vision: false,
      jsonMode: true
    };
  }
  
  async healthCheck() {
    try {
      this.debug('[iFlow] Performing health check');
      
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
      this.error(`[iFlow] Health check failed: ${error.message}`);
      return {
        status: 'unhealthy',
        provider: this.name,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}

module.exports = iFlowProvider;