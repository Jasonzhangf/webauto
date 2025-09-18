/**
 * PassThrough Transformer
 * 透明传输转换器
 *
 * 透明传输转换器，不进行任何实际的格式转换，只进行配置调整
 * 用于保持架构一致性，同时避免不必要的处理开销
 */

const Transformer = require('../Transformer');

class PassThroughTransformer extends Transformer {
  constructor(options = {}) {
    super({ ...options, name: 'pass-through' });

    // 可以配置一些调整参数
    this.config = {
      // 模型名称映射
      modelAliases: options.modelAliases || {},
      // 参数默认值
      defaultParams: options.defaultParams || {},
      // 参数范围限制
      paramLimits: options.paramLimits || {},
      // 字段过滤器
      fieldFilters: options.fieldFilters || [],
      ...options
    };
  }

  /**
   * 转换请求数据 (输入格式 → 统一格式)
   * @param {Object} request 输入格式的请求数据
   * @returns {Object} 统一格式的请求数据
   */
  transformRequestIn(request) {
    // 透明传输，直接返回原数据，但可以应用配置调整
    const unifiedRequest = { ...request };

    // 应用模型名称映射
    if (unifiedRequest.model && this.config.modelAliases[unifiedRequest.model]) {
      unifiedRequest.model = this.config.modelAliases[unifiedRequest.model];
    }

    // 应用默认参数
    for (const [param, defaultValue] of Object.entries(this.config.defaultParams)) {
      if (unifiedRequest[param] === undefined) {
        unifiedRequest[param] = defaultValue;
      }
    }

    // 应用参数范围限制
    for (const [param, limits] of Object.entries(this.config.paramLimits)) {
      if (unifiedRequest[param] !== undefined && limits) {
        if (limits.min !== undefined) {
          unifiedRequest[param] = Math.max(limits.min, unifiedRequest[param]);
        }
        if (limits.max !== undefined) {
          unifiedRequest[param] = Math.min(limits.max, unifiedRequest[param]);
        }
      }
    }

    // 应用字段过滤
    if (this.config.fieldFilters.length > 0) {
      for (const field of this.config.fieldFilters) {
        if (unifiedRequest[field] !== undefined) {
          delete unifiedRequest[field];
        }
      }
    }

    return unifiedRequest;
  }

  /**
   * 转换响应数据 (统一格式 → 输出格式)
   * @param {Object} response 统一格式的响应数据
   * @returns {Object} 输出格式的响应数据
   */
  transformResponseOut(response) {
    // 透明传输，直接返回原数据，但可以应用配置调整
    const outputResponse = { ...response };

    // 应用模型名称反向映射
    if (outputResponse.model && this.config.modelAliases) {
      // 查找反向映射
      for (const [alias, original] of Object.entries(this.config.modelAliases)) {
        if (outputResponse.model === original) {
          outputResponse.model = alias;
          break;
        }
      }
    }

    // 确保必要的字段存在
    if (!outputResponse.object) {
      outputResponse.object = 'chat.completion';
    }

    if (!outputResponse.created) {
      outputResponse.created = Math.floor(Date.now() / 1000);
    }

    return outputResponse;
  }

  /**
   * 转换请求数据 (统一格式 → 输出格式)
   * @param {Object} request 统一格式的请求数据
   * @returns {Object} 输出格式的请求数据
   */
  transformRequestOut(request) {
    // 透明传输，直接返回原数据，但可以应用配置调整
    const outputRequest = { ...request };

    // 应用模型名称反向映射
    if (outputRequest.model && this.config.modelAliases) {
      // 查找反向映射
      for (const [alias, original] of Object.entries(this.config.modelAliases)) {
        if (outputRequest.model === original) {
          outputRequest.model = alias;
          break;
        }
      }
    }

    // 应用默认参数（反向）
    for (const [param, defaultValue] of Object.entries(this.config.defaultParams)) {
      if (outputRequest[param] === defaultValue && request[param] !== undefined) {
        outputRequest[param] = request[param];
      }
    }

    return outputRequest;
  }

  /**
   * 转换响应数据 (输出格式 → 统一格式)
   * @param {Object} response 输出格式的响应数据
   * @returns {Object} 统一格式的响应数据
   */
  transformResponseIn(response) {
    // 透明传输，直接返回原数据，但可以应用配置调整
    const unifiedResponse = { ...response };

    // 应用模型名称映射
    if (unifiedResponse.model && this.config.modelAliases[unifiedResponse.model]) {
      unifiedResponse.model = this.config.modelAliases[unifiedResponse.model];
    }

    // 确保必要的字段存在
    if (!unifiedResponse.object) {
      unifiedResponse.object = 'chat.completion';
    }

    if (!unifiedResponse.created) {
      unifiedResponse.created = Math.floor(Date.now() / 1000);
    }

    return unifiedResponse;
  }

  /**
   * 获取API端点
   * @returns {string} API端点
   */
  get endPoint() {
    return this.config.endPoint || '/v1/chat/completions';
  }

  /**
   * 获取默认配置
   * @returns {Object} 默认配置
   */
  static getDefaultConfig() {
    return {
      modelAliases: {},
      defaultParams: {},
      paramLimits: {},
      fieldFilters: []
    };
  }
}

module.exports = PassThroughTransformer;