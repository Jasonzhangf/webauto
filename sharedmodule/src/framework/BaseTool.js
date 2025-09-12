/**
 * MCP Tool Base Class
 * 提供工具的基础实现，新工具可以继承此类
 */

const ToolInterface = require('./ToolInterface');

class BaseTool extends ToolInterface {
  constructor(name, description, config = {}) {
    super();
    this.name = name;
    this.description = description;
    this.config = config;
    this.initialized = false;
  }

  /**
   * 获取工具名称
   * @returns {string} 工具名称
   */
  getName() {
    return this.name;
  }

  /**
   * 获取工具描述
   * @returns {string} 工具描述
   */
  getDescription() {
    return this.description;
  }

  /**
   * 获取工具输入参数模式
   * @returns {Object} JSON Schema 格式的输入参数
   */
  getInputSchema() {
    return {
      type: 'object',
      properties: {},
      required: []
    };
  }

  /**
   * 验证输入参数
   * @param {Object} args 输入参数
   * @returns {Object} { valid: boolean, errors: Array }
   */
  validateInput(args) {
    const schema = this.getInputSchema();
    const errors = [];

    // 检查必需参数
    if (schema.required) {
      for (const requiredField of schema.required) {
        if (!(requiredField in args)) {
          errors.push(`Missing required field: ${requiredField}`);
        }
      }
    }

    // 检查参数类型
    if (schema.properties) {
      for (const [field, fieldSchema] of Object.entries(schema.properties)) {
        if (field in args) {
          const value = args[field];
          const type = fieldSchema.type;
          
          if (type && !this.validateType(value, type)) {
            errors.push(`Field '${field}' should be of type ${type}`);
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * 验证参数类型
   * @param {*} value 值
   * @param {string} type 期望的类型
   * @returns {boolean} 是否匹配
   */
  validateType(value, type) {
    switch (type) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number';
      case 'boolean':
        return typeof value === 'boolean';
      case 'object':
        return typeof value === 'object' && value !== null;
      case 'array':
        return Array.isArray(value);
      default:
        return true;
    }
  }

  /**
   * 执行工具功能（带验证）
   * @param {Object} args 输入参数
   * @param {Object} context 执行上下文
   * @returns {Promise<Object>} 执行结果
   */
  async execute(args, context = {}) {
    // 验证输入
    const validation = this.validateInput(args);
    if (!validation.valid) {
      throw new Error(`Invalid input: ${validation.errors.join(', ')}`);
    }

    // 确保工具已初始化
    if (!this.initialized) {
      await this.initialize(this.config);
      this.initialized = true;
    }

    try {
      // 调用子类实现
      return await this.doExecute(args, context);
    } catch (error) {
      throw new Error(`${this.name} execution failed: ${error.message}`);
    }
  }

  /**
   * 实际执行逻辑（子类必须实现）
   * @param {Object} args 输入参数
   * @param {Object} context 执行上下文
   * @returns {Promise<Object>} 执行结果
   */
  async doExecute(args, context) {
    throw new Error('doExecute() must be implemented by tool subclass');
  }

  /**
   * 记录日志
   * @param {string} level 日志级别
   * @param {string} message 日志消息
   */
  log(level, message) {
    if (this.config.logger) {
      this.config.logger[level](`[${this.name}] ${message}`);
    } else {
      console.log(`[${level.toUpperCase()}] [${this.name}] ${message}`);
    }
  }

  /**
   * 获取工具元数据
   * @returns {Object} 工具元数据
   */
  getMetadata() {
    return {
      ...super.getMetadata(),
      name: this.name,
      description: this.description,
      config: this.config
    };
  }
}

module.exports = BaseTool;