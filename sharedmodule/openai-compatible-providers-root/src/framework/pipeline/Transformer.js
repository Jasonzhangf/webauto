/**
 * Transformer
 * 转换器基类
 *
 * 所有转换器的基类，提供统一的接口和配置管理
 * 借鉴Claude Code Router的transformer设计
 */

class Transformer {
  constructor(options = {}) {
    this.name = options.name || this.constructor.name;
    this.options = options;
  }

  /**
   * 转换请求数据 (Provider特定格式 → 统一格式)
   * @param {Object} request 请求数据
   * @returns {Object} 转换后的请求数据
   */
  transformRequestIn(request) {
    // 子类需要实现具体的转换逻辑
    return request;
  }

  /**
   * 转换响应数据 (统一格式 → Provider特定格式)
   * @param {Object} response 响应数据
   * @returns {Object} 转换后的响应数据
   */
  transformResponseOut(response) {
    // 子类需要实现具体的转换逻辑
    return response;
  }

  /**
   * 转换请求数据 (统一格式 → Provider特定格式)
   * @param {Object} request 请求数据
   * @returns {Object} 转换后的请求数据
   */
  transformRequestOut(request) {
    // 子类需要实现具体的转换逻辑
    return request;
  }

  /**
   * 转换响应数据 (Provider特定格式 → 统一格式)
   * @param {Object} response 响应数据
   * @returns {Object} 转换后的响应数据
   */
  transformResponseIn(response) {
    // 子类需要实现具体的转换逻辑
    return response;
  }

  /**
   * 获取API端点
   * @returns {string} API端点
   */
  get endPoint() {
    return '/v1/chat/completions';
  }

  /**
   * 验证配置
   * @returns {boolean} 验证是否通过
   */
  validateConfig() {
    return true;
  }
}

module.exports = Transformer;