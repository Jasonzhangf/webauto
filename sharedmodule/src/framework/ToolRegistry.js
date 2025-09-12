/**
 * MCP Tool Registry
 * 工具注册中心，负责工具的自动发现、注册和管理
 */

const path = require('path');
const fs = require('fs');
const Module = require('module');

class ToolRegistry {
  constructor(config = {}) {
    this.tools = new Map();
    this.config = {
      toolDirectories: [],
      autoDiscover: true,
      logger: console,
      ...config
    };
    this.initialized = false;
  }

  /**
   * 初始化注册中心
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    this.log('info', 'Initializing Tool Registry');

    if (this.config.autoDiscover) {
      await this.discoverTools();
    }

    this.initialized = true;
    this.log('info', `Tool Registry initialized with ${this.tools.size} tools`);
  }

  /**
   * 自动发现工具
   */
  async discoverTools() {
    const directories = this.config.toolDirectories || [];
    
    for (const directory of directories) {
      await this.scanDirectory(directory);
    }
  }

  /**
   * 扫描目录发现工具
   * @param {string} directory 目录路径
   */
  async scanDirectory(directory) {
    if (!fs.existsSync(directory)) {
      this.log('warn', `Tool directory not found: ${directory}`);
      return;
    }

    const items = fs.readdirSync(directory, { withFileTypes: true });
    
    for (const item of items) {
      if (item.isDirectory()) {
        await this.scanToolDirectory(path.join(directory, item.name));
      }
    }
  }

  /**
   * 扫描具体工具目录
   * @param {string} toolDir 工具目录路径
   */
  async scanToolDirectory(toolDir) {
    const indexPath = path.join(toolDir, 'index.js');
    const packagePath = path.join(toolDir, 'package.json');
    
    if (!fs.existsSync(indexPath)) {
      return;
    }

    try {
      // 读取工具包信息
      let packageInfo = {};
      if (fs.existsSync(packagePath)) {
        packageInfo = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
      }

      // 动态加载工具
      const ToolClass = require(indexPath);
      
      // 验证工具类
      if (!this.isValidTool(ToolClass)) {
        this.log('error', `Invalid tool class in: ${toolDir}`);
        return;
      }

      // 实例化工具
      const tool = new ToolClass(packageInfo.config || {});
      
      // 注册工具
      this.registerTool(tool);
      
      this.log('info', `Discovered and registered tool: ${tool.getName()}`);
    } catch (error) {
      this.log('error', `Failed to load tool from ${toolDir}: ${error.message}`);
    }
  }

  /**
   * 验证工具类
   * @param {Class} ToolClass 工具类
   * @returns {boolean} 是否有效
   */
  isValidTool(ToolClass) {
    try {
      const instance = new ToolClass({});
      return typeof instance.getName === 'function' &&
             typeof instance.getDescription === 'function' &&
             typeof instance.getInputSchema === 'function' &&
             typeof instance.execute === 'function';
    } catch (error) {
      return false;
    }
  }

  /**
   * 注册工具
   * @param {BaseTool} tool 工具实例
   */
  registerTool(tool) {
    const name = tool.getName();
    
    if (this.tools.has(name)) {
      this.log('warn', `Tool ${name} already registered, replacing`);
    }

    this.tools.set(name, tool);
    this.log('info', `Registered tool: ${name}`);
  }

  /**
   * 注销工具
   * @param {string} name 工具名称
   */
  unregisterTool(name) {
    if (this.tools.has(name)) {
      const tool = this.tools.get(name);
      this.tools.delete(name);
      
      // 清理工具资源
      if (typeof tool.cleanup === 'function') {
        tool.cleanup();
      }
      
      this.log('info', `Unregistered tool: ${name}`);
    }
  }

  /**
   * 获取工具
   * @param {string} name 工具名称
   * @returns {BaseTool|null} 工具实例
   */
  getTool(name) {
    return this.tools.get(name) || null;
  }

  /**
   * 获取所有工具
   * @returns {Array<BaseTool>} 工具列表
   */
  getAllTools() {
    return Array.from(this.tools.values());
  }

  /**
   * 获取工具列表（用于 MCP）
   * @returns {Array} MCP 格式的工具列表
   */
  getToolList() {
    return this.getAllTools().map(tool => ({
      name: tool.getName(),
      description: tool.getDescription(),
      inputSchema: tool.getInputSchema()
    }));
  }

  /**
   * 执行工具
   * @param {string} name 工具名称
   * @param {Object} args 参数
   * @param {Object} context 上下文
   * @returns {Promise<Object>} 执行结果
   */
  async executeTool(name, args, context = {}) {
    const tool = this.getTool(name);
    
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }

    return await tool.execute(args, context);
  }

  /**
   * 检查工具是否存在
   * @param {string} name 工具名称
   * @returns {boolean} 是否存在
   */
  hasTool(name) {
    return this.tools.has(name);
  }

  /**
   * 获取工具数量
   * @returns {number} 工具数量
   */
  getToolCount() {
    return this.tools.size;
  }

  /**
   * 清理所有工具
   */
  async cleanup() {
    this.log('info', 'Cleaning up all tools');
    
    for (const [name, tool] of this.tools) {
      try {
        if (typeof tool.cleanup === 'function') {
          await tool.cleanup();
        }
      } catch (error) {
        this.log('error', `Failed to cleanup tool ${name}: ${error.message}`);
      }
    }
    
    this.tools.clear();
    this.initialized = false;
  }

  /**
   * 记录日志
   * @param {string} level 日志级别
   * @param {string} message 日志消息
   */
  log(level, message) {
    if (this.config.logger) {
      this.config.logger[level](`[ToolRegistry] ${message}`);
    } else {
      console.log(`[${level.toUpperCase()}] [ToolRegistry] ${message}`);
    }
  }
}

module.exports = ToolRegistry;