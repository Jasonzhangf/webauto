#!/usr/bin/env node

/**
 * Framework Test Script
 * 标准测试脚本
 */

const fs = require('fs');
const path = require('path');

console.log('🧪 Testing OpenAI Compatible Providers Framework...');

async function runTests() {
  try {
  // 加载framework
  const frameworkPath = path.resolve(__dirname, '../dist/index.js');
  const { ProviderFramework, BaseProvider, ModuleScanner } = require(frameworkPath);

  console.log('✅ Framework loaded successfully');

  // 测试ModuleScanner
  console.log('🔍 Testing ModuleScanner...');
  const scanner = new ModuleScanner();
  
  if (typeof scanner.scan !== 'function') {
    throw new Error('ModuleScanner.scan method not found');
  }
  
  if (typeof scanner.scanDirectory !== 'function') {
    throw new Error('ModuleScanner.scanDirectory method not found');
  }
  
  if (typeof scanner.loadModule !== 'function') {
    throw new Error('ModuleScanner.loadModule method not found');
  }
  
  console.log('✅ ModuleScanner methods validated');

  // 测试ProviderFramework
  console.log('🏗️ Testing ProviderFramework...');
  const framework = new ProviderFramework();
  
  if (typeof framework.chat !== 'function') {
    throw new Error('ProviderFramework.chat method not found');
  }
  
  if (typeof framework.streamChat !== 'function') {
    throw new Error('ProviderFramework.streamChat method not found');
  }
  
  if (typeof framework.healthCheck !== 'function') {
    throw new Error('ProviderFramework.healthCheck method not found');
  }
  
  if (typeof framework.getAllProviders !== 'function') {
    throw new Error('ProviderFramework.getAllProviders method not found');
  }
  
  console.log('✅ ProviderFramework methods validated');

  // 测试BaseProvider
  console.log('🔧 Testing BaseProvider...');
  
  if (typeof BaseProvider !== 'function') {
    throw new Error('BaseProvider class not found');
  }
  
  // 创建测试Provider类
  class TestProvider extends BaseProvider {
    constructor() {
      super({
        name: 'test',
        endpoint: 'http://test.com/v1/chat/completions',
        supportedModels: ['test-model'],
        defaultModel: 'test-model'
      });
    }

    async executeChat(request) {
      return {
        id: 'test-chat',
        object: 'chat.completion',
        created: Date.now(),
        model: 'test-model',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: 'Test response'
          },
          finish_reason: 'stop'
        }]
      };
    }

    async *executeStreamChat(request) {
      yield {
        id: 'test-stream',
        object: 'chat.completion.chunk',
        created: Date.now(),
        model: 'test-model',
        choices: [{
          index: 0,
          delta: {
            content: 'Test stream'
          },
          finish_reason: null
        }]
      };
    }

    getCapabilities() {
      return {
        streaming: true,
        tools: false,
        vision: false,
        jsonMode: true
      };
    }

    async healthCheck() {
      return {
        status: 'healthy',
        provider: this.name,
        endpoint: this.endpoint,
        model: this.defaultModel,
        timestamp: new Date().toISOString()
      };
    }
  }

  const testProvider = new TestProvider();
  
  if (typeof testProvider.chat !== 'function') {
    throw new Error('BaseProvider.chat method not found');
  }
  
  if (typeof testProvider.streamChat !== 'function') {
    throw new Error('BaseProvider.streamChat method not found');
  }
  
  if (typeof testProvider.executeChat !== 'function') {
    throw new Error('BaseProvider.executeChat method not found');
  }
  
  if (typeof testProvider.executeStreamChat !== 'function') {
    throw new Error('BaseProvider.executeStreamChat method not found');
  }
  
  console.log('✅ BaseProvider functionality validated');

  // 测试基本聊天功能
  console.log('💬 Testing basic chat functionality...');
  const testRequest = {
    model: 'test-model',
    messages: [{ role: 'user', content: 'Hello' }]
  };
  
  const response = await testProvider.chat(testRequest);
  
  if (!response.id || !response.choices || !response.choices.length) {
    throw new Error('Chat response format invalid');
  }
  
  console.log('✅ Basic chat functionality works');

  // 测试健康检查
  console.log('🏥 Testing health check...');
  const health = await testProvider.healthCheck();
  
  if (health.status !== 'healthy') {
    throw new Error('Health check failed');
  }
  
  console.log('✅ Health check works');

  // 测试模块类型检测
  console.log('🔍 Testing module type detection...');
  const isProvider = scanner.isModuleOfType(TestProvider, 'provider');
  
  if (!isProvider) {
    throw new Error('Module type detection failed');
  }
  
  console.log('✅ Module type detection works');

  console.log('🎉 All tests passed! Framework is ready for use.');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// 运行测试
runTests();