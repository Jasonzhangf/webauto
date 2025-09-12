// MCP协议常量和类型定义

// 标准错误码
const ERROR_CODES = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  SERVER_ERROR: -32000
};

// 核心方法
const METHODS = {
  // 初始化方法
  INITIALIZE: 'initialize',
  INITIALIZED: 'initialized',
  
  // 资源方法
  RESOURCES_LIST: 'resources/list',
  RESOURCES_READ: 'resources/read',
  
  // 提示方法
  PROMPTS_LIST: 'prompts/list',
  PROMPTS_GET: 'prompts/get',
  
  // 工具方法
  TOOLS_LIST: 'tools/list',
  TOOLS_CALL: 'tools/call'
};

// 传输协议
const TRANSPORTS = {
  STDIO: 'stdio',
  SSE: 'sse',
  WEBSOCKETS: 'websockets',
  HTTP: 'http'
};

module.exports = {
  ERROR_CODES,
  METHODS,
  TRANSPORTS
};