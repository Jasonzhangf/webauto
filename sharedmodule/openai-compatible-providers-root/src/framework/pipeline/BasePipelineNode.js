/**
 * Base Pipeline Node
 * 流水线节点基类
 *
 * 所有流水线节点的基类，提供统一的接口和配置管理
 */

const path = require('path');

class BasePipelineNode {
  constructor(config = {}) {
    this.name = config.name || this.constructor.name;
    this.type = config.type || 'pipeline-node';
    this.enabled = config.enabled !== false;
    this.config = config;
    this.nextNode = null;
  }

  /**
   * 初始化节点
   */
  initialize() {
    console.log(`Initializing pipeline node: ${this.name}`);
    this.validateConfig();
  }

  /**
   * 设置下一个节点
   * @param {BasePipelineNode} node 下一个节点
   */
  setNext(node) {
    this.nextNode = node;
  }

  /**
   * 处理输入数据
   * @param {Object} inputData 输入数据
   * @returns {Object} 处理后的数据
   */
  async process(inputData) {
    if (!this.enabled) {
      return this.forwardToNext(inputData);
    }

    try {
      const processedData = await this.handleProcess(inputData);
      return this.forwardToNext(processedData);
    } catch (error) {
      throw new Error(`Error in node ${this.name}: ${error.message}`);
    }
  }

  /**
   * 转发到下一个节点
   * @param {Object} data 数据
   * @returns {Object} 处理结果
   */
  async forwardToNext(data) {
    if (this.nextNode) {
      return await this.nextNode.process(data);
    }
    return data;
  }

  /**
   * 子类需要实现的具体处理逻辑
   * @param {Object} inputData 输入数据
   * @returns {Object} 处理后的数据
   */
  async handleProcess(inputData) {
    // 默认实现，直接返回输入数据
    return inputData;
  }

  /**
   * 验证配置
   * @returns {boolean} 验证是否通过
   */
  validateConfig() {
    // 通用配置验证逻辑
    return true;
  }

  /**
   * 重新加载配置
   * @param {Object} newConfig 新配置
   */
  reloadConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    this.name = newConfig.name || this.name;
    this.enabled = newConfig.enabled !== false;
  }

  /**
   * 获取节点信息
   * @returns {Object} 节点信息
   */
  getNodeInfo() {
    return {
      name: this.name,
      type: this.type,
      enabled: this.enabled,
    };
  }
}

module.exports = BasePipelineNode;