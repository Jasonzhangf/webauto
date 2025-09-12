#!/usr/bin/env node

/**
 * Providers Collection Test Script
 * Provider集合测试脚本
 */

const fs = require('fs');
const path = require('path');

console.log('🧪 Testing OpenAI Providers Collection...');

try {
  // 测试模块导出
  console.log('📦 Testing module exports...');
  
  const indexPath = path.resolve(__dirname, '../dist/index.js');
  if (!fs.existsSync(indexPath)) {
    console.error('❌ Built index.js not found. Run npm run build first.');
    process.exit(1);
  }
  
  const collection = require(indexPath);
  
  // 检查导出的项目
  const expectedExports = [
    'LMStudioProvider',
    'iFlowProvider', 
    'LMStudioCompatibility',
    'iFlowCompatibility',
    'testUtils',
    'createProvider',
    'createCompatibility',
    'setupFramework'
  ];
  
  for (const exportName of expectedExports) {
    if (!collection[exportName]) {
      console.error(`❌ Missing export: ${exportName}`);
      process.exit(1);
    }
  }
  
  console.log('✅ All expected exports found');

  // 测试Provider工厂函数
  console.log('🏭 Testing provider factory...');
  
  try {
    const lmstudio = collection.createProvider('lmstudio', {
      endpoint: 'http://localhost:1234/v1/chat/completions',
      apiKey: 'test-key'
    });
    
    if (!lmstudio || typeof lmstudio.executeChat !== 'function') {
      throw new Error('LMStudio provider factory failed');
    }
    
    const iflow = collection.createProvider('iflow', {
      endpoint: 'https://platform.iflow.cn/api/v1/chat/completions',
      apiKey: 'test-key'
    });
    
    if (!iflow || typeof iflow.executeChat !== 'function') {
      throw new Error('iFlow provider factory failed');
    }
    
    console.log('✅ Provider factory functions work');
  } catch (error) {
    console.error('❌ Provider factory test failed:', error.message);
    process.exit(1);
  }

  // 测试Compatibility工厂函数
  console.log('🔧 Testing compatibility factory...');
  
  try {
    const lmstudioCompat = collection.createCompatibility('lmstudio');
    if (!lmstudioCompat || typeof lmstudioCompat.mapRequest !== 'function') {
      throw new Error('LMStudio compatibility factory failed');
    }
    
    const iflowCompat = collection.createCompatibility('iflow');
    if (!iflowCompat || typeof iflowCompat.mapRequest !== 'function') {
      throw new Error('iFlow compatibility factory failed');
    }
    
    console.log('✅ Compatibility factory functions work');
  } catch (error) {
    console.error('❌ Compatibility factory test failed:', error.message);
    process.exit(1);
  }

  // 测试无效Provider名称
  console.log('🚫 Testing invalid provider names...');
  
  try {
    collection.createProvider('invalid');
    console.error('❌ Should have thrown error for invalid provider');
    process.exit(1);
  } catch (error) {
    if (error.message.includes('Unknown provider')) {
      console.log('✅ Invalid provider names properly rejected');
    } else {
      throw error;
    }
  }

  // 测试无效Compatibility名称
  try {
    collection.createCompatibility('invalid');
    console.error('❌ Should have thrown error for invalid compatibility');
    process.exit(1);
  } catch (error) {
    if (error.message.includes('Unknown compatibility')) {
      console.log('✅ Invalid compatibility names properly rejected');
    } else {
      throw error;
    }
  }

  // 测试Provider功能
  console.log('⚙️ Testing provider functionality...');
  
  const testProvider = collection.createProvider('lmstudio', {
    endpoint: 'http://localhost:1234/v1/chat/completions',
    apiKey: 'test-key'
  });
  
  // 检查必需的方法
  const requiredMethods = ['chat', 'streamChat', 'executeChat', 'executeStreamChat', 'getCapabilities', 'healthCheck'];
  
  for (const method of requiredMethods) {
    if (typeof testProvider[method] !== 'function') {
      console.error(`❌ Missing method: ${method}`);
      process.exit(1);
    }
  }
  
  console.log('✅ All required provider methods present');

  // 测试Capabilities
  const capabilities = testProvider.getCapabilities();
  if (!capabilities || typeof capabilities !== 'object') {
    console.error('❌ getCapabilities should return an object');
    process.exit(1);
  }
  
  console.log('✅ Provider capabilities check passed');

  // 测试配置文件
  console.log('📋 Testing configuration files...');
  
  const configFiles = [
    '../config/example.config.js',
    '../dist/example.config.js'
  ];
  
  for (const configFile of configFiles) {
    const configPath = path.resolve(__dirname, configFile);
    if (fs.existsSync(configPath)) {
      const config = require(configPath);
      
      if (!config.iflow || !config.lmstudio) {
        console.error(`❌ ${configFile}: Missing required configuration sections`);
        process.exit(1);
      }
      
      console.log(`✅ ${configFile} configuration structure valid`);
    }
  }

  // 检查构建产物
  console.log('📁 Checking build artifacts...');
  
  const distDir = path.resolve(__dirname, '../dist');
  const expectedFiles = [
    'index.js',
    'index.d.ts', 
    'example.config.js',
    'README.md'
  ];
  
  for (const file of expectedFiles) {
    const filePath = path.join(distDir, file);
    if (!fs.existsSync(filePath)) {
      console.error(`❌ Missing build artifact: ${file}`);
      process.exit(1);
    }
  }
  
  console.log('✅ All build artifacts present');

  console.log('🎉 All tests passed! OpenAI Providers Collection is ready for use.');

} catch (error) {
  console.error('❌ Test failed:', error.message);
  console.error('Stack:', error.stack);
  process.exit(1);
}