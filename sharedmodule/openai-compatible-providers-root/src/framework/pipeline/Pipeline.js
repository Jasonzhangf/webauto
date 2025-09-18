/**
 * Pipeline
 * 流水线
 *
 * 负责管理和执行流水线节点
 */

const BasePipelineNode = require('./BasePipelineNode');

class Pipeline {
  constructor(config = {}) {
    this.name = config.name || 'default-pipeline';
    this.nodes = [];
    this.config = config;
  }

  /**
   * 添加节点到流水线
   * @param {BasePipelineNode} node 节点
   * @returns {Pipeline} 当前流水线实例
   */
  addNode(node) {
    if (!(node instanceof BasePipelineNode)) {
      throw new Error('Node must be an instance of BasePipelineNode');
    }

    // 将当前节点链接到上一个节点
    if (this.nodes.length > 0) {
      const lastNode = this.nodes[this.nodes.length - 1];
      lastNode.setNext(node);
    }

    this.nodes.push(node);
    return this;
  }

  /**
   * 执行流水线
   * @param {Object} inputData 输入数据
   * @returns {Object} 处理结果
   */
  async execute(inputData) {
    if (this.nodes.length === 0) {
      throw new Error('Pipeline must have at least one node');
    }

    // 从第一个节点开始执行
    const firstNode = this.nodes[0];
    return await firstNode.process(inputData);
  }

  /**
   * 获取流水线信息
   * @returns {Object} 流水线信息
   */
  getPipelineInfo() {
    return {
      name: this.name,
      nodeCount: this.nodes.length,
      nodes: this.nodes.map(node => node.getNodeInfo())
    };
  }

  /**
   * 验证流水线配置
   * @returns {boolean} 验证是否通过
   */
  validate() {
    if (this.nodes.length === 0) {
      throw new Error('Pipeline must have at least one node');
    }

    // 验证每个节点的配置
    for (const node of this.nodes) {
      if (typeof node.validateConfig === 'function') {
        node.validateConfig();
      }
    }

    return true;
  }

  /**
   * 重新加载配置
   * @param {Object} newConfig 新配置
   */
  reloadConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    this.name = newConfig.name || this.name;
  }
}

module.exports = Pipeline;