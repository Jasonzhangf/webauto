/**
 * MCP Protocol Framework - Core
 * 纯 MCP 协议框架，不包含业务逻辑
 */

const EventEmitter = require('events');
const readline = require('readline');
const { BaseModule } = require('rcc-basemodule');
const { ErrorHandlingCenter } = require('rcc-errorhandling');
const fs = require('fs');
const path = require('path');

// MCP 错误码
const ERROR_CODES = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603
};

class MCPProtocolFramework extends BaseModule {
  constructor(config = {}) {
    const moduleInfo = {
      id: 'mcp-protocol-framework',
      name: 'MCP Protocol Framework',
      version: '1.0.0',
      description: 'Pure MCP Protocol Framework for building MCP servers',
      type: 'mcp-framework',
      ...config
    };
    
    super(moduleInfo);
    
    this.config = {
      protocolVersion: '2025-06-18',
      logger: console,
      toolScanPaths: ['./tools', './src/tools'],
      autoScanTools: true,
      ...config
    };
    
    this.tools = new Map();
    this.initialized = false;
    this.rl = null;
    
    // 初始化RCC错误处理器
    this.errorHandler = new ErrorHandlingCenter({
      id: 'mcp-protocol-framework',
      name: 'MCP Protocol Framework Error Handler'
    });
    
    // 业务逻辑回调接口
    this.callbacks = {
      onInitialize: null,
      onToolList: null,
      onToolCall: null,
      onInitialized: null,
      onShutdown: null
    };
    
    // 自动扫描工具
    if (this.config.autoScanTools) {
      this.scanAndRegisterTools();
    }
  }

  /**
   * 设置业务逻辑回调
   * @param {Object} callbacks 回调函数
   */
  setCallbacks(callbacks) {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  /**
   * 注册工具
   * @param {Object} tool 工具定义
   */
  registerTool(tool) {
    if (!tool.name || !tool.description || !tool.inputSchema) {
      throw new Error('Tool must have name, description, and inputSchema');
    }
    
    this.tools.set(tool.name, tool);
    this.log('info', `Registered tool: ${tool.name}`);
  }

  /**
   * 注销工具
   * @param {string} name 工具名称
   */
  unregisterTool(name) {
    if (this.tools.has(name)) {
      this.tools.delete(name);
      this.log('info', `Unregistered tool: ${name}`);
    }
  }

  /**
   * 扫描并注册工具
   */
  scanAndRegisterTools() {
    this.log('info', 'Scanning for tools...');
    
    for (const scanPath of this.config.toolScanPaths) {
      this.scanDirectory(scanPath);
    }
    
    this.log('info', `Tool scanning completed. Found ${this.tools.size} tools.`);
  }

  /**
   * 扫描目录中的工具
   * @param {string} directory 目录路径
   */
  scanDirectory(directory) {
    if (!fs.existsSync(directory)) {
      this.log('debug', `Scan directory not found: ${directory}`);
      return;
    }
    
    const files = fs.readdirSync(directory);
    
    for (const file of files) {
      if (file.endsWith('.js')) {
        this.scanToolFile(path.join(directory, file));
      }
    }
  }

  /**
   * 扫描工具文件
   * @param {string} filePath 文件路径
   */
  scanToolFile(filePath) {
    try {
      // 解析绝对路径
      const absolutePath = path.resolve(filePath);
      const toolModule = require(absolutePath);
      
      // 检查是否导出了MCP工具
      if (toolModule.mcpTool) {
        this.registerTool(toolModule.mcpTool);
        this.log('info', `Auto-registered tool from file: ${path.basename(filePath)}`);
      }
      
      // 检查是否导出了多个工具
      if (toolModule.mcpTools) {
        for (const tool of toolModule.mcpTools) {
          this.registerTool(tool);
        }
        this.log('info', `Auto-registered ${toolModule.mcpTools.length} tools from file: ${path.basename(filePath)}`);
      }
      
      // 检查是否是工具类
      if (toolModule.default && typeof toolModule.default === 'function') {
        try {
          const toolInstance = new toolModule.default();
          if (toolInstance.getMCPTool) {
            const tool = toolInstance.getMCPTool();
            this.registerTool(tool);
            this.log('info', `Auto-registered tool class from file: ${path.basename(filePath)}`);
          }
        } catch (error) {
          this.log('debug', `Failed to instantiate tool class from ${filePath}: ${error.message}`);
        }
      }
    } catch (error) {
      this.log('debug', `Failed to scan tool file ${filePath}: ${error.message}`);
    }
  }

  /**
   * 添加工具扫描路径
   * @param {string} path 扫描路径
   */
  addToolScanPath(path) {
    if (!this.config.toolScanPaths.includes(path)) {
      this.config.toolScanPaths.push(path);
      this.scanDirectory(path);
      this.log('info', `Added tool scan path: ${path}`);
    }
  }

  /**
   * 移除工具扫描路径
   * @param {string} path 扫描路径
   */
  removeToolScanPath(path) {
    const index = this.config.toolScanPaths.indexOf(path);
    if (index > -1) {
      this.config.toolScanPaths.splice(index, 1);
      this.log('info', `Removed tool scan path: ${path}`);
    }
  }

  /**
   * 重新扫描所有工具
   */
  rescanTools() {
    this.log('info', 'Rescanning all tools...');
    this.tools.clear();
    this.scanAndRegisterTools();
  }

  /**
   * 启动 MCP 服务器
   */
  start() {
    this.log('info', 'Starting MCP Protocol Framework');
    
    // 设置 stdio 通信
    this.setupStdioCommunication();
    
    this.log('info', 'MCP Protocol Framework started');
  }

  /**
   * 停止 MCP 服务器
   */
  async stop() {
    this.log('info', 'Stopping MCP Protocol Framework');
    
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }
    
    // 调用清理回调
    if (this.callbacks.onShutdown) {
      await this.callbacks.onShutdown();
    }
    
    // 调用BaseModule的destroy方法
    await this.destroy();
    
    this.initialized = false;
    this.log('info', 'MCP Protocol Framework stopped');
  }

  /**
   * 设置 stdio 通信
   */
  setupStdioCommunication() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false
    });

    this.rl.on('line', async (line) => {
      if (!line.trim()) return;
      
      try {
        const message = JSON.parse(line);
        await this.handleMessage(message);
      } catch (error) {
        this.errorHandler.handleError({
        error: error,
        source: 'MCPProtocolFramework.parseMessage',
        severity: 'error'
      });
        this.sendError(null, ERROR_CODES.PARSE_ERROR, `Parse error: ${error.message}`);
      }
    });

    // 保持进程运行
    this.keepAlive();
  }

  /**
   * 处理 MCP 消息
   * @param {Object} message MCP 消息
   */
  async handleMessage(message) {
    this.log('debug', `Received message: ${JSON.stringify(message)}`);
    
    try {
      if (!message.jsonrpc || message.jsonrpc !== '2.0') {
        throw new Error('Invalid JSON-RPC version');
      }
      
      if (!message.method) {
        throw new Error('Missing method');
      }
      
      const result = await this.handleMethod(message);
      
      if (message.id !== undefined) {
        this.sendResponse(message.id, result);
      }
    } catch (error) {
      this.errorHandler.handleError({
        error: error,
        source: 'MCPProtocolFramework.handleMessage',
        severity: 'error'
      });
      const errorCode = this.getErrorCode(error);
      this.sendError(message.id, errorCode, error.message);
    }
  }

  /**
   * 处理 MCP 方法
   * @param {Object} message MCP 消息
   * @returns {Promise<Object>} 处理结果
   */
  async handleMethod(message) {
    switch (message.method) {
      case 'initialize':
        return await this.handleInitialize(message);
        
      case 'initialized':
      case 'notifications/initialized':
        return await this.handleInitialized(message);
        
      case 'tools/list':
        return await this.handleToolsList(message);
        
      case 'tools/call':
        return await this.handleToolsCall(message);
        
      default:
        throw new Error(`Method not found: ${message.method}`);
    }
  }

  /**
   * 处理初始化请求
   * @param {Object} message MCP 消息
   * @returns {Object} 初始化响应
   */
  async handleInitialize(message) {
    this.log('info', 'Handling initialize request');
    
    if (!message.params || !message.params.protocolVersion) {
      throw new Error('Missing protocolVersion in params');
    }
    
    // 调用业务逻辑的初始化回调
    let initData = { success: true };
    if (this.callbacks.onInitialize) {
      initData = await this.callbacks.onInitialize(message.params);
    }
    
    const response = {
      protocolVersion: message.params.protocolVersion,
      capabilities: {
        tools: {
          list: true,
          call: true
        },
        resources: {
          list: false,
          read: false
        },
        prompts: {
          list: false,
          get: false
        }
      },
      serverInfo: {
        name: this.config.name,
        version: this.config.version
      }
    };
    
    this.initialized = true;
    this.log('info', 'Initialize response sent');
    
    return response;
  }

  /**
   * 处理客户端初始化通知
   * @param {Object} message MCP 消息
   */
  async handleInitialized(message) {
    this.log('info', 'Handling client initialized notification');
    
    if (this.callbacks.onInitialized) {
      await this.callbacks.onInitialized();
    }
    
    this.log('info', 'MCP server fully initialized');
    return null;
  }

  /**
   * 处理工具列表请求
   * @param {Object} message MCP 消息
   * @returns {Object} 工具列表
   */
  async handleToolsList(message) {
    this.log('info', 'Handling tools/list request');
    
    if (!this.initialized) {
      throw new Error('Server not initialized');
    }
    
    // 调用业务逻辑的工具列表回调
    let tools = Array.from(this.tools.values());
    if (this.callbacks.onToolList) {
      const customTools = await this.callbacks.onToolList();
      if (customTools) {
        tools = customTools;
      }
    }
    
    return { tools };
  }

  /**
   * 处理工具调用请求
   * @param {Object} message MCP 消息
   * @returns {Object} 工具调用结果
   */
  async handleToolsCall(message) {
    this.log('info', 'Handling tools/call request');
    
    if (!this.initialized) {
      throw new Error('Server not initialized');
    }
    
    if (!message.params || !message.params.name) {
      throw new Error('Missing tool name');
    }
    
    const toolName = message.params.name;
    const toolArgs = message.params.arguments || {};
    
    // 调用业务逻辑的工具调用回调
    if (this.callbacks.onToolCall) {
      return await this.callbacks.onToolCall(toolName, toolArgs);
    } else {
      throw new Error(`Tool execution callback not implemented for: ${toolName}`);
    }
  }

  /**
   * 发送响应
   * @param {string|number} id 请求 ID
   * @param {Object} result 响应结果
   */
  sendResponse(id, result) {
    const response = {
      jsonrpc: '2.0',
      id: id,
      result: result
    };
    
    this.send(response);
    this.log('debug', `Sent response for request ${id}`);
  }

  /**
   * 发送错误响应
   * @param {string|number} id 请求 ID
   * @param {number} code 错误码
   * @param {string} message 错误消息
   */
  sendError(id, code, message) {
    const response = {
      jsonrpc: '2.0',
      id: id,
      error: {
        code: code,
        message: message
      }
    };
    
    this.send(response);
    this.log('error', `Sent error response: ${code} - ${message}`);
  }

  /**
   * 发送消息
   * @param {Object} message 要发送的消息
   */
  send(message) {
    const json = JSON.stringify(message);
    process.stdout.write(json + '\n');
  }

  /**
   * 保持进程运行
   */
  keepAlive() {
    setInterval(() => {
      // 保持进程活跃
    }, 1000);
  }

  /**
   * 获取错误码
   * @param {Error} error 错误对象
   * @returns {number} 错误码
   */
  getErrorCode(error) {
    switch (error.message) {
      case 'Invalid JSON-RPC version':
      case 'Missing method':
        return ERROR_CODES.INVALID_REQUEST;
      case 'Missing protocolVersion in params':
        return ERROR_CODES.INVALID_PARAMS;
      case 'Method not found':
        return ERROR_CODES.METHOD_NOT_FOUND;
      default:
        return ERROR_CODES.INTERNAL_ERROR;
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
    }
  }
}

module.exports = {
  MCPProtocolFramework,
  ERROR_CODES
};