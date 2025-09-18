#!/usr/bin/env node

// WebAuto MCP Transport using the new MCP Protocol Framework
const { MCPProtocolFramework } = require('@webauto/mcp-protocol-framework');
const { BaseModule } = require('rcc-basemodule');
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

class WebAutoMCPTransport extends BaseModule {
  constructor() {
    super();
    this.errorHandler = new ErrorHandlingCenter({
      id: 'mcp-transport',
      name: 'MCP Transport Error Handler'
    });
    
    // 确保日志目录存在
    ensureLogDirectory();
    
    // 创建MCP协议框架实例
    this.framework = new MCPProtocolFramework({
      name: 'WebAuto MCP Transport',
      version: '0.0.1',
      logger: console
    });
    
    // 设置业务逻辑回调
    this.setupCallbacks();
    
    // 注册工具
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
      name: 'applyRules',
      description: 'Apply rules to a webpage',
      inputSchema: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'URL of the webpage to apply rules to'
          }
        },
        required: ['url']
      }
    });

    this.framework.registerTool({
      name: 'extractTargets',
      description: 'Extract target elements from a webpage',
      inputSchema: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'URL of the webpage to extract targets from'
          },
          prompt: {
            type: 'string',
            description: 'Prompt for target extraction'
          }
        },
        required: ['url', 'prompt']
      }
    });
  }

  start() {
    this.debug('Starting WebAuto MCP Transport');
    this.framework.start();
    this.debug('WebAuto MCP Transport started');
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
        case 'applyRules':
          return await this.applyRules(args.url);
        case 'extractTargets':
          return await this.extractTargets(args.url, args.prompt);
        default:
          throw new Error(`Unknown tool: ${toolName}`);
      }
    } catch (error) {
      this.errorHandler.handleError({
        error: error,
        source: `WebAutoMCPTransport.handleToolCall.${toolName}`,
        severity: 'error'
      });
      throw error;
    }
  }

  async executePipeline(pipelineName, config = {}) {
    this.debug(`Executing pipeline: ${pipelineName}`);
    // TODO: 实现实际的管道执行逻辑
    return {
      content: [
        {
          type: 'text',
          text: `Pipeline '${pipelineName}' execution started. Config: ${JSON.stringify(config)}`
        }
      ]
    };
  }

  async applyRules(url) {
    this.debug(`Applying rules to URL: ${url}`);
    // TODO: 实现实际的规则应用逻辑
    return {
      content: [
        {
          type: 'text',
          text: `Rules applied to URL: ${url}`
        }
      ]
    };
  }

  async extractTargets(url, prompt) {
    this.debug(`Extracting targets from URL: ${url} with prompt: ${prompt}`);
    // TODO: 实现实际的目标提取逻辑
    return {
      content: [
        {
          type: 'text',
          text: `Target extraction completed for URL: ${url} with prompt: ${prompt}`
        }
      ]
    };
  }

  async handleShutdown() {
    this.debug('MCP server shutting down');
    // 清理资源
  }

  // 调试日志
  debug(message) {
    ensureLogDirectory();
    const logFile = path.join(require('os').homedir(), '.webauto', 'stdio-transport.log');
    const timestamp = new Date().toISOString();
    fs.appendFileSync(logFile, `[${timestamp}] ${message}\n`);
  }
}

// 如果直接运行此文件，启动传输
if (require.main === module) {
  const transport = new WebAutoMCPTransport();
  transport.start();
  
  // 保持主进程运行
  process.stdin.resume();
  
  // 防止进程退出
  process.on('SIGTERM', () => {
    transport.debug('Received SIGTERM - shutting down gracefully');
    process.exit(0);
  });
  
  process.on('SIGINT', () => {
    transport.debug('Received SIGINT - shutting down gracefully');
    process.exit(0);
  });
}

module.exports = WebAutoMCPTransport;