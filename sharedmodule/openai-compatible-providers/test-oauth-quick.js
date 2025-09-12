#!/usr/bin/env node

/**
 * Quick OAuth Test Script
 * 快速OAuth测试脚本（跳过用户确认）
 */

const { QwenProvider } = require('./src/index');

async function quickOAuthTest() {
  console.log('🔐 Quick Qwen OAuth Test\n');

  try {
    const qwenProvider = new QwenProvider();
    
    console.log('🚀 Starting OAuth device flow...');
    console.log('⚠️  Browser will open automatically for authorization.\n');
    
    // 启动设备流程（自动打开浏览器）
    const deviceFlow = await qwenProvider.initiateDeviceFlow(true);
    
    console.log('✅ Device flow initiated!');
    console.log(`📱 User Code: ${deviceFlow.userCode}`);
    console.log(`🌐 Verification URI: ${deviceFlow.verificationUriComplete}`);
    console.log(`⏰ Expires in: ${deviceFlow.expiresIn} seconds\n`);
    
    console.log('⏳ Waiting for user to complete authorization in browser...');
    console.log('   (This will wait for up to 5 minutes)\n');
    
    // 等待授权完成
    const tokens = await qwenProvider.waitForDeviceAuthorization(
      deviceFlow.deviceCode,
      deviceFlow.pkceVerifier,
      3,  // 3秒间隔
      100 // 100次尝试 = 5分钟
    );
    
    console.log('🎉 Authentication completed successfully!');
    console.log('\n📊 Token Information:');
    console.log(`  Access Token: ${tokens.accessToken.slice(0, 30)}...`);
    console.log(`  Refresh Token: ${tokens.refreshToken ? tokens.refreshToken.slice(0, 30) + '...' : 'N/A'}`);
    console.log(`  Expires In: ${tokens.expiresIn} seconds`);
    console.log(`  Token Type: ${tokens.tokenType}`);
    console.log(`  Scope: ${tokens.scope}`);
    
    // 检查provider中的token状态
    console.log('\n🔍 Provider Token Status:');
    console.log(`  Access Token Set: ${qwenProvider.accessToken ? 'Yes' : 'No'}`);
    console.log(`  Refresh Token Set: ${qwenProvider.refreshToken ? 'Yes' : 'No'}`);
    console.log(`  Token Expiry: ${qwenProvider.tokenExpiry ? new Date(qwenProvider.tokenExpiry).toISOString() : 'Not set'}`);
    
    // 测试健康检查
    console.log('\n🏥 Testing Health Check:');
    const health = await qwenProvider.healthCheck();
    console.log(`  Status: ${health.status}`);
    console.log(`  Message: ${health.message || 'No message'}`);
    
    // 测试模型列表
    console.log('\n📋 Testing Model List:');
    try {
      const models = await qwenProvider.getModels();
      console.log(`  Found ${models.length} models:`);
      models.forEach(model => {
        console.log(`    • ${model.id}: ${model.name || model.id}`);
      });
    } catch (error) {
      console.log(`  Error getting models: ${error.message}`);
    }
    
    console.log('\n✅ OAuth Test Complete!');
    console.log('🎯 Provider is ready to make API calls.');
    
    return {
      success: true,
      tokens,
      provider: qwenProvider
    };
    
  } catch (error) {
    console.error('\n❌ OAuth Test Failed:');
    console.error(`Error: ${error.message}`);
    console.error('Stack:', error.stack);
    
    return {
      success: false,
      error: error.message
    };
  }
}

// 运行测试
if (require.main === module) {
  quickOAuthTest().then(result => {
    if (result.success) {
      console.log('\n🎉 Test completed successfully!');
    } else {
      console.log('\n💔 Test failed.');
      process.exit(1);
    }
  }).catch(console.error);
}

module.exports = quickOAuthTest;