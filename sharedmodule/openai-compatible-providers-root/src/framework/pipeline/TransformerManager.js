/**
 * Transformer Manager
 * 转换器管理器
 *
 * 负责管理和创建不同类型的转换器实例
 */

const AnthropicTransformer = require('./transformers/AnthropicTransformer');
const OpenAITransformer = require('./transformers/OpenAITransformer');
const GeminiTransformer = require('./transformers/GeminiTransformer');
const PassThroughTransformer = require('./transformers/PassThroughTransformer');

class TransformerManager {
  constructor() {
    this.transformers = new Map();
    this.registeredTypes = new Map();
    this.registerBuiltInTransformers();
  }

  /**
   * 注册内置转换器
   */
  registerBuiltInTransformers() {
    this.registerTransformerType('anthropic', AnthropicTransformer);
    this.registerTransformerType('openai', OpenAITransformer);
    this.registerTransformerType('gemini', GeminiTransformer);
    this.registerTransformerType('pass-through', PassThroughTransformer);
  }

  /**
   * 注册转换器类型
   * @param {string} type 转换器类型
   * @param {class} transformerClass 转换器类
   */
  registerTransformerType(type, transformerClass) {
    this.registeredTypes.set(type, transformerClass);
  }

  /**
   * 创建转换器实例
   * @param {string} type 转换器类型
   * @param {Object} options 转换器选项
   * @returns {Transformer} 转换器实例
   */
  createTransformer(type, options = {}) {
    const key = `${type}_${JSON.stringify(options)}`;

    // 如果已经创建过相同配置的转换器，直接返回缓存的实例
    if (this.transformers.has(key)) {
      return this.transformers.get(key);
    }

    // 获取转换器类
    const TransformerClass = this.registeredTypes.get(type);
    if (!TransformerClass) {
      throw new Error(`Transformer type '${type}' is not registered`);
    }

    // 创建转换器实例
    const transformer = new TransformerClass(options);

    // 缓存实例
    this.transformers.set(key, transformer);

    return transformer;
  }

  /**
   * 获取转换器实例
   * @param {string} type 转换器类型
   * @param {Object} options 转换器选项
   * @returns {Transformer} 转换器实例
   */
  getTransformer(type, options = {}) {
    const key = `${type}_${JSON.stringify(options)}`;
    return this.transformers.get(key);
  }

  /**
   * 获取所有已注册的转换器类型
   * @returns {Array} 转换器类型数组
   */
  getRegisteredTypes() {
    return Array.from(this.registeredTypes.keys());
  }

  /**
   * 获取所有转换器实例信息
   * @returns {Array} 转换器实例信息数组
   */
  getAllTransformersInfo() {
    const info = [];
    for (const [key, transformer] of this.transformers) {
      info.push({
        key,
        name: transformer.name,
        type: transformer.constructor.name,
        endPoint: transformer.endPoint
      });
    }
    return info;
  }

  /**
   * 清除所有缓存的转换器实例
   */
  clearCache() {
    this.transformers.clear();
  }

  /**
   * 验证转换器配置
   * @param {Object} config 转换器配置
   * @returns {boolean} 验证是否通过
   */
  validateConfig(config) {
    if (!config || typeof config !== 'object') {
      return false;
    }

    if (config.use) {
      if (!Array.isArray(config.use)) {
        return false;
      }

      for (const item of config.use) {
        if (typeof item === 'string') {
          // 简单的转换器名称
          if (!this.registeredTypes.has(item)) {
            return false;
          }
        } else if (Array.isArray(item)) {
          // 转换器名称和选项
          const [name, options] = item;
          if (typeof name !== 'string' || typeof options !== 'object') {
            return false;
          }
          if (!this.registeredTypes.has(name)) {
            return false;
          }
        } else {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * 应用转换器链
   * @param {Array} transformerConfigs 转换器配置数组
   * @param {Object} data 数据
   * @param {string} method 转换方法名
   * @returns {Object} 转换后的数据
   */
  applyTransformerChain(transformerConfigs, data, method) {
    let result = { ...data };

    for (const config of transformerConfigs) {
      let transformer;
      let options = {};

      if (typeof config === 'string') {
        // 简单的转换器名称
        transformer = this.createTransformer(config);
      } else if (Array.isArray(config)) {
        // 转换器名称和选项
        const [name, opts] = config;
        transformer = this.createTransformer(name, opts);
        options = opts || {};
      } else {
        throw new Error('Invalid transformer configuration');
      }

      if (typeof transformer[method] === 'function') {
        result = transformer[method](result, options);
      }
    }

    return result;
  }
}

// 创建全局单例实例
const transformerManager = new TransformerManager();

module.exports = transformerManager;