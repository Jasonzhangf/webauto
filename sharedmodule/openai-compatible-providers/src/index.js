/**
 * OpenAI Compatible Providers Framework Entry Point
 * OpenAI兼容Providers框架入口点
 */

const ProviderFramework = require('./framework/ProviderFramework');
const BaseProvider = require('./framework/BaseProvider');
const ModuleScanner = require('./framework/ModuleScanner');
const { 
  OpenAIChatRequest, 
  OpenAIChatResponse, 
  ChatMessage, 
  ChatChoice, 
  ToolCall, 
  FunctionCall, 
  ChatTool, 
  UsageStats 
} = require('./framework/OpenAIInterface');

// 导出接口
const ICompatibility = require('./interfaces/ICompatibility');
const IAuthManager = require('./interfaces/IAuthManager');

module.exports = {
  // 框架主类
  ProviderFramework,
  
  // 基础类
  BaseProvider,
  ModuleScanner,
  
  // OpenAI接口
  OpenAIChatRequest,
  OpenAIChatResponse,
  ChatMessage,
  ChatChoice,
  ToolCall,
  FunctionCall,
  ChatTool,
  UsageStats,
  
  // 扩展接口
  ICompatibility,
  IAuthManager,
  
  // 版本信息
  version: '1.0.0',
  name: 'OpenAI Compatible Providers Framework'
};