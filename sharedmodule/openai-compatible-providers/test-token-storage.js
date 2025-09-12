#!/usr/bin/env node

/**
 * Token Storage Test Script
 * 测试token存储和验证功能
 */

const { QwenProvider } = require('./src/index');
const fs = require('fs');
const path = require('path');
const os = require('os');

async function testTokenStorage() {
  console.log('🔍 Testing Token Storage and Validation\n');

  try {
    const qwenProvider = new QwenProvider();
    
    // 检查provider当前的token状态
    console.log('📊 Current Provider Token Status:');
    console.log(`  Access Token: ${qwenProvider.accessToken ? 'Set' : 'Not Set'}`);
    console.log(`  Refresh Token: ${qwenProvider.refreshToken ? 'Set' : 'Not Set'}`);
    console.log(`  Token Expiry: ${qwenProvider.tokenExpiry ? new Date(qwenProvider.tokenExpiry).toISOString() : 'Not Set'}`);
    
    // 检查可能的token存储位置
    const possibleStoragePaths = [
      path.join(os.homedir(), '.webauto', 'qwen-token.json'),
      path.join(os.homedir(), '.qwen', 'token.json'),
      path.join(process.cwd(), 'qwen-token.json'),
      path.join(os.tmpdir(), 'qwen-token.json')
    ];
    
    console.log('\n🔍 Checking for token storage files:');
    let foundTokenFile = null;
    
    for (const storagePath of possibleStoragePaths) {
      if (fs.existsSync(storagePath)) {
        console.log(`  ✅ Found: ${storagePath}`);
        foundTokenFile = storagePath;
        
        try {
          const tokenData = JSON.parse(fs.readFileSync(storagePath, 'utf8'));
          console.log('     Token Data:');
          console.log(`       Access Token: ${tokenData.accessToken ? 'Set' : 'Not Set'}`);
          console.log(`       Refresh Token: ${tokenData.refreshToken ? 'Set' : 'Not Set'}`);
          console.log(`       Last Refresh: ${tokenData.lastRefresh || tokenData.LastRefresh || 'Not Set'}`);
          console.log(`       Expire: ${tokenData.expire || tokenData.Expire || 'Not Set'}`);
          console.log(`       Type: ${tokenData.type || 'Not Set'}`);
        } catch (parseError) {
          console.log(`     ❌ Error reading file: ${parseError.message}`);
        }
      } else {
        console.log(`  ❌ Not found: ${storagePath}`);
      }
    }
    
    // 测试健康检查
    console.log('\n🏥 Testing Health Check:');
    const health = await qwenProvider.healthCheck();
    console.log(`  Status: ${health.status}`);
    console.log(`  Message: ${health.message || 'No message'}`);
    
    // 如果有token，测试API连接
    if (qwenProvider.accessToken || foundTokenFile) {
      console.log('\n🔗 Testing API Connection:');
      try {
        const models = await qwenProvider.getModels();
        console.log(`  ✅ API Connection Successful!`);
        console.log(`  📋 Found ${models.length} models:`);
        models.forEach((model, index) => {
          console.log(`     ${index + 1}. ${model.id}: ${model.name || model.id}`);
        });
        
        // 如果API连接成功，token是有效的
        console.log('\n✅ Token Validation: SUCCESS');
        console.log('🎯 Qwen Provider is ready for API calls!');
        
        return {
          success: true,
          tokenValid: true,
          modelsAvailable: models.length,
          providerStatus: health
        };
        
      } catch (apiError) {
        console.log(`  ❌ API Connection Failed: ${apiError.message}`);
        console.log('\n⚠️  Token Validation: FAILED');
        console.log('   Token may be expired or invalid.');
        
        return {
          success: false,
          tokenValid: false,
          error: apiError.message,
          providerStatus: health
        };
      }
    } else {
      console.log('\n⚠️  No token found in provider or storage files.');
      console.log('🔐 OAuth authentication may be required.');
      
      return {
        success: false,
        tokenValid: false,
        error: 'No token found',
        providerStatus: health
      };
    }
    
  } catch (error) {
    console.error('❌ Token storage test failed:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

// 运行测试
if (require.main === module) {
  testTokenStorage().then(result => {
    console.log('\n📋 Test Summary:');
    console.log(`  Success: ${result.success ? 'Yes' : 'No'}`);
    console.log(`  Token Valid: ${result.tokenValid ? 'Yes' : 'No'}`);
    if (result.modelsAvailable !== undefined) {
      console.log(`  Models Available: ${result.modelsAvailable}`);
    }
    if (result.error) {
      console.log(`  Error: ${result.error}`);
    }
  }).catch(console.error);
}

module.exports = testTokenStorage;