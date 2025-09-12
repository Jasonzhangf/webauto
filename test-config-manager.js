#!/usr/bin/env node

const WebAutoConfigManager = require('./src/utils/WebAutoConfigManager');

/**
 * 测试WebAuto配置管理器和LMStudio模型检测
 */
async function testConfigManager() {
  console.log('🚀 测试WebAuto配置管理器...\n');
  
  try {
    const configManager = new WebAutoConfigManager();
    
    // 初始化配置管理器
    console.log('📋 初始化配置管理器...');
    await configManager.initialize();
    
    // 验证API密钥
    const issues = configManager.validateApiKeys();
    if (issues.length > 0) {
      console.log('\n⚠️  配置问题:');
      issues.forEach(issue => console.log(`   • ${issue}`));
    } else {
      console.log('\n✅ API密钥验证通过');
    }
    
    // 显示默认配置
    const defaultProvider = configManager.config.defaults.provider;
    const defaultModel = configManager.config.defaults.model;
    console.log(`\n📋 默认配置: ${defaultProvider}/${defaultModel}`);
    
    // 显示可用模型
    console.log('\n🤖 可用模型:');
    const models = configManager.getAvailableModels();
    const providers = {};
    
    models.forEach(model => {
      if (!providers[model.provider]) {
        providers[model.provider] = [];
      }
      providers[model.provider].push(model);
    });
    
    for (const [providerId, providerModels] of Object.entries(providers)) {
      console.log(`\n${providerId === 'iflow' ? '🔥' : '🏠'} ${providerId}:`);
      providerModels.forEach(model => {
        const contextSize = model.contextWindow >= 1024 ? 
          `${(model.contextWindow / 1024).toFixed(0)}k` : 
          `${model.contextWindow}`;
        console.log(`   • ${model.model} (${model.modelName})`);
        console.log(`     上下文: ${contextSize}, 输出: ${model.maxOutput}`);
      });
    }
    
    // 测试LMStudio模型检测
    console.log('\n🔍 检测LMStudio模型...');
    await configManager.autoDetectLMStudioModels();
    
    // 显示更新后的模型列表
    const updatedModels = configManager.getAvailableModels();
    const lmstudioModels = updatedModels.filter(m => m.provider === 'lmstudio');
    
    if (lmstudioModels.length > 0) {
      console.log(`✅ 检测到 ${lmstudioModels.length} 个LMStudio模型:`);
      lmstudioModels.forEach(model => {
        console.log(`   • ${model.model} (${model.modelName})`);
        console.log(`     上下文: ${model.contextWindow}, 输出: ${model.maxOutput}`);
      });
    } else {
      console.log('ℹ️  未检测到LMStudio模型（LMStudio可能未启动）');
    }
    
    console.log('\n🎉 测试完成！');
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    process.exit(1);
  }
}

// 运行测试
if (require.main === module) {
  testConfigManager().catch(console.error);
}

module.exports = testConfigManager;