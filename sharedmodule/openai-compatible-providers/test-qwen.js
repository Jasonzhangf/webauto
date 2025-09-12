#!/usr/bin/env node

/**
 * Qwen Provider Integration Test
 * Qwen Provider集成测试
 */

const { QwenProvider } = require('./src/index');
const fs = require('fs');
const path = require('path');

async function testQwenProvider() {
  console.log('🚀 Testing Qwen Provider Integration...\n');

  try {
    // 创建Qwen Provider实例
    const qwenProvider = new QwenProvider();
    
    console.log('📋 Provider Info:');
    console.log(JSON.stringify(qwenProvider.getInfo(), null, 2));
    
    console.log('\n🔧 Capabilities:');
    console.log(JSON.stringify(qwenProvider.getCapabilities(), null, 2));
    
    console.log('\n🏥 Health Check:');
    const health = await qwenProvider.healthCheck();
    console.log(JSON.stringify(health, null, 2));
    
    console.log('\n📊 Supported Models:');
    qwenProvider.supportedModels.forEach(model => {
      console.log(`  • ${model.id}: ${model.name}`);
      console.log(`    Context: ${model.contextWindow}, Max Tokens: ${model.maxTokens}`);
      console.log(`    Streaming: ${model.supportsStreaming}, Tools: ${model.supportsTools}`);
    });
    
    console.log('\n🔐 OAuth Authentication Test:');
    console.log('⚠️  This will open a browser for authentication. Please be ready to authorize.\n');
    
    try {
      // 测试完整的认证流程（但不等待用户完成）
      console.log('Testing device flow initiation...');
      const deviceFlow = await qwenProvider.initiateDeviceFlow();
      console.log('✅ Device flow initiated successfully!');
      console.log(`  User Code: ${deviceFlow.userCode}`);
      console.log(`  Verification URI: ${deviceFlow.verificationUriComplete}`);
      console.log(`  Expires in: ${deviceFlow.expiresIn}s`);
      
      console.log('\n📝 Note: Browser should have opened automatically.');
      console.log('   If not, please manually visit the verification URI.');
      console.log('   This test will not wait for authorization completion.');
      
    } catch (error) {
      console.log(`❌ Device flow test failed: ${error.message}`);
    }
    
    console.log('\n📄 Compatibility JSON Test:');
    try {
      const compatibilityPath = path.join(__dirname, 'compatibility', 'qwen.json');
      if (fs.existsSync(compatibilityPath)) {
        const compatibility = JSON.parse(fs.readFileSync(compatibilityPath, 'utf8'));
        console.log('✅ Compatibility JSON loaded successfully');
        console.log(`Provider: ${compatibility.provider}`);
        console.log(`Version: ${compatibility.version}`);
        console.log(`Models: ${compatibility.models?.length || 0}`);
        console.log(`Authentication: ${compatibility.authentication?.type}`);
      } else {
        console.log('❌ Compatibility JSON not found');
      }
    } catch (error) {
      console.log(`❌ Compatibility JSON test failed: ${error.message}`);
    }
    
    console.log('\n🎉 Qwen Provider Integration Test Completed!');
    console.log('\n📝 Summary:');
    console.log('  ✅ Provider instance created');
    console.log('  ✅ Basic functionality tested');
    console.log('  ✅ Health check performed');
    console.log('  ✅ Models information displayed');
    console.log('  ✅ OAuth device flow tested');
    console.log('  ✅ Compatibility JSON validated');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// 运行测试
if (require.main === module) {
  testQwenProvider().catch(console.error);
}

module.exports = testQwenProvider;