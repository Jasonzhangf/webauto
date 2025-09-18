/**
 * Provider Node
 * Provider节点
 *
 * 负责与实际的AI服务提供商进行通信
 */

const BasePipelineNode = require('./BasePipelineNode');

class ProviderNode extends BasePipelineNode {
  constructor(config = {}) {
    super({ ...config, type: 'provider' });

    this.apiKey = config.apiKey;
    this.apiEndpoint = config.apiEndpoint;
    this.providerName = config.providerName || 'unknown';
    this.timeout = config.timeout || 30000;
  }

  /**
   * 处理Provider请求
   * @param {Object} inputData 输入数据
   * @returns {Object} Provider响应
   */
  async handleProcess(inputData) {
    const { data } = inputData;

    try {
      // 发送请求到Provider
      const response = await this.sendRequest(data);

      return {
        data: response,
        provider: this.providerName
      };
    } catch (error) {
      throw new Error(`Failed to send request to provider: ${error.message}`);
    }
  }

  /**
   * 发送请求到Provider
   * @param {Object} requestData 请求数据
   * @returns {Object} 响应数据
   */
  async sendRequest(requestData) {
    // 这里应该实现实际的HTTP请求逻辑
    // 为简化起见，我们模拟一个响应

    // 模拟网络延迟
    await new Promise(resolve => setTimeout(resolve, 100));

    // 返回模拟响应
    return {
      id: 'mock-response-id',
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: requestData.model || 'mock-model',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: 'This is a mock response from the provider'
          },
          finish_reason: 'stop'
        }
      ],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 20,
        total_tokens: 30
      }
    };
  }

  /**
   * 验证配置
   * @returns {boolean} 验证是否通过
   */
  validateConfig() {
    if (!this.apiKey) {
      throw new Error('API key is required for ProviderNode');
    }

    if (!this.apiEndpoint) {
      throw new Error('API endpoint is required for ProviderNode');
    }

    return true;
  }
}

module.exports = ProviderNode;