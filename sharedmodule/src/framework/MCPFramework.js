/**
 * MCP Framework Adapter
 * 将工具注册中心适配到 MCP 协议
 */

const ToolRegistry = require('./ToolRegistry');

class MCPFramework {
  constructor(config = {}) {
    this.config = {
      toolDirectories: [],
      logger: console,
      ...config
    };
    
    this.registry = new ToolRegistry({
      toolDirectories: this.config.toolDirectories,
      logger: this.config.logger
    });
    
    this.initialized = false;
  }

  /**
   * 初始化框架
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    this.log('info', 'Initializing MCP Framework');
    
    await this.registry.initialize();
    
    this.initialized = true;
    this.log('info', `MCP Framework initialized with ${this.registry.getToolCount()} tools`);
  }

  /**
   * 获取工具列表（MCP 格式）
   * @returns {Array} 工具列表
   */
  getTools() {
    this.ensureInitialized();
    return this.registry.getToolList();
  }

  /**
   * 调用工具
   * @param {string} name 工具名称
   * @param {Object} args 参数
   * @returns {Promise<Object>} 执行结果
   */
  async callTool(name, args) {
    this.ensureInitialized();
    
    try {
      const result = await this.registry.executeTool(name, args, {
        framework: this,
        timestamp: new Date().toISOString()
      });
      
      return {
        success: true,
        result,
        tool: name,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        tool: name,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * 检查工具是否存在
   * @param {string} name 工具名称
   * @returns {boolean} 是否存在
   */
  hasTool(name) {
    this.ensureInitialized();
    return this.registry.hasTool(name);
  }

  /**
   * 获取工具信息
   * @param {string} name 工具名称
   * @returns {Object|null} 工具信息
   */
  getToolInfo(name) {
    this.ensureInitialized();
    const tool = this.registry.getTool(name);
    
    if (!tool) {
      return null;
    }
    
    return {
      name: tool.getName(),
      description: tool.getDescription(),
      inputSchema: tool.getInputSchema(),
      metadata: tool.getMetadata()
    };
  }

  /**
   * 添加工具目录
   * @param {string} directory 目录路径
   */
  addToolDirectory(directory) {
    if (!this.config.toolDirectories.includes(directory)) {
      this.config.toolDirectories.push(directory);
      this.log('info', `Added tool directory: ${directory}`);
    }
  }

  /**
   * 手动注册工具
   * @param {BaseTool} tool 工具实例
   */
  registerTool(tool) {
    this.ensureInitialized();
    this.registry.registerTool(tool);
  }

  /**
   * 获取所有工具名称
   * @returns {Array<string>} 工具名称列表
   */
  getToolNames() {
    this.ensureInitialized();
    return this.registry.getAllTools().map(tool => tool.getName());
  }

  /**
   * 获取统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    return {
      toolCount: this.registry.getToolCount(),
      toolDirectories: this.config.toolDirectories,
      initialized: this.initialized,
      toolNames: this.getToolNames()
    };
  }

  /**
   * 清理框架
   */
  async cleanup() {
    this.log('info', 'Cleaning up MCP Framework');
    await this.registry.cleanup();
    this.initialized = false;
  }

  /**
   * 确保框架已初始化
   */
  ensureInitialized() {
    if (!this.initialized) {
      throw new Error('MCP Framework is not initialized');
    }
  }

  /**
   * 记录日志
   * @param {string} level 日志级别
   * @param {string} message 日志消息
   */
  log(level, message) {
    if (this.config.logger) {
      this.config.logger[level](`[MCPFramework] ${message}`);
    } else {
      console.log(`[${level.toUpperCase()}] [MCPFramework] ${message}`);
    }
  }
}

module.exports = MCPFramework;