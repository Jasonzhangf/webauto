const { BaseModule } = require('rcc-basemodule');
const { ERROR_CODES, METHODS } = require('./protocol');
const fs = require('fs');
const path = require('path');

// 创建一个简单的UnderConstruction模拟类
class UnderConstruction {
  mark(feature) {
    console.warn(`[Under Construction] Feature: ${feature}`);
  }
}

// 创建一个简单的错误处理模拟
class ErrorHandler {
  handle(error) {
    console.error(`[Error] ${error.message}`);
    console.error(error.stack);
  }
}

// 确保日志目录存在
function ensureLogDirectory() {
  const logDir = path.join(require('os').homedir(), '.webauto');
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
}

class MCPServer extends BaseModule {
  constructor(transport = 'stdio') {
    super();
    this.errorHandler = new ErrorHandler();
    this.underConstruction = new UnderConstruction();
    
    // 确保日志目录存在
    ensureLogDirectory();
    
    this.transport = transport;
    this.resources = [];
    this.prompts = [];
    this.tools = [];
    this.isInitialized = false;
    
    // 注册核心方法处理器
    this.methodHandlers = {
      [METHODS.INITIALIZE]: this.handleInitialize.bind(this),
      [METHODS.INITIALIZED]: this.handleInitialized.bind(this),
      [METHODS.RESOURCES_LIST]: this.handleResourcesList.bind(this),
      [METHODS.RESOURCES_READ]: this.handleResourcesRead.bind(this),
      [METHODS.PROMPTS_LIST]: this.handlePromptsList.bind(this),
      [METHODS.PROMPTS_GET]: this.handlePromptsGet.bind(this),
      [METHODS.TOOLS_LIST]: this.handleToolsList.bind(this),
      [METHODS.TOOLS_CALL]: this.handleToolsCall.bind(this)
    };
    
    // 初始化资源、提示和工具
    this.initializeResources();
    this.initializePrompts();
    this.initializeTools();
  }

  // 初始化资源
  initializeResources() {
    this.debug('Initializing resources');
    
    // 注册示例资源
    this.resources.push({
      uri: 'file:///pipelines/example.json',
      name: 'Example Pipeline',
      description: 'An example pipeline configuration',
      mimeType: 'application/json'
    });
    
    this.resources.push({
      uri: 'file:///rules/example.json',
      name: 'Example Rules',
      description: 'An example rule set',
      mimeType: 'application/json'
    });
    
    this.debug('Resources initialized');
  }

  // 初始化提示
  initializePrompts() {
    this.debug('Initializing prompts');
    
    // 注册示例提示
    this.prompts.push({
      name: 'create-pipeline',
      description: 'Create a new pipeline',
      arguments: [
        {
          name: 'name',
          description: 'Pipeline name',
          required: true
        },
        {
          name: 'description',
          description: 'Pipeline description',
          required: false
        }
      ]
    });
    
    this.debug('Prompts initialized');
  }

