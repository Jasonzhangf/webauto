/**
 * LLM Switch Node
 * LLM协议转换节点
 *
 * 负责不同LLM协议之间的字段双向转换
 * 支持基于模板的映射和基于Transformer的转换
 */

const BasePipelineNode = require('./BasePipelineNode');
const transformerManager = require('./TransformerManager');

class LLMSwitchNode extends BasePipelineNode {
  constructor(config = {}) {
    super({ ...config, type: 'llm-switch' });
    this.protocolMap = config.protocolMap || {};
    this.transformerManager = transformerManager;
  }

  /**
   * 处理协议转换
   * @param {Object} inputData 输入数据
   * @returns {Object} 转换后的数据
   */
  async handleProcess(inputData) {
    const { sourceProtocol, targetProtocol, data } = inputData;

    if (!sourceProtocol || !targetProtocol) {
      throw new Error('Source and target protocols must be specified');
    }

    try {
      // 如果配置了transformer，优先使用transformer进行转换
      if (this.config.transformer) {
        return await this.handleTransformerConversion(sourceProtocol, targetProtocol, data);
      }

      // 否则使用原有的模板映射方式
      const mapping = this.getProtocolMapping(sourceProtocol, targetProtocol);
      const transformedData = this.applyTemplateMapping(data, mapping.requestTemplate);

      return {
        sourceProtocol,
        targetProtocol,
        data: transformedData
      };
    } catch (error) {
      throw new Error(`Failed to transform request: ${error.message}`);
    }
  }

  /**
   * 处理基于Transformer的转换
   * @param {string} sourceProtocol 源协议
   * @param {string} targetProtocol 目标协议
   * @param {Object} data 数据
   * @returns {Object} 转换后的数据
   */
  async handleTransformerConversion(sourceProtocol, targetProtocol, data) {
    // 获取或创建源协议转换器
    let sourceTransformer;
    try {
      sourceTransformer = this.transformerManager.createTransformer(sourceProtocol, this.config.transformer.sourceOptions);
    } catch (error) {
      throw new Error(`Failed to create transformer for protocol '${sourceProtocol}': ${error.message}`);
    }

    // 获取或创建目标协议转换器
    let targetTransformer;
    try {
      targetTransformer = this.transformerManager.createTransformer(targetProtocol, this.config.transformer.targetOptions);
    } catch (error) {
      throw new Error(`Failed to create transformer for protocol '${targetProtocol}': ${error.message}`);
    }

    // 转换流程:
    // 1. 源协议格式 → 统一格式
    // 2. 统一格式 → 目标协议格式

    const unifiedData = sourceTransformer.transformRequestIn(data);
    const targetData = targetTransformer.transformRequestOut(unifiedData);

    return {
      sourceProtocol,
      targetProtocol,
      data: targetData
    };
  }

  /**
   * 获取协议映射配置
   * @param {string} sourceProtocol 源协议
   * @param {string} targetProtocol 目标协议
   * @returns {Object} 协议映射配置
   */
  getProtocolMapping(sourceProtocol, targetProtocol) {
    const key = `${sourceProtocol}_to_${targetProtocol}`;
    return this.protocolMap[key] || this.loadMappingFromConfig(key);
  }

  /**
   * 从配置加载映射
   * @param {string} key 映射键
   * @returns {Object} 映射配置
   */
  loadMappingFromConfig(key) {
    // 从配置文件加载映射
    if (this.config.mappings && this.config.mappings[key]) {
      return this.config.mappings[key];
    }

    // 默认返回空映射
    return {
      requestTemplate: {},
      responseTemplate: {}
    };
  }

  /**
   * 应用JSON模板映射
   * @param {Object} data 数据
   * @param {Object} template 模板
   * @returns {Object} 映射后的数据
   */
  applyTemplateMapping(data, template) {
    // 简单的字段映射实现
    const result = {};

    for (const [targetField, sourceField] of Object.entries(template)) {
      if (typeof sourceField === 'string' && sourceField.startsWith('{{') && sourceField.endsWith('}}')) {
        // 模板变量 {{field}}
        const field = sourceField.slice(2, -2).trim();
        result[targetField] = this.getNestedValue(data, field);
      } else if (typeof sourceField === 'string') {
        // 直接字段映射
        result[targetField] = this.getNestedValue(data, sourceField);
      } else {
        // 直接值
        result[targetField] = sourceField;
      }
    }

    return result;
  }

  /**
   * 获取嵌套字段值
   * @param {Object} obj 对象
   * @param {string} path 字段路径
   * @returns {*} 字段值
   */
  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
  }

  /**
   * 转换响应数据
   * @param {Object} responseData 响应数据
   * @param {string} sourceProtocol 源协议
   * @param {string} targetProtocol 目标协议
   * @returns {Object} 转换后的响应数据
   */
  transformResponse(responseData, sourceProtocol, targetProtocol) {
    // 如果配置了transformer，优先使用transformer进行转换
    if (this.config.transformer) {
      return this.handleTransformerResponseConversion(sourceProtocol, targetProtocol, responseData);
    }

    try {
      const mapping = this.getProtocolMapping(targetProtocol, sourceProtocol);
      return this.applyTemplateMapping(responseData, mapping.responseTemplate);
    } catch (error) {
      throw new Error(`Failed to transform response: ${error.message}`);
    }
  }

  /**
   * 处理基于Transformer的响应转换
   * @param {string} sourceProtocol 源协议
   * @param {string} targetProtocol 目标协议
   * @param {Object} data 数据
   * @returns {Object} 转换后的数据
   */
  handleTransformerResponseConversion(sourceProtocol, targetProtocol, data) {
    // 获取或创建源协议转换器
    let sourceTransformer;
    try {
      sourceTransformer = this.transformerManager.createTransformer(sourceProtocol, this.config.transformer.sourceOptions);
    } catch (error) {
      throw new Error(`Failed to create transformer for protocol '${sourceProtocol}': ${error.message}`);
    }

    // 获取或创建目标协议转换器
    let targetTransformer;
    try {
      targetTransformer = this.transformerManager.createTransformer(targetProtocol, this.config.transformer.targetOptions);
    } catch (error) {
      throw new Error(`Failed to create transformer for protocol '${targetProtocol}': ${error.message}`);
    }

    // 转换流程:
    // 1. 源协议格式 → 统一格式
    // 2. 统一格式 → 目标协议格式

    const unifiedData = sourceTransformer.transformResponseIn(data);
    const targetData = targetTransformer.transformResponseOut(unifiedData);

    return targetData;
  }
}

module.exports = LLMSwitchNode;