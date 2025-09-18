/**
 * ICompatibility Interface
 * 兼容性接口基类
 *
 * 所有兼容性实现的基类
 */

class ICompatibility {
  constructor(config = {}) {
    this.providerName = config.providerName || 'unknown';
    this.version = config.version || '1.0.0';
    this.description = config.description || 'Compatibility module';
  }

  /**
   * 将OpenAI格式的请求映射到Provider格式
   * @param {Object} openaiRequest OpenAI格式的请求
   * @returns {Object} Provider格式的请求
   */
  mapRequest(openaiRequest) {
    // 子类应实现此方法
    throw new Error('mapRequest method must be implemented by subclass');
  }

  /**
   * 将Provider格式的响应映射到OpenAI格式
   * @param {Object} providerResponse Provider格式的响应
   * @returns {Object} OpenAI格式的响应
   */
  mapResponse(providerResponse) {
    // 子类应实现此方法
    throw new Error('mapResponse method must be implemented by subclass');
  }

  /**
   * 验证请求参数
   * @param {Object} request 请求参数
   */
  validateRequest(request) {
    // 默认实现，子类可以重写
    return true;
  }

  /**
   * 获取Provider信息
   * @returns {Object} Provider信息
   */
  getProviderInfo() {
    return {
      name: this.providerName,
      version: this.version,
      description: this.description
    };
  }

  /**
   * 检查是否支持工具调用
   * @returns {boolean} 是否支持工具调用
   */
  isToolCallingSupported() {
    return false;
  }

  /**
   * 获取工具调用配置
   * @returns {Object} 工具调用配置
   */
  getToolCallingConfig() {
    return {};
  }

  /**
   * 检查是否支持流式响应
   * @returns {boolean} 是否支持流式响应
   */
  isStreamingSupported() {
    return false;
  }

  /**
   * 获取流式响应配置
   * @returns {Object} 流式响应配置
   */
  getStreamingConfig() {
    return {};
  }
}

module.exports = { ICompatibility };