  // 初始化工具
  initializeTools() {
    this.debug('Initializing tools');
    
    // 注册示例工具
    this.tools.push({
      name: 'executePipeline',
      description: 'Execute a web automation pipeline',
      inputSchema: {
        type: 'object',
        properties: {
          pipelineName: {
            type: 'string',
            description: 'Name of the pipeline to execute'
          }
        },
        required: ['pipelineName']
      }
    });
    
    this.tools.push({
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
    
    this.tools.push({
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
    
    this.debug('Tools initialized');
  }

  // 处理initialize请求
  async handleInitialize(request) {
    this.debug(`Handling initialize request: ${JSON.stringify(request)}`);
    
    if (this.isInitialized) {
      return this.createErrorResponse(
        request.id,
        ERROR_CODES.INVALID_REQUEST,
        'Server already initialized'
      );
    }

    // 验证参数
    if (!request.params || !request.params.protocolVersion) {
      return this.createErrorResponse(
        request.id,
        ERROR_CODES.INVALID_PARAMS,
        'Missing protocolVersion in params'
      );
    }

    // 设置初始化状态
    this.isInitialized = true;

    // 返回服务器capabilities
    const response = this.createSuccessResponse(request.id, {
      protocolVersion: '2024-01-01',
      capabilities: {
        resources: {
          list: true,
          read: true
        },
        prompts: {
          list: true,
          get: true
        },
        tools: {
          list: true,
          call: true
        }
      },
      instructions: [
        'Welcome to WebAuto MCP Server',
        'You can manage web automation pipelines and rules through this server'
      ]
    });
    
    this.debug(`Initialize response: ${JSON.stringify(response)}`);
    return response;
  }

  // 处理initialized通知
  async handleInitialized(request) {
    this.debug(`Handling initialized notification: ${JSON.stringify(request)}`);
    
    if (!this.isInitialized) {
      this.debug('Received initialized notification before server initialization');
      return null;
    }

    this.debug('Client initialized');
    return null;
  }

  // 处理resources/list请求
  async handleResourcesList(request) {
    this.debug(`Handling resources/list request: ${JSON.stringify(request)}`);
    
    if (!this.isInitialized) {
      return this.createErrorResponse(
        request.id,
        ERROR_CODES.INVALID_REQUEST,
        'Server not initialized'
      );
    }

    const response = this.createSuccessResponse(request.id, {
      resources: this.resources
    });
    
    this.debug(`Resources list response: ${JSON.stringify(response)}`);
    return response;
  }

  // 处理resources/read请求
  async handleResourcesRead(request) {
    this.debug(`Handling resources/read request: ${JSON.stringify(request)}`);
    
    if (!this.isInitialized) {
      return this.createErrorResponse(
        request.id,
        ERROR_CODES.INVALID_REQUEST,
        'Server not initialized'
      );
    }

    if (!request.params || !request.params.uri) {
      return this.createErrorResponse(
        request.id,
        ERROR_CODES.INVALID_PARAMS,
        'Missing uri in params'
      );
    }

    const uri = request.params.uri;
    // 查找资源
    const resource = this.resources.find(r => r.uri === uri);
    
    if (!resource) {
      return this.createErrorResponse(
        request.id,
        ERROR_CODES.INVALID_PARAMS,
        `Resource not found: ${uri}`
      );
    }

    // 返回资源内容
    const response = this.createSuccessResponse(request.id, {
      contents: [
        {
          uri: resource.uri,
          mimeType: resource.mimeType,
          text: resource.content || ''
        }
      ]
    });
    
    this.debug(`Resources read response: ${JSON.stringify(response)}`);
    return response;
  }

  // 处理prompts/list请求
  async handlePromptsList(request) {
    this.debug(`Handling prompts/list request: ${JSON.stringify(request)}`);
    
    if (!this.isInitialized) {
      return this.createErrorResponse(
        request.id,
        ERROR_CODES.INVALID_REQUEST,
        'Server not initialized'
      );
    }

    const response = this.createSuccessResponse(request.id, {
      prompts: this.prompts
    });
    
    this.debug(`Prompts list response: ${JSON.stringify(response)}`);
    return response;
  }

  // 处理prompts/get请求
  async handlePromptsGet(request) {
    this.debug(`Handling prompts/get request: ${JSON.stringify(request)}`);
    
    if (!this.isInitialized) {
      return this.createErrorResponse(
        request.id,
        ERROR_CODES.INVALID_REQUEST,
        'Server not initialized'
      );
    }

    if (!request.params || !request.params.name) {
      return this.createErrorResponse(
        request.id,
        ERROR_CODES.INVALID_PARAMS,
        'Missing name in params'
      );
    }

    const name = request.params.name;
    // 查找提示
    const prompt = this.prompts.find(p => p.name === name);
    
    if (!prompt) {
      return this.createErrorResponse(
        request.id,
        ERROR_CODES.INVALID_PARAMS,
        `Prompt not found: ${name}`
      );
    }

    this.debug(`Prompts get response: ${JSON.stringify(prompt)}`);
    return this.createSuccessResponse(request.id, prompt);
  }

  // 处理tools/list请求
  async handleToolsList(request) {
    this.debug(`Handling tools/list request: ${JSON.stringify(request)}`);
    
    if (!this.isInitialized) {
      return this.createErrorResponse(
        request.id,
        ERROR_CODES.INVALID_REQUEST,
        'Server not initialized'
      );
    }

    const response = this.createSuccessResponse(request.id, {
      tools: this.tools
    });
    
    this.debug(`Tools list response: ${JSON.stringify(response)}`);
    return response;
  }

  // 处理tools/call请求
  async handleToolsCall(request) {
    this.debug(`Handling tools/call request: ${JSON.stringify(request)}`);
    
    if (!this.isInitialized) {
      return this.createErrorResponse(
        request.id,
        ERROR_CODES.INVALID_REQUEST,
        'Server not initialized'
      );
    }

    if (!request.params || !request.params.name) {
      return this.createErrorResponse(
        request.id,
        ERROR_CODES.INVALID_PARAMS,
        'Missing name in params'
      );
    }

    const toolName = request.params.name;
    const toolArgs = request.params.arguments || {};
    
    // 查找工具
    const tool = this.tools.find(t => t.name === toolName);
    
    if (!tool) {
      return this.createErrorResponse(
        request.id,
        ERROR_CODES.METHOD_NOT_FOUND,
        `Tool not found: ${toolName}`
      );
    }

    try {
      // 调用工具
      this.debug(`Calling tool: ${toolName} with args: ${JSON.stringify(toolArgs)}`);
      const result = await this.callTool(toolName, toolArgs);
      
      const response = this.createSuccessResponse(request.id, {
        content: {
          type: 'text',
          text: JSON.stringify(result)
        }
      });
      
      this.debug(`Tool call response: ${JSON.stringify(response)}`);
      return response;
    } catch (error) {
      this.errorHandler.handle(error);
      return this.createErrorResponse(
        request.id,
        ERROR_CODES.INTERNAL_ERROR,
        `Tool execution failed: ${error.message}`
      );
    }
  }

  // 调用具体工具的实现
  async callTool(toolName, args) {
    this.debug(`Calling tool implementation: ${toolName}`);
    
    // 使用underConstruction标记未实现的功能
    switch (toolName) {
      case 'executePipeline':
        this.underConstruction.mark('executePipeline');
        return { message: `Executing pipeline: ${args.pipelineName}` };
      case 'applyRules':
        this.underConstruction.mark('applyRules');
        return { message: `Applying rules to: ${args.url}` };
      case 'extractTargets':
        this.underConstruction.mark('extractTargets');
        return { message: `Extracting targets from: ${args.url}` };
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  // 创建成功响应
  createSuccessResponse(id, result) {
    return {
      jsonrpc: '2.0',
      id: id,
      result: result
    };
  }

  // 创建错误响应
  createErrorResponse(id, code, message, data = null) {
    const error = {
      jsonrpc: '2.0',
      id: id,
      error: {
        code: code,
        message: message
      }
    };
    
    if (data) {
      error.error.data = data;
    }
    
    return error;
  }

  // 处理传入的消息
  async handleMessage(message) {
    try {
      this.debug(`Processing message: ${JSON.stringify(message)}`);
      
      // 验证消息格式
      if (!message.jsonrpc || message.jsonrpc !== '2.0') {
        return this.createErrorResponse(
          message.id,
          ERROR_CODES.INVALID_REQUEST,
          'Invalid JSON-RPC version'
        );
      }

      // 检查方法是否存在
      if (!message.method) {
        return this.createErrorResponse(
          message.id,
          ERROR_CODES.INVALID_REQUEST,
          'Missing method'
        );
      }

      // 查找方法处理器
      const handler = this.methodHandlers[message.method];
      
      if (!handler) {
        return this.createErrorResponse(
          message.id,
          ERROR_CODES.METHOD_NOT_FOUND,
          `Method not found: ${message.method}`
        );
      }

      // 调用处理器
      return await handler(message);
    } catch (error) {
      this.errorHandler.handle(error);
      return this.createErrorResponse(
        message.id,
        ERROR_CODES.INTERNAL_ERROR,
        `Internal error: ${error.message}`
      );
    }
  }
  
  // 调试日志
  debug(message) {
    ensureLogDirectory();
    const logFile = path.join(require('os').homedir(), '.webauto', 'mcp-server.log');
    const timestamp = new Date().toISOString();
    fs.appendFileSync(logFile, `[${timestamp}] ${message}\n`);
  }
  
  // 获取工具列表
  getTools() {
    return this.tools;
  }
}

module.exports = MCPServer;