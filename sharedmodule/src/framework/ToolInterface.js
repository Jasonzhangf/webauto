/**
 * MCP Tool Interface
 * 定义所有工具必须实现的接口
 */

class ToolInterface {
  /**
   * 获取工具名称
   * @returns {string} 工具名称
   */
  getName() {
    throw new Error('getName() must be implemented by tool');
  }

  /**
   * 获取工具描述
   * @returns {string} 工具描述
   */
  getDescription() {
    throw new Error('getDescription() must be implemented by tool');
  }

  /**
   * 获取工具输入参数模式
   * @returns {Object} JSON Schema 格式的输入参数
   */
  getInputSchema() {
    throw new Error('getInputSchema() must be implemented by tool');
  }

  /**
   * 执行工具功能
   * @param {Object} args 输入参数
   * @param {Object} context 执行上下文
   * @returns {Promise<Object>} 执行结果
   */
  async execute(args, context = {}) {
    throw new Error('execute() must be implemented by tool');
  }

  /**
   * 工具初始化（可选）
   * @param {Object} config 配置参数
   */
  async initialize(config = {}) {
    // 默认空实现
  }

  /**
   * 工具清理（可选）
   */
  async cleanup() {
    // 默认空实现
  }

  /**
   * 获取工具元数据
   * @returns {Object} 工具元数据
   */
  getMetadata() {
    return {
      version: '1.0.0',
      author: 'unknown',
      category: 'general',
      tags: []
    };
  }
}

module.exports = ToolInterface;