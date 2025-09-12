#!/usr/bin/env node

/**
 * Complete OAuth Flow Test with Manual Input
 * 完整OAuth流程测试（手动输入用户码）
 */

const { QwenProvider } = require('./src/index');
const readline = require('readline');

async function completeOAuthTest() {
  console.log('🔐 Complete Qwen OAuth Flow Test\n');

  try {
    const qwenProvider = new QwenProvider();
    
    // 步骤1：获取设备码
    console.log('🚀 Step 1: Getting device code...');
    const deviceFlow = await qwenProvider.initiateDeviceFlow(false);
    
    console.log('✅ Device code obtained!');
    console.log('\n📱 Authorization Details:');
    console.log(`  User Code: ${deviceFlow.userCode}`);
    console.log(`  Verification URI: ${deviceFlow.verificationUriComplete}`);
    console.log(`  Expires in: ${deviceFlow.expiresIn} seconds\n`);
    
    // 步骤2：等待用户确认授权完成
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    const authCompleted = await new Promise(resolve => {
      rl.question('Have you completed the authorization in the browser? (y/N): ', answer => {
        rl.close();
        resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
      });
    });
    
    if (!authCompleted) {
      console.log('🛑 Test cancelled by user.');
      return { success: false, error: 'User cancelled' };
    }
    
    console.log('\n⏳ Step 3: Waiting for token exchange...');
    
    // 步骤3：等待token交换
    const tokens = await qwenProvider.waitForDeviceAuthorization(
      deviceFlow.deviceCode,
      deviceFlow.pkceVerifier,
      3,
      60
    );
    
    console.log('\n🎉 Authentication completed successfully!');
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
    
    // 步骤4：测试API连接
    console.log('\n🔗 Step 4: Testing API Connection...');
    const health = await qwenProvider.healthCheck();
    console.log(`  Health Status: ${health.status}`);
    console.log(`  Health Message: ${health.message || 'No message'}`);
    
    if (health.status === 'healthy') {
      console.log('\n📋 Testing Model Access...');
      try {
        const models = await qwenProvider.getModels();
        console.log(`  ✅ Found ${models.length} models:`);
        models.forEach((model, index) => {
          console.log(`     ${index + 1}. ${model.id}: ${model.name || model.id}`);
        });
        
        console.log('\n✅ OAuth Flow Test - COMPLETE SUCCESS!');
        console.log('🎯 Provider is fully functional and ready for API calls!');
        
        return {
          success: true,
          tokens,
          health,
          modelsAvailable: models.length,
          provider: qwenProvider
        };
        
      } catch (modelError) {
        console.log(`  ❌ Model access failed: ${modelError.message}`);
        
        return {
          success: true,
          tokens,
          health,
          error: `Model access failed: ${modelError.message}`,
          provider: qwenProvider
        };
      }
    } else {
      console.log('\n❌ Health check failed, token may be invalid.');
      
      return {
        success: true,
        tokens,
        health,
        error: 'Health check failed',
        provider: qwenProvider
      };
    }
    
  } catch (error) {
    console.error('\n❌ OAuth Flow Test Failed:');
    console.error(`Error: ${error.message}`);
    
    return {
      success: false,
      error: error.message
    };
  }
}

// 运行测试
if (require.main === module) {
  completeOAuthTest().then(result => {
    console.log('\n📋 Final Test Summary:');
    console.log(`  Overall Success: ${result.success ? 'Yes' : 'No'}`);
    console.log(`  Authentication: ${result.tokens ? 'Success' : 'Failed'}`);
    console.log(`  Token Valid: ${result.health?.status === 'healthy' ? 'Yes' : 'No'}`);
    if (result.modelsAvailable !== undefined) {
      console.log(`  Models Available: ${result.modelsAvailable}`);
    }
    if (result.error) {
      console.log(`  Error: ${result.error}`);
    }
    
    if (result.success) {
      console.log('\n🎉 Qwen Provider is ready to use!');
    } else {
      console.log('\n💔 Test failed. Please check the error above.');
      process.exit(1);
    }
  }).catch(console.error);
}

module.exports = completeOAuthTest;