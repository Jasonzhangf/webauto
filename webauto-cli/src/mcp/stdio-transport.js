#!/usr/bin/env node

// 简单的MCP服务器实现，遵循Model Context Protocol标准
const readline = require('readline');
const fs = require('fs');
const path = require('path');

// 确保日志目录存在
function ensureLogDirectory() {
  const logDir = path.join(require('os').homedir(), '.webauto');
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
}

// 简单的错误处理类
class ErrorHandler {
  handle(error) {
    console.error(`[Error] ${error.message}`);
    console.error(error.stack);
  }
}

// MCP错误码
const ERROR_CODES = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603
};

class STDIOTransport {
  constructor() {
    this.errorHandler = new ErrorHandler();
    
    // 设置日志输出到 ~/.webauto
    ensureLogDirectory();
    
    // 存储服务器状态
    this.initialized = false;
    this.tools = [
      {
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
      },
      {
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
      },
      {
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
      }
    ];
    
    // 设置 readline 接口
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false
    });
    
    // 监听输入行
    this.rl.on('line', async (line) => {
      if (!line.trim()) return; // 忽略空行
      
      try {
        // 解析JSON消息
        const message = JSON.parse(line);
        this.debug(`Received message: ${JSON.stringify(message)}`);
        
        // 处理消息
        const response = await this.handleMessage(message);
        
        // 发送响应
        if (response) {
          this.debug(`Sending response: ${JSON.stringify(response)}`);
          this.send(response);
        }
      } catch (error) {
        this.errorHandler.handle(error);
        this.debug(`Error processing message: ${error.message}`);
        
        // 发送错误响应
        const errorResponse = {
          jsonrpc: '2.0',
          id: null,
          error: {
            code: ERROR_CODES.PARSE_ERROR,
            message: `Parse error: ${error.message}`
          }
        };
        
        this.send(errorResponse);
      }
    });
    
    // 监听关闭事件
    this.rl.on('close', () => {
      this.debug('STDIO transport closed - keeping process alive');
      // 不要退出进程，而是继续运行
    });
    
    // 监听错误事件
    this.rl.on('error', (error) => {
      this.errorHandler.handle(error);
      this.debug(`STDIO transport error: ${error.message} - keeping process alive`);
      // 不要退出进程
    });
    
    // 防止进程因stdin结束而退出
    process.stdin.on('end', () => {
      this.debug('STDIO input ended - keeping process alive for more messages');
      // 不退出，继续等待可能的消息
    });
    
    // 确保进程保持运行
    this.keepAlive();
    
    // 发送启动日志
    this.debug('STDIO transport started and ready to receive messages');
  }

  // 处理MCP消息
  async handleMessage(message) {
    // 验证JSON-RPC版本
    if (!message.jsonrpc || message.jsonrpc !== '2.0') {
      return this.createErrorResponse(
        message.id,
        ERROR_CODES.INVALID_REQUEST,
        'Invalid JSON-RPC version'
      );
    }
    
    // 检查是否有方法
    if (!message.method) {
      return this.createErrorResponse(
        message.id,
        ERROR_CODES.INVALID_REQUEST,
        'Missing method'
      );
    }
    
    // 根据方法处理消息
    const result = await this.handleMethod(message);
    
    // 通知（没有id）不返回响应
    if (!message.id) {
      return null;
    }
    
    return result;
  }
  
  // 处理具体的MCP方法
  async handleMethod(message) {
    switch (message.method) {
      case 'initialize':
        return this.handleInitialize(message);
      case 'initialized':
      case 'notifications/initialized':
        return this.handleInitialized(message);
      case 'tools/list':
        return this.handleToolsList(message);
      case 'tools/call':
        return this.handleToolsCall(message);
      case 'resources/list':
        return this.handleResourcesList(message);
      case 'prompts/list':
        return this.handlePromptsList(message);
      default:
        return this.createErrorResponse(
          message.id,
          ERROR_CODES.METHOD_NOT_FOUND,
          `Method not found: ${message.method}`
        );
    }
  }
  
  // 处理initialize请求
  async handleInitialize(message) {
    this.debug('Handling initialize request');
    
    // 验证参数
    if (!message.params || !message.params.protocolVersion) {
      return this.createErrorResponse(
        message.id,
        ERROR_CODES.INVALID_PARAMS,
        'Missing protocolVersion in params'
      );
    }
    
    // 设置初始化状态（但不完全初始化，等待客户端的initialized通知）
    this.initialized = false;
    this.serverCapabilities = {
      // 使用客户端请求的协议版本或最新版本
      protocolVersion: message.params.protocolVersion || '2024-01-01',
      capabilities: {
        tools: {
          list: true,
          call: true
        },
        resources: {
          list: true,
          read: true
        },
        prompts: {
          list: true,
          get: true
        }
      },
      serverInfo: {
        name: 'webauto-cli',
        version: '0.0.1'
      }
    };
    
    // 返回服务器capabilities
    const response = this.createSuccessResponse(message.id, this.serverCapabilities);
    
    // 立即发送响应
    this.debug(`Sending initialize response: ${JSON.stringify(response)}`);
    this.send(response);
    
    return response;
  }
  
  // 处理客户端initialized通知
  async handleInitialized(message) {
    this.debug('Handling client initialized notification');
    
    // 设置服务器为完全初始化状态
    this.initialized = true;
    
    // 发送initialized通知作为响应
    this.sendInitializedNotification();
    
    this.debug('Server fully initialized and ready');
    
    // 通知不返回响应
    return null;
  }
  
  // 处理tools/list请求
  async handleToolsList(message) {
    this.debug('Handling tools/list request');
    
    if (!this.initialized) {
      return this.createErrorResponse(
        message.id,
        ERROR_CODES.INVALID_REQUEST,
        'Server not initialized'
      );
    }
    
    return this.createSuccessResponse(message.id, {
      tools: this.tools
    });
  }
  
  // 处理resources/list请求
  async handleResourcesList(message) {
    this.debug('Handling resources/list request');
    
    if (!this.initialized) {
      return this.createErrorResponse(
        message.id,
        ERROR_CODES.INVALID_REQUEST,
        'Server not initialized'
      );
    }
    
    return this.createSuccessResponse(message.id, {
      resources: []  // 暂时返回空列表
    });
  }
  
  // 处理prompts/list请求
  async handlePromptsList(message) {
    this.debug('Handling prompts/list request');
    
    if (!this.initialized) {
      return this.createErrorResponse(
        message.id,
        ERROR_CODES.INVALID_REQUEST,
        'Server not initialized'
      );
    }
    
    return this.createSuccessResponse(message.id, {
      prompts: []  // 暂时返回空列表
    });
  }
  
  // 处理tools/call请求
  async handleToolsCall(message) {
    this.debug('Handling tools/call request');
    
    if (!this.initialized) {
      return this.createErrorResponse(
        message.id,
        ERROR_CODES.INVALID_REQUEST,
        'Server not initialized'
      );
    }
    
    if (!message.params || !message.params.name) {
      return this.createErrorResponse(
        message.id,
        ERROR_CODES.INVALID_PARAMS,
        'Missing name in params'
      );
    }
    
    const toolName = message.params.name;
    const toolArgs = message.params.arguments || {};
    
    // 查找工具
    const tool = this.tools.find(t => t.name === toolName);
    
    if (!tool) {
      return this.createErrorResponse(
        message.id,
        ERROR_CODES.METHOD_NOT_FOUND,
        `Tool not found: ${toolName}`
      );
    }
    
    // 模拟工具执行
    const result = {
      content: {
        type: 'text',
        text: `Tool ${toolName} executed with args: ${JSON.stringify(toolArgs)}`
      }
    };
    
    return this.createSuccessResponse(message.id, result);
  }

  // 发送initialized通知
  sendInitializedNotification() {
    const notification = {
      jsonrpc: '2.0',
      method: 'initialized',
      params: {}
    };
    
    this.debug('Sending initialized notification');
    this.send(notification);
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
  createErrorResponse(id, code, message) {
    return {
      jsonrpc: '2.0',
      id: id,
      error: {
        code: code,
        message: message
      }
    };
  }

  // 发送消息
  send(message) {
    // 将消息转换为JSON字符串并发送
    const json = JSON.stringify(message);
    this.debug(`Actually sending message to stdout: ${json}`);
    process.stdout.write(json + '\n');
    this.debug(`Message sent to stdout`);
  }

  // 保持进程运行
  keepAlive() {
    // 防止进程退出
    setInterval(() => {
      // 保持活跃
    }, 1000);
  }

  // 调试日志
  debug(message) {
    ensureLogDirectory();
    const logFile = path.join(require('os').homedir(), '.webauto', 'stdio-transport.log');
    const timestamp = new Date().toISOString();
    fs.appendFileSync(logFile, `[${timestamp}] ${message}\n`);
  }
}

// 如果直接运行此文件，启动STDIO传输
if (require.main === module) {
  const transport = new STDIOTransport();
  
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

module.exports = STDIOTransport;