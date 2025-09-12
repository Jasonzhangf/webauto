/**
 * WebAuto MCP Protocol Framework Entry Point
 * 纯 MCP 协议框架，供各种 MCP 服务使用
 */

const { MCPProtocolFramework, ERROR_CODES } = require('./protocol/MCPProtocolFramework');

module.exports = {
  // Core framework class
  MCPProtocolFramework,
  
  // Error codes
  ERROR_CODES,
  
  // Factory function
  createFramework: (config) => new MCPProtocolFramework(config),
  
  // Version
  version: require('../package.json').version
};