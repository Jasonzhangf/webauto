const { BaseModule } = require('rcc-basemodule');
const MCPServer = require('./server');
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

class MCPManager extends BaseModule {
  constructor() {
    super();
    this.errorHandler = new ErrorHandler();
    
    // 确保日志目录存在
    ensureLogDirectory();
    
    this.server = new MCPServer();
  }

  async initialize() {
    this.debug('Initializing MCP Manager...');
    // MCP服务器的初始化在收到initialize请求时完成
    this.debug('MCP Manager initialized');
  }

  async handleMessage(message) {
    this.debug(`Handling message: ${JSON.stringify(message)}`);
    return this.server.handleMessage(message);
  }

  // 获取服务器状态
  getServerStatus() {
    this.debug('Getting server status');
    return {
      initialized: this.server.isInitialized,
      resources: this.server.resources.length,
      prompts: this.server.prompts.length,
      tools: this.server.tools.length
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
    return this.server.getTools();
  }
}

module.exports = MCPManager;