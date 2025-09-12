const { BaseModule } = require('rcc-basemodule');
const { MCPProtocolFramework } = require('mcp-protocol-framework');
const { ErrorHandlingCenter } = require('rcc-errorhandling');
const fs = require('fs');
const path = require('path');

// 确保日志目录存在
function ensureLogDirectory() {
  const logDir = path.join(require('os').homedir(), '.webauto');
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
}

class MCPManager extends BaseModule {
  constructor() {
    super();
    this.errorHandler = new ErrorHandlingCenter({
      id: 'mcp-manager',
      name: 'MCP Manager Error Handler'
    });
    
    // 确保日志目录存在
    ensureLogDirectory();
    
    // 创建MCP协议框架实例
    this.framework = new MCPProtocolFramework({
      name: 'WebAuto MCP Server',
      version: '0.0.1',
      logger: console,
      toolScanPaths: ['./tools', '../tools'],
      autoScanTools: true
    });
    
    // 设置业务逻辑回调
    this.setupCallbacks();
    
    // 注册WebAuto工具
    this.registerTools();
  }

  setupCallbacks() {
    this.framework.setCallbacks({
      onInitialize: this.handleInitialize.bind(this),
      onToolList: this.handleToolList.bind(this),
      onToolCall: this.handleToolCall.bind(this),
      onInitialized: this.handleInitialized.bind(this),
      onShutdown: this.handleShutdown.bind(this)
    });
  }

  registerTools() {
    // 注册WebAuto核心工具
    this.framework.registerTool({
      name: 'executePipeline',
      description: 'Execute a web automation pipeline',
      inputSchema: {
        type: 'object',
        properties: {
          pipelineName: {
            type: 'string',
            description: 'Name of the pipeline to execute'
          },
          config: {
            type: 'object',
            description: 'Pipeline configuration'
          }
        },
        required: ['pipelineName']
      }
    });

    this.framework.registerTool({
      name: 'startBrowser',
      description: 'Start a browser instance for automation',
      inputSchema: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'Initial URL to navigate to'
          },
          headless: {
            type: 'boolean',
            description: 'Run in headless mode',
            default: false
          }
        }
      }
    });

    this.framework.registerTool({
      name: 'performWebAction',
      description: 'Perform web automation actions',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'Action type (click, type, wait, etc.)'
          },
          selector: {
            type: 'string',
            description: 'CSS selector for target element'
          },
          value: {
            type: 'string',
            description: 'Value to input (for type actions)'
          }
        },
        required: ['action']
      }
    });
  }

  async initialize() {
    this.debug('Initializing MCP Manager...');
    this.framework.start();
    this.debug('MCP Manager initialized');
  }

  async handleInitialize(params) {
    this.debug(`Handling initialize request with params: ${JSON.stringify(params)}`);
    return { success: true };
  }

  async handleInitialized() {
    this.debug('Client initialized notification received');
  }

  async handleToolList() {
    this.debug('Handling tools list request');
    // 返回框架中注册的工具
    return null; // 使用框架默认的工具列表
  }

  async handleToolCall(toolName, args) {
    this.debug(`Handling tool call: ${toolName} with args: ${JSON.stringify(args)}`);
    
    try {
      switch (toolName) {
        case 'executePipeline':
          return await this.executePipeline(args.pipelineName, args.config);
        case 'startBrowser':
          return await this.startBrowser(args);
        case 'performWebAction':
          return await this.performWebAction(args);
        default:
          throw new Error(`Unknown tool: ${toolName}`);
      }
    } catch (error) {
      this.errorHandler.handleError({
        error: error,
        source: `MCPManager.handleToolCall.${toolName}`,
        severity: 'error'
      });
      throw error;
    }
  }

  async executePipeline(pipelineName, config = {}) {
    this.debug(`Executing pipeline: ${pipelineName}`);
    // TODO: 实现实际的管道执行逻辑
    return {
      success: true,
      message: `Pipeline '${pipelineName}' execution started`,
      pipelineId: Date.now().toString()
    };
  }

  async startBrowser(args = {}) {
    this.debug(`Starting browser with args: ${JSON.stringify(args)}`);
    // TODO: 实现实际的浏览器启动逻辑
    return {
      success: true,
      message: 'Browser started successfully',
      browserId: Date.now().toString()
    };
  }

  async performWebAction(args = {}) {
    this.debug(`Performing web action: ${args.action}`);
    // TODO: 实现实际的Web操作逻辑
    return {
      success: true,
      message: `Action '${args.action}' completed successfully`
    };
  }

  async handleShutdown() {
    this.debug('MCP server shutting down');
    // 清理资源
  }

  async handleMessage(message) {
    this.debug(`Handling message: ${JSON.stringify(message)}`);
    return this.framework.handleMessage(message);
  }

  // 获取服务器状态
  getServerStatus() {
    this.debug('Getting server status');
    return {
      initialized: this.framework.initialized,
      tools: this.framework.tools.size
    };
  }
  
  // 调试日志
  debug(message) {
    ensureLogDirectory();
    const logFile = path.join(require('os').homedir(), '.webauto', 'mcp-manager.log');
    const timestamp = new Date().toISOString();
    fs.appendFileSync(logFile, `[${timestamp}] ${message}\n`);
  }
  
  // 获取工具列表
  getTools() {
    return Array.from(this.framework.tools.values());
  }
}

module.exports = MCPManager;