/**
 * Compatibility Node
 * 兼容性节点
 *
 * 负责处理OpenAI兼容性转换
 * 基于现有GenericCompatibility实现
 */

const BasePipelineNode = require('./BasePipelineNode');
const GenericCompatibility = require('../compatibility/GenericCompatibility');

class CompatibilityNode extends BasePipelineNode {
  constructor(config = {}) {
    super({ ...config, type: 'compatibility' });

    if (config.configPath) {
      this.compatibility = new GenericCompatibility(config.configPath);
    } else {
      throw new Error('Config path is required for CompatibilityNode');
    }
  }

  /**
   * 处理兼容性转换
   * @param {Object} inputData 输入数据
   * @returns {Object} 转换后的数据
   */
  async handleProcess(inputData) {
    const { data } = inputData;

    try {
      // 转换请求
      const providerRequest = this.compatibility.mapRequest(data);

      return {
        data: providerRequest,
        sourceProtocol: 'openai',
        targetProtocol: this.compatibility.config.provider.name
      };
    } catch (error) {
      throw new Error(`Failed to map request: ${error.message}`);
    }
  }

  /**
   * 转换响应数据
   * @param {Object} providerResponse Provider响应数据
   * @returns {Object} OpenAI格式的响应数据
   */
  mapResponse(providerResponse) {
    try {
      return this.compatibility.mapResponse(providerResponse);
    } catch (error) {
      throw new Error(`Failed to map response: ${error.message}`);
    }
  }

  /**
   * 获取Provider信息
   * @returns {Object} Provider信息
   */
  getProviderInfo() {
    return this.compatibility.getProviderInfo();
  }

  /**
   * 重新加载配置
   * @param {string} configPath 配置文件路径
   */
  reloadConfig(configPath) {
    super.reloadConfig({ configPath });
    this.compatibility.reloadConfig();
  }
}

module.exports = CompatibilityNode